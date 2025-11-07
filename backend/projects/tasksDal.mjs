import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const taskStatuses = [
  "todo",
  "in_progress",
  "in_review",
  "needs_changes",
  "done",
  "archived",
];

export const allowedTransitions = {
  todo: ["in_progress", "in_review"],
  in_progress: ["in_review"],
  in_review: ["done", "needs_changes"],
  needs_changes: ["in_progress", "in_review"],
  done: ["archived", "needs_changes"],
  archived: ["done"],
};

const LEGACY_STATUS_MAP = new Map(
  [
    ["open", "todo"],
    ["not_started", "todo"],
    ["not-started", "todo"],
    ["in-progress", "in_progress"],
    ["review", "in_review"],
    ["needs-review", "in_review"],
    ["needs_changes", "needs_changes"],
    ["needs-changes", "needs_changes"],
    ["complete", "done"],
    ["completed", "done"],
    ["archived", "archived"],
  ].map(([a, b]) => [a, b]),
);

export function normalizeStatus(value) {
  if (typeof value !== "string" || !value.trim()) return "todo";
  const trimmed = value.trim().toLowerCase();
  if (taskStatuses.includes(trimmed)) return trimmed;
  return LEGACY_STATUS_MAP.get(trimmed) || "todo";
}

function toDateKey(value) {
  if (value == null || value === "") return "no-due";

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "no-due";
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "no-due";
    return date.toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "no-due";

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }

    if (trimmed.length >= 10) {
      return trimmed.slice(0, 10);
    }
  }

  return "no-due";
}

export function buildStatusSortKey(status, dueAt, taskId) {
  const normalizedStatus = normalizeStatus(status);
  const dueKey = toDateKey(dueAt);
  return `${normalizedStatus}##${dueKey}##${taskId}`;
}

async function getTask(ddb, tableName, projectId, taskId) {
  const response = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { projectId, taskId },
    }),
  );
  return response.Item || null;
}

function mergeNames(base = {}, additions = {}) {
  return { ...base, ...additions };
}

function mergeValues(base = {}, additions = {}) {
  return { ...base, ...additions };
}

function buildUpdateExpression({ sets, removes }) {
  const ExpressionAttributeNames = {};
  const ExpressionAttributeValues = {};
  const setParts = [];
  const removeParts = [];
  let index = 0;

  for (const [field, value] of Object.entries(sets || {})) {
    if (value === undefined) continue;
    const nameKey = `#f${index}`;
    const valueKey = `:v${index}`;
    ExpressionAttributeNames[nameKey] = field;
    ExpressionAttributeValues[valueKey] = value;
    setParts.push(`${nameKey} = ${valueKey}`);
    index += 1;
  }

  for (const field of removes || []) {
    if (!field) continue;
    const nameKey = `#f${index}`;
    ExpressionAttributeNames[nameKey] = field;
    removeParts.push(nameKey);
    index += 1;
  }

  let UpdateExpression = "";
  if (setParts.length) {
    UpdateExpression = `SET ${setParts.join(", ")}`;
  }
  if (removeParts.length) {
    UpdateExpression += `${UpdateExpression ? " " : ""}REMOVE ${removeParts.join(", ")}`;
  }

  if (!UpdateExpression) {
    return null;
  }

  return { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues };
}

function computeTransitionEffects({
  current,
  nextStatus,
  taskId,
  now,
  actorId,
  options = {},
}) {
  const sets = {
    status: nextStatus,
    updatedAt: now,
  };
  const removes = [];

  const dueAt = options.dueAt !== undefined ? options.dueAt : current.dueAt;
  const statusSortKey = buildStatusSortKey(nextStatus, dueAt, taskId);
  sets.statusSortKey = statusSortKey;
  sets.statusDueDateTaskId = statusSortKey.replace("##", "#").replace("##", "#");
  if (dueAt !== undefined) {
    sets.dueAt = dueAt;
  }

  switch (nextStatus) {
    case "in_review": {
      sets.reviewRequestedAt = options.reviewRequestedAt || now;
      const reviewerId =
        options.reviewerId ||
        current.reviewerId ||
        current.createdById ||
        current.createdBy ||
        null;
      if (reviewerId) {
        sets.reviewerId = reviewerId;
      }
      sets.reviewNote = options.reviewNote ?? options.note ?? current.reviewNote ?? "";
      if (options.resetNeedsChangesNote !== false) {
        removes.push("needsChangesNote");
      }
      if (options.clearReviewedTimestamps) {
        removes.push("reviewedAt");
      }
      break;
    }
    case "done": {
      sets.completedAt = options.completedAt || now;
      sets.reviewedAt = options.reviewedAt || now;
      if (options.reviewNote !== undefined) {
        sets.reviewNote = options.reviewNote;
      } else if (options.note !== undefined) {
        sets.reviewNote = options.note;
      }
      if (current.archived || options.archived === false) {
        sets.archived = false;
      }
      removes.push("needsChangesNote");
      removes.push("archivedAt");
      removes.push("archivedById");
      break;
    }
    case "needs_changes": {
      sets.reviewedAt = options.reviewedAt || now;
      sets.needsChangesNote = options.needsChangesNote ?? options.note ?? "";
      if (options.resetReviewNote) {
        removes.push("reviewNote");
      }
      sets.completedAt = options.completedAt ?? null;
      break;
    }
    case "archived": {
      sets.archived = true;
      sets.archivedAt = options.archivedAt || now;
      if (actorId) {
        sets.archivedById = actorId;
      }
      break;
    }
    default: {
      if (options.archived === false || current.archived) {
        sets.archived = false;
        removes.push("archivedAt");
        removes.push("archivedById");
      }
      if (nextStatus !== "done" && options.completedAt !== undefined) {
        sets.completedAt = options.completedAt;
      }
    }
  }

  return { sets, removes };
}

