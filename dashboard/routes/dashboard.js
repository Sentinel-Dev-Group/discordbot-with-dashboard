const express             = require('express');
const router              = express.Router();
const { query, execute: dbExecute } = require('../../src/db');
const { getConfig, setConfig }      = require('../../src/utils/guildConfig');
const { requireAuth }               = require('./index');

// ─── Middleware: verify guild access ──────────────────────
// Checks the logged-in user actually manages the requested guild
async function requireGuildAccess(req, res, next) {
  try {
    const { guildId } = req.params;
    const userGuilds  = req.user.guilds ?? [];

    // Check user has MANAGE_GUILD on this guild
    const guild = userGuilds.find(g => {
      const perms = BigInt(g.permissions);
      return g.id === guildId && (perms & BigInt(0x20)) === BigInt(0x20);
    });

    if (!guild) {
      req.flash('error', 'You do not have permission to manage that server.');
      return res.redirect('/servers');
    }

    // Check bot is actually in that guild
    const rows = await query(
      `SELECT * FROM guilds WHERE id = ? AND active = 1`,
      [guildId],
    );

    if (rows.length === 0) {
      req.flash('error', 'The bot is not in that server.');
      return res.redirect('/servers');
    }

    // Attach to request for use in route handlers
    req.guild    = rows[0];
    req.guild.discord = guild; // Discord OAuth guild data (name, icon etc.)
    next();
  } catch (err) {
    console.error('[Dashboard] requireGuildAccess error:', err.message);
    req.flash('error', 'Something went wrong. Please try again.');
    res.redirect('/servers');
  }
}

// ─── All dashboard routes require login ───────────────────
router.use(requireAuth);

// ─── GET /dashboard/:guildId ──────────────────────────────
router.get('/:guildId', requireGuildAccess, async (req, res) => {
  try {
    const { guildId } = req.params;
    const config      = await getConfig(guildId);

    // Recent command usage (last 7 days)
    const recentCommands = await query(
      `SELECT command, COUNT(*) AS uses
       FROM command_logs
       WHERE guild_id = ? AND used_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY command
       ORDER BY uses DESC
       LIMIT 10`,
      [guildId],
    );

    // Total members with XP
    const xpStats = await query(
      `SELECT COUNT(*) AS ranked, SUM(xp) AS total_xp
       FROM guild_members
       WHERE guild_id = ? AND xp > 0`,
      [guildId],
    );

    // Open tickets
    const ticketStats = await query(
      `SELECT COUNT(*) AS open_tickets
       FROM tickets
       WHERE guild_id = ? AND status = 'open'`,
      [guildId],
    );

    // Total warnings
    const warnStats = await query(
      `SELECT COUNT(*) AS total_warnings
       FROM warnings
       WHERE guild_id = ?`,
      [guildId],
    );

    return res.render('guild', {
      title:         `${req.guild.discord.name} — Overview`,
      guild:         req.guild,
      config,
      recentCommands,
      stats: {
        ranked:        xpStats[0]?.ranked        ?? 0,
        totalXp:       xpStats[0]?.total_xp      ?? 0,
        openTickets:   ticketStats[0]?.open_tickets  ?? 0,
        totalWarnings: warnStats[0]?.total_warnings  ?? 0,
      },
    });
  } catch (err) {
    console.error('[Dashboard] Overview error:', err.message);
    req.flash('error', 'Failed to load dashboard.');
    res.redirect('/servers');
  }
});

// ─── GET /dashboard/:guildId/config ───────────────────────
router.get('/:guildId/config', requireGuildAccess, async (req, res) => {
  const config = await getConfig(req.params.guildId);
  return res.render('guild_config', {
    title:  `${req.guild.discord.name} — Config`,
    guild:  req.guild,
    config,
  });
});

// ─── POST /dashboard/:guildId/config ──────────────────────
router.post('/:guildId/config', requireGuildAccess, async (req, res) => {
  try {
    const { guildId } = req.params;
    const {
      log_channel,
      welcome_channel,
      welcome_message,
      mute_role,
      auto_role,
      ticket_category,
      ticket_log,
    } = req.body;

    await setConfig(guildId, {
      log_channel:      log_channel      || null,
      welcome_channel:  welcome_channel  || null,
      welcome_message:  welcome_message  || null,
      mute_role:        mute_role        || null,
      auto_role:        auto_role        || null,
      ticket_category:  ticket_category  || null,
      ticket_log:       ticket_log       || null,
    });

    req.flash('success', 'Configuration saved successfully.');
  } catch (err) {
    console.error('[Dashboard] Config save error:', err.message);
    req.flash('error', 'Failed to save configuration.');
  }

  res.redirect(`/dashboard/${req.params.guildId}/config`);
});

