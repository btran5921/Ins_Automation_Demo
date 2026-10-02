// tests/actionQueue.test.js
//
// FILE PURPOSE:
// Integration tests for the queue against a real (in-memory) MongoDB.
// Verifies FIFO processing, retries, permanent failure, and hydration.

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");

const setup = require("./setup");
const Action = require("../src/models/Action");
const Counter = require("../src/models/Counter");
const actionStore = require("../src/services/actionStore");
const queue = require("../src/services/actionQueue");
const mock = require("../src/services/instagramMock");
const rateLimiter = require("../src/services/rateLimiter");

before(async () => {
  await setup.start();
});

after(async () => {
  await setup.stop();
});

beforeEach(async () => {
  await setup.clear();
  queue.start();
});

/** Create a persisted action with sensible defaults. */
async function makeAction(overrides = {}) {
  const id = await actionStore.nextActionId();
  return actionStore.create({
    _id: id,
    type: "LIKE",
    target: "post_x",
    text: null,
    status: "pending",
    attempts: 0,
    maxAttempts: 3,
    error: null,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    ...overrides
  });
}

/** Poll predicate every 25ms until true, or reject after timeoutMs. */
function waitFor(predicate, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = async () => {
      if (await predicate()) return resolve();
      if (Date.now() - start > timeoutMs) {
        return reject(new Error("waitFor timed out"));
      }
      setTimeout(check, 25);
    };
    check();
  });
}

function fastMode() {
  mock.updateConfig({ failureRate: 0, latencyMs: 0 });
  rateLimiter.updateConfig({ minDelayMs: 0, maxDelayMs: 0 });
}

test("processes a single action to completion", async () => {
  fastMode();
  const action = await makeAction({ target: "post_single" });
  queue.enqueue(action);

  await waitFor(async () => {
    const fresh = await actionStore.findById(action.id);
    return fresh.status === "completed";
  });

  const saved = await actionStore.findById(action.id);
  assert.strictEqual(saved.status, "completed");
  assert.strictEqual(saved.attempts, 0);
  assert.ok(saved.completedAt, "completedAt should be set");
});

test("retries a transient failure and then succeeds", async () => {
  rateLimiter.updateConfig({ minDelayMs: 0, maxDelayMs: 0 });
  mock.updateConfig({ failureRate: 0, latencyMs: 0 });

  const originalLike = mock.like;
  let calls = 0;
  mock.like = async (postId) => {
    calls += 1;
    if (calls === 1) throw new Error("transient mock failure");
    return { success: true, action: "LIKE", target: postId };
  };

  try {
    const action = await makeAction({
      target: "post_transient",
      maxAttempts: 3
    });
    queue.enqueue(action);

    await waitFor(async () => {
      const fresh = await actionStore.findById(action.id);
      return fresh.status === "completed";
    });

    const saved = await actionStore.findById(action.id);
    assert.strictEqual(saved.status, "completed");
    assert.strictEqual(saved.attempts, 1);
    assert.strictEqual(calls, 2);
  } finally {
    mock.like = originalLike;
  }
});

test("marks an action as failed after maxAttempts", async () => {
  mock.updateConfig({ failureRate: 1, latencyMs: 0 });
  rateLimiter.updateConfig({ minDelayMs: 0, maxDelayMs: 0 });

  const action = await makeAction({
    target: "post_always_fail",
    maxAttempts: 2
  });
  queue.enqueue(action);

  await waitFor(async () => {
    const fresh = await actionStore.findById(action.id);
    return fresh.status === "failed";
  });

  const saved = await actionStore.findById(action.id);
  assert.strictEqual(saved.status, "failed");
  assert.strictEqual(saved.attempts, 2);
  assert.ok(saved.error, "error message should be recorded");
});

test("hydrate re-queues pending actions from MongoDB", async () => {
  fastMode();

  // Create three pending actions directly, without enqueueing them.
  await makeAction({ target: "post_h1" });
  await makeAction({ target: "post_h2" });
  await makeAction({ target: "post_h3" });

  // Also add one that was "processing" when the server died.
  await makeAction({ target: "post_h4", status: "processing" });

  await queue.hydrate();

  await waitFor(async () => {
    const remaining = await Action.countDocuments({
      status: { $in: ["pending", "processing"] }
    });
    return remaining === 0;
  });

  const completed = await Action.countDocuments({ status: "completed" });
  assert.strictEqual(completed, 4, "all four should complete");
});

test("IDs are sequential across multiple creations", async () => {
  const a = await actionStore.nextActionId();
  const b = await actionStore.nextActionId();
  const c = await actionStore.nextActionId();
  assert.strictEqual(a, "action_001");
  assert.strictEqual(b, "action_002");
  assert.strictEqual(c, "action_003");

  // Sanity: the counter doc exists.
  const counter = await Counter.findById("action");
  assert.ok(counter);
  assert.strictEqual(counter.seq, 3);
});