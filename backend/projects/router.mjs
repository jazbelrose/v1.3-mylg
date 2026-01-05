// backend/projects/router.mjs
import { corsHeadersFromEvent, preflightFromEvent, json } from "/opt/nodejs/utils/cors.mjs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import {
  buildStatusSortKey,
  normalizeStatus as normalizeTaskStatus,
  updateTaskStatus as dalUpdateTaskStatus,
  setArchive as dalSetArchive,
  requestReview as dalRequestReview,
  approveTask as dalApproveTask,
  requestChanges as dalRequestChanges,
  updateTaskFields as dalUpdateTaskFields,
  getTaskById as dalGetTaskById,
} from "./tasksDal.mjs";

/* ------------ ENV ------------ */
const REGION = process.env.AWS_REGION || "us-west-2";
const FILE_BUCKET = process.env.FILE_BUCKET || "mylg-files-v12";

// Core projects table
const PROJECTS_TABLE = process.env.PROJECTS_TABLE || "Projects";

// Project directory table (contains all projects in a single item)
const PROJECT_DIRECTORY_TABLE = process.env.PROJECT_DIRECTORY_TABLE || "ProjectDirectory";

// User profiles table (for project lookup by userId)
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || "UserProfiles";
// GSIs for project visibility and team membership
const PROJECTS_VISIBILITY_INDEX = process.env.PROJECTS_VISIBILITY_INDEX || "visibility-index";


// Tasks & Events
const TASKS_TABLE   = process.env.TASKS_TABLE   || "Tasks";
const EVENTS_TABLE  = process.env.EVENTS_TABLE  || "Events";
const EVENTS_STARTAT_INDEX = process.env.EVENTS_STARTAT_INDEX || ""; // e.g., "projectId-startAt-index"

// Budgets (same schema as v1.1)
const BUDGETS_TABLE           = process.env.BUDGETS_TABLE           || "Budgets";
const BUDGET_ID_INDEX         = process.env.BUDGET_ID_INDEX         || "budgetId-index";
const BUDGET_ITEM_ID_INDEX    = process.env.BUDGET_ITEM_ID_INDEX    || "budgetItemId-index";

// --- Galleries (v1.1 table: PK=galleryId, GSI on projectId) ---
const GALLERIES_TABLE = process.env.GALLERIES_TABLE || "Galleries";
const GALLERIES_PROJECT_INDEX = process.env.GALLERIES_PROJECT_INDEX || "projectId-index";

// --- DeckVersions (slide deck versions per project) ---
const DECK_VERSIONS_TABLE = process.env.DECK_VERSIONS_TABLE || "DeckVersions";
const DECK_VERSIONS_DEFAULT_INDEX = process.env.DECK_VERSIONS_DEFAULT_INDEX || "projectId-isDefault-index";

// Dev-only: allow scans when not filtered
const SCANS_ALLOWED = (process.env.SCANS_ALLOWED || "true").toLowerCase() === "true";

/* ------------ DDB ------------ */
const ddb = DynamoDBDocument.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

const s3 = new S3Client({ region: REGION });

/* ------------ utils ------------ */
const M = (e) => e?.requestContext?.http?.method?.toUpperCase?.() || e?.httpMethod?.toUpperCase?.() || "GET";
const P = (e) => (e?.rawPath || e?.path || "/");
const Q = (e) => e?.queryStringParameters || {};
const B = (e) => { try { return JSON.parse(e?.body || "{}"); } catch { return {}; } };
const nowISO = () => new Date().toISOString();
const epochNow = () => Math.floor(Date.now() / 1000);

const makeEventId = (ts = Date.now()) => `E#${String(ts).padStart(13, "0")}#${uuidv4()}`;
const makeThreadEntryId = () => `RT#${String(epochNow()).padStart(10, "0")}#${uuidv4()}`;

function getUserFromEvent(e) {
  const claims = e?.requestContext?.authorizer?.jwt?.claims || {};
  const rawUserId = claims["custom:userId"] || claims.sub;
  const userId = typeof rawUserId === "string" && rawUserId.trim() ? rawUserId.trim() : null;

  const groupsClaim = claims["cognito:groups"] || claims.groups;
  const groupList = Array.isArray(groupsClaim)
    ? groupsClaim
    : typeof groupsClaim === "string"
      ? groupsClaim
          .split(/[,\s]+/)
          .map((value) => value.trim())
          .filter(Boolean)
      : [];
  const roleCandidates = [claims.role, claims["custom:role"]];
  const isAdmin =
    groupList.some((group) => group.toLowerCase() === "admin") ||
    roleCandidates.some((role) => typeof role === "string" && role.toLowerCase() === "admin");

  const usernameCandidates = [
    claims["cognito:username"],
    claims.preferred_username,
    claims.username,
  ];
  const username = usernameCandidates.find((value) => typeof value === "string" && value.trim()) || null;

  const givenName = typeof claims.given_name === "string" ? claims.given_name.trim() : "";
  const familyName = typeof claims.family_name === "string" ? claims.family_name.trim() : "";
  const fullNameFromParts = [givenName, familyName].filter(Boolean).join(" ");
  const displayNameCandidates = [
    typeof claims.name === "string" ? claims.name.trim() : "",
    fullNameFromParts.trim(),
    username || "",
    typeof claims.email === "string" ? claims.email.trim() : "",
  ];
  const displayName = displayNameCandidates.find((value) => typeof value === "string" && value.length) || null;

  const email = typeof claims.email === "string" && claims.email.trim() ? claims.email.trim() : null;

  return {
    userId,
    username,
    displayName,
    email,
    isAdmin,
  };
}

function buildUpdate(obj) {
  const Names = {}, Values = {}, sets = [];
  let i = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const nameToken = `#f${i}`;
    const valueToken = `:v${i}`;
    Names[nameToken] = k;
    Values[valueToken] = v;
    sets.push(`${nameToken} = ${valueToken}`);
    i++;
  }
  if (!sets.length) return null;
  return {
    UpdateExpression: "SET " + sets.join(", "),
    ExpressionAttributeNames: Names,
    ExpressionAttributeValues: Values,
  };
}

function buildDirectoryUpdate(projectId, obj) {
  const Names  = { "#projects": "projects", "#projectId": projectId, "#lastUpdated": "lastUpdated" };
  const Values = { ":now": nowISO() };
  const sets = ["#lastUpdated = :now"];

  let i = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const nk = `#f${i}`;
    const vk = `:v${i}`;
    Names[nk]  = k;
    Values[vk] = v;
    // Keep dateCreated immutable; other fields just set
    sets.push(
      k === "dateCreated"
        ? `#projects.#projectId.${nk} = if_not_exists(#projects.#projectId.${nk}, ${vk})`
        : `#projects.#projectId.${nk} = ${vk}`
    );
    i++;
  }

  return {
    UpdateExpression: "SET " + sets.join(", "),
    ExpressionAttributeNames: Names,
    ExpressionAttributeValues: Values,
  };
}

async function updateProjectDirectory(projectId, fields) {
  // No-op when no fields to write
  if (!fields || Object.keys(fields).length === 0) return;

  // Get current directory item
  const res = await ddb.get({ TableName: PROJECT_DIRECTORY_TABLE, Key: { directoryId: "1" } });
  const item = res.Item || { directoryId: "1", projects: {} };

  // Ensure structure
  if (!item.projects) item.projects = {};
  if (!item.projects[projectId]) item.projects[projectId] = {};

  // Update fields
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) {
      if (k === "dateCreated" && item.projects[projectId][k]) {
        // Don't overwrite dateCreated if it exists
        continue;
      }
      item.projects[projectId][k] = v;
    }
  }

  item.lastUpdated = nowISO();

  // Put the updated item back
  await ddb.put({ TableName: PROJECT_DIRECTORY_TABLE, Item: item });
}

const listAllKeys = async (bucket, prefix) => {
  const keys = [];
  let token;
  do {
    const page = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: token
    }));
    (page.Contents || []).forEach(o => o?.Key && keys.push(o.Key));
    token = page.NextContinuationToken;
  } while (token);
  return keys;
};

const resolveGallerySlug = async (projectId, slugOrId) => {
  if (!projectId || !slugOrId) {
    return { slug: null, galleryId: null };
  }

  try {
    const res = await ddb.get({ TableName: GALLERIES_TABLE, Key: { galleryId: slugOrId } });
    const item = res?.Item;
    if (item && (!item.projectId || item.projectId === projectId)) {
      return {
        slug: item.slug || item.galleryId || slugOrId,
        galleryId: item.galleryId || slugOrId,
      };
    }
  } catch (err) {
    console.warn('resolve_gallery_slug_failed', { projectId, slugOrId, err });
  }

  return { slug: slugOrId, galleryId: slugOrId };
};

const chunk = (arr, n = 1000) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

/* ============== Handlers ============== */

// Health
const health = async (_e, C) => json(200, C, { ok: true, domain: "projects" });

