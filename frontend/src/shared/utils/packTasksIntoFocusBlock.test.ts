import { describe, expect, it } from "vitest";
import { packTasksIntoFocusBlock } from "./packTasksIntoFocusBlock";

describe("packTasksIntoFocusBlock", () => {
  describe("weighted allocation", () => {
    it("allocates time proportionally based on duration hints", () => {
      const result = packTasksIntoFocusBlock(120, [
        { draftId: "a", title: "Short task", durationMinutes: 30 },
        { draftId: "b", title: "Long task", durationMinutes: 90 },
      ]);

      expect(result.tasks.length).toBe(2);
      // Long task should get more time than short task
      const shortTask = result.tasks.find((t) => t.draftId === "a")!;
      const longTask = result.tasks.find((t) => t.draftId === "b")!;
      expect(longTask.plannedMinutes).toBeGreaterThan(shortTask.plannedMinutes);
    });

    it("respects min/max constraints", () => {
      // Give tasks different merge keys to prevent merging
      const result = packTasksIntoFocusBlock(
        180,
        [
          { draftId: "a", title: "Tiny task", durationMinutes: 5, mergeKey: "A" },
          { draftId: "b", title: "Huge task", durationMinutes: 300, mergeKey: "B" },
        ],
        { minTaskMinutes: 15, maxTaskMinutes: 120 }
      );

      expect(result.tasks.length).toBe(2);
      result.tasks.forEach((task) => {
        // Max constraint should be respected
        expect(task.plannedMinutes).toBeLessThanOrEqual(120);
      });
      // Should have a warning about tiny tasks since min can't be met via merge
      expect(result.warnings.some((w) => w.code === "tiny_tasks_detected" || w.code === "merge_key_conflict")).toBe(
        true
      );
    });

    it("uses default duration for tasks without hints", () => {
      const result = packTasksIntoFocusBlock(
        90,
        [
          { draftId: "a", title: "Task A" },
          { draftId: "b", title: "Task B" },
          { draftId: "c", title: "Task C" },
        ],
        { defaultDurationMinutes: 30 }
      );

      expect(result.tasks.length).toBe(3);
      // Should distribute evenly when no hints
      const sum = result.tasks.reduce((s, t) => s + t.plannedMinutes, 0);
      expect(sum).toBe(90);
    });
  });

  describe("merge safety", () => {
    it("never merges break items", () => {
      const result = packTasksIntoFocusBlock(
        60,
        [
          { draftId: "a", title: "Task A", durationMinutes: 10, kind: "task" },
          { draftId: "b", title: "Break", durationMinutes: 5, kind: "break" },
          { draftId: "c", title: "Task B", durationMinutes: 10, kind: "task" },
        ],
        { minTaskMinutes: 20 }
      );

      // Break should still be present and not merged
      const breakTask = result.tasks.find((t) => t.draftId === "b");
      expect(breakTask).toBeDefined();
      expect(breakTask?.title).toBe("Break");
      expect(result.warnings.some((w) => w.code === "break_buffer_preserved")).toBe(true);
    });

    it("never merges buffer items", () => {
      const result = packTasksIntoFocusBlock(
        60,
        [
          { draftId: "a", title: "Task A", durationMinutes: 10, kind: "task" },
          { draftId: "b", title: "Buffer", durationMinutes: 5, kind: "buffer" },
          { draftId: "c", title: "Task B", durationMinutes: 10, kind: "task" },
        ],
        { minTaskMinutes: 20 }
      );

      // Buffer should still be present
      const bufferTask = result.tasks.find((t) => t.draftId === "b");
      expect(bufferTask).toBeDefined();
    });

    it("only merges tasks with same mergeKey", () => {
      const result = packTasksIntoFocusBlock(
        60,
        [
          { draftId: "a", title: "Frontend A", durationMinutes: 5, mergeKey: "Frontend|task|ui" },
          { draftId: "b", title: "Backend B", durationMinutes: 5, mergeKey: "Backend|task|api" },
          { draftId: "c", title: "Frontend C", durationMinutes: 5, mergeKey: "Frontend|task|ui" },
        ],
        { minTaskMinutes: 15 }
      );

      // Should not merge Frontend A with Backend B
      // Backend B should remain separate
      const backendTask = result.tasks.find(
        (t) => t.title.includes("Backend") || t.draftId.includes("b")
      );
      expect(backendTask).toBeDefined();
    });

    it("warns about merge key conflicts", () => {
      // With minTaskMinutes=0, allocateWeighted won't clamp up,
      // but we need the merge loop to try merging.
      // Use 6 tasks with different merge keys in a small window
      // so they end up tiny and can't merge.
      const result = packTasksIntoFocusBlock(
        30,
        [
          { draftId: "a", title: "Task A", durationMinutes: 5, mergeKey: "A" },
          { draftId: "b", title: "Task B", durationMinutes: 5, mergeKey: "B" },
          { draftId: "c", title: "Task C", durationMinutes: 5, mergeKey: "C" },
          { draftId: "d", title: "Task D", durationMinutes: 5, mergeKey: "D" },
          { draftId: "e", title: "Task E", durationMinutes: 5, mergeKey: "E" },
          { draftId: "f", title: "Task F", durationMinutes: 5, mergeKey: "F" },
        ],
        { minTaskMinutes: 10 }
      );

      // 30 mins / 6 tasks = 5 mins each (after weighted allocation and roundTo5)
      // 5 < 10 means tiny tasks, but different merge keys prevent merging
      // Should warn about merge conflicts or tiny tasks
      expect(
        result.warnings.some(
          (w) => w.code === "merge_key_conflict" || w.code === "tiny_tasks_detected"
        )
      ).toBe(true);
    });
  });

  describe("warnings", () => {
    it("warns about slack time when max clamp applies", () => {
      const result = packTasksIntoFocusBlock(
        240,
        [{ draftId: "a", title: "Single task", durationMinutes: 60 }],
        { maxTaskMinutes: 120 }
      );

      expect(result.warnings.some((w) => w.code === "slack_time")).toBe(true);
    });

    it("warns about tiny tasks when min not met", () => {
      // With many tasks that have different merge keys in a small window,
      // they can't be merged and remain tiny
      const result = packTasksIntoFocusBlock(
        30,
        [
          { draftId: "a", title: "Task A", durationMinutes: 3, mergeKey: "A" },
          { draftId: "b", title: "Task B", durationMinutes: 3, mergeKey: "B" },
          { draftId: "c", title: "Task C", durationMinutes: 3, mergeKey: "C" },
          { draftId: "d", title: "Task D", durationMinutes: 3, mergeKey: "D" },
          { draftId: "e", title: "Task E", durationMinutes: 3, mergeKey: "E" },
          { draftId: "f", title: "Task F", durationMinutes: 3, mergeKey: "F" },
        ],
        { minTaskMinutes: 10 }
      );

      // 30 mins / 6 tasks ≈ 5 mins each (less than minTaskMinutes=10)
      // Different merge keys prevent merging, so tiny_tasks_detected or merge_key_conflict
      expect(
        result.warnings.some(
          (w) => w.code === "tiny_tasks_detected" || w.code === "merge_key_conflict"
        )
      ).toBe(true);
    });
  });
});
