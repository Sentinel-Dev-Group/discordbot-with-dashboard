const { execute: dbExecute } = require('../db');

module.exports = {
  name: 'guildCreate',
  once: false,

  async execute(guild, client) {
    console.log(`[GuildCreate] Joined: ${guild.name} (${guild.id}) — ${guild.memberCount} members`);

    // ─── Register guild in DB ───────────────────────────
    try {
      await dbExecute(
        `INSERT INTO guilds (id, name, icon, member_count, active)
         VALUES (?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           name         = VALUES(name),
           icon         = VALUES(icon),
           member_count = VALUES(member_count),
           active       = 1`,
        [guild.id, guild.name, guild.icon ?? null, guild.memberCount],
      );

      // Create default config row for this guild
      await dbExecute(
        `INSERT IGNORE INTO guild_config (guild_id) VALUES (?)`,
        [guild.id],
      );

      console.log(`[GuildCreate] DB records created for guild ${guild.id}`);
    } catch (err) {
      console.error(`[GuildCreate] Failed to register guild ${guild.id}:`, err.message);
    }

    // ─── Send welcome DM to guild owner ─────────────────
    try {
      const owner = await guild.fetchOwner();

      await owner.send({
        embeds: [
          {
            color: 0x5865f2,
            title: '👋 Thanks for adding me!',
            description: [
              `I'm now active in **${guild.name}**.`,
              '',
              '**Get started:**',
              '• Use `/config` in your server to set up log channels, welcome messages, and more.',
              '• Use `/help` to see all available commands.',
              '',
              'If you need help, feel free to reach out to the bot owner.',
            ].join('\n'),
            footer: {
              text: `Guild ID: ${guild.id}`,
            },
            timestamp: new Date().toISOString(),
          },
        ],
      });
    } catch (err) {
      // Owner may have DMs disabled — not a critical failure
      console.warn(`[GuildCreate] Could not DM owner of ${guild.id}:`, err.message);
    }

    // ─── Update presence to reflect new guild count ─────
    try {
      const guildCount = client.guilds.cache.size;
      client.user.setActivity(
        `${guildCount} server${guildCount !== 1 ? 's' : ''} | /help`,
        { type: 0 }, // 0 = ActivityType.Playing
      );
    } catch (err) {
      console.warn('[GuildCreate] Failed to update presence:', err.message);
    }
  },
};