/* ---------- Projects CRUD ---------- */
const listProjects = async (e, C) => {
  const q = Q(e);
  const limit = Math.min(parseInt(q.limit || "50", 10), 200);
  
  const authorizer = e?.requestContext?.authorizer || {};
  const jwtClaims = authorizer?.jwt?.claims || {};
  const userId = jwtClaims['custom:userId'] || jwtClaims.sub;
  
  console.log('JWT Claims Debug:', {
    authorizerKeys: Object.keys(authorizer),
    jwtKeys: authorizer?.jwt ? Object.keys(authorizer.jwt) : null,
    claimsKeys: Object.keys(jwtClaims),
    fullClaims: jwtClaims,
    userId,
    customUserId: jwtClaims['custom:userId'],
    sub: jwtClaims.sub
  });
  
  // Check for admin role in various possible locations
  const role = jwtClaims.role || 
               jwtClaims['custom:role'] || 
               (jwtClaims['cognito:groups'] && jwtClaims['cognito:groups'].includes('admin') ? 'admin' : null) ||
               (jwtClaims.groups && jwtClaims.groups.includes('admin') ? 'admin' : null);

  console.log('Admin check:', {
    userId,
    role,
    queryUserId: q.userId,
    isAdmin: role === 'admin'
  });

  // If a userId is provided in query AND user is not admin, fetch the user's project list
  if (q.userId && role !== "admin") {
    console.log('Taking user-specific path for non-admin user');
    // ... existing code ...
    const u = await ddb.get({
      TableName: USER_PROFILES_TABLE,
      Key: { userId: q.userId },
      ProjectionExpression: "projects",
    });
    const ids = Array.isArray(u.Item?.projects) ? u.Item.projects.slice(0, limit) : [];
    if (!ids.length) {
      return json(200, C, { items: [], count: 0, scannedCount: 0, lastKey: null });
    }

    // Get all projects from ProjectDirectory table
    const directoryResult = await ddb.get({
      TableName: PROJECT_DIRECTORY_TABLE,
      Key: { directoryId: "1" },
      ConsistentRead: true,
    });

    console.log('Directory result:', {
      hasItem: !!directoryResult.Item,
      hasProjects: !!(directoryResult.Item?.projects),
      projectsCount: directoryResult.Item?.projects ? Object.keys(directoryResult.Item.projects).length : 0
    });

    if (!directoryResult.Item || !directoryResult.Item.projects) {
      console.log('No projects found in directory, falling back to Projects table scan');
      
      // Fallback to old behavior for debugging
      const scanResult = await ddb.scan({
        TableName: PROJECTS_TABLE,
        Limit: limit,
      });
      
      console.log(`Fallback scan found ${scanResult.Items?.length || 0} projects`);
      return json(200, C, {
        items: scanResult.Items || [],
        count: scanResult.Count ?? 0,
        scannedCount: scanResult.ScannedCount ?? 0,
        lastKey: null,
      });
    }

      // Filter projects to only include those the user has access to
      const projectsMap = directoryResult.Item.projects;
      const userProjects = ids
        .map(projectId => {
          const projectData = projectsMap[projectId];
          if (projectData) {
            return {
              projectId,
              ...projectData,
              // Convert thumbnail back to thumbnails for frontend compatibility
              thumbnails: projectData.thumbnail ? [projectData.thumbnail] : [],
            };
          }
          return null;
        })
        .filter(Boolean)
        .slice(0, limit);

      console.log(`Returning ${userProjects.length} projects for user ${q.userId}`);
      return json(200, C, { items: userProjects, count: userProjects.length, scannedCount: userProjects.length, lastKey: null });
  }

  // Admin users can see all projects
  if (role === "admin") {
    console.log('Taking admin path - should return all projects');
    // ... existing code ...
    try {
      // Get all projects from the ProjectDirectory table
      const directoryResult = await ddb.get({
        TableName: PROJECT_DIRECTORY_TABLE,
        Key: { directoryId: "1" },
        ConsistentRead: true,
      });

      console.log('Admin directory result:', {
        hasItem: !!directoryResult.Item,
        hasProjects: !!(directoryResult.Item?.projects),
        projectsCount: directoryResult.Item?.projects ? Object.keys(directoryResult.Item.projects).length : 0
      });

      if (!directoryResult.Item || !directoryResult.Item.projects) {
        console.log('No projects found in directory for admin, falling back to Projects table scan');
        
        // Fallback to old behavior for debugging
        const scanResult = await ddb.scan({
          TableName: PROJECTS_TABLE,
          Limit: limit,
        });
        
        console.log(`Admin fallback scan found ${scanResult.Items?.length || 0} projects`);
        return json(200, C, {
          items: scanResult.Items || [],
          count: scanResult.Count ?? 0,
          scannedCount: scanResult.ScannedCount ?? 0,
          lastKey: null,
        });
      }

      // Extract projects from the directory
      const projectsMap = directoryResult.Item.projects;
      const allProjects = Object.entries(projectsMap).map(([projectId, projectData]) => ({
        projectId,
        ...projectData,
      }));

      // Apply pagination
      const startIndex = q.lastKey ? parseInt(q.lastKey) : 0;
      const endIndex = startIndex + limit;
      const paginatedProjects = allProjects.slice(startIndex, endIndex);

      // Convert projects to expected format (add any missing fields from original Projects table if needed)
      const items = paginatedProjects.map(project => ({
        ...project,
        // Ensure projectId is included (it should be from the map key)
        projectId: project.projectId,
        // Convert thumbnail back to thumbnails for frontend compatibility
        thumbnails: project.thumbnail ? [project.thumbnail] : [],
      }));

      console.log(`Admin returning ${items.length} projects out of ${allProjects.length} total`);
      return json(200, C, {
        items,
        count: items.length,
        scannedCount: allProjects.length, // Total count for scannedCount
        lastKey: endIndex < allProjects.length ? endIndex.toString() : null,
      });
    } catch (error) {
      console.error('Admin directory query error:', error);
      // Return empty result on error
      return json(200, C, {
        items: [],
        count: 0,
        scannedCount: 0,
        lastKey: null,
        warning: 'Directory query temporarily unavailable'
      });
    }
  }
  
  // Non-admin users see only their assigned projects
  if (!userId) return json(400, C, { error: "Missing userId" });
  
  console.log('Taking fallback non-admin path');
  // Fetch user's project IDs from their profile
  const u = await ddb.get({
    TableName: USER_PROFILES_TABLE,
    Key: { userId },
    ProjectionExpression: "projects",
  });
  const projectIds = Array.isArray(u.Item?.projects) ? u.Item.projects.slice(0, limit) : [];
  
  if (!projectIds.length) {
    return json(200, C, { items: [], count: 0, scannedCount: 0, lastKey: null });
  }
  
  // Get all projects from ProjectDirectory table
  const directoryResult = await ddb.get({
    TableName: PROJECT_DIRECTORY_TABLE,
    Key: { directoryId: "1" },
    ConsistentRead: true,
  });

    if (!directoryResult.Item || !directoryResult.Item.projects) {
      console.log('No projects found in directory for user, falling back to Projects table');
      
      // Fallback to old behavior for debugging
      const r = await ddb.batchGet({
        RequestItems: {
          [PROJECTS_TABLE]: {
            Keys: projectIds.map((projectId) => ({ projectId }))
          },
        },
      });
      
      console.log(`Fallback found ${r.Responses?.[PROJECTS_TABLE]?.length || 0} projects for user`);
      return json(200, C, { items: r.Responses?.[PROJECTS_TABLE] || [], count: (r.Responses?.[PROJECTS_TABLE] || []).length, scannedCount: (r.Responses?.[PROJECTS_TABLE] || []).length, lastKey: null });
    }  // Filter projects to only include those the user has access to
  const projectsMap = directoryResult.Item.projects;
  const userProjects = projectIds
    .map(projectId => {
      const projectData = projectsMap[projectId];
      if (projectData) {
        return {
          projectId,
          ...projectData,
          // Convert thumbnail back to thumbnails for frontend compatibility
          thumbnails: projectData.thumbnail ? [projectData.thumbnail] : [],
        };
      }
      return null;
    })
    .filter(Boolean);

  return json(200, C, { 
    items: userProjects, 
    count: userProjects.length, 
    scannedCount: userProjects.length, 
    lastKey: null 
  });
};

const createProject = async (e, C) => {
  const body = B(e);
  const projectId = body.projectId || uuidv4();
  const ts = nowISO();
  const { userId } = getUserFromEvent(e);

  const team = body.team || [];
  const teamUserIds = body.teamUserIds || team.map((m) => m.userId).filter(Boolean);
  const item = {
    projectId,
    title: body.title || "",
    status: body.status || "new",
    team,
    teamUserIds,
    ownerId: body.ownerId || userId || null,
    visibility: body.visibility || "admin",
    color: body.color,
    description: body.description,
    clientName: body.clientName,
    clientEmail: body.clientEmail,
    clientPhone: body.clientPhone,
    previewUrl: body.previewUrl,
    quickLinks: body.quickLinks || [],
    thumbnails: body.thumbnails || [],
    dateCreated: ts,
    updatedAt: ts,
  };

  await ddb.put({
    TableName: PROJECTS_TABLE,
    Item: item,
    ConditionExpression: "attribute_not_exists(projectId)",
  });

  await updateProjectDirectory(projectId, {
    title: item.title,
    slug: item.slug,
    color: item.color,
    status: item.status,
    team: item.team,
    ownerId: item.ownerId,
    thumbnail: item.thumbnails[0],
    dateCreated: item.dateCreated,
    finishline: item.finishLine || item.finishline,
  });

  return json(201, C, item);
};

const getProject = async (_e, C, { projectId }) => {
  const r = await ddb.get({ TableName: PROJECTS_TABLE, Key: { projectId } });
  if (!r.Item) return json(200, C, null);
  
  return json(200, C, r.Item);
};

const patchProject = async (e, C, { projectId }) => {
  const body = B(e);
  const upd = buildUpdate({ ...body, updatedAt: nowISO() });
  if (!upd) return json(400, C, { error: "No fields to update" });
  const dirFields = [
    "color",
    "dateCreated",
    "finishLine",
    "finishline",
    "ownerId",
    "slug",
    "status",
    "team",
    "thumbnail",
    "thumbnails",
    "title",
  ];

  const r = await ddb.update({
    TableName: PROJECTS_TABLE,
    Key: { projectId },
    ...upd,
    ReturnValues: "ALL_NEW",
  });

  if (Object.keys(body).some((k) => dirFields.includes(k))) {
    await updateProjectDirectory(projectId, {
      color: r.Attributes.color,
      dateCreated: r.Attributes.dateCreated,
      finishline: r.Attributes.finishLine || r.Attributes.finishline,
      ownerId: r.Attributes.ownerId,
      slug: r.Attributes.slug,
      status: r.Attributes.status,
      team: r.Attributes.team,
      thumbnail: (r.Attributes.thumbnails && r.Attributes.thumbnails[0]) || r.Attributes.thumbnail,
      title: r.Attributes.title,
    });
  }

  return json(200, C, r.Attributes);
};

// Calendar: Overlap Stack Titles (project-wide)
const getOverlapStackTitles = async (_e, C, { projectId }) => {
  const r = await ddb.get({
    TableName: PROJECTS_TABLE,
    Key: { projectId },
    ProjectionExpression: "projectId, calendarOverlapStackTitles",
  });
  return json(200, C, {
    projectId,
    calendarOverlapStackTitles: r.Item?.calendarOverlapStackTitles || {},
  });
};

const patchOverlapStackTitles = async (e, C, { projectId }) => {
  const b = B(e);
  const key = typeof b?.key === "string" ? b.key.trim() : "";
  const titleRaw = typeof b?.title === "string" ? b.title : "";
  const title = titleRaw.trim();

  if (!key) return json(400, C, { error: "key is required" });

  // Read-modify-write to avoid DynamoDB path overlap errors
  const existing = await ddb.get({
    TableName: PROJECTS_TABLE,
    Key: { projectId },
    ProjectionExpression: "calendarOverlapStackTitles",
  });

  const current = existing.Item?.calendarOverlapStackTitles || {};
  const isRemove = !title;

  if (isRemove) {
    delete current[key];
  } else {
    current[key] = title;
  }

  const r = await ddb.update({
    TableName: PROJECTS_TABLE,
    Key: { projectId },
    UpdateExpression: "SET #calendar = :titles, #updatedAt = :now",
    ExpressionAttributeNames: {
      "#calendar": "calendarOverlapStackTitles",
      "#updatedAt": "updatedAt",
    },
    ExpressionAttributeValues: {
      ":titles": current,
      ":now": nowISO(),
    },
    ReturnValues: "ALL_NEW",
  });

  return json(200, C, {
    projectId,
    calendarOverlapStackTitles: r.Attributes?.calendarOverlapStackTitles || {},
  });
};

const deleteProject = async (_e, C, { projectId }) => {
  await ddb.delete({ TableName: PROJECTS_TABLE, Key: { projectId } });
  return json(204, C, "");
};

/* ---------- Team (array on project) ---------- */
const getTeam = async (_e, C, { projectId }) => {
  const r = await ddb.get({
    TableName: PROJECTS_TABLE,
    Key: { projectId },
    ProjectionExpression: "projectId, team, teamUserIds",
  });
  return json(200, C, {
    projectId,
    team: r.Item?.team || [],
    teamUserIds: r.Item?.teamUserIds || [],
  });
};

const addTeam = async (e, C, { projectId }) => {
  const b = B(e);
  const members = Array.isArray(b) ? b : [b];
  const current = await ddb.get({
    TableName: PROJECTS_TABLE,
    Key: { projectId },
    ProjectionExpression: "team, teamUserIds",
  });
  const currTeam = current.Item?.team || [];
  const currIds = current.Item?.teamUserIds || [];
  const newTeam = currTeam.concat(members);
  const newIds = Array.from(new Set(currIds.concat(members.map((m) => m.userId).filter(Boolean))));
  const r = await ddb.update({
    TableName: PROJECTS_TABLE,
    Key: { projectId },
    UpdateExpression: "SET #team = :team, #teamUserIds = :ids, #updatedAt = :ts",
    ExpressionAttributeNames: {
      "#team": "team",
      "#teamUserIds": "teamUserIds",
      "#updatedAt": "updatedAt",
    },
    ExpressionAttributeValues: {
      ":team": newTeam,
      ":ids": newIds,
      ":ts": nowISO(),
    },
    ReturnValues: "ALL_NEW",
  });
  await updateProjectDirectory(projectId, { team: r.Attributes.team });
  return json(201, C, {
    projectId,
    team: r.Attributes.team || [],
    teamUserIds: r.Attributes.teamUserIds || [],
  });
};

const removeTeam = async (_e, C, { projectId, userId }) => {
  const r = await ddb.get({
    TableName: PROJECTS_TABLE,
    Key: { projectId },
    ProjectionExpression: "team, teamUserIds",
  });
  const team = (r.Item?.team || []).filter((m) => m?.userId !== userId);
  const teamUserIds = (r.Item?.teamUserIds || []).filter((id) => id !== userId);
  await ddb.update({
    TableName: PROJECTS_TABLE,
    Key: { projectId },
    UpdateExpression: "SET #team = :team, #teamUserIds = :ids, #updatedAt = :ts",
    ExpressionAttributeNames: {
      "#team": "team",
      "#teamUserIds": "teamUserIds",
      "#updatedAt": "updatedAt",
    },
    ExpressionAttributeValues: { ":team": team, ":ids": teamUserIds, ":ts": nowISO() },
  });
  await updateProjectDirectory(projectId, { team });
  return json(200, C, { projectId, removedUserId: userId, team, teamUserIds });
};

function addIdCandidate(set, value) {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed) set.add(trimmed);
}

function getTaskAssigneeIds(task) {
  const ids = new Set();
  if (!task || typeof task !== "object") return ids;
  addIdCandidate(ids, task.assigneeId);
  addIdCandidate(ids, task.assignedTo);
  if (Array.isArray(task.assigneeIds)) {
    task.assigneeIds.forEach((id) => addIdCandidate(ids, id));
  }
  if (Array.isArray(task.assignees)) {
    task.assignees.forEach((assignee) => {
      if (!assignee) return;
      if (typeof assignee === "string") {
        addIdCandidate(ids, assignee);
        return;
      }
      addIdCandidate(ids, assignee.userId);
      addIdCandidate(ids, assignee.id);
    });
  }
  return ids;
}

