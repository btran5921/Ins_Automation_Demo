// TEMPORARY test — remove after verifying
const { actions, nextActionId } = require("./data/actions");
const queue = require("./services/actionQueue");

(async () => {
  const demo = [
    { type: "LIKE", target: "post_001" },
    { type: "FOLLOW", target: "@user001" },
    { type: "COMMENT", target: "post_002", text: "Nice post!" }
  ];

  for (const d of demo) {
    const action = {
      id: nextActionId(),
      type: d.type,
      target: d.target,
      text: d.text || null,
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
      error: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null
    };
    actions.push(action);
    queue.enqueue(action);
  }

  // Give it enough time for 3 actions @ 2–4s each + retries
  setTimeout(() => {
    console.log("\n=== Final actions ===");
    console.table(actions.map((a) => ({
      id: a.id, type: a.type, target: a.target,
      status: a.status, attempts: a.attempts
    })));
  }, 25000);
})();