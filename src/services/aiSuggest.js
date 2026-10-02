// src/services/aiSuggest.js
//
// FILE PURPOSE:
// Generates comment suggestions for a candidate post.
//
// Three providers, tried in this order:
//   1. Gemini  — if GEMINI_API_KEY is set (free tier, no card required)
//   2. Anthropic — if ANTHROPIC_API_KEY is set (paid)
//   3. Templates — no key needed, always available
//
// Template mode extracts keywords from the caption and slots them into
// varied sentence patterns. It's not as good as an LLM, but with a
// real caption it produces usable, specific-sounding comments instead
// of "Nice post!" boilerplate.

const logger = require("../utils/logger");

/* ============================================================
   Provider detection
   ============================================================ */

function getProvider() {
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "template";
}

/**
 * Always returns true — template mode works without any key.
 * The dashboard uses this to decide whether to show the Suggest button.
 */
function isConfigured() {
  return true;
}

function getProviderName() {
  return getProvider();
}

/* ============================================================
   Public entry point
   ============================================================ */

async function suggest({ caption = "", author = "", notes = "", count = 3 }) {
  const provider = getProvider();

  try {
    if (provider === "gemini") {
      return await suggestWithGemini({ caption, author, notes, count });
    }
    if (provider === "anthropic") {
      return await suggestWithAnthropic({ caption, author, notes, count });
    }
  } catch (error) {
    logger.log(
      `${provider} suggestion failed (${error.message}); falling back to templates`,
      "warn"
    );
  }

  return suggestWithTemplates({ caption, author, notes, count });
}

/* ============================================================
   Shared prompt builder
   ============================================================ */

function buildPrompt({ caption, author, notes, count }) {
  const lines = [
    `Generate ${count} short Instagram comments for the post below.`,
    "",
    "Rules:",
    `- Return exactly ${count} comments, each on its own line.`,
    "- Number them 1., 2., 3. — nothing else before or after.",
    "- Each comment must be a complete, natural sentence or two.",
    "- Keep each one under ~15 words.",
    "- Vary the tone: one warm, one curious or a question, one playful.",
    "- Do NOT use emojis unless the caption already contains them.",
    "- Do NOT sound generic (avoid 'Great post!', 'Love this!', 'So cool!').",
    "- Reference something specific from the caption when possible.",
    "- Do NOT wrap comments in quotation marks.",
    ""
  ];

  if (author) lines.push(`Post by: ${author}`);
  if (caption) lines.push(`Caption: "${caption}"`);
  else lines.push("Caption: (not provided — keep comments warm but generic)");
  if (notes) lines.push(`Extra context from the person commenting: ${notes}`);

  return lines.join("\n");
}

function parseNumberedList(text, count) {
  const suggestions = [];
  for (const raw of text.split("\n")) {
    const match = raw.trim().match(/^\d+[.)]\s*(.+)$/);
    if (match) suggestions.push(match[1].trim());
  }
  // Fallback if the model ignored numbering.
  if (suggestions.length === 0) {
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, count);
  }
  return suggestions.slice(0, count);
}

/* ============================================================
   Provider: Google Gemini (free tier)
   ============================================================ */

async function suggestWithGemini({ caption, author, notes, count }) {
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt({ caption, author, notes, count }) }] }],
      generationConfig: {
        maxOutputTokens: 400,
        temperature: 0.9
      }
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";

  if (!text) throw new Error("Gemini returned no text");

  return parseNumberedList(text, count);
}

/* ============================================================
   Provider: Anthropic (paid — kept for when you have a key)
   ============================================================ */

async function suggestWithAnthropic({ caption, author, notes, count }) {
  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      messages: [
        { role: "user", content: buildPrompt({ caption, author, notes, count }) }
      ]
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text || "";
  return parseNumberedList(text, count);
}

/* ============================================================
   Provider: Templates (no key, always available)
   ============================================================ */

// Words we don't want to treat as keywords — too generic to reference.
const STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "these", "those",
  "have", "has", "had", "been", "were", "was", "are", "from", "into",
  "about", "just", "your", "yours", "youre", "they", "them", "their",
  "what", "when", "where", "which", "while", "would", "could", "should",
  "there", "here", "because", "than", "then", "some", "very", "much",
  "many", "more", "most", "only", "also", "even", "still", "like",
  "well", "make", "made", "over", "after", "before", "today", "yesterday",
  "instagram", "insta", "post", "photo", "pic", "picture", "image"
]);