function isTaskCreator(task, userId) {
  if (!userId) return false;
  const candidateIds = [task?.createdById, task?.createdBy];
  return candidateIds.some((value) => typeof value === "string" && value.trim() === userId);
}

function normalizeReviewAction(action) {
  if (typeof action !== "string") return null;
  const normalized = action.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "submit") return "submit_for_review";
  if (normalized === "submit_for_review") return "submit_for_review";
  if (normalized === "request_changes") return "request_changes";
  if (normalized === "approve") return "approve";
  if (normalized === "mark_done") return "mark_done";
  return null;
}

function getTaskThread(task) {
  const raw = task?.thread;
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry) => entry && typeof entry === "object");
}

function resolveSubmissionId(task, nextAction) {
  if (nextAction === "submit_for_review") {
    return uuidv4();
  }
  const existing = typeof task?.currentSubmissionId === "string" ? task.currentSubmissionId.trim() : "";
  return existing || uuidv4();
}

function buildThreadEntry({ task, action, note, actorId, isAdmin, now }) {
  const fromStatus = normalizeTaskStatus(task?.status);
  const submissionId = resolveSubmissionId(task, action);
  const entry = {
    id: makeThreadEntryId(),
    submissionId,
    action,
    note: typeof note === "string" ? note : undefined,
    fromStatus,
    createdAt: now,
    createdById: actorId || undefined,
    createdByAdmin: Boolean(isAdmin),
  };
  return { entry, submissionId };
}

const performReviewTransition = async (e, C, { projectId, taskId }, actionOverride) => {
  const body = B(e) || {};
  const action = normalizeReviewAction(actionOverride ?? body.action);
  if (!action) {
    return json(400, C, { error: "Invalid review action" });
  }

  const { userId, isAdmin } = getUserFromEvent(e);
  if (!userId && !isAdmin) {
    return json(403, C, { error: "Authentication required" });
  }

  const task = await dalGetTaskById({ ddb, tableName: TASKS_TABLE, projectId, taskId });
  if (!task) {
    return json(404, C, { error: "Task not found" });
  }

  const actorId = userId || null;
  const now = nowISO();
  const status = normalizeTaskStatus(task.status);
  const assigneeIds = getTaskAssigneeIds(task);

  if (action === "submit_for_review") {
    const canSubmit =
      isAdmin ||
      (actorId && (assigneeIds.has(actorId) || isTaskCreator(task, actorId)));
    if (!canSubmit) {
      return json(403, C, { error: "Not authorized to submit review" });
    }
    if (!["todo", "in_progress", "needs_changes"].includes(status)) {
      return json(409, C, { error: "Task is not ready for review submission" });
    }

    const reviewerCandidate =
      typeof body.reviewerId === "string" && body.reviewerId.trim()
        ? body.reviewerId.trim()
        : task.reviewerId || task.createdById || task.createdBy || actorId;

    const note = typeof body.note === "string" ? body.note : undefined;
    const { entry, submissionId } = buildThreadEntry({ task, action, note, actorId, isAdmin, now });
    const thread = [...getTaskThread(task), entry];

    const updated = await dalUpdateTaskStatus({
      ddb,
      tableName: TASKS_TABLE,
      projectId,
      taskId,
      nextStatus: "in_review",
      actorId,
      now,
      options: {
        reviewerId: reviewerCandidate || null,
        note,
        reviewRequestedAt: now,
        clearReviewedTimestamps: true,
        additionalUpdates: {
          reviewState: "in_review",
          currentSubmissionId: submissionId,
          thread,
        },
      },
    });

    return json(200, C, updated);
  }

  if (!isAdmin) {
    return json(403, C, { error: "Not authorized to transition review" });
  }

  if (action === "request_changes") {
    const noteRaw = typeof body.note === "string" ? body.note.trim() : "";
    if (!noteRaw) {
      return json(400, C, { error: "A note is required when requesting changes" });
    }
    if (!["in_review", "done"].includes(status)) {
      return json(409, C, { error: "Task is not under review" });
    }

    const { entry, submissionId } = buildThreadEntry({ task, action, note: noteRaw, actorId, isAdmin, now });
    const thread = [...getTaskThread(task), entry];

    const updated = await dalUpdateTaskStatus({
      ddb,
      tableName: TASKS_TABLE,
      projectId,
      taskId,
      nextStatus: "needs_changes",
      actorId,
      now,
      options: {
        note: noteRaw,
        additionalUpdates: {
          reviewState: "needs_changes",
          currentSubmissionId: submissionId,
          thread,
        },
      },
    });

    return json(200, C, updated);
  }

  if (action === "approve") {
    if (status !== "in_review") {
      return json(409, C, { error: "Task is not under review" });
    }
    const note = typeof body.note === "string" ? body.note : undefined;
    const { entry, submissionId } = buildThreadEntry({ task, action, note, actorId, isAdmin, now });
    const thread = [...getTaskThread(task), entry];

    const updated = await dalUpdateTaskFields({
      ddb,
      tableName: TASKS_TABLE,
      projectId,
      taskId,
      now,
      fields: {
        reviewState: "approved",
        currentSubmissionId: submissionId,
        thread,
        reviewedAt: now,
      },
    });

    return json(200, C, updated);
  }

  if (action === "mark_done") {
    if (status === "archived") {
      return json(409, C, { error: "Archived tasks cannot be marked done" });
    }

    const note = typeof body.note === "string" ? body.note : undefined;
    const { entry, submissionId } = buildThreadEntry({ task, action, note, actorId, isAdmin, now });
    const thread = [...getTaskThread(task), entry];

    if (status === "done") {
      const updated = await dalUpdateTaskFields({
        ddb,
        tableName: TASKS_TABLE,
        projectId,
        taskId,
        now,
        fields: {
          reviewState: "done",
          currentSubmissionId: submissionId,
          thread,
        },
      });
      return json(200, C, updated);
    }

    if (status !== "in_review") {
      const reviewerCandidate = task.reviewerId || task.createdById || task.createdBy || actorId;
      await dalUpdateTaskStatus({
        ddb,
        tableName: TASKS_TABLE,
        projectId,
        taskId,
        nextStatus: "in_review",
        actorId,
        now,
        options: {
          reviewerId: reviewerCandidate || null,
          reviewRequestedAt: now,
          clearReviewedTimestamps: true,
          additionalUpdates: {
            reviewState: "in_review",
            currentSubmissionId: submissionId,
          },
        },
      });
    }

    const updated = await dalUpdateTaskStatus({
      ddb,
      tableName: TASKS_TABLE,
      projectId,
      taskId,
      nextStatus: "done",
      actorId,
      now,
      options: {
        completedAt: now,
        reviewedAt: now,
        note,
        additionalUpdates: {
          reviewState: "done",
          currentSubmissionId: submissionId,
          thread,
        },
      },
    });

    return json(200, C, updated);
  }

  return json(400, C, { error: "Invalid review action" });
};

const reviewTransition = async (e, C, { projectId, taskId }) => {
  return performReviewTransition(e, C, { projectId, taskId });
};

/* ---------- Tasks (PK=projectId, SK=taskId) ---------- */
const listTasks = async (_e, C, { projectId }) => {
  const r = await ddb.query({
    TableName: TASKS_TABLE,
    KeyConditionExpression: "projectId = :p",
    ExpressionAttributeValues: { ":p": projectId },
  });
  return json(200, C, { projectId, tasks: r.Items || [] });
};

const createTask = async (e, C, { projectId }) => {
  const b = B(e);
  const { userId, username, displayName, email } = getUserFromEvent(e);
  const body = { ...(b || {}) };
  delete body.createdAt;
  delete body.updatedAt;
  delete body.statusDueDateTaskId;
  delete body.createdBy;
  delete body.createdById;
  delete body.createdByName;
  delete body.createdByUsername;
  delete body.createdByEmail;
  delete body.thread;
  delete body.reviewState;
  delete body.currentSubmissionId;
  const taskId = b.taskId || `T-${uuidv4()}`;
  const ts = nowISO();
  const item = {
    ...body,
    projectId,
    taskId,
    createdAt: ts,
    updatedAt: ts,
  };
  item.title = typeof item.title === "string" ? item.title : "";
  item.status = normalizeTaskStatus(item.status);
  item.projectId = projectId;
  item.taskId = taskId;
  if (userId) {
    item.createdBy = userId;
    item.createdById = userId;
  }
  if (displayName) item.createdByName = displayName;
  if (username) item.createdByUsername = username;
  if (email) item.createdByEmail = email;
  if (!item.reviewerId && item.createdById) {
    item.reviewerId = item.createdById;
  }
  item.archived = false;
  if (item.status === "done") {
    item.completedAt = item.completedAt || ts;
  } else if (item.completedAt !== undefined) {
    item.completedAt = null;
  }
  if (item.reviewNote == null) {
    item.reviewNote = "";
  }
  if (!Array.isArray(item.thread)) {
    item.thread = [];
  }
  if (item.currentSubmissionId === undefined) {
    item.currentSubmissionId = null;
  }
  if (typeof item.reviewState !== "string" || !item.reviewState.trim()) {
    item.reviewState = "";
  }
  const statusSortKey = buildStatusSortKey(item.status, item.dueAt, taskId);
  item.statusSortKey = statusSortKey;
  item.statusDueDateTaskId = statusSortKey.replace("##", "#").replace("##", "#");
  await ddb.put({
    TableName: TASKS_TABLE,
    Item: item,
    ConditionExpression: "attribute_not_exists(projectId) AND attribute_not_exists(taskId)",
  });
  return json(201, C, { projectId, task: item });
};

