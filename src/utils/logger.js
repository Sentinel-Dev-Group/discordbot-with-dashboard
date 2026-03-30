const { execute: dbExecute } = require('../db');

// ─── Log levels ───────────────────────────────────────────
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

// ─── Console logger ───────────────────────────────────────
const log = {
  debug: (...args) => currentLevel <= LEVELS.debug && console.debug('[DEBUG]', ...args),
  info:  (...args) => currentLevel <= LEVELS.info  && console.info('[INFO]',  ...args),
  warn:  (...args) => currentLevel <= LEVELS.warn  && console.warn('[WARN]',  ...args),
  error: (...args) => currentLevel <= LEVELS.error && console.error('[ERROR]', ...args),
};

// ─── Audit log (DB) ───────────────────────────────────────
/**
 * Write a mod action to the audit_log table.
 *
 * @param {Object} entry
 * @param {string}  entry.guildId
 * @param {string}  entry.moderatorId
 * @param {string}  [entry.targetId]
 * @param {string}  entry.action       — BAN | KICK | WARN | MUTE | UNMUTE | UNBAN etc.
 * @param {string}  [entry.reason]
 * @param {Object}  [entry.metadata]   — any extra context as a plain object
 */
async function auditLog({ guildId, moderatorId, targetId, action, reason, metadata }) {
  try {
    await dbExecute(
      `INSERT INTO audit_log
         (guild_id, moderator_id, target_id, action, reason, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        guildId,
        moderatorId,
        targetId   ?? null,
        action,
        reason     ?? null,
        metadata   ? JSON.stringify(metadata) : null,
      ],
    );
  } catch (err) {
    log.error('[AuditLog] Failed to write audit entry:', err.message);
  }
}

// ─── Discord mod-log channel ──────────────────────────────
/**
 * Send a mod action embed to the guild's configured log channel.
 *
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 * @param {string} logChannelId
 * @param {Object} embed         — raw Discord embed object
 */
async function modLog(client, guildId, logChannelId, embed) {
  if (!logChannelId) return;

  try {
    const guild   = client.guilds.cache.get(guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(logChannelId);
    if (!channel) {
      log.warn(`[ModLog] Log channel ${logChannelId} not found in ${guildId}`);
      return;
    }

    await channel.send({ embeds: [embed] });
  } catch (err) {
    log.error(`[ModLog] Failed to send to log channel ${logChannelId}:`, err.message);
  }
}

// ─── Shared mod embed builder ─────────────────────────────
/**
 * Build a consistent mod-action embed.
 *
 * @param {Object} opts
 * @param {string}  opts.action       — display title e.g. "Member Banned"
 * @param {number}  opts.color        — hex colour
 * @param {import('discord.js').User} opts.target
 * @param {import('discord.js').User} opts.moderator
 * @param {string}  [opts.reason]
 * @param {Array}   [opts.extraFields] — additional { name, value, inline } fields
 * @returns {Object}  Discord embed object
 */
function buildModEmbed({ action, color, target, moderator, reason, extraFields = [] }) {
  return {
    color,
    title: `🔨 ${action}`,
    fields: [
      {
        name:   'User',
        value:  `${target.tag} (<@${target.id}>)`,
        inline: true,
      },
      {
        name:   'Moderator',
        value:  `${moderator.tag} (<@${moderator.id}>)`,
        inline: true,
      },
      {
        name:   'Reason',
        value:  reason || 'No reason provided',
        inline: false,
      },
      ...extraFields,
    ],
    footer: { text: `User ID: ${target.id}` },
    timestamp: new Date().toISOString(),
  };
}

module.exports = { log, auditLog, modLog, buildModEmbed };