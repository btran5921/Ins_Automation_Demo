const logs = [];
const MAX_LOGS = 500;

function log(message, level = "info") {
  const entry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    level,
    message,
    createdAt: new Date().toISOString()
  };

  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.shift();

  const tag = level.toUpperCase().padEnd(5);
  console.log(`[${entry.createdAt}] [${tag}] ${message}`);

  return entry;
}

function getLogs() {
  return logs;
}

function clear() {
  logs.length = 0;
}

module.exports = { log, getLogs, clear };