export async function updateTaskStatus({
  ddb,
  tableName,
  projectId,
  taskId,
  nextStatus,
  actorId,
  now,
  options = {},
}) {
  const task = await getTask(ddb, tableName, projectId, taskId);
  if (!task) {
    const err = new Error("Task not found");
    err.statusCode = 404;
    throw err;
  }

  const currentStatus = normalizeStatus(task.status);
  const targetStatus = normalizeStatus(nextStatus);

  if (currentStatus === targetStatus && !options.force) {
    return task;
  }

  const allowed = allowedTransitions[currentStatus] || [];
  if (currentStatus !== targetStatus && !allowed.includes(targetStatus)) {
    const err = new Error(`Invalid status transition: ${currentStatus} -> ${targetStatus}`);
    err.statusCode = 400;
    throw err;
  }

  const timestamp = now || new Date().toISOString();
  const { sets, removes } = computeTransitionEffects({
    current: task,
    nextStatus: targetStatus,
    taskId,
    now: timestamp,
    actorId,
    options,
  });

  if (options.additionalUpdates) {
    Object.assign(sets, options.additionalUpdates);
  }

  const expression = buildUpdateExpression({ sets, removes });
  if (!expression) {
    return task;
  }

  const conditionNames = mergeNames(expression.ExpressionAttributeNames, {
    "#taskId": "taskId",
    "#status": "status",
  });
  const conditionValues = mergeValues(expression.ExpressionAttributeValues, {});
  let ConditionExpression = "attribute_exists(#taskId)";
  if (task.status === undefined) {
    ConditionExpression += " AND attribute_not_exists(#status)";
  } else {
    ConditionExpression += " AND #status = :expectedStatus";
    conditionValues[":expectedStatus"] = task.status;
  }

  const command = new UpdateCommand({
    TableName: tableName,
    Key: { projectId, taskId },
    ...expression,
    ExpressionAttributeNames: conditionNames,
    ExpressionAttributeValues: conditionValues,
    ConditionExpression,
    ReturnValues: "ALL_NEW",
  });

  const response = await ddb.send(command);
  return response.Attributes || null;
}

export async function setArchive({
  ddb,
  tableName,
  projectId,
  taskId,
  archived,
  actorId,
  now,
}) {
  if (archived) {
    return updateTaskStatus({
      ddb,
      tableName,
      projectId,
      taskId,
      nextStatus: "archived",
      actorId,
      now,
      options: { archivedAt: now },
    });
  }
  return updateTaskStatus({
    ddb,
    tableName,
    projectId,
    taskId,
    nextStatus: "done",
    actorId,
    now,
    options: { archived: false },
  });
}

export async function requestReview({
  ddb,
  tableName,
  projectId,
  taskId,
  reviewerId,
  note,
  actorId,
  now,
}) {
  return updateTaskStatus({
    ddb,
    tableName,
    projectId,
    taskId,
    nextStatus: "in_review",
    actorId,
    now,
    options: {
      reviewerId,
      reviewNote: note ?? "",
      note,
      reviewRequestedAt: now,
      clearReviewedTimestamps: true,
      additionalUpdates: { reviewNote: note ?? "" },
    },
  });
}

export async function approveTask({
  ddb,
  tableName,
  projectId,
  taskId,
  note,
  actorId,
  now,
}) {
  return updateTaskStatus({
    ddb,
    tableName,
    projectId,
    taskId,
    nextStatus: "done",
    actorId,
    now,
    options: {
      reviewNote: note ?? "",
      note,
      reviewedAt: now,
      completedAt: now,
    },
  });
}

export async function requestChanges({
  ddb,
  tableName,
  projectId,
  taskId,
  note,
  actorId,
  now,
}) {
  return updateTaskStatus({
    ddb,
    tableName,
    projectId,
    taskId,
    nextStatus: "needs_changes",
    actorId,
    now,
    options: {
      needsChangesNote: note,
      note,
      reviewedAt: now,
      completedAt: null,
    },
  });
}

export async function updateTaskFields({
  ddb,
  tableName,
  projectId,
  taskId,
  fields,
  now,
}) {
  const task = await getTask(ddb, tableName, projectId, taskId);
  if (!task) {
    const err = new Error("Task not found");
    err.statusCode = 404;
    throw err;
  }

  const normalizedStatus = normalizeStatus(task.status);
  const dueAt = fields.dueAt !== undefined ? fields.dueAt : task.dueAt;
  const statusSortKey = buildStatusSortKey(normalizedStatus, dueAt, taskId);

  const sets = {
    ...fields,
    statusSortKey,
    statusDueDateTaskId: statusSortKey.replace("##", "#").replace("##", "#"),
    updatedAt: now || new Date().toISOString(),
  };

  const expression = buildUpdateExpression({ sets });
  if (!expression) {
    return task;
  }

  const command = new UpdateCommand({
    TableName: tableName,
    Key: { projectId, taskId },
    ...expression,
    ReturnValues: "ALL_NEW",
  });

  const response = await ddb.send(command);
  return response.Attributes || null;
}

export async function getTaskById({ ddb, tableName, projectId, taskId }) {
  return getTask(ddb, tableName, projectId, taskId);
}
