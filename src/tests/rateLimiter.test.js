// tests/rateLimiter.test.js
//
// FILE PURPOSE:
// Unit tests for src/services/rateLimiter.js. These are fast — no
// network, no queue — and they verify both the happy path and the
// validation rules.
//
// RUN:
//   npm test
//   or: node --test tests/rateLimiter.test.js

const test = require("node:test");
const assert = require("node:assert");

const rateLimiter = require("../src/services/rateLimiter");

test("getConfig returns the current values", () => {
  const cfg = rateLimiter.getConfig();
  assert.ok(typeof cfg.minDelayMs === "number");
  assert.ok(typeof cfg.maxDelayMs === "number");
  assert.ok(cfg.maxDelayMs >= cfg.minDelayMs);
});

test("updateConfig rejects a negative minDelayMs", () => {
  assert.throws(
    () => rateLimiter.updateConfig({ minDelayMs: -1 }),
    /minDelayMs must be a number >= 0/
  );
});

test("updateConfig rejects maxDelayMs smaller than minDelayMs", () => {
  assert.throws(
    () => rateLimiter.updateConfig({ minDelayMs: 5000, maxDelayMs: 1000 }),
    /maxDelayMs must be >= minDelayMs/
  );
});

test("updateConfig does not corrupt state when validation fails", () => {
  // Put the module into a known-good state.
  rateLimiter.updateConfig({ minDelayMs: 100, maxDelayMs: 200 });

  // Attempt an invalid update — it should throw.
  try {
    rateLimiter.updateConfig({ minDelayMs: 5000, maxDelayMs: 1000 });
  } catch (_) {
    // Expected.
  }

  // Config must still reflect the known-good state.
  const cfg = rateLimiter.getConfig();
  assert.strictEqual(cfg.minDelayMs, 100);
  assert.strictEqual(cfg.maxDelayMs, 200);
});

test("waitBeforeNextAction waits within the configured range", async () => {
  rateLimiter.updateConfig({ minDelayMs: 40, maxDelayMs: 80 });

  const start = Date.now();
  const delay = await rateLimiter.waitBeforeNextAction();
  const elapsed = Date.now() - start;

  // The returned value must be in [min, max].
  assert.ok(delay >= 40 && delay <= 80, `delay was ${delay}ms`);
  // And the wall-clock time should be at least approximately min.
  assert.ok(elapsed >= 35, `elapsed was ${elapsed}ms`);
});