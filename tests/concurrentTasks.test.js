import test from "node:test";
import assert from "node:assert/strict";
import { mapConcurrent } from "../src/concurrentTasks.js";
test("bounded work preserves media order even when transfers finish out of order", async () => {
  let active = 0, maximum = 0;
  const result = await mapConcurrent([30, 5, 2, 1], 2, async (delay, index) => {
    active++; maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, delay));
    active--; return index;
  });
  assert.equal(maximum, 2);
  assert.deepEqual(result, [0, 1, 2, 3]);
});
test("failure stops queued uploads and waits for active writes before rollback", async () => {
  const started = [], finished = [];
  await assert.rejects(mapConcurrent([0, 1, 2, 3], 2, async (item) => {
    started.push(item);
    if (item === 0) throw new Error("upload failed");
    await new Promise((resolve) => setTimeout(resolve, 15));
    finished.push(item);
  }), /upload failed/);
  assert.deepEqual(started, [0, 1]);
  assert.deepEqual(finished, [1]);
});
test("an empty media list creates no tasks", async () => {
  assert.deepEqual(await mapConcurrent([], 2, () => { throw new Error("should not run"); }), []);
});
