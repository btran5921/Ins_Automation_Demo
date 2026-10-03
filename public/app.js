// public/app.js
//
// FILE PURPOSE:
// Client-side logic for the dashboard. Organized by feature:
//   1. State & helpers
//   2. Theme + tab navigation
//   3. Toasts
//   4. Candidates (the main workflow)
//   5. Actions & demo queue
//   6. Stats & logs
//   7. Settings
//   8. Media editor modal
//   9. Boot
//
// Renders are cheap — every render rebuilds the relevant section from
// state. That's fine at this scale and much simpler than diffing.

// ============ 1. State & helpers ============

const state = {
  candidates: [],
  candidateFilter: "",      // "" = all
  candidateCounts: { new: 0, ready: 0, acted: 0, skipped: 0 },
  actions: [],
  stats: null,
  queue: null,
  logs: [],
  provider: "unknown",
  ready: []
};

const API = "/api";

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  let data = null;
  try { data = await res.json(); } catch (_) { /* no body */ }

  if (!res.ok) {
    const message =
      (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

/** Escape for safe HTML insertion. */
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/**
 * Cheap signature for a value. Used to skip re-renders when the data
 * hasn't changed since last poll. Good enough for our shapes — we
 * don't need cryptographic strength, just change detection.
 */
function sig(value) {
  return JSON.stringify(value);
}

/** Short "2m ago" style timestamp. */
function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 90) return "1m ago";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** HH:MM:SS.mmm for log lines. */
function timeOnly(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour12: false }) +
    "." + String(d.getMilliseconds()).padStart(3, "0");
}

function $(id) { return document.getElementById(id); }

/**
 * Run an async function with a button in a disabled "working" state.
 * Restores the original label when done, regardless of success.
 */
async function withLoading(btn, fn) {
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = "…";
  try { return await fn(); }
  finally { btn.disabled = false; btn.innerHTML = original; }
}

// ============ 2. Theme + tab navigation ============

const THEME_KEY = "theme";

function getStoredTheme() {
  return localStorage.getItem(THEME_KEY) || "system";
}

function applyTheme(theme) {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

function cycleTheme() {
  const order = ["system", "light", "dark"];
  const current = getStoredTheme();
  const next = order[(order.indexOf(current) + 1) % order.length];
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
  toast(`Theme: ${next}`);
}

applyTheme(getStoredTheme());
$("theme-toggle").addEventListener("click", cycleTheme);

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.tab === name)
  );
  document.querySelectorAll("[data-panel]").forEach((p) => {
    p.hidden = p.dataset.panel !== name;
  });
  localStorage.setItem("activeTab", name);
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

// ============ 3. Toasts ============