const bulkCreateTasks = async (e, C, { projectId }) => {
  const b = B(e);
  const inputTasks = Array.isArray(b) ? b : Array.isArray(b?.tasks) ? b.tasks : [];

  if (!Array.isArray(inputTasks) || inputTasks.length === 0) {
    return json(400, C, { error: "tasks must be a non-empty array" });
  }

  if (inputTasks.length > 200) {
    return json(413, C, { error: "Too many tasks (max 200)" });
  }

  const { userId, username, displayName, email } = getUserFromEvent(e);
  const ts = nowISO();

  const sanitize = (task) => {
    const body = { ...(task || {}) };
    delete body.createdAt;
    delete body.updatedAt;
    delete body.statusDueDateTaskId;
    delete body.createdBy;
    delete body.createdById;
    delete body.createdByName;
    delete body.createdByUsername;
    delete body.createdByEmail;
    delete body.thread;
    delete body.reviewState;
    delete body.currentSubmissionId;
    return body;
  };

  const items = inputTasks.map((task) => {
    const body = sanitize(task);
    const taskId = body.taskId || `T-${uuidv4()}`;
    delete body.taskId;
    delete body.projectId;

    const item = {
      ...body,
      projectId,
      taskId,
      createdAt: ts,
      updatedAt: ts,
    };

    item.title = typeof item.title === "string" ? item.title : "";
    item.status = normalizeTaskStatus(item.status);
    item.projectId = projectId;
    item.taskId = taskId;

    if (userId) {
      item.createdBy = userId;
      item.createdById = userId;
    }
    if (displayName) item.createdByName = displayName;
    if (username) item.createdByUsername = username;
    if (email) item.createdByEmail = email;
    if (!item.reviewerId && item.createdById) {
      item.reviewerId = item.createdById;
    }

    item.archived = false;
    if (item.status === "done") {
      item.completedAt = item.completedAt || ts;
    } else if (item.completedAt !== undefined) {
      item.completedAt = null;
    }

    if (item.reviewNote == null) {
      item.reviewNote = "";
    }
    if (!Array.isArray(item.thread)) {
      item.thread = [];
    }
    if (item.currentSubmissionId === undefined) {
      item.currentSubmissionId = null;
    }
    if (typeof item.reviewState !== "string" || !item.reviewState.trim()) {
      item.reviewState = "";
    }

    const statusSortKey = buildStatusSortKey(item.status, item.dueAt, taskId);
    item.statusSortKey = statusSortKey;
    item.statusDueDateTaskId = statusSortKey.replace("##", "#").replace("##", "#");

    return item;
  });

  const requests = items.map((Item) => ({ PutRequest: { Item } }));
  const batches = chunk(requests, 25);

  for (const batch of batches) {
    let unprocessed = batch;
    for (let attempt = 0; attempt < 6 && unprocessed.length > 0; attempt++) {
      const result = await ddb.batchWrite({
        RequestItems: {
          [TASKS_TABLE]: unprocessed,
        },
      });
      const leftover = result?.UnprocessedItems?.[TASKS_TABLE] || [];
      unprocessed = Array.isArray(leftover) ? leftover : [];
      if (unprocessed.length > 0) {
        const delay = Math.min(2000, 150 * Math.pow(2, attempt));
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    if (unprocessed.length > 0) {
      return json(503, C, { error: "Failed to write all tasks. Please retry." });
    }
  }

  return json(201, C, { projectId, tasks: items });
};

const bulkPatchTasks = async (e, C, { projectId }) => {
  const b = B(e);
  const updates = Array.isArray(b) ? b : Array.isArray(b?.updates) ? b.updates : [];

  if (!Array.isArray(updates) || updates.length === 0) {
    return json(400, C, { error: "updates must be a non-empty array" });
  }

  if (updates.length > 200) {
    return json(413, C, { error: "Too many updates (max 200)" });
  }

  const now = nowISO();
  const out = [];

  for (const entry of updates) {
    const taskId = entry?.taskId || entry?.id;
    if (!taskId || typeof taskId !== "string") {
      return json(400, C, { error: "Each update must include taskId" });
    }

    const fields = entry?.fields && typeof entry.fields === "object" ? entry.fields : entry;
    const updatesObj = { ...(fields || {}) };
    delete updatesObj.taskId;
    delete updatesObj.id;
    delete updatesObj.projectId;

    delete updatesObj.createdAt;
    delete updatesObj.createdBy;
    delete updatesObj.createdById;
    delete updatesObj.createdByName;
    delete updatesObj.createdByUsername;
    delete updatesObj.createdByEmail;
    delete updatesObj.statusDueDateTaskId;
    delete updatesObj.statusSortKey;
    delete updatesObj.updatedAt;
    delete updatesObj.completedAt;
    delete updatesObj.reviewRequestedAt;
    delete updatesObj.reviewedAt;
    delete updatesObj.reviewNote;
    delete updatesObj.needsChangesNote;
    delete updatesObj.archived;
    delete updatesObj.archivedAt;
    delete updatesObj.archivedById;
    delete updatesObj.thread;
    delete updatesObj.reviewState;
    delete updatesObj.currentSubmissionId;

    const statusValue = updatesObj.status;
    if (statusValue !== undefined) {
      delete updatesObj.status;
      const nextStatus = normalizeTaskStatus(statusValue);
      const restrictedTargets = new Set(["in_review", "needs_changes", "done", "archived"]);
      if (restrictedTargets.has(nextStatus)) {
        return json(400, C, { error: "Status transition requires a dedicated endpoint" });
      }
    }

    const updated = await dalUpdateTaskFields({
      ddb,
      tableName: TASKS_TABLE,
      projectId,
      taskId,
      fields: updatesObj,
      now,
    });

    out.push(updated);
  }

  return json(200, C, { projectId, tasks: out });
};

const getTask = async (_e, C, { projectId, taskId }) => {
  const r = await ddb.get({ TableName: TASKS_TABLE, Key: { projectId, taskId } });
  return json(200, C, r.Item || null);
};

const patchTask = async (e, C, { projectId, taskId }) => {
  const body = B(e);
  if (!body || typeof body !== "object") {
    return json(400, C, { error: "No fields to update" });
  }

  const updates = { ...body };
  delete updates.createdAt;
  delete updates.createdBy;
  delete updates.createdById;
  delete updates.createdByName;
  delete updates.createdByUsername;
  delete updates.createdByEmail;
  delete updates.statusDueDateTaskId;
  delete updates.statusSortKey;
  delete updates.updatedAt;
  delete updates.completedAt;
  delete updates.reviewRequestedAt;
  delete updates.reviewedAt;
  delete updates.reviewNote;
  delete updates.needsChangesNote;
  delete updates.archived;
  delete updates.archivedAt;
  delete updates.archivedById;
  delete updates.thread;
  delete updates.reviewState;
  delete updates.currentSubmissionId;

  const statusValue = updates.status;
  if (statusValue !== undefined) {
    delete updates.status;
  }

  const now = nowISO();
  const { userId, isAdmin } = getUserFromEvent(e);

  if (statusValue !== undefined) {
    const nextStatus = normalizeTaskStatus(statusValue);
    const current = await dalGetTaskById({
      ddb,
      tableName: TASKS_TABLE,
      projectId,
      taskId,
    });
    if (!current) {
      return json(404, C, { error: "Task not found" });
    }

    const currentStatus = normalizeTaskStatus(current.status);
    if (nextStatus !== currentStatus) {
      const restrictedTargets = new Set(["in_review", "needs_changes", "done", "archived"]);
      if (restrictedTargets.has(nextStatus)) {
        return json(400, C, { error: "Status transition requires a dedicated endpoint" });
      }

      if (nextStatus !== "in_progress") {
        return json(400, C, { error: "Unsupported status transition" });
      }

      if (!new Set(["todo", "needs_changes", "in_progress"]).has(currentStatus)) {
        return json(400, C, { error: "Invalid status transition" });
      }

      const actorId = userId || null;
      const assignees = getTaskAssigneeIds(current);
      const canProgress =
        isAdmin ||
        (actorId && (assignees.has(actorId) || isTaskCreator(current, actorId)));
      if (!canProgress) {
        return json(403, C, { error: "Not authorized to update task status" });
      }
    }

    const hasAdditional = Object.keys(updates).length > 0;
    const options = {
      additionalUpdates: hasAdditional ? updates : undefined,
      dueAt: updates.dueAt,
    };
    if (options.dueAt === undefined) {
      delete options.dueAt;
    }
    if (hasAdditional || options.dueAt !== undefined) {
      options.force = true;
    }
    const updated = await dalUpdateTaskStatus({
      ddb,
      tableName: TASKS_TABLE,
      projectId,
      taskId,
      nextStatus,
      actorId: userId || null,
      now,
      options,
    });
    return json(200, C, updated);
  }

  if (Object.keys(updates).length) {
    const updated = await dalUpdateTaskFields({
      ddb,
      tableName: TASKS_TABLE,
      projectId,
      taskId,
      fields: updates,
      now,
    });
    return json(200, C, updated);
  }

  return json(400, C, { error: "No fields to update" });
};

const deleteTask = async (_e, C, { projectId, taskId }) => {
  await ddb.delete({ TableName: TASKS_TABLE, Key: { projectId, taskId } });
  return json(204, C, "");
};

const requestTaskReview = async (e, C, { projectId, taskId }) => {
  return performReviewTransition(e, C, { projectId, taskId }, "submit_for_review");
};

const approveTaskReview = async (e, C, { projectId, taskId }) => {
  return performReviewTransition(e, C, { projectId, taskId }, "mark_done");
};

const requestTaskChanges = async (e, C, { projectId, taskId }) => {
  return performReviewTransition(e, C, { projectId, taskId }, "request_changes");
};

const archiveTask = async (e, C, { projectId, taskId }) => {
  const { userId, isAdmin } = getUserFromEvent(e);
  if (!userId && !isAdmin) {
    return json(403, C, { error: "Authentication required" });
  }

  const task = await dalGetTaskById({ ddb, tableName: TASKS_TABLE, projectId, taskId });
  if (!task) {
    return json(404, C, { error: "Task not found" });
  }

  const actorId = userId || null;
  const reviewerId = typeof task.reviewerId === "string" ? task.reviewerId.trim() : null;
  const canArchive =
    isAdmin ||
    (actorId && (isTaskCreator(task, actorId) || (reviewerId && reviewerId === actorId)));

  if (!canArchive) {
    return json(403, C, { error: "Not authorized to archive" });
  }

  const updated = await dalSetArchive({
    ddb,
    tableName: TASKS_TABLE,
    projectId,
    taskId,
    archived: true,
    actorId,
    now: nowISO(),
  });

  return json(200, C, updated);
};

const unarchiveTask = async (e, C, { projectId, taskId }) => {
  const { userId, isAdmin } = getUserFromEvent(e);
  if (!userId && !isAdmin) {
    return json(403, C, { error: "Authentication required" });
  }

  const task = await dalGetTaskById({ ddb, tableName: TASKS_TABLE, projectId, taskId });
  if (!task) {
    return json(404, C, { error: "Task not found" });
  }

  const actorId = userId || null;
  const reviewerId = typeof task.reviewerId === "string" ? task.reviewerId.trim() : null;
  const canUnarchive =
    isAdmin ||
    (actorId && (isTaskCreator(task, actorId) || (reviewerId && reviewerId === actorId)));

  if (!canUnarchive) {
    return json(403, C, { error: "Not authorized to unarchive" });
  }

  const updated = await dalSetArchive({
    ddb,
    tableName: TASKS_TABLE,
    projectId,
    taskId,
    archived: false,
    actorId,
    now: nowISO(),
  });

  return json(200, C, updated);
};

/* ---------- Events (unified timeline/schedule) ---------- */
const listEvents = async (e, C, { projectId }) => {
  const q = Q(e);
  const view = (q.view || "timeline").toLowerCase();
  const fromISO = q.from || null;
  const toISO   = q.to || null;
  const kinds = (q.kind || "").split(",").map((s) => s.trim()).filter(Boolean);

  let items = [];
  if (view === "schedule" && EVENTS_STARTAT_INDEX) {
    const values = { ":p": projectId };
    let cond = "projectId = :p";
    if (fromISO && toISO) {
      cond += " AND #startAt BETWEEN :from AND :to";
      values[":from"] = fromISO; values[":to"] = toISO;
    } else if (fromISO) {
      cond += " AND #startAt >= :from";
      values[":from"] = fromISO;
    } else if (toISO) {
      cond += " AND #startAt <= :to";
      values[":to"] = toISO;
    }
    const r = await ddb.query({
      TableName: EVENTS_TABLE,
      IndexName: EVENTS_STARTAT_INDEX,
      KeyConditionExpression: cond,
      ExpressionAttributeNames: { "#startAt": "startAt" },
      ExpressionAttributeValues: values,
      ScanIndexForward: true,
    });
    items = r.Items || [];
  } else {
    const r = await ddb.query({
      TableName: EVENTS_TABLE,
      KeyConditionExpression: "projectId = :p",
      ExpressionAttributeValues: { ":p": projectId },
      ScanIndexForward: false, // eventId encoded with millis for DESC
    });
    items = r.Items || [];
  }

  if (kinds.length) items = items.filter((ev) => ev?.kind && kinds.includes(ev.kind));
  return json(200, C, { projectId, view, events: items });
};

const createEvent = async (e, C, { projectId }) => {
  const b = B(e);
  const tsMillis = Date.now();
  const eventId = b.eventId || makeEventId(tsMillis);
  const ts = b.ts || new Date(tsMillis).toISOString();

  const item = {
    projectId,
    eventId,
    ts,
    kind: b.kind || "note",
    title: b.title || "",
    description: b.description,
    startAt: b.startAt,
    endAt: b.endAt,
    actorId: b.actorId,
    tags: b.tags || [],
    meta: b.meta || {},
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  await ddb.put({
    TableName: EVENTS_TABLE,
    Item: item,
    ConditionExpression: "attribute_not_exists(projectId) AND attribute_not_exists(eventId)",
  });

  return json(201, C, { projectId, event: item });
};

const getEvent = async (_e, C, { projectId, eventId }) => {
  const r = await ddb.get({ TableName: EVENTS_TABLE, Key: { projectId, eventId } });
  return json(200, C, r.Item || null);
};

const patchEvent = async (e, C, { projectId, eventId }) => {
  const b = B(e);
  const upd = buildUpdate({ ...b, updatedAt: nowISO() });
  if (!upd) return json(400, C, { error: "No fields to update" });
  const r = await ddb.update({
    TableName: EVENTS_TABLE,
    Key: { projectId, eventId },
    ...upd,
    ReturnValues: "ALL_NEW",
  });
  return json(200, C, r.Attributes);
};

const deleteEvent = async (_e, C, { projectId, eventId }) => {
  await ddb.delete({ TableName: EVENTS_TABLE, Key: { projectId, eventId } });
  return json(204, C, "");
};

/* ---------- Project file management ---------- */
const deleteProjectFiles = async (e, C, { projectId }) => {
  const body = B(e);
  const keys = Array.isArray(body.fileKeys) ? body.fileKeys.filter(Boolean) : [];
  if (!projectId) return json(400, C, { error: "projectId is required" });
  if (!keys.length) return json(400, C, { error: "fileKeys must be a non-empty array" });

  const objects = [...new Set(keys)].map((Key) => ({ Key }));

  try {
    const result = await s3.send(
      new DeleteObjectsCommand({
        Bucket: FILE_BUCKET,
        Delete: { Objects: objects },
      }),
    );

    const deleted = (result.Deleted || []).map((item) => item.Key).filter(Boolean);
    const errors = (result.Errors || []).map((err) => ({
      key: err.Key,
      code: err.Code,
      message: err.Message,
    }));

    return json(200, C, {
      ok: errors.length === 0,
      projectId,
      deleted,
      errors,
    });
  } catch (err) {
    console.error("delete_project_files_error", { projectId, keys, err });
    const message = err?.message || "Failed to delete files";
    return json(500, C, { error: message });
  }
};

// Back-compat timeline shims
const getTimeline = (e, C, g) => {
  const e2 = { ...e, queryStringParameters: { ...(Q(e) || {}), view: "timeline" } };
  return listEvents(e2, C, g);
};
const addTimeline = createEvent;
const patchTimeline = patchEvent;
const deleteTimeline = deleteEvent;

/* ---------- Quick Links & Thumbnails on Project ---------- */
const getQuickLinks = async (_e, C, { projectId }) => {
  const r = await ddb.get({ TableName: PROJECTS_TABLE, Key: { projectId }, ProjectionExpression: "quickLinks" });
  return json(200, C, { projectId, quickLinks: r.Item?.quickLinks || [] });
};

const addQuickLink = async (e, C, { projectId }) => {
  const link = B(e);
  link.id = link.id || `QL-${uuidv4()}`;
  const r = await ddb.update({
    TableName: PROJECTS_TABLE,
    Key: { projectId },
    UpdateExpression: "SET #ql = list_append(if_not_exists(#ql, :empty), :l), #updatedAt = :ts",
    ExpressionAttributeNames: { "#ql": "quickLinks", "#updatedAt": "updatedAt" },
    ExpressionAttributeValues: { ":l": [link], ":empty": [], ":ts": nowISO() },
    ReturnValues: "ALL_NEW",
  });
  return json(201, C, { projectId, quickLinks: r.Attributes.quickLinks || [] });
};

const getThumbnails = async (_e, C, { projectId }) => {
  const r = await ddb.get({ TableName: PROJECTS_TABLE, Key: { projectId }, ProjectionExpression: "thumbnails" });
  return json(200, C, { projectId, thumbnails: r.Item?.thumbnails || [] });
};

/* ---------- Galleries ---------- */
// GET /projects/{projectId}/galleries
const listProjectGalleries = async (_e, C, { projectId }) => {
  const r = await ddb.query({
    TableName: GALLERIES_TABLE,
    IndexName: GALLERIES_PROJECT_INDEX,
    KeyConditionExpression: "projectId = :pid",
    ExpressionAttributeValues: { ":pid": projectId },
  });
  return json(200, C, r.Items || []);
};

// POST /projects/{projectId}/galleries
// body: { name, ...customFields }
const createGallery = async (e, C, { projectId }) => {
  const b = B(e);
  if (!b.name) return json(400, C, "name is required");
  const galleryId = b.galleryId || uuidv4();
  const now = epochNow();

  const item = {
    ...b,
    projectId,
    galleryId,           // PK
    createdAt: now,
    updatedAt: now,
  };

  await ddb.put({
    TableName: GALLERIES_TABLE,
    Item: item,
    ConditionExpression: "attribute_not_exists(galleryId)",
  });

  return json(201, C, item);
};

// GET /projects/{projectId}/galleries/{galleryId}
const getGallery = async (_e, C, { projectId, galleryId }) => {
  const r = await ddb.get({ TableName: GALLERIES_TABLE, Key: { galleryId } });
  const item = r.Item || null;
  // optional guard: ensure the item belongs to this project
  if (item && item.projectId && item.projectId !== projectId) {
    return json(404, C, null);
  }
  return json(200, C, item);
};

// PUT /projects/{projectId}/galleries/{galleryId}  (merge/upsert)
const putGallery = async (e, C, { projectId, galleryId }) => {
  const b = B(e);
  // fetch so we merge (v1.1 behavior)
  const ex = await ddb.get({ TableName: GALLERIES_TABLE, Key: { galleryId } });
  const merged = {
    ...(ex.Item || {}),
    ...b,
    projectId,
    galleryId,
    updatedAt: epochNow(),
    createdAt: ex.Item?.createdAt || epochNow(),
  };
  await ddb.put({ TableName: GALLERIES_TABLE, Item: merged });
  return json(200, C, merged);
};

// PATCH /projects/{projectId}/galleries/{galleryId}
const patchGallery = async (e, C, { projectId, galleryId }) => {
  const b = B(e);
  const upd = buildUpdate({ ...b, updatedAt: epochNow(), projectId }); // keep projectId aligned
  if (!upd) return json(400, C, "No fields to update");
  const r = await ddb.update({
    TableName: GALLERIES_TABLE,
    Key: { galleryId },
    ...upd,
    ReturnValues: "ALL_NEW",
  });
  // optional project guard
  if (r.Attributes?.projectId && r.Attributes.projectId !== projectId) {
    return json(404, C, null);
  }
  return json(200, C, r.Attributes);
};

// DELETE /projects/{projectId}/galleries/{galleryId}
const deleteGallery = async (_e, C, { projectId, galleryId }) => {
  // (optional) read first to validate projectId
  const r0 = await ddb.get({ TableName: GALLERIES_TABLE, Key: { galleryId } });
  if (!r0.Item || (r0.Item.projectId && r0.Item.projectId !== projectId)) {
    return json(404, C, null);
  }
  await ddb.delete({ TableName: GALLERIES_TABLE, Key: { galleryId } });
  return json(204, C, "");
};

// POST /projects/{projectId}/galleries/{gallerySlug}/files/delete
const deleteGalleryFilesBySlug = async (e, C, { projectId, gallerySlug }) => {
  if (!projectId || !gallerySlug) {
    return json(400, C, { error: "projectId and gallerySlug required" });
  }

  const { slug: resolvedSlug, galleryId } = await resolveGallerySlug(projectId, gallerySlug);
  if (!resolvedSlug) {
    return json(404, C, { error: "Gallery not found", projectId, gallerySlug });
  }

  const prefix = `projects/${projectId}/gallery/${resolvedSlug}/`;
  try {
    const keys = await listAllKeys(FILE_BUCKET, prefix);
    if (!keys.length) {
      return json(200, C, { ok: true, projectId, gallerySlug: resolvedSlug, galleryId, deletedCount: 0, errors: [] });
    }

    const batches = chunk(keys, 1000);
    const errors = [];
    for (const b of batches) {
      const res = await s3.send(new DeleteObjectsCommand({
        Bucket: FILE_BUCKET,
        Delete: { Objects: b.map(Key => ({ Key })), Quiet: true }
      }));
      (res.Errors || []).forEach(err => errors.push({
        key: err.Key, code: err.Code, message: err.Message
      }));
    }

    return json(200, C, {
      ok: errors.length === 0,
      projectId,
      gallerySlug: resolvedSlug,
      galleryId,
      deletedCount: keys.length,
      errors
    });
  } catch (err) {
    console.error("delete_gallery_files_error", { projectId, gallerySlug: resolvedSlug, err });
    return json(500, C, {
      error: "Failed to delete gallery files",
      detail: String(err?.message || err),
      projectId,
      gallerySlug: resolvedSlug,
      galleryId,
    });
  }
};

// POST /projects/galleries/upload
// Body: { projectId, fileName, contentType, galleryName?, gallerySlug?, galleryPassword?, passwordEnabled?, passwordTimeout?, importToSlides? }
const createGalleryUpload = async (e, C) => {
  const b = B(e);
  const {
    projectId,
    fileName,
    contentType,
    galleryName,
    gallerySlug,
    galleryPassword,
    passwordEnabled,
    passwordTimeout,
    importToSlides,
    key: customKey,
    versionId, // For version-specific PDF imports
  } = b;
  
  if (!projectId || !fileName || !contentType) {
    return json(400, C, { error: "projectId, fileName, and contentType are required" });
  }

  if (importToSlides && contentType !== "application/pdf") {
    return json(400, C, { error: "importToSlides only supports PDF uploads" });
  }

  // Slides import must target exactly one deck version. If the caller doesn't pass a versionId,
  // try to use the project's activeDeckVersionId; otherwise error.
  let effectiveVersionId = versionId;
  if (importToSlides) {
    if (!effectiveVersionId) {
      const projectRes = await ddb.get({
        TableName: PROJECTS_TABLE,
        Key: { projectId },
        ProjectionExpression: "activeDeckVersionId",
      });
      effectiveVersionId = projectRes.Item?.activeDeckVersionId || null;
    }

    if (!effectiveVersionId) {
      return json(400, C, { error: "versionId is required for importToSlides" });
    }

    const versionRes = await ddb.get({
      TableName: DECK_VERSIONS_TABLE,
      Key: { projectId, versionId: effectiveVersionId },
      ProjectionExpression: "projectId, versionId",
    });
    if (!versionRes.Item) {
      return json(404, C, { error: "Deck version not found", versionId: effectiveVersionId });
    }
  }

  // Validate file type
  const allowedTypes = ['application/pdf', 'image/svg+xml', 'image/png', 'text/xml'];
  if (!allowedTypes.includes(contentType) && !contentType.startsWith('image/svg')) {
    return json(400, C, { error: "Only PDF, SVG, and PNG files are supported" });
  }

  // Generate unique file key
  const key = customKey || (() => {
    let fileExtension;
    if (contentType === 'application/pdf') {
      fileExtension = 'pdf';
    } else if (contentType === 'image/png') {
      fileExtension = 'png';
    } else {
      fileExtension = 'svg';
    }
    const timestamp = Date.now();
    const fileId = uuidv4();
    const importPrefix = importToSlides ? 'slides-import/' : '';
    return `uploads/${projectId}/${importPrefix}${timestamp}_${fileId}.${fileExtension}`;
  })();

  // Create metadata for the S3 object
  const metadata = {
    projectid: projectId,
    galleryname: galleryName || fileName,
  };
  
  if (gallerySlug) metadata.galleryslug = gallerySlug;
  if (galleryPassword) metadata.gallerypassword = galleryPassword;
  if (passwordEnabled !== undefined) metadata.passwordenabled = String(passwordEnabled);
  if (passwordTimeout) metadata.passwordtimeout = String(passwordTimeout);
  if (importToSlides) metadata.importtoslides = "true";
  if (importToSlides) metadata.versionid = String(effectiveVersionId);

  try {
    // Create presigned URL for upload
    const command = new PutObjectCommand({
      Bucket: FILE_BUCKET,
      Key: key,
      ContentType: contentType,
      Metadata: metadata,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 minutes

    return json(200, C, {
      uploadUrl,
      key,
      bucket: FILE_BUCKET,
      metadata,
    });
  } catch (error) {
    console.error("Error creating presigned URL:", error);
    return json(500, C, { error: "Failed to create upload URL" });
  }
};

/* ---------- Budgets (headers & line items) ---------- */
// Helpers
function enforcePrefix(id) {
  if (!id.startsWith("HEADER-") && !id.startsWith("LINE-")) {
    throw new Error("budgetItemId must start with HEADER- or LINE-");
  }
}

// POST /projects/{projectId}/budget  (create header OR line item)
// Body: { isHeader?: boolean, budgetId?, budgetItemId?, ... }
const createBudgetItem = async (e, C, { projectId }) => {
  const data = B(e);
  if (!projectId) return json(400, C, "projectId required");

  const isHeader = data.isHeader === true || !data.budgetId;

  // budgetId
  if (isHeader && !data.budgetId) {
    data.budgetId = uuidv4();
  } else if (!isHeader && !data.budgetId) {
    return json(400, C, "budgetId required for line item creation");
  }

  // budgetItemId
  let budgetItemId = data.budgetItemId;
  if (!budgetItemId) {
    budgetItemId = (isHeader ? "HEADER-" : "LINE-") + uuidv4();
  }
  enforcePrefix(budgetItemId);

  const ts = nowISO();
  const item = {
    projectId,
    budgetId: data.budgetId,
    budgetItemId,
    createdAt: ts,
    updatedAt: ts,
    revision: data.revision ?? 1,
    ...data,
  };
  delete item.isHeader;

  await ddb.put({
    TableName: BUDGETS_TABLE,
    Item: item,
    ConditionExpression: "attribute_not_exists(projectId) AND attribute_not_exists(budgetItemId)",
  });

  return json(201, C, item);
};

// PUT /projects/{projectId}/budget/items/{budgetItemId}  (full upsert; requires budgetId)
const putBudgetItem = async (e, C, { projectId, budgetItemId }) => {
  const data = B(e);
  if (!projectId || !budgetItemId) return json(400, C, "projectId and budgetItemId required");
  if (!data.budgetId) return json(400, C, "budgetId required");
  enforcePrefix(budgetItemId);

  const ts = nowISO();
  const item = {
    ...data,
    projectId,
    budgetItemId,
    updatedAt: ts,
    createdAt: data.createdAt || ts,
    revision: data.revision ?? 1,
  };
  await ddb.put({ TableName: BUDGETS_TABLE, Item: item });
  return json(200, C, item);
};

// PATCH /projects/{projectId}/budget/items/{budgetItemId}
const patchBudgetItem = async (e, C, { projectId, budgetItemId }) => {
  const data = B(e);
  if (!projectId || !budgetItemId) return json(400, C, "projectId and budgetItemId required");
  enforcePrefix(budgetItemId);
  if (Object.keys(data).length === 0) return json(400, C, "No fields to update");

  const expr = buildUpdate({ ...data, updatedAt: nowISO() });
  const r = await ddb.update({
    TableName: BUDGETS_TABLE,
    Key: { projectId, budgetItemId },
    ...expr,
    ReturnValues: "ALL_NEW",
  });
  return json(200, C, r.Attributes);
};

// GET /projects/{projectId}/budget  (?headers=true supported)
const listBudgetForProject = async (e, C, { projectId }) => {
  const headersOnly = (Q(e).headers || "").toLowerCase() === "true";
  if (headersOnly) {
    const r = await ddb.query({
      TableName: BUDGETS_TABLE,
      KeyConditionExpression: "projectId = :p AND begins_with(budgetItemId, :h)",
      ExpressionAttributeValues: { ":p": projectId, ":h": "HEADER-" },
    });
    return json(200, C, r.Items || []);
  }
  const r = await ddb.query({
    TableName: BUDGETS_TABLE,
    KeyConditionExpression: "projectId = :p",
    ExpressionAttributeValues: { ":p": projectId },
  });
  return json(200, C, r.Items || []);
};

// GET /projects/{projectId}/budget/items/{budgetItemId}
const getBudgetItem = async (_e, C, { projectId, budgetItemId }) => {
  enforcePrefix(budgetItemId);
  const r = await ddb.get({
    TableName: BUDGETS_TABLE,
    Key: { projectId, budgetItemId },
  });
  return json(200, C, r.Item || null);
};

// DELETE /projects/{projectId}/budget/items/{budgetItemId}
const deleteBudgetItem = async (_e, C, { projectId, budgetItemId }) => {
  enforcePrefix(budgetItemId);
  await ddb.delete({
    TableName: BUDGETS_TABLE,
    Key: { projectId, budgetItemId },
  });
  return json(204, C, "");
};

// Extra convenience lookups (optional):
// GET /budgets/byBudgetId/{budgetId}
const listByBudgetId = async (_e, C, { budgetId }) => {
  const r = await ddb.query({
    TableName: BUDGETS_TABLE,
    IndexName: BUDGET_ID_INDEX,
    KeyConditionExpression: "budgetId = :b",
    ExpressionAttributeValues: { ":b": budgetId },
  });
  return json(200, C, r.Items || []);
};

// GET /budgets/byItemId/{budgetItemId}
const getByBudgetItemId = async (_e, C, { budgetItemId }) => {
  enforcePrefix(budgetItemId);
  const r = await ddb.query({
    TableName: BUDGETS_TABLE,
    IndexName: BUDGET_ITEM_ID_INDEX,
    KeyConditionExpression: "budgetItemId = :bi",
    ExpressionAttributeValues: { ":bi": budgetItemId },
    Limit: 1,
  });
  return json(200, C, (r.Items && r.Items[0]) || null);
};

/* ---------- Deck Versions ---------- */

// Helper: filter versions by user role
const filterVersionsByRole = (versions, userRole, isAdmin) => {
  if (isAdmin) return versions;
  return versions.filter((v) => {
    const allowed = v.allowedRoles || [];
    if (allowed.length === 0) return true; // No restrictions = everyone can see
    return allowed.includes(userRole) || allowed.includes("all");
  });
};

// Helper: get or create default version for backward compatibility
const ensureDefaultVersion = async (projectId, slides, userId, userName) => {
  // Check if any versions exist
  const existing = await ddb.query({
    TableName: DECK_VERSIONS_TABLE,
    KeyConditionExpression: "projectId = :p",
    ExpressionAttributeValues: { ":p": projectId },
    Limit: 1,
  });

  if (existing.Items && existing.Items.length > 0) {
    return existing.Items[0];
  }

  // Create default "Main" version from existing slides
  const versionId = uuidv4();
  const now = nowISO();
  const defaultVersion = {
    projectId,
    versionId,
    name: "Main",
    status: "draft",
    isDefault: "true", // String for GSI
    isClientDefault: "false",
    allowedRoles: [], // Empty = all roles can see
    createdBy: userId || "system",
    createdByName: userName || "System",
    createdAt: now,
    updatedAt: now,
    notes: "Default version (auto-created)",
    slides: slides || [],
  };

  await ddb.put({
    TableName: DECK_VERSIONS_TABLE,
    Item: defaultVersion,
  });

  return defaultVersion;
};

// GET /projects/{projectId}/deck-versions
const listDeckVersions = async (e, C, { projectId }) => {
  const { userId, isAdmin } = getUserFromEvent(e);
  const claims = e?.requestContext?.authorizer?.jwt?.claims || {};
  const userRole = claims.role || claims["custom:role"] || "client";

  const r = await ddb.query({
    TableName: DECK_VERSIONS_TABLE,
    KeyConditionExpression: "projectId = :p",
    ExpressionAttributeValues: { ":p": projectId },
  });

  let versions = r.Items || [];

  // If no versions exist but project has slides, create default version
  if (versions.length === 0) {
    const projectRes = await ddb.get({
      TableName: PROJECTS_TABLE,
      Key: { projectId },
      ProjectionExpression: "slides",
    });
    const slides = projectRes.Item?.slides || [];
    const claims = e?.requestContext?.authorizer?.jwt?.claims || {};
    const userName = claims.name || claims["cognito:username"] || "Unknown";
    const defaultVersion = await ensureDefaultVersion(projectId, slides, userId, userName);
    versions = [defaultVersion];
  }

  // Enrich createdByName with user profile data (first + last name)
  const creatorIds = [...new Set(versions.map((v) => v.createdBy).filter(Boolean))];
  const profilesMap = new Map();
  if (creatorIds.length > 0) {
    try {
      const batchResult = await ddb.batchGet({
        RequestItems: {
          [USER_PROFILES_TABLE]: {
            Keys: creatorIds.map((id) => ({ userId: id })),
            ProjectionExpression: "userId, firstName, lastName, email",
          },
        },
      });
      const profiles = batchResult.Responses?.[USER_PROFILES_TABLE] || [];
      for (const profile of profiles) {
        const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
        if (fullName) {
          profilesMap.set(profile.userId, fullName);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch user profiles for deck versions:", err);
      // Non-fatal - continue with existing createdByName
    }
  }

  // Filter by role
  const filtered = filterVersionsByRole(versions, userRole, isAdmin);

  // Transform isDefault from string to boolean for frontend and enrich createdByName
  const transformed = filtered.map((v) => ({
    ...v,
    isDefault: v.isDefault === "true",
    isClientDefault: v.isClientDefault === "true",
    createdByName: profilesMap.get(v.createdBy) || v.createdByName,
  }));

  return json(200, C, transformed);
};

// POST /projects/{projectId}/deck-versions
const createDeckVersion = async (e, C, { projectId }) => {
  const { userId, displayName } = getUserFromEvent(e);
  const body = B(e);
  const versionId = uuidv4();
  const now = nowISO();

  // If duplicating from another version
  let slides = body.slides || [];
  if (body.duplicateFromVersionId) {
    const sourceRes = await ddb.get({
      TableName: DECK_VERSIONS_TABLE,
      Key: { projectId, versionId: body.duplicateFromVersionId },
    });
    if (sourceRes.Item?.slides) {
      // Deep clone slides with new IDs
      slides = (sourceRes.Item.slides || []).map((slide) => ({
        ...slide,
        id: uuidv4(),
      }));
    }
  }

  // Check if this is the first version for this project
  const existingVersions = await ddb.query({
    TableName: DECK_VERSIONS_TABLE,
    KeyConditionExpression: "projectId = :pid",
    ExpressionAttributeValues: { ":pid": projectId },
    Limit: 1,
  });
  const isFirstVersion = !existingVersions.Items || existingVersions.Items.length === 0;

  // If first version and no slides provided, try to migrate from project.slides
  if (isFirstVersion && (!slides || slides.length === 0)) {
    const projectRes = await ddb.get({
      TableName: PROJECTS_TABLE,
      Key: { projectId },
    });
    if (projectRes.Item?.slides && Array.isArray(projectRes.Item.slides)) {
      slides = projectRes.Item.slides;
    }
  }

  const version = {
    projectId,
    versionId,
    name: body.name || `Version ${new Date().toLocaleDateString()}`,
    status: body.status || "draft",
    isDefault: isFirstVersion ? "true" : "false", // First version becomes default
    isClientDefault: isFirstVersion ? "true" : "false", // First version becomes client default too
    allowedRoles: body.allowedRoles || [],
    createdBy: userId,
    createdByName: displayName || "Unknown",
    createdAt: now,
    updatedAt: now,
    notes: body.notes || "",
    slides,
  };

  await ddb.put({
    TableName: DECK_VERSIONS_TABLE,
    Item: version,
  });

  // If first version was created, clear project.slides to avoid duplication
  // and set activeDeckVersionId on the project
  if (isFirstVersion) {
    try {
      await ddb.update({
        TableName: PROJECTS_TABLE,
        Key: { projectId },
        UpdateExpression: "SET activeDeckVersionId = :vid, updatedAt = :now REMOVE slides",
        ExpressionAttributeValues: {
          ":vid": versionId,
          ":now": now,
        },
      });
    } catch (err) {
      console.warn("Failed to clear project slides after first version creation:", err);
      // Non-fatal - version was still created
    }
  }

  return json(201, C, {
    ...version,
    isDefault: isFirstVersion,
    isClientDefault: isFirstVersion,
  });
};

// GET /projects/{projectId}/deck-versions/{versionId}
const getDeckVersion = async (e, C, { projectId, versionId }) => {
  const { isAdmin } = getUserFromEvent(e);
  const claims = e?.requestContext?.authorizer?.jwt?.claims || {};
  const userRole = claims.role || claims["custom:role"] || "client";

  const r = await ddb.get({
    TableName: DECK_VERSIONS_TABLE,
    Key: { projectId, versionId },
  });

  if (!r.Item) {
    return json(404, C, { error: "Version not found" });
  }

  // Check access
  const allowed = r.Item.allowedRoles || [];
  if (!isAdmin && allowed.length > 0 && !allowed.includes(userRole) && !allowed.includes("all")) {
    return json(403, C, { error: "Access denied to this version" });
  }

  return json(200, C, {
    ...r.Item,
    isDefault: r.Item.isDefault === "true",
    isClientDefault: r.Item.isClientDefault === "true",
  });
};

// PATCH /projects/{projectId}/deck-versions/{versionId}
const patchDeckVersion = async (e, C, { projectId, versionId }) => {
  const body = B(e);
  const now = nowISO();

  // Build update expression
  const updates = {};
  const allowedFields = ["name", "status", "notes", "slides", "allowedRoles"];
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }
  updates.updatedAt = now;

  const expr = buildUpdate(updates);
  if (!expr) {
    return json(400, C, { error: "No valid fields to update" });
  }

  const r = await ddb.update({
    TableName: DECK_VERSIONS_TABLE,
    Key: { projectId, versionId },
    ...expr,
    ReturnValues: "ALL_NEW",
  });

  return json(200, C, {
    ...r.Attributes,
    isDefault: r.Attributes.isDefault === "true",
    isClientDefault: r.Attributes.isClientDefault === "true",
  });
};

// DELETE /projects/{projectId}/deck-versions/{versionId}
const deleteDeckVersion = async (e, C, { projectId, versionId }) => {
  // Check if this is the default version
  const r = await ddb.get({
    TableName: DECK_VERSIONS_TABLE,
    Key: { projectId, versionId },
  });

  if (!r.Item) {
    return json(404, C, { error: "Version not found" });
  }

  if (r.Item.isDefault === "true") {
    return json(400, C, { error: "Cannot delete the default version. Set another version as default first." });
  }

  // Check if it's the last version
  const allVersions = await ddb.query({
    TableName: DECK_VERSIONS_TABLE,
    KeyConditionExpression: "projectId = :p",
    ExpressionAttributeValues: { ":p": projectId },
    Select: "COUNT",
  });

  if (allVersions.Count <= 1) {
    return json(400, C, { error: "Cannot delete the last version." });
  }

  await ddb.delete({
    TableName: DECK_VERSIONS_TABLE,
    Key: { projectId, versionId },
  });

  return json(204, C, "");
};

// POST /projects/{projectId}/deck-versions/{versionId}/set-default
const setDefaultDeckVersion = async (e, C, { projectId, versionId }) => {
  const now = nowISO();

  // First, unset any existing default
  const existingDefaults = await ddb.query({
    TableName: DECK_VERSIONS_TABLE,
    IndexName: DECK_VERSIONS_DEFAULT_INDEX,
    KeyConditionExpression: "projectId = :p AND isDefault = :d",
    ExpressionAttributeValues: { ":p": projectId, ":d": "true" },
  });

  for (const existing of existingDefaults.Items || []) {
    if (existing.versionId !== versionId) {
      await ddb.update({
        TableName: DECK_VERSIONS_TABLE,
        Key: { projectId, versionId: existing.versionId },
        UpdateExpression: "SET isDefault = :f, updatedAt = :now",
        ExpressionAttributeValues: { ":f": "false", ":now": now },
      });
    }
  }

  // Set the new default
  const r = await ddb.update({
    TableName: DECK_VERSIONS_TABLE,
    Key: { projectId, versionId },
    UpdateExpression: "SET isDefault = :t, updatedAt = :now",
    ExpressionAttributeValues: { ":t": "true", ":now": now },
    ReturnValues: "ALL_NEW",
  });

  // Also update the project's activeDeckVersionId
  await ddb.update({
    TableName: PROJECTS_TABLE,
    Key: { projectId },
    UpdateExpression: "SET activeDeckVersionId = :v, updatedAt = :now",
    ExpressionAttributeValues: { ":v": versionId, ":now": now },
  });

  return json(200, C, {
    ...r.Attributes,
    isDefault: true,
    isClientDefault: r.Attributes.isClientDefault === "true",
  });
};

// POST /projects/{projectId}/deck-versions/{versionId}/set-client-default
const setClientDefaultDeckVersion = async (e, C, { projectId, versionId }) => {
  const now = nowISO();

  // First, unset any existing client default
  const allVersions = await ddb.query({
    TableName: DECK_VERSIONS_TABLE,
    KeyConditionExpression: "projectId = :p",
    ExpressionAttributeValues: { ":p": projectId },
  });

  for (const existing of allVersions.Items || []) {
    if (existing.isClientDefault === "true" && existing.versionId !== versionId) {
      await ddb.update({
        TableName: DECK_VERSIONS_TABLE,
        Key: { projectId, versionId: existing.versionId },
        UpdateExpression: "SET isClientDefault = :f, updatedAt = :now",
        ExpressionAttributeValues: { ":f": "false", ":now": now },
      });
    }
  }

  // Set the new client default
  const r = await ddb.update({
    TableName: DECK_VERSIONS_TABLE,
    Key: { projectId, versionId },
    UpdateExpression: "SET isClientDefault = :t, updatedAt = :now",
    ExpressionAttributeValues: { ":t": "true", ":now": now },
    ReturnValues: "ALL_NEW",
  });

  return json(200, C, {
    ...r.Attributes,
    isDefault: r.Attributes.isDefault === "true",
    isClientDefault: true,
  });
};

// POST /projects/{projectId}/deck-versions/{versionId}/duplicate
const duplicateDeckVersion = async (e, C, { projectId, versionId }) => {
  const { userId, displayName } = getUserFromEvent(e);
  const body = B(e);
  const now = nowISO();
  const newVersionId = uuidv4();

  // Get source version
  const sourceRes = await ddb.get({
    TableName: DECK_VERSIONS_TABLE,
    Key: { projectId, versionId },
  });

  if (!sourceRes.Item) {
    return json(404, C, { error: "Source version not found" });
  }

  // Deep clone slides with new IDs
  const slides = (sourceRes.Item.slides || []).map((slide) => ({
    ...slide,
    id: uuidv4(),
  }));

  const newVersion = {
    projectId,
    versionId: newVersionId,
    name: body.name || `${sourceRes.Item.name} (Copy)`,
    status: "draft",
    isDefault: "false",
    isClientDefault: "false",
    allowedRoles: body.allowedRoles || sourceRes.Item.allowedRoles || [],
    createdBy: userId,
    createdByName: displayName || "Unknown",
    createdAt: now,
    updatedAt: now,
    notes: body.notes || `Duplicated from "${sourceRes.Item.name}"`,
    slides,
  };

  await ddb.put({
    TableName: DECK_VERSIONS_TABLE,
    Item: newVersion,
  });

  return json(201, C, {
    ...newVersion,
    isDefault: false,
    isClientDefault: false,
  });
};

// POST /projects/{projectId}/slides/{slideId}/thumbnail
// Atomic update of a single slide's thumbnail fields without touching the full slides array
const patchSlideThumbnail = async (e, C, { projectId, slideId }) => {
  const body = B(e);
  const now = nowISO();

  const { thumbUrl, thumbRevision, generatedAt, width, height, etag, versionId } = body;

  if (!thumbUrl || thumbRevision === undefined) {
    return json(400, C, { error: "Missing required fields: thumbUrl and thumbRevision" });
  }

  const incomingRevision = Number(thumbRevision);
  if (!Number.isFinite(incomingRevision) || incomingRevision < 0) {
    return json(400, C, { error: "Invalid thumbRevision: must be a non-negative number" });
  }

  // Determine which table to update based on whether a versionId is provided
  if (versionId) {
    // Update slide in DeckVersions table
    // First, get the current version to find the slide
    const versionRes = await ddb.get({
      TableName: DECK_VERSIONS_TABLE,
      Key: { projectId, versionId },
      ProjectionExpression: "slides",
    });

    if (!versionRes.Item) {
      return json(404, C, { error: "Deck version not found" });
    }

    const slides = versionRes.Item.slides || [];
    const slideIndex = slides.findIndex((s) => s.id === slideId);

    if (slideIndex === -1) {
      return json(404, C, { error: "Slide not found in version" });
    }

    const currentSlide = slides[slideIndex];
    const currentRevision = Number(currentSlide.thumbRevision) || 0;

    // Monotonicity check: only apply if incoming revision is greater
    if (incomingRevision <= currentRevision) {
      return json(200, C, {
        updated: false,
        reason: "stale_revision",
        currentRevision,
        incomingRevision,
        slideId,
      });
    }

    // Re-read to get fresh index (guards against reorder/insert/delete race)
    const freshVersionRes = await ddb.get({
      TableName: DECK_VERSIONS_TABLE,
      Key: { projectId, versionId },
      ProjectionExpression: "slides",
    });
    const freshSlides = freshVersionRes.Item?.slides || [];
    const freshIndex = freshSlides.findIndex((s) => s.id === slideId);
    
    if (freshIndex === -1) {
      // Slide was deleted between initial read and now
      console.log('[THUMB_PATCH] slide_deleted', { projectId, versionId, slideId, incomingRevision });
      return json(200, C, {
        updated: false,
        reason: "slide_deleted",
        slideId,
      });
    }
    
    const freshRevision = Number(freshSlides[freshIndex].thumbRevision) || 0;
    if (incomingRevision <= freshRevision) {
      // Re-check monotonicity with fresh data
      console.log('[THUMB_PATCH] stale_revision', { projectId, versionId, slideId, currentRevision: freshRevision, incomingRevision });
      return json(200, C, {
        updated: false,
        reason: "stale_revision",
        currentRevision: freshRevision,
        incomingRevision,
        slideId,
      });
    }
    
    // Use nested-field-only update to avoid clobbering non-thumb fields.
    // ConditionExpression ensures the slide at freshIndex still has the expected id.
    const names = {
      "#slides": "slides",
      "#updatedAt": "updatedAt",
      "#thumb": "thumbnail",
      "#thumbRev": "thumbRevision",
      "#id": "id",
    };
    const values = {
      ":thumbUrl": thumbUrl,
      ":rev": incomingRevision,
      ":now": now,
      ":slideId": slideId,
    };
    const setParts = [
      `#slides[${freshIndex}].#thumb = :thumbUrl`,
      `#slides[${freshIndex}].#thumbRev = :rev`,
      `#updatedAt = :now`,
    ];
    
    if (generatedAt) {
      names["#thumbGenAt"] = "thumbGeneratedAt";
      values[":genAt"] = generatedAt;
      setParts.push(`#slides[${freshIndex}].#thumbGenAt = :genAt`);
    }
    if (width) {
      names["#thumbW"] = "thumbWidth";
      values[":w"] = width;
      setParts.push(`#slides[${freshIndex}].#thumbW = :w`);
    }
    if (height) {
      names["#thumbH"] = "thumbHeight";
      values[":h"] = height;
      setParts.push(`#slides[${freshIndex}].#thumbH = :h`);
    }
    if (etag) {
      names["#thumbEtag"] = "thumbEtag";
      values[":etag"] = etag;
      setParts.push(`#slides[${freshIndex}].#thumbEtag = :etag`);
    }
    
    try {
      await ddb.update({
        TableName: DECK_VERSIONS_TABLE,
        Key: { projectId, versionId },
        UpdateExpression: `SET ${setParts.join(", ")}`,
        // Guard: slideId at index + monotonic revision (attribute_not_exists handles first thumb)
        ConditionExpression: 
          "attribute_exists(#slides) AND #slides[" + freshIndex + "].#id = :slideId AND " +
          "(attribute_not_exists(#slides[" + freshIndex + "].#thumbRev) OR #slides[" + freshIndex + "].#thumbRev < :rev)",
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      });
    } catch (updateError) {
      // ConditionalCheckFailedException means slide was modified/reordered between read and write
      if (updateError.name === "ConditionalCheckFailedException") {
        console.log('[THUMB_PATCH] condition_failed', { projectId, versionId, slideId, freshIndex, incomingRevision });
        return json(200, C, {
          updated: false,
          reason: "concurrent_modification",
          slideId,
        });
      }
      console.error("Failed to update slide thumbnail in deck version:", updateError);
      return json(500, C, { error: "Failed to update slide thumbnail" });
    }

    console.log('[THUMB_PATCH] write_succeeded', { projectId, versionId, slideId, thumbRevision: incomingRevision });
    return json(200, C, {
      updated: true,
      slideId,
      versionId,
      thumbUrl,
      thumbRevision: incomingRevision,
    });
  } else {
    // Update slide in main Projects table
    const projectRes = await ddb.get({
      TableName: PROJECTS_TABLE,
      Key: { projectId },
      ProjectionExpression: "slides",
    });

    if (!projectRes.Item) {
      return json(404, C, { error: "Project not found" });
    }

    const slides = projectRes.Item.slides || [];
    const slideIndex = slides.findIndex((s) => s.id === slideId);

    if (slideIndex === -1) {
      return json(404, C, { error: "Slide not found in project" });
    }

    const currentSlide = slides[slideIndex];
    const currentRevision = Number(currentSlide.thumbRevision) || 0;

    // Monotonicity check: only apply if incoming revision is greater
    if (incomingRevision <= currentRevision) {
      return json(200, C, {
        updated: false,
        reason: "stale_revision",
        currentRevision,
        incomingRevision,
        slideId,
      });
    }

    // Re-read to get fresh index (guards against reorder/insert/delete race)
    const freshProjectRes = await ddb.get({
      TableName: PROJECTS_TABLE,
      Key: { projectId },
      ProjectionExpression: "slides",
    });
    const freshSlides = freshProjectRes.Item?.slides || [];
    const freshIndex = freshSlides.findIndex((s) => s.id === slideId);
    
    if (freshIndex === -1) {
      // Slide was deleted between initial read and now
      console.log('[THUMB_PATCH] slide_deleted', { projectId, slideId, incomingRevision });
      return json(200, C, {
        updated: false,
        reason: "slide_deleted",
        slideId,
      });
    }
    
    const freshRevision = Number(freshSlides[freshIndex].thumbRevision) || 0;
    if (incomingRevision <= freshRevision) {
      // Re-check monotonicity with fresh data
      console.log('[THUMB_PATCH] stale_revision', { projectId, slideId, currentRevision: freshRevision, incomingRevision });
      return json(200, C, {
        updated: false,
        reason: "stale_revision",
        currentRevision: freshRevision,
        incomingRevision,
        slideId,
      });
    }
    
    // Use nested-field-only update to avoid clobbering non-thumb fields.
    // ConditionExpression ensures the slide at freshIndex still has the expected id.
    const names = {
      "#slides": "slides",
      "#updatedAt": "updatedAt",
      "#thumb": "thumbnail",
      "#thumbRev": "thumbRevision",
      "#id": "id",
    };
    const values = {
      ":thumbUrl": thumbUrl,
      ":rev": incomingRevision,
      ":now": now,
      ":slideId": slideId,
    };
    const setParts = [
      `#slides[${freshIndex}].#thumb = :thumbUrl`,
      `#slides[${freshIndex}].#thumbRev = :rev`,
      `#updatedAt = :now`,
    ];
    
    if (generatedAt) {
      names["#thumbGenAt"] = "thumbGeneratedAt";
      values[":genAt"] = generatedAt;
      setParts.push(`#slides[${freshIndex}].#thumbGenAt = :genAt`);
    }
    if (width) {
      names["#thumbW"] = "thumbWidth";
      values[":w"] = width;
      setParts.push(`#slides[${freshIndex}].#thumbW = :w`);
    }
    if (height) {
      names["#thumbH"] = "thumbHeight";
      values[":h"] = height;
      setParts.push(`#slides[${freshIndex}].#thumbH = :h`);
    }
    if (etag) {
      names["#thumbEtag"] = "thumbEtag";
      values[":etag"] = etag;
      setParts.push(`#slides[${freshIndex}].#thumbEtag = :etag`);
    }
    
    try {
      await ddb.update({
        TableName: PROJECTS_TABLE,
        Key: { projectId },
        UpdateExpression: `SET ${setParts.join(", ")}`,
        // Guard: slideId at index + monotonic revision (attribute_not_exists handles first thumb)
        ConditionExpression: 
          "attribute_exists(#slides) AND #slides[" + freshIndex + "].#id = :slideId AND " +
          "(attribute_not_exists(#slides[" + freshIndex + "].#thumbRev) OR #slides[" + freshIndex + "].#thumbRev < :rev)",
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      });
    } catch (updateError) {
      // ConditionalCheckFailedException means slide was modified/reordered between read and write
      if (updateError.name === "ConditionalCheckFailedException") {
        console.log('[THUMB_PATCH] condition_failed', { projectId, slideId, freshIndex, incomingRevision });
        return json(200, C, {
          updated: false,
          reason: "concurrent_modification",
          slideId,
        });
      }
      console.error("Failed to update slide thumbnail in project:", updateError);
      return json(500, C, { error: "Failed to update slide thumbnail" });
    }

    console.log('[THUMB_PATCH] write_succeeded', { projectId, slideId, thumbRevision: incomingRevision });
    return json(200, C, {
      updated: true,
      slideId,
      projectId,
      thumbUrl,
      thumbRevision: incomingRevision,
    });
  }
};

/* ============== Routes ============== */
const routes = [
  { m: "GET",    r: /^\/projects\/health$/i,                                                    h: health },

  // Projects
  { m: "GET",    r: /^\/projects$/i,                                                            h: listProjects },
  { m: "POST",   r: /^\/projects$/i,                                                            h: createProject },
  { m: "GET",    r: /^\/projects\/(?<projectId>[^/]+)$/i,                                       h: getProject },
  { m: "GET",    r: /^\/projects\/(?<projectId>[^/]+)\/calendar\/overlap-stack-titles$/i,      h: getOverlapStackTitles },
  { m: "PATCH",  r: /^\/projects\/(?<projectId>[^/]+)\/calendar\/overlap-stack-titles$/i,      h: patchOverlapStackTitles },
  { m: "PUT",    r: /^\/projects\/(?<projectId>[^/]+)$/i,                                       h: patchProject },
  { m: "PATCH",  r: /^\/projects\/(?<projectId>[^/]+)$/i,                                       h: patchProject },
  { m: "DELETE", r: /^\/projects\/(?<projectId>[^/]+)$/i,                                       h: deleteProject },

  // Team
  { m: "GET",    r: /^\/projects\/(?<projectId>[^/]+)\/team$/i,                                 h: getTeam },
  { m: "POST",   r: /^\/projects\/(?<projectId>[^/]+)\/team$/i,                                 h: addTeam },
  { m: "DELETE", r: /^\/projects\/(?<projectId>[^/]+)\/team\/(?<userId>[^/]+)$/i,               h: removeTeam },

  // Tasks
  { m: "GET",    r: /^\/projects\/(?<projectId>[^/]+)\/tasks$/i,                                h: listTasks },
  { m: "POST",   r: /^\/projects\/(?<projectId>[^/]+)\/tasks$/i,                                h: createTask },
  { m: "POST",   r: /^\/projects\/(?<projectId>[^/]+)\/tasks\/bulk$/i,                           h: bulkCreateTasks },
  { m: "PATCH",  r: /^\/projects\/(?<projectId>[^/]+)\/tasks\/bulk$/i,                           h: bulkPatchTasks },
  { m: "GET",    r: /^\/projects\/(?<projectId>[^/]+)\/tasks\/(?<taskId>[^/]+)$/i,              h: getTask },
  { m: "POST",   r: /^\/projects\/(?<projectId>[^/]+)\/tasks\/(?<taskId>[^/]+)\/review-transition$/i, h: reviewTransition },
  { m: "POST",   r: /^\/projects\/(?<projectId>[^/]+)\/tasks\/(?<taskId>[^/]+)\/review\/request$/i, h: requestTaskReview },
  { m: "POST",   r: /^\/projects\/(?<projectId>[^/]+)\/tasks\/(?<taskId>[^/]+)\/review\/approve$/i, h: approveTaskReview },
  { m: "POST",   r: /^\/projects\/(?<projectId>[^/]+)\/tasks\/(?<taskId>[^/]+)\/review\/request_changes$/i, h: requestTaskChanges },
  { m: "POST",   r: /^\/projects\/(?<projectId>[^/]+)\/tasks\/(?<taskId>[^/]+)\/archive$/i,    h: archiveTask },
  { m: "POST",   r: /^\/projects\/(?<projectId>[^/]+)\/tasks\/(?<taskId>[^/]+)\/unarchive$/i,  h: unarchiveTask },
  { m: "PATCH",  r: /^\/projects\/(?<projectId>[^/]+)\/tasks\/(?<taskId>[^/]+)$/i,              h: patchTask },
  { m: "DELETE", r: /^\/projects\/(?<projectId>[^/]+)\/tasks\/(?<taskId>[^/]+)$/i,              h: deleteTask },

  // Files
  { m: "POST",   r: /^\/projects\/(?<projectId>[^/]+)\/files\/delete$/i,                       h: deleteProjectFiles },

  // Events (unified)
  { m: "GET",    r: /^\/projects\/(?<projectId>[^/]+)\/events$/i,                               h: listEvents },
  { m: "POST",   r: /^\/projects\/(?<projectId>[^/]+)\/events$/i,                               h: createEvent },
  { m: "GET",    r: /^\/projects\/(?<projectId>[^/]+)\/events\/(?<eventId>[^/]+)$/i,            h: getEvent },
  { m: "PATCH",  r: /^\/projects\/(?<projectId>[^/]+)\/events\/(?<eventId>[^/]+)$/i,            h: patchEvent },
  { m: "DELETE", r: /^\/projects\/(?<projectId>[^/]+)\/events\/(?<eventId>[^/]+)$/i,            h: deleteEvent },

  // Back-compat timeline shims
  { m: "GET",    r: /^\/projects\/(?<projectId>[^/]+)\/timeline$/i,                             h: getTimeline },
  { m: "POST",   r: /^\/projects\/(?<projectId>[^/]+)\/timeline$/i,                             h: addTimeline },
  { m: "PATCH",  r: /^\/projects\/(?<projectId>[^/]+)\/timeline\/(?<eventId>[^/]+)$/i,          h: patchTimeline },
  { m: "DELETE", r: /^\/projects\/(?<projectId>[^/]+)\/timeline\/(?<eventId>[^/]+)$/i,          h: deleteTimeline },

  // Quick-links & thumbnails
  { m: "GET",    r: /^\/projects\/(?<projectId>[^/]+)\/quick-links$/i,                          h: getQuickLinks },
  { m: "POST",   r: /^\/projects\/(?<projectId>[^/]+)\/quick-links$/i,                          h: addQuickLink },
  { m: "GET",    r: /^\/projects\/(?<projectId>[^/]+)\/thumbnails$/i,                           h: getThumbnails },

  // Slide thumbnail patch (atomic, race-free thumbnail updates)
  { m: "POST",   r: /^\/projects\/(?<projectId>[^/]+)\/slides\/(?<slideId>[^/]+)\/thumbnail$/i, h: patchSlideThumbnail },

  // Galleries
  { m: "GET",    r: /^\/projects\/(?<projectId>[^/]+)\/galleries$/i,                          h: listProjectGalleries },
  { m: "POST",   r: /^\/projects\/(?<projectId>[^/]+)\/galleries$/i,                          h: createGallery },
  { m: "GET",    r: /^\/projects\/(?<projectId>[^/]+)\/galleries\/(?<galleryId>[^/]+)$/i,     h: getGallery },
  { m: "PUT",    r: /^\/projects\/(?<projectId>[^/]+)\/galleries\/(?<galleryId>[^/]+)$/i,     h: putGallery },
  { m: "PATCH",  r: /^\/projects\/(?<projectId>[^/]+)\/galleries\/(?<galleryId>[^/]+)$/i,     h: patchGallery },
  { m: "DELETE", r: /^\/projects\/(?<projectId>[^/]+)\/galleries\/(?<galleryId>[^/]+)$/i,     h: deleteGallery },
  { m: "POST",   r: /^\/projects\/(?<projectId>[^/]+)\/galleries\/(?<gallerySlug>[^/]+)\/files\/delete$/i, h: deleteGalleryFilesBySlug },

  // Gallery upload (creates signed S3 URLs)
  { m: "POST",   r: /^\/projects\/galleries\/upload$/i,                                        h: createGalleryUpload },

  // Deck Versions
  { m: "GET",    r: /^\/projects\/(?<projectId>[^/]+)\/deck-versions$/i,                       h: listDeckVersions },
  { m: "POST",   r: /^\/projects\/(?<projectId>[^/]+)\/deck-versions$/i,                       h: createDeckVersion },
  { m: "GET",    r: /^\/projects\/(?<projectId>[^/]+)\/deck-versions\/(?<versionId>[^/]+)$/i,  h: getDeckVersion },
  { m: "PATCH",  r: /^\/projects\/(?<projectId>[^/]+)\/deck-versions\/(?<versionId>[^/]+)$/i,  h: patchDeckVersion },
  { m: "DELETE", r: /^\/projects\/(?<projectId>[^/]+)\/deck-versions\/(?<versionId>[^/]+)$/i,  h: deleteDeckVersion },
  { m: "POST",   r: /^\/projects\/(?<projectId>[^/]+)\/deck-versions\/(?<versionId>[^/]+)\/set-default$/i, h: setDefaultDeckVersion },
  { m: "POST",   r: /^\/projects\/(?<projectId>[^/]+)\/deck-versions\/(?<versionId>[^/]+)\/set-client-default$/i, h: setClientDefaultDeckVersion },
  { m: "POST",   r: /^\/projects\/(?<projectId>[^/]+)\/deck-versions\/(?<versionId>[^/]+)\/duplicate$/i, h: duplicateDeckVersion },

  // Budgets under project
  { m: "GET",    r: /^\/projects\/(?<projectId>[^/]+)\/budget$/i,                               h: listBudgetForProject },
  { m: "POST",   r: /^\/projects\/(?<projectId>[^/]+)\/budget$/i,                               h: createBudgetItem },
  { m: "GET",    r: /^\/projects\/(?<projectId>[^/]+)\/budget\/items\/(?<budgetItemId>[^/]+)$/i, h: getBudgetItem },
  { m: "PUT",    r: /^\/projects\/(?<projectId>[^/]+)\/budget\/items\/(?<budgetItemId>[^/]+)$/i, h: putBudgetItem },
  { m: "PATCH",  r: /^\/projects\/(?<projectId>[^/]+)\/budget\/items\/(?<budgetItemId>[^/]+)$/i, h: patchBudgetItem },
  { m: "DELETE", r: /^\/projects\/(?<projectId>[^/]+)\/budget\/items\/(?<budgetItemId>[^/]+)$/i, h: deleteBudgetItem },

  // Optional convenience lookups (not under /projects)
  { m: "GET",    r: /^\/budgets\/byBudgetId\/(?<budgetId>[^/]+)$/i,                             h: listByBudgetId },
  { m: "GET",    r: /^\/budgets\/byItemId\/(?<budgetItemId>[^/]+)$/i,                           h: getByBudgetItemId },
];

export {
  patchTask,
  requestTaskReview,
  approveTaskReview,
  requestTaskChanges,
  archiveTask,
  unarchiveTask,
  reviewTransition,
};

/* ============== Entrypoint ============== */
export async function handler(event) {
  if (M(event) === "OPTIONS") return preflightFromEvent(event);
  const CORS = corsHeadersFromEvent(event);
  const method = M(event);
  const path = P(event);

  try {
    for (const { m, r, h } of routes) {
      if (m !== method) continue;
      const match = r.exec(path);
      if (match) return await h(event, CORS, match.groups || {});
    }
    return json(404, CORS, { error: "Not found", method, path });
  } catch (err) {
    console.error("projects_router_error", { method, path, err });
    const msg = err?.message || "Server error";
    const status = /ConditionalCheckFailed/i.test(msg) ? 409 : 500;
    return json(status, CORS, { error: msg });
  }
}
