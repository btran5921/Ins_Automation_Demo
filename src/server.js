const express = require("express");

const app = express();
app.use(express.json());

const PORT = 3000;

app.get("/", (req, res) => {
  res.json({ message: "Instagram Automation Demo API" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

const logger = require("./utils/logger");
const sleep = require("./utils/sleep");
const { actions, nextActionId } = require("./data/actions");

logger.log("Logger loaded");
logger.log("Warning example", "warn");
logger.log("Error example", "error");

const id = nextActionId();
actions.push({ id, type: "LIKE", target: "post_123", status: "pending" });
logger.log(`Created ${id}, actions length = ${actions.length}`);