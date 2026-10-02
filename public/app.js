// public/app.js
//
// FILE PURPOSE:
// Client-side logic for the dashboard. Responsibilities:
//   1. Poll the API every 1.5s and re-render the UI
//   2. Submit the "Add action" form
//   3. Toggle queue start/stop
//   4. Cancel pending actions
//   5. Save settings (rate limiter + mock failure rate)
//   6. Load and clear the activity log
//
// State lives in the `state` object and is completely rebuilt on
// every refresh. There is no client-side routing or persistence.

// ---------------- State ----------------

// Snapshot of everything the UI needs on each render.
const state = {
  actions: [],
  stats: null,
  queue: null,
  logs: [],
  config: null
};

// Base path for all API calls. Kept in one place so it's easy to change.
const API = "/api";

// ---------------- Helpers ----------------

/**
 * Thin fetch wrapper. Adds JSON headers, parses the response, and
 * throws a readable Error on non-2xx responses.
 *
 * @param {string} path - e.g. "/actions"
 * @param {object} [options] - fetch options (method, body, etc.)
 * @returns {Promise<any>} parsed JSON body
 */
async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    // Some responses (e.g. DELETE /logs) may have no JSON body.
  }

  if (!res.ok) {
    const message =
      (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data;
}

/**
 * Escape a string for safe insertion into HTML. Prevents actions or
 * log messages from breaking the layout or injecting markup.
 */
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

/**
 * Format an ISO timestamp as HH:MM:SS.mmm for the log view.
 */
function timeOnly(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return (
    d.toLocaleTimeString([], { hour12: false }) +
    "." +
    String(d.getMilliseconds()).padStart(3, "0")
  );
}

/** Shorthand for document.getElementById. */
function $(id) {
  return document.getElementById(id);
}

// ---------------- Rendering ----------------

/**
 * Re-render the stats cards from state.stats and state.queue.
 */
function renderStats() {
  const s = state.stats;
  const q = state.queue;
  const el = $("stats");

  if (!s || !q) {
    el.innerHTML = "";
    return;
  }

  const cards = [
    { label: "Total", value: s.total, cls: "" },
    { label: "Pending", value: s.byStatus.pending, cls: "amber" },
    { label: "Processing", value: s.byStatus.processing, cls: "blue" },
    { label: "Completed", value: s.byStatus.completed, cls: "green" },
    { label: "Failed", value: s.byStatus.failed, cls: "red" },
    { label: "Cancelled", value: s.byStatus.cancelled, cls: "" },
    { label: "In queue", value: q.waiting, cls: "purple" }
  ];

  el.innerHTML = cards
    .map(
      (c) => `
      <div class="card">
        <div class="label">${c.label}</div>
        <div class="value ${c.cls}">${c.value}</div>
      </div>`
    )
    .join("");
}

/**
 * Re-render the queue indicator + start/stop button in the header.
 * Reattaches the click handler each time, because innerHTML replaces
 * the button element.
 */
function renderQueueToggle() {
  const q = state.queue;
  const el = $("queue-toggle");
  if (!q) return;

  const running = q.running;
  const current = q.currentActionId
    ? ` · processing <span class="mono">${esc(q.currentActionId)}</span>`
    : "";

  el.innerHTML = `
    <span>
      <span class="dot ${running ? "on" : "off"}"></span>
      ${running ? "Queue running" : "Queue paused"}${current}
    </span>
    <button class="btn small" id="toggle-queue-btn">
      ${running ? "Pause" : "Resume"}
    </button>
  `;

  // Wire the button up right after we render it.
  $("toggle-queue-btn").addEventListener("click", async () => {
    try {
      await api(running ? "/queue/stop" : "/queue/start", { method: "POST" });
      await refresh();
    } catch (err) {
      console.error(err);
    }
  });
}

/**
 * Re-render the actions table, respecting the status/type filters.
 */
function renderActions() {
  const body = $("actions-body");
  const statusFilter = $("filter-status").value;
  const typeFilter = $("filter-type").value;

  const rows = state.actions.filter(
    (a) =>
      (!statusFilter || a.status === statusFilter) &&
      (!typeFilter || a.type === typeFilter)
  );

  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="6" class="empty">No actions match.</td></tr>`;
    return;
  }

  body.innerHTML = rows
    .map(
      (a) => `
      <tr>
        <td class="id-cell">${esc(a.id)}</td>
        <td><span class="type-tag ${esc(a.type)}">${esc(a.type)}</span></td>
        <td>
          <span class="mono">${esc(a.target)}</span>
          ${a.text ? `<br><span class="id-cell">"${esc(a.text)}"</span>` : ""}
        </td>
        <td>
          <span class="badge ${esc(a.status)}">${esc(a.status)}</span>
          ${a.error ? `<br><span class="id-cell">${esc(a.error)}</span>` : ""}
        </td>
        <td class="id-cell">${a.attempts}/${a.maxAttempts}</td>
        <td style="text-align:right">
          ${
            a.status === "pending"
              ? `<button class="btn small danger" data-cancel="${esc(a.id)}">Cancel</button>`
              : ""
          }
        </td>
      </tr>`
    )
    .join("");

  // Attach cancel handlers to any Cancel buttons just rendered.
  body.querySelectorAll("[data-cancel]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api(`/actions/${btn.dataset.cancel}`, { method: "DELETE" });
        await refresh();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

/**
 * Re-render the activity log. Logs come from the API newest-first.
 */
function renderLogs() {
  const el = $("logs");
  if (state.logs.length === 0) {
    el.innerHTML = `<div class="log-line"><span class="log-msg">No logs yet.</span></div>`;
    return;
  }

  el.innerHTML = state.logs
    .map(
      (l) => `
      <div class="log-line ${esc(l.level)}">
        <span class="log-time">${timeOnly(l.createdAt)}</span>
        <span class="log-msg">${esc(l.message)}</span>
      </div>`
    )
    .join("");
}

// ---------------- Data loading ----------------

/**
 * Fetch everything the dashboard needs in one parallel batch and
 * re-render the UI. Called on load, after user actions, and on a
 * 1.5s interval.
 */
async function refresh() {
  try {
    const [actions, stats, queue, logs] = await Promise.all([
      api("/actions"),
      api("/actions/stats"),
      api("/queue"),
      api("/logs?limit=120")
    ]);

    state.actions = actions;
    state.stats = stats;
    state.queue = queue;
    state.logs = logs;

    renderStats();
    renderQueueToggle();
    renderActions();
    renderLogs();
  } catch (err) {
    console.error("Refresh failed:", err);
  }
}

/**
 * Fetch the current config and sync the sliders to it. Called once
 * at startup.
 */
async function loadConfig() {
  try {
    const cfg = await api("/config");
    state.config = cfg;

    $("min-delay").value = cfg.rateLimiter.minDelayMs;
    $("max-delay").value = cfg.rateLimiter.maxDelayMs;
    $("failure-rate").value = Math.round(cfg.instagramMock.failureRate * 100);

    updateConfigLabels();
  } catch (err) {
    console.error(err);
  }
}

/**
 * Update the small numeric labels next to each slider, so the user
 * sees the current value while dragging.
 */
function updateConfigLabels() {
  $("min-delay-value").textContent = $("min-delay").value;
  $("max-delay-value").textContent = $("max-delay").value;
  $("failure-rate-value").textContent = $("failure-rate").value;
}

// ---------------- Form handling ----------------

/** Show a small status message under the Add-action form. */
function setMessage(text, kind) {
  const el = $("form-message");
  el.textContent = text;
  el.className = "form-message" + (kind ? ` ${kind}` : "");
}

/** POST a single action to the API. */
async function submitAction(payload) {
  return api("/actions", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

// Handle form submit.
$("action-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const type = $("type").value;
  const target = $("target").value.trim();
  const text = $("text").value.trim();

  if (!target) {
    setMessage("Target is required.", "err");
    return;
  }

  if (type === "COMMENT" && !text) {
    setMessage("Comment text is required for COMMENT actions.", "err");
    return;
  }

  try {
    const payload = { type, target };
    if (type === "COMMENT") payload.text = text;

    const action = await submitAction(payload);
    setMessage(`Queued ${action.id}`, "ok");

    // Clear the inputs so the user can immediately add another.
    $("target").value = "";
    $("text").value = "";

    await refresh();
  } catch (err) {
    setMessage(err.message, "err");
  }
});

// Show/hide the Comment text field based on the selected type.
$("type").addEventListener("change", () => {
  $("text-field").hidden = $("type").value !== "COMMENT";
});

// The "Add 5 demo actions" button — a quick way to see the queue in action.
$("demo-btn").addEventListener("click", async () => {
  const demo = [
    { type: "LIKE", target: "post_001" },
    { type: "FOLLOW", target: "@user001" },
    { type: "COMMENT", target: "post_002", text: "Nice post!" },
    { type: "LIKE", target: "post_003" },
    { type: "FOLLOW", target: "@user002" }
  ];

  try {
    for (const item of demo) {
      await submitAction(item);
    }
    setMessage("5 demo actions queued.", "ok");
    await refresh();
  } catch (err) {
    setMessage(err.message, "err");
  }
});

// ---------------- Filters & config ----------------

$("filter-status").addEventListener("change", renderActions);
$("filter-type").addEventListener("change", renderActions);

// Live-update the small numeric labels while dragging sliders.
["min-delay", "max-delay", "failure-rate"].forEach((id) => {
  $(id).addEventListener("input", updateConfigLabels);
});

// Save settings to the API.
$("save-config").addEventListener("click", async () => {
  const minDelayMs = Number($("min-delay").value);
  const maxDelayMs = Number($("max-delay").value);

  if (maxDelayMs < minDelayMs) {
    alert("Max delay must be greater than or equal to min delay.");
    return;
  }

  try {
    await api("/config", {
      method: "PUT",
      body: JSON.stringify({
        rateLimiter: { minDelayMs, maxDelayMs },
        instagramMock: { failureRate: Number($("failure-rate").value) / 100 }
      })
    });
    await loadConfig();
  } catch (err) {
    alert(err.message);
  }
});

// Clear the log buffer.
$("clear-logs").addEventListener("click", async () => {
  await api("/logs", { method: "DELETE" });
  await refresh();
});

// ---------------- Boot ----------------

loadConfig();          // one-time: sync sliders with server config
refresh();             // initial render
setInterval(refresh, 1500); // poll every 1.5s