function toast(message, kind = "") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`.trim();
  el.textContent = message;
  $("toasts").appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
  }, 3000);
}

// ============ 4. Candidates ============
let candidatesSig = "";

async function loadCandidates() {
  try {
    const [list, counts, ready] = await Promise.all([
      api(state.candidateFilter
        ? `/candidates?status=${encodeURIComponent(state.candidateFilter)}`
        : "/candidates"),
      api("/candidates/counts"),
      api("/candidates?status=ready")   // feeds the Overview tab
    ]);

    state.candidates = list;
    state.candidateCounts = counts;
    state.ready = ready;

    // Skip the re-render if nothing changed. Otherwise every poll
    // would rebuild the DOM and replay the card animation, which
    // feels like the page is constantly refreshing.
    const newSig = sig({ list, counts, ready });
    if (newSig === candidatesSig) return;
    candidatesSig = newSig;

    renderCandidates();
    renderCandidateCounts();
    renderOverview();
  } catch (err) {
    console.error("loadCandidates failed:", err);
  }
}

let actionsSig = "";

async function loadActions() {
  try {
    const [actions, stats, queue] = await Promise.all([
      api("/actions"),
      api("/actions/stats"),
      api("/queue")
    ]);
    state.actions = actions;
    state.stats = stats;
    state.queue = queue;

    // Skip the re-render if nothing changed. Same pattern as
    // loadCandidates and loadLogs.
    const newSig = sig({ actions, stats, queue });
    if (newSig === actionsSig) return;
    actionsSig = newSig;

    renderStats();
    renderQueuePill();
    renderActions();
    renderOverview();
  } catch (err) {
    console.error("loadActions failed:", err);
  }
}

let logsSig = "";

async function loadLogs() {
  try {
    const logs = await api("/logs?limit=150");
    state.logs = logs;

    const newSig = sig(logs);
    if (newSig === logsSig) return;
    logsSig = newSig;

    renderLogs();
    renderOverview();
  } catch (err) {
    console.error("loadLogs failed:", err);
  }
}

function renderCandidateCounts() {
  const c = state.candidateCounts;
  const total = (c.new || 0) + (c.ready || 0) + (c.acted || 0) + (c.skipped || 0);
  const el = $("tab-count-candidates");
  if (el) el.textContent = total;
}

let candidatesAnimated = false;

function renderCandidates() {
  const el = $("candidates-list");
  if (!el) return;

  if (state.candidates.length === 0) {
    el.innerHTML = emptyStateForList();
    return;
  }

  // On the first render, add a class that triggers the fade-in.
  // On subsequent renders, skip it so cards don't flash.
  const animate = !candidatesAnimated;
  el.innerHTML =
    (animate ? '<div class="animate-in">' : "") +
    state.candidates.map(renderCandidate).join("") +
    (animate ? "</div>" : "");

  if (animate) candidatesAnimated = true;

  wireCandidateCardEvents();
}

function emptyStateForList() {
  if (state.candidateFilter) {
    return `
      <div class="empty-state">
        <strong>Nothing in "${esc(state.candidateFilter)}"</strong>
        Try a different filter, or add a new candidate above.
      </div>`;
  }
  return `
    <div class="empty-state">
      <strong>No candidates yet</strong>
      Add a post you want to engage with, then generate comment
      options and paste one in yourself on Instagram.
      <div style="margin-top:12px">
        Press <span class="kbd">⌘</span> <span class="kbd">K</span> to add one.
      </div>
    </div>`;
}

function renderCandidate(c) {
  const metaBits = [];
  if (c.author) metaBits.push(`<span>${esc(c.author)}</span>`);
  if (c.sourceUrl) {
    metaBits.push(
      `<a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener"
          title="Open on Instagram">open ↗</a>`
    );
  }
  metaBits.push(`<span>${timeAgo(c.createdAt)}</span>`);
  const meta = metaBits.join(`<span class="sep">·</span>`);

  // --- Media block: image + music overlay, or placeholder ---
  const musicBadge = c.musicTitle
    ? `<div class="music-badge" title="${esc(c.musicArtist || "")}">
         <span class="music-icon">♪</span>
         <span class="music-title">${esc(c.musicTitle)}</span>
         ${c.musicArtist ? `<span class="music-artist">· ${esc(c.musicArtist)}</span>` : ""}
       </div>`
    : "";

  const imageHtml = c.imageUrl
    ? `<div class="post-media">
         <img
           src="${esc(c.imageUrl)}"
           alt=""
           loading="lazy"
           referrerpolicy="no-referrer"
           onerror="this.parentElement.classList.add('media-error')"
         />
         ${musicBadge}
         <button class="media-edit" data-edit-media="${esc(c.id)}"
                 title="Edit image or music">Edit</button>
       </div>`
    : `<div class="post-media placeholder">
         <div class="placeholder-inner">
           <span>No image yet</span>
           <button class="btn small primary" data-edit-media="${esc(c.id)}">
             Paste image &amp; music
           </button>
         </div>
       </div>`;

  // --- Caption with show-more for long ones ---
  const captionHtml = c.caption
    ? (() => {
        const isLong = c.caption.length > 220;
        return `
          <div class="cand-caption ${isLong ? "clamped" : ""}"
               data-caption="${esc(c.id)}">${esc(c.caption)}</div>
          ${isLong
            ? `<button class="cand-caption-toggle" data-expand="${esc(c.id)}">Show more</button>`
            : ""}`;
      })()
    : "";

  // --- Suggestions ---
  const suggestionsHtml = c.suggestions && c.suggestions.length
    ? `<div class="suggestions">${c.suggestions
        .map((s, i) => {
          const picked = c.chosenComment === s;
          return `
            <div class="suggestion ${picked ? "picked" : ""}">
              <span class="suggestion-text">${esc(s)}</span>
              <span class="suggestion-actions">
                <button class="btn small" data-pick="${esc(c.id)}" data-idx="${i}">
                  ${picked ? "✓ Picked" : "Pick"}
                </button>
                <button class="btn small" data-copy="${esc(c.id)}" data-idx="${i}">
                  Copy
                </button>
              </span>
            </div>`;
        })
        .join("")}</div>`
    : "";

  const orphanChosen =
    c.chosenComment && !(c.suggestions || []).includes(c.chosenComment)
      ? `<div class="suggestion picked">
           <span class="suggestion-text">${esc(c.chosenComment)}</span>
         </div>`
      : "";

  // --- Metadata error hint ---
  const metaHint =
    c.metadataError && !c.imageUrl
      ? `<div class="meta-hint">${esc(c.metadataError)}</div>`
      : "";

  return `
    <div class="candidate" data-id="${esc(c.id)}">
      <div class="cand-head">
        <span class="badge ${esc(c.status)}">${esc(c.status)}</span>
        <div class="cand-meta">${meta}</div>
      </div>

      <div class="cand-body">
        ${imageHtml}
        <div class="cand-content">
          ${captionHtml}
          ${metaHint}
        </div>
      </div>

      ${suggestionsHtml}
      ${orphanChosen}

      <div class="cand-actions">
        <button class="btn small primary" data-suggest="${esc(c.id)}">
          ${c.suggestions && c.suggestions.length ? "Regenerate" : "Suggest comments"}
        </button>
        <button class="btn small" data-acted="${esc(c.id)}"
                ${c.status === "acted" ? "disabled" : ""}>Mark acted</button>
        <button class="btn small" data-skip="${esc(c.id)}"
                ${c.status === "skipped" ? "disabled" : ""}>Skip</button>
        <span class="spacer"></span>
        <button class="btn small danger" data-delete="${esc(c.id)}">Delete</button>
      </div>
    </div>`;
}

function wireCandidateCardEvents() {
  const el = $("candidates-list");
  if (!el) return;

  // Suggest / Regenerate
  el.querySelectorAll("[data-suggest]").forEach((btn) =>
    btn.addEventListener("click", () =>
      withLoading(btn, async () => {
        try {
          await api(`/candidates/${btn.dataset.suggest}/suggest`, { method: "POST" });
          toast("Suggestions ready", "ok");
          await loadCandidates();
        } catch (err) {
          toast(err.message, "err");
        }
      })
    )
  );

  // Mark acted
  el.querySelectorAll("[data-acted]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      try {
        await api(`/candidates/${btn.dataset.acted}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "acted" })
        });
        toast("Marked as acted", "ok");
        await loadCandidates();
      } catch (err) { toast(err.message, "err"); }
    })
  );

  // Skip
  el.querySelectorAll("[data-skip]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      try {
        await api(`/candidates/${btn.dataset.skip}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "skipped" })
        });
        toast("Skipped");
        await loadCandidates();
      } catch (err) { toast(err.message, "err"); }
    })
  );

  // Delete
  el.querySelectorAll("[data-delete]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this candidate?")) return;
      try {
        await api(`/candidates/${btn.dataset.delete}`, { method: "DELETE" });
        toast("Deleted");
        await loadCandidates();
      } catch (err) { toast(err.message, "err"); }
    })
  );

  // Pick a suggestion
  el.querySelectorAll("[data-pick]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const cand = state.candidates.find((c) => c.id === btn.dataset.pick);
      if (!cand) return;
      const text = cand.suggestions[Number(btn.dataset.idx)];
      try {
        await api(`/candidates/${cand.id}`, {
          method: "PATCH",
          body: JSON.stringify({ chosenComment: text })
        });
        await loadCandidates();
      } catch (err) { toast(err.message, "err"); }
    })
  );

  // Copy suggestion
  el.querySelectorAll("[data-copy]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const cand = state.candidates.find((c) => c.id === btn.dataset.copy);
      if (!cand) return;
      const text = cand.suggestions[Number(btn.dataset.idx)];
      try {
        await navigator.clipboard.writeText(text);
        toast("Copied to clipboard", "ok");
      } catch (_) {
        toast("Copy failed — select and copy manually", "err");
      }
    })
  );

  // Edit media
  el.querySelectorAll("[data-edit-media]").forEach((btn) =>
    btn.addEventListener("click", () => openMediaEditor(btn.dataset.editMedia))
  );

  // Show more / less for long captions
  el.querySelectorAll("[data-expand]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const cap = el.querySelector(`[data-caption="${btn.dataset.expand}"]`);
      if (!cap) return;
      cap.classList.toggle("clamped");
      btn.textContent = cap.classList.contains("clamped") ? "Show more" : "Show less";
    })
  );
}

// ---------- Add candidate form ----------

function openAddPanel(open) {
  const panel = $("add-panel");
  if (!panel) return;
  const body = panel.querySelector(".add-panel-body");
  const toggle = $("add-toggle");
  if (body) body.hidden = !open;
  if (toggle) toggle.setAttribute("aria-expanded", String(open));
  if (open) setTimeout(() => { const el = $("cand-url"); if (el) el.focus(); }, 30);
}

$("add-toggle").addEventListener("click", () => {
  const isOpen = $("add-toggle").getAttribute("aria-expanded") === "true";
  openAddPanel(!isOpen);
});

$("add-cancel").addEventListener("click", () => openAddPanel(false));

$("cand-caption").addEventListener("input", () => {
  const len = $("cand-caption").value.length;
  $("cand-caption-hint").textContent = `${len} char${len === 1 ? "" : "s"}`;
});

$("candidate-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const sourceUrl = $("cand-url").value.trim() || null;
  const author = $("cand-author").value.trim() || null;
  const caption = $("cand-caption").value.trim() || "";

  if (!sourceUrl && !caption) {
    toast("Add a URL or a caption", "warn");
    $("cand-caption").focus();
    return;
  }

  await withLoading($("add-submit"), async () => {
    try {
      await api("/candidates", {
        method: "POST",
        body: JSON.stringify({ sourceUrl, author, caption })
      });
      $("cand-url").value = "";
      $("cand-author").value = "";
      $("cand-caption").value = "";
      $("cand-caption-hint").textContent = "0 chars";
      toast("Candidate added", "ok");
      openAddPanel(false);
      await loadCandidates();
    } catch (err) {
      toast(err.message, "err");
    }
  });
});

// Chips filter
$("cand-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  document.querySelectorAll("#cand-chips .chip").forEach((c) =>
    c.classList.toggle("active", c === chip)
  );
  state.candidateFilter = chip.dataset.status || "";
  loadCandidates();
});

// ============ 5. Actions & demo queue ============

function renderQueuePill() {
  const q = state.queue;
  if (!q) return;
  const el = $("queue-pill");
  if (!el) return;
  const running = q.running;
  el.querySelector(".dot").className = `dot ${running ? "green" : "amber"}`;
  el.querySelector(".pill-label").textContent =
    running ? `queue on · ${q.waiting}` : `queue paused · ${q.waiting}`;

  el.style.cursor = "pointer";
  el.onclick = async () => {
    try {
      await api(running ? "/queue/stop" : "/queue/start", { method: "POST" });
      await loadActions();
    } catch (err) { toast(err.message, "err"); }
  };
}

function renderStats() {
  const s = state.stats;
  const q = state.queue;
  if (!s || !q) return;

  const cards = [
    { label: "Total", value: s.total, cls: "" },
    { label: "Pending", value: s.byStatus.pending, cls: "amber" },
    { label: "Processing", value: s.byStatus.processing, cls: "blue" },
    { label: "Completed", value: s.byStatus.completed, cls: "green" },
    { label: "Failed", value: s.byStatus.failed, cls: "red" },
    { label: "Cancelled", value: s.byStatus.cancelled, cls: "" },
    { label: "In queue", value: q.waiting, cls: "purple" }
  ];

  $("stats").innerHTML = cards.map((c) => `
    <div class="card">
      <div class="label">${c.label}</div>
      <div class="value ${c.cls}">${c.value}</div>
    </div>
  `).join("");
}

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

  body.innerHTML = rows.map((a) => `
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
        ${a.status === "pending"
          ? `<button class="btn small danger" data-cancel="${esc(a.id)}">Cancel</button>`
          : ""}
      </td>
    </tr>
  `).join("");

  body.querySelectorAll("[data-cancel]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      try {
        await api(`/actions/${btn.dataset.cancel}`, { method: "DELETE" });
        toast("Cancelled");
        await loadActions();
      } catch (err) { toast(err.message, "err"); }
    })
  );
}

$("filter-status").addEventListener("change", renderActions);
$("filter-type").addEventListener("change", renderActions);

$("type").addEventListener("change", () => {
  $("text-field").hidden = $("type").value !== "COMMENT";
});

$("action-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const type = $("type").value;
  const target = $("target").value.trim();
  const text = $("text").value.trim();

  if (!target) { toast("Target is required", "warn"); return; }
  if (type === "COMMENT" && !text) { toast("Comment text is required", "warn"); return; }

  const payload = { type, target };
  if (type === "COMMENT") payload.text = text;

  try {
    const action = await api("/actions", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    toast(`Queued ${action.id}`, "ok");
    $("target").value = "";
    $("text").value = "";
    await loadActions();
  } catch (err) { toast(err.message, "err"); }
});

$("demo-btn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  await withLoading(btn, async () => {
    const demo = [
      { type: "LIKE", target: "post_001" },
      { type: "FOLLOW", target: "@user001" },
      { type: "COMMENT", target: "post_002", text: "Nice post!" },
      { type: "LIKE", target: "post_003" },
      { type: "FOLLOW", target: "@user002" }
    ];
    try {
      for (const item of demo) {
        await api("/actions", { method: "POST", body: JSON.stringify(item) });
      }
      toast("5 demo actions queued", "ok");
      await loadActions();
    } catch (err) { toast(err.message, "err"); }
  });
});

// ============ 6. Logs ============

function renderLogs() {
  const el = $("logs");
  if (state.logs.length === 0) {
    el.innerHTML = `<div class="log-line"><span class="log-msg">No logs yet.</span></div>`;
    return;
  }
  el.innerHTML = state.logs.map((l) => `
    <div class="log-line ${esc(l.level)}">
      <span class="log-time">${timeOnly(l.createdAt)}</span>
      <span class="log-msg">${esc(l.message)}</span>
    </div>
  `).join("");
}

$("clear-logs").addEventListener("click", async () => {
  try {
    await api("/logs", { method: "DELETE" });
    toast("Logs cleared");
    await loadLogs();
  } catch (err) { toast(err.message, "err"); }
});

// ============ 7. Settings ============

async function loadConfig() {
  try {
    const cfg = await api("/config");
    $("min-delay").value = cfg.rateLimiter.minDelayMs;
    $("max-delay").value = cfg.rateLimiter.maxDelayMs;
    $("failure-rate").value = Math.round(cfg.instagramMock.failureRate * 100);
    updateConfigLabels();

    const prov = cfg.provider || "template";
    state.provider = prov;
    const pill = $("provider-pill");
    if (pill) {
      pill.querySelector(".dot").className =
        `dot ${prov === "template" ? "gray" : "green"}`;
      pill.querySelector(".pill-label").textContent = `ai: ${prov}`;
    }
  } catch (err) {
    console.error("loadConfig failed:", err);
  }
}

function updateConfigLabels() {
  $("min-delay-value").textContent = $("min-delay").value;
  $("max-delay-value").textContent = $("max-delay").value;
  $("failure-rate-value").textContent = $("failure-rate").value;
}

["min-delay", "max-delay", "failure-rate"].forEach((id) => {
  $(id).addEventListener("input", updateConfigLabels);
});

$("save-config").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const minDelayMs = Number($("min-delay").value);
  const maxDelayMs = Number($("max-delay").value);

  if (maxDelayMs < minDelayMs) {
    toast("Max delay must be ≥ min delay", "warn");
    return;
  }

  await withLoading(btn, async () => {
    try {
      await api("/config", {
        method: "PUT",
        body: JSON.stringify({
          rateLimiter: { minDelayMs, maxDelayMs },
          instagramMock: { failureRate: Number($("failure-rate").value) / 100 }
        })
      });
      toast("Settings saved", "ok");
      await loadConfig();
    } catch (err) { toast(err.message, "err"); }
  });
});

// ============ 8. Media editor modal ============

function openMediaEditor(candidateId) {
  const c = state.candidates.find((x) => x.id === candidateId);
  if (!c) return;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3>Edit media</h3>
        <button class="modal-close" aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label for="edit-image">Image URL</label>
          <input id="edit-image" type="text"
                 placeholder="https://…/image.jpg"
                 value="${esc(c.imageUrl || "")}" />
        </div>
        <div class="field-row">
          <div class="field">
            <label for="edit-music-title">Music title</label>
            <input id="edit-music-title" type="text"
                   placeholder="Song name"
                   value="${esc(c.musicTitle || "")}" />
          </div>
          <div class="field">
            <label for="edit-music-artist">Music artist</label>
            <input id="edit-music-artist" type="text"
                   placeholder="Artist"
                   value="${esc(c.musicArtist || "")}" />
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn ghost" data-modal-cancel>Cancel</button>
        <button class="btn primary" data-modal-save>Save</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));
  setTimeout(() => overlay.querySelector("#edit-image").focus(), 40);

  // Paste a URL directly into the image field.
  overlay.querySelector("#edit-image").addEventListener("paste", (e) => {
    const text = e.clipboardData.getData("text");
    if (text && /^https?:\/\//i.test(text.trim())) {
      e.preventDefault();
      overlay.querySelector("#edit-image").value = text.trim();
    }
  });

  const close = () => {
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 200);
  };

  overlay.querySelector(".modal-close").addEventListener("click", close);
  overlay.querySelector("[data-modal-cancel]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  overlay.querySelector("[data-modal-save]").addEventListener("click", async (e) => {
    const payload = {
      imageUrl: overlay.querySelector("#edit-image").value.trim() || null,
      musicTitle: overlay.querySelector("#edit-music-title").value.trim() || null,
      musicArtist: overlay.querySelector("#edit-music-artist").value.trim() || null
    };
    await withLoading(e.currentTarget, async () => {
      try {
        await api(`/candidates/${c.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        toast("Media updated", "ok");
        close();
        await loadCandidates();
      } catch (err) {
        toast(err.message, "err");
      }
    });
  });

  const onEsc = (e) => {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", onEsc); }
  };
  document.addEventListener("keydown", onEsc);
}