/**
 * Pull a few candidate "topic" words out of the caption. Prefers words
 * that look like nouns or proper nouns. Returns up to 3, most-unusual
 * first, and never returns anything from STOPWORDS.
 */
function extractKeywords(caption) {
  if (!caption) return [];

  // Strip URLs and normalize whitespace.
  const cleaned = caption.replace(/https?:\/\/\S+/g, " ");

  // Collect hashtags separately — they're usually the topic.
  const hashtags = (cleaned.match(/#([A-Za-z0-9_]{3,})/g) || [])
    .map((h) => h.replace("#", "").toLowerCase())
    .filter((h) => !STOPWORDS.has(h) && h.length > 3);

  // Then split into words and filter aggressively.
  const words = cleaned
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""));

  // Keep original capitalization for "proper noun" detection.
  const originalWords = caption.match(/\b[A-Za-z][a-z'-]{3,}\b/g) || [];

  // Score: capitalized mid-sentence or from hashtags → higher.
  const scored = new Map();
  for (const w of words) {
    const lower = w.toLowerCase();
    if (STOPWORDS.has(lower)) continue;
    if (/^\d+$/.test(w)) continue;
    scored.set(lower, (scored.get(lower) || 0) + 1);
  }
  for (const w of originalWords) {
    const lower = w.toLowerCase();
    if (STOPWORDS.has(lower)) continue;
    // Capitalized words are likely names/topics.
    scored.set(lower, (scored.get(lower) || 0) + 2);
  }
  for (const h of hashtags) {
    scored.set(h, (scored.get(h) || 0) + 3);
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([w]) => w);
}

/**
 * Detect simple features of the caption so templates can adapt.
 */
function analyzeCaption(caption) {
  if (!caption) return { hasQuestion: false, hasEmoji: false, length: 0 };
  const hasQuestion = /\?/.test(caption);
  const hasEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(caption);
  const length = caption.trim().length;
  return { hasQuestion, hasEmoji, length };
}

/**
 * Build suggestions from templates. Picks different templates for
 * variety, and slots in a keyword when one is available.
 */
function suggestWithTemplates({ caption, author, notes, count }) {
  const keywords = extractKeywords(caption);
  const features = analyzeCaption(caption);
  const topic = keywords[0] || null;
  const second = keywords[1] || null;

  const pools = {
    warm: [
      topic ? `The ${topic} part really stood out to me.` : `This really stood out to me.`,
      topic ? `Something about the ${topic} here just works.` : `This just works, honestly.`,
      second ? `Between the ${topic} and the ${second}, this is a favorite.` : null,
      `The energy in this is contagious.`,
      `This made me stop scrolling.`
    ].filter(Boolean),

    curious: [
      topic ? `How long did the ${topic} part take?` : `How long did this take to put together?`,
      topic ? `What got you into ${topic} in the first place?` : `What was the inspiration here?`,
      `Where was this taken?`,
      `What's the story behind this one?`
    ].filter(Boolean),

    playful: [
      topic ? `Okay, the ${topic} is doing something right.` : `Okay this is doing something right.`,
      `I was not prepared for this.`,
      topic ? `Adding ${topic} to the list of things I need to try.` : `Adding this to the list of things to try.`,
      `This is a whole vibe.`
    ].filter(Boolean)
  };

  // If the caption asks a question, lean into answers.
  if (features.hasQuestion) {
    pools.curious.unshift(
      `Good question — honestly it depends, but I lean toward the first option.`
    );
  }

  // Shuffle each pool so repeated clicks give different results.
  const shuffle = (arr) => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const result = [];
  const order = ["warm", "curious", "playful"];
  for (const key of order) {
    if (result.length >= count) break;
    const pool = shuffle(pools[key]);
    if (pool[0]) result.push(pool[0]);
  }

  // If count is bigger than 3 or we're short, top up from any pool.
  while (result.length < count) {
    const all = shuffle([...pools.warm, ...pools.curious, ...pools.playful]);
    const next = all.find((s) => !result.includes(s));
    if (!next) break;
    result.push(next);
  }

  return result;
}

module.exports = {
  suggest,
  isConfigured,
  getProviderName
};