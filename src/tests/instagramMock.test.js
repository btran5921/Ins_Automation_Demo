// tests/instagramMock.test.js
//
// FILE PURPOSE:
// Unit tests for src/services/instagramMock.js. Verifies the shape of
// the success responses and that the failure rate is respected.

const test = require("node:test");
const assert = require("node:assert");

const mock = require("../src/services/instagramMock");

test("follow returns a success response", async () => {
  mock.updateConfig({ failureRate: 0, latencyMs: 0 });
  const res = await mock.follow("@user123");
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.action, "FOLLOW");
  assert.strictEqual(res.target, "@user123");
});

test("like returns a success response", async () => {
  mock.updateConfig({ failureRate: 0, latencyMs: 0 });
  const res = await mock.like("post_123");
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.action, "LIKE");
  assert.strictEqual(res.target, "post_123");
});

test("comment echoes the text", async () => {
  mock.updateConfig({ failureRate: 0, latencyMs: 0 });
  const res = await mock.comment("post_123", "Nice post!");
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.action, "COMMENT");
  assert.strictEqual(res.target, "post_123");
  assert.strictEqual(res.text, "Nice post!");
});

test("failureRate 1 always throws", async () => {
  mock.updateConfig({ failureRate: 1, latencyMs: 0 });
  await assert.rejects(() => mock.like("post_x"));
  // Reset so we don't leak state into other tests.
  mock.updateConfig({ failureRate: 0 });
});

test("updateConfig rejects an out-of-range failureRate", () => {
  assert.throws(
    () => mock.updateConfig({ failureRate: 1.5 }),
    /failureRate must be a number between 0 and 1/
  );
});