// ─── GET /dashboard/:guildId/logs ─────────────────────────
router.get('/:guildId/logs', requireGuildAccess, async (req, res) => {
  try {
    const { guildId } = req.params;
    const page        = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize    = 25;
    const offset      = (page - 1) * pageSize;
    const search      = req.query.search?.trim() ?? '';

    const whereClauses = ['guild_id = ?'];
    const params       = [guildId];

    if (search) {
      whereClauses.push('(command LIKE ? OR username LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const where = whereClauses.join(' AND ');

    const logs = await query(
      `SELECT * FROM command_logs
       WHERE ${where}
       ORDER BY used_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    const countRows = await query(
      `SELECT COUNT(*) AS total FROM command_logs WHERE ${where}`,
      params,
    );

    const total      = countRows[0]?.total ?? 0;
    const totalPages = Math.ceil(total / pageSize);

    return res.render('logs', {
      title:      `${req.guild.discord.name} — Command Logs`,
      guild:      req.guild,
      logs,
      page,
      totalPages,
      total,
      search,
    });
  } catch (err) {
    console.error('[Dashboard] Logs error:', err.message);
    req.flash('error', 'Failed to load logs.');
    res.redirect(`/dashboard/${req.params.guildId}`);
  }
});

// ─── GET /dashboard/:guildId/moderation ───────────────────
router.get('/:guildId/moderation', requireGuildAccess, async (req, res) => {
  try {
    const { guildId } = req.params;
    const page        = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize    = 20;
    const offset      = (page - 1) * pageSize;
    const filter      = req.query.filter ?? 'all'; // all | warnings | bans

    let rows, total;

    if (filter === 'warnings') {
      const countRows = await query(
        `SELECT COUNT(*) AS total FROM warnings WHERE guild_id = ?`,
        [guildId],
      );
      total = countRows[0]?.total ?? 0;

      rows = await query(
        `SELECT 'warning' AS type, id, user_id, moderator_id, reason, created_at
         FROM warnings
         WHERE guild_id = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [guildId, pageSize, offset],
      );
    } else if (filter === 'bans') {
      const countRows = await query(
        `SELECT COUNT(*) AS total FROM bans WHERE guild_id = ?`,
        [guildId],
      );
      total = countRows[0]?.total ?? 0;

      rows = await query(
        `SELECT 'ban' AS type, id, user_id, moderator_id, reason, created_at, active
         FROM bans
         WHERE guild_id = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [guildId, pageSize, offset],
      );
    } else {
      // Combined view — warnings + bans interleaved by date
      const countRows = await query(
        `SELECT
           (SELECT COUNT(*) FROM warnings WHERE guild_id = ?) +
           (SELECT COUNT(*) FROM bans    WHERE guild_id = ?) AS total`,
        [guildId, guildId],
      );
      total = countRows[0]?.total ?? 0;

      rows = await query(
        `(SELECT 'warning' AS type, id, user_id, moderator_id, reason, created_at, 1 AS active
          FROM warnings WHERE guild_id = ?)
         UNION ALL
         (SELECT 'ban' AS type, id, user_id, moderator_id, reason, created_at, active
          FROM bans WHERE guild_id = ?)
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [guildId, guildId, pageSize, offset],
      );
    }

    const totalPages = Math.ceil(total / pageSize);

    return res.render('moderation', {
      title:      `${req.guild.discord.name} — Moderation`,
      guild:      req.guild,
      rows,
      page,
      totalPages,
      total,
      filter,
    });
  } catch (err) {
    console.error('[Dashboard] Moderation error:', err.message);
    req.flash('error', 'Failed to load moderation data.');
    res.redirect(`/dashboard/${req.params.guildId}`);
  }
});

// ─── POST /dashboard/:guildId/moderation/warning/:id/delete
router.post('/:guildId/moderation/warning/:id/delete',
  requireGuildAccess,
  async (req, res) => {
    try {
      const { guildId, id } = req.params;

      await dbExecute(
        `DELETE FROM warnings WHERE id = ? AND guild_id = ?`,
        [id, guildId],
      );

      req.flash('success', `Warning #${id} deleted.`);
    } catch (err) {
      console.error('[Dashboard] Delete warning error:', err.message);
      req.flash('error', 'Failed to delete warning.');
    }

    res.redirect(`/dashboard/${req.params.guildId}/moderation`);
  },
);

// ─── POST /dashboard/:guildId/moderation/ban/:id/revoke ───
router.post('/:guildId/moderation/ban/:id/revoke',
  requireGuildAccess,
  async (req, res) => {
    try {
      const { guildId, id } = req.params;

      await dbExecute(
        `UPDATE bans SET active = 0 WHERE id = ? AND guild_id = ?`,
        [id, guildId],
      );

      req.flash('success', `Ban #${id} marked as revoked.`);
    } catch (err) {
      console.error('[Dashboard] Revoke ban error:', err.message);
      req.flash('error', 'Failed to revoke ban.');
    }

    res.redirect(`/dashboard/${req.params.guildId}/moderation`);
  },
);

// ─── GET /dashboard/:guildId/leaderboard ──────────────────
router.get('/:guildId/leaderboard', requireGuildAccess, async (req, res) => {
  try {
    const { guildId } = req.params;
    const page        = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize    = 20;
    const offset      = (page - 1) * pageSize;

    const members = await query(
      `SELECT user_id, username, xp, level,
              RANK() OVER (ORDER BY xp DESC) AS rank_pos
       FROM guild_members
       WHERE guild_id = ? AND xp > 0
       ORDER BY xp DESC
       LIMIT ? OFFSET ?`,
      [guildId, pageSize, offset],
    );

    const countRows = await query(
      `SELECT COUNT(*) AS total
       FROM guild_members
       WHERE guild_id = ? AND xp > 0`,
      [guildId],
    );

    const total      = countRows[0]?.total ?? 0;
    const totalPages = Math.ceil(total / pageSize);

    return res.render('leaderboard', {
      title:      `${req.guild.discord.name} — XP Leaderboard`,
      guild:      req.guild,
      members,
      page,
      totalPages,
      total,
    });
  } catch (err) {
    console.error('[Dashboard] Leaderboard error:', err.message);
    req.flash('error', 'Failed to load leaderboard.');
    res.redirect(`/dashboard/${req.params.guildId}`);
  }
});

module.exports = router;