// ============ 8b. Overview ============

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

/** Jump to the Candidates tab with a status filter applied. */
function showCandidates(status) {
  switchTab("candidates");
  const chip = document.querySelector(`#cand-chips .chip[data-status="${status}"]`);
  if (chip) chip.click();
}

function renderOverview() {
  if (!$("ov-kpis")) return;
  const c = state.candidateCounts;
  const n = { new: c.new || 0, ready: c.ready || 0, acted: c.acted || 0, skipped: c.skipped || 0 };
  const total = n.new + n.ready + n.acted + n.skipped;
  const by = (state.stats && state.stats.byStatus) || {};
  const done = by.completed || 0, failed = by.failed || 0;
  const waiting = state.queue ? state.queue.waiting : 0;

  // --- KPIs ---
  const kpis = [
    { label: "Candidates", value: total, sub: `${n.new} new` },
    { label: "Ready to act on", value: n.ready, sub: n.ready ? "waiting for you" : "all caught up", cls: "hot" },
    { label: "Acted on", value: n.acted, sub: `${pct(n.acted, n.acted + n.skipped)}% of reviewed` },
    { label: "Queue success", value: done + failed ? pct(done, done + failed) + "%" : "–",
      sub: `${waiting} waiting` }
  ];
  $("ov-kpis").innerHTML = kpis.map((k) => `
    <div class="ov-kpi">
      <div class="k-label">${k.label}</div>
      <div class="k-value ${k.cls || ""}">${k.value}</div>
      <div class="k-sub">${k.sub}</div>
    </div>`).join("");

  // --- Pipeline bar ---
  const stages = [["new", "New"], ["ready", "Ready"], ["acted", "Acted"], ["skipped", "Skipped"]];
  $("ov-pipeline").innerHTML = total === 0
    ? `<p class="muted">No candidates yet. Press <span class="kbd">⌘</span> <span class="kbd">K</span> to add one.</p>`
    : `<div class="pipeline">${stages.filter(([k]) => n[k] > 0).map(([k, l]) =>
          `<span class="seg seg-${k}" style="flex-grow:${n[k]}" title="${l}: ${n[k]}"></span>`).join("")}</div>
       <div class="pipeline-legend">${stages.map(([k, l]) =>
          `<button class="legend-item" data-go="${k}"><i class="swatch seg-${k}"></i>${l} <b>${n[k]}</b></button>`).join("")}</div>`;

  // --- Queue by action type ---
  const counts = { LIKE: 0, FOLLOW: 0, COMMENT: 0 };
  state.actions.forEach((a) => { if (a.type in counts) counts[a.type]++; });
  const max = Math.max(1, ...Object.values(counts));
  $("ov-mix").innerHTML = state.actions.length === 0
    ? `<p class="muted">No queued actions. Add some on the Demo tab.</p>`
    : Object.entries(counts).map(([t, v]) => `
        <div class="mix-row">
          <span class="type-tag ${t}">${t}</span>
          <div class="mix-track"><div class="mix-bar ${t}" style="width:${(v / max) * 100}%"></div></div>
          <span class="mono">${v}</span>
        </div>`).join("");

  // --- Ready list ---
  const ready = state.ready.slice(0, 4);
  $("ov-next").innerHTML = ready.length === 0
    ? `<p class="muted">Nothing is ready. Open a New candidate and generate comment suggestions.</p>`
    : ready.map((r) => `
        <div class="next-row" data-go="ready">
          <div class="next-main">
            <div class="next-title">${esc(r.author || "Unknown author")}${r.chosenComment ? ' <span class="next-picked">comment picked</span>' : ""}</div>
            <div class="next-sub">${esc((r.caption || r.sourceUrl || "").slice(0, 110))}</div>
          </div>
          <span class="id-cell">${timeAgo(r.createdAt)}</span>
        </div>`).join("");

  // --- Latest logs ---
  $("ov-logs").innerHTML = state.logs.length === 0
    ? `<div class="log-line"><span class="log-msg">No activity yet.</span></div>`
    : state.logs.slice(0, 6).map((l) => `
        <div class="log-line ${esc(l.level)}">
          <span class="log-time">${timeOnly(l.createdAt)}</span>
          <span class="log-msg">${esc(l.message)}</span>
        </div>`).join("");
}

// One delegated handler for every "jump to Candidates" control on the Overview.
document.querySelector('[data-panel="overview"]').addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]");
  if (go) showCandidates(go.dataset.go);
});
$("ov-view-ready").addEventListener("click", () => showCandidates("ready"));

// ============ 9. Boot ============

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    switchTab("candidates");
    openAddPanel(true);
  }
});

const savedTab = localStorage.getItem("activeTab") || "overview";
switchTab(savedTab);

loadCandidates();
loadActions();
loadLogs();
loadConfig();

setInterval(loadCandidates, 10000);  // was 5000
setInterval(loadLogs, 8000);         // was 3000
setInterval(loadActions, 5000);      // was 2000