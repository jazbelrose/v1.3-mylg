import { describe, expect, it, vi } from "vitest";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { updateTaskFields } from "./tasksDal.mjs";

describe("tasksDal.updateTaskFields", () => {
  it("removes budgetItemId when null (GSI-safe)", async () => {
    const calls = [];

    const ddb = {
      send: vi.fn(async (command) => {
        calls.push(command);

        if (command instanceof GetCommand) {
          return {
            Item: {
              projectId: "p1",
              taskId: "t1",
              status: "todo",
              dueAt: undefined,
            },
          };
        }

        if (command instanceof UpdateCommand) {
          return { Attributes: { projectId: "p1", taskId: "t1" } };
        }

        return {};
      }),
    };

    await updateTaskFields({
      ddb,
      tableName: "TasksTable",
      projectId: "p1",
      taskId: "t1",
      fields: { budgetItemId: null },
      now: "2026-01-06T00:00:00Z",
    });

    const updateCommand = calls.find((c) => c instanceof UpdateCommand);
    expect(updateCommand).toBeTruthy();

    const input = updateCommand.input;
    expect(input.UpdateExpression).toMatch(/REMOVE/);
    expect(Object.values(input.ExpressionAttributeNames || {})).toContain("budgetItemId");
    expect(Object.values(input.ExpressionAttributeValues || {})).not.toContain(null);
  });
});
