const { query, execute: dbExecute } = require('../db');

// ─── In-memory cache ──────────────────────────────────────
// Avoids hitting the DB on every single command/event
// Structure: Map<guildId, { data: Object, cachedAt: number }>
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Get config ───────────────────────────────────────────
/**
 * Fetch guild config from cache or DB.
 * Always returns an object — falls back to empty defaults if not found.
 * @param {string} guildId
 * @returns {Promise<Object>}
 */
async function getConfig(guildId) {
  // Check cache first
  if (cache.has(guildId)) {
    const cached = cache.get(guildId);
    if (Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.data;
    }
    // Expired — fall through to DB
    cache.delete(guildId);
  }

  // Fetch from DB
  const rows = await query(
    `SELECT * FROM guild_config WHERE guild_id = ?`,
    [guildId],
  );

  const data = rows[0] ?? { guild_id: guildId };

  // Store in cache
  cache.set(guildId, { data, cachedAt: Date.now() });

  return data;
}

// ─── Update config ────────────────────────────────────────
/**
 * Update one or more config fields for a guild.
 * Automatically invalidates the cache entry.
 *
 * @param {string} guildId
 * @param {Object} fields  — key/value pairs matching guild_config columns
 * @returns {Promise<void>}
 */
async function setConfig(guildId, fields) {
  if (!fields || Object.keys(fields).length === 0) return;

  // Whitelist of updatable columns
  const allowed = [
    'log_channel',
    'welcome_channel',
    'welcome_message',
    'mute_role',
    'auto_role',
    'ticket_category',
    'ticket_log',
  ];

  const updates = Object.entries(fields).filter(([key]) => allowed.includes(key));

  if (updates.length === 0) {
    throw new Error(`No valid fields provided. Allowed: ${allowed.join(', ')}`);
  }

  const setClauses = updates.map(([key]) => `${key} = ?`).join(', ');
  const values     = updates.map(([, val]) => val ?? null);

  await dbExecute(
    `UPDATE guild_config SET ${setClauses} WHERE guild_id = ?`,
    [...values, guildId],
  );

  // Bust cache so next read is fresh
  cache.delete(guildId);
}

// ─── Reset config field ───────────────────────────────────
/**
 * Set a single config field back to NULL.
 * @param {string} guildId
 * @param {string} field
 */
async function resetField(guildId, field) {
  await setConfig(guildId, { [field]: null });
}

// ─── Invalidate cache ─────────────────────────────────────
/**
 * Force-expire a guild's cache entry.
 * Useful after bulk updates.
 * @param {string} guildId
 */
function invalidate(guildId) {
  cache.delete(guildId);
}

// ─── Ensure config row exists ─────────────────────────────
/**
 * Creates a guild_config row if one doesn't already exist.
 * Safe to call multiple times.
 * @param {string} guildId
 */
async function ensureConfig(guildId) {
  await dbExecute(
    `INSERT IGNORE INTO guild_config (guild_id) VALUES (?)`,
    [guildId],
  );
  invalidate(guildId);
}

module.exports = {
  getConfig,
  setConfig,
  resetField,
  invalidate,
  ensureConfig,
};