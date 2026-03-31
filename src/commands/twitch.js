const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { query, execute: dbExecute }                 = require('../db');
const { getTwitchUser, subscribeToStreamer, unsubscribeFromStreamer } = require('../utils/twitch');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('twitch')
    .setDescription('Manage Twitch live notifications')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Track a Twitch streamer and post notifications when they go live')
      .addStringOption(opt => opt
        .setName('username')
        .setDescription('Twitch username to track')
        .setRequired(true))
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Discord channel to post notifications in')
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('message')
        .setDescription('Custom notification message (use {streamer} {title} {game} {url})')
        .setRequired(false)
        .setMaxLength(500)))

    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Stop tracking a Twitch streamer')
      .addStringOption(opt => opt
        .setName('username')
        .setDescription('Twitch username to stop tracking')
        .setRequired(true)))

    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List all tracked streamers in this server')),

  cooldown: 10,

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const sub                      = interaction.options.getSubcommand();
    const { guild, user: invoker } = interaction;

    // ─── add ───────────────────────────────────────
    if (sub === 'add') {
      const username      = interaction.options.getString('username').toLowerCase().trim();
      const channel       = interaction.options.getChannel('channel');
      const customMessage = interaction.options.getString('message') ?? null;

      const countRows = await query(
        `SELECT COUNT(*) AS total FROM twitch_subscriptions WHERE guild_id = ?`,
        [guild.id],
      );

      if (countRows[0].total >= 25) {
        return interaction.editReply({
          content: '❌ You can track a maximum of 25 streamers per server.',
        });
      }

      const existing = await query(
        `SELECT id FROM twitch_subscriptions
         WHERE guild_id = ? AND twitch_login = ?`,
        [guild.id, username],
      );

      if (existing.length > 0) {
        return interaction.editReply({
          content: `❌ **${username}** is already being tracked in this server.`,
        });
      }

      const twitchUser = await getTwitchUser(username);

      if (!twitchUser) {
        return interaction.editReply({
          content: `❌ Twitch user **${username}** not found. Check the username and try again.`,
        });
      }

      const subscription = await subscribeToStreamer(twitchUser.id);

      await dbExecute(
        `INSERT INTO twitch_subscriptions
           (guild_id, channel_id, twitch_user_id, twitch_login, subscription_id, custom_message, added_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           channel_id      = VALUES(channel_id),
           subscription_id = VALUES(subscription_id),
           custom_message  = VALUES(custom_message)`,
        [
          guild.id,
          channel.id,
          twitchUser.id,
          twitchUser.login,
          subscription?.id ?? null,
          customMessage,
          invoker.id,
        ],
      );

      return interaction.editReply({
        embeds: [{
          color:  0x9147ff,
          title:  '✅ Streamer Added',
          fields: [
            { name: 'Streamer',    value: `[${twitchUser.display_name}](https://twitch.tv/${twitchUser.login})`, inline: true  },
            { name: 'Channel',     value: `${channel}`,                                                           inline: true  },
            { name: 'EventSub',    value: subscription ? '✅ Active' : '⚠️ Pending',                              inline: false },
            {
              name:   'Notification message',
              value:  customMessage ?? '`Default — {streamer} is now live playing {game}!`',
              inline: false,
            },
          ],
          thumbnail: { url: twitchUser.profile_image_url },
          footer:    { text: 'Notifications will post when they go live.' },
          timestamp: new Date().toISOString(),
        }],
      });
    }

    // ─── remove ────────────────────────────────────
    if (sub === 'remove') {
      const username = interaction.options.getString('username').toLowerCase().trim();

      const rows = await query(
        `SELECT * FROM twitch_subscriptions
         WHERE guild_id = ? AND twitch_login = ?`,
        [guild.id, username],
      );

      if (rows.length === 0) {
        return interaction.editReply({
          content: `❌ **${username}** is not being tracked in this server.`,
        });
      }

      const streamer = rows[0];

      if (streamer.subscription_id) {
        await unsubscribeFromStreamer(streamer.subscription_id);
      }

      await dbExecute(
        `DELETE FROM twitch_subscriptions
         WHERE guild_id = ? AND twitch_login = ?`,
        [guild.id, username],
      );

      return interaction.editReply({
        content: `✅ Stopped tracking **${username}**.`,
      });
    }

    // ─── list ──────────────────────────────────────
    if (sub === 'list') {
      const streamers = await query(
        `SELECT * FROM twitch_subscriptions
         WHERE guild_id = ?
         ORDER BY twitch_login ASC`,
        [guild.id],
      );

      if (streamers.length === 0) {
        return interaction.editReply({
          content: '❌ No streamers are being tracked in this server. Use `/twitch add` to add one.',
        });
      }

      const fields = streamers.map(s => ({
        name:   `${s.live ? '🔴 LIVE' : '⚫'} ${s.twitch_login}`,
        value:  `Channel: <#${s.channel_id}>\nEventSub: ${s.subscription_id ? '✅' : '⚠️ Pending'}`,
        inline: true,
      }));

      return interaction.editReply({
        embeds: [{
          color:  0x9147ff,
          title:  `📡 Tracked Streamers — ${guild.name}`,
          fields,
          footer: { text: `${streamers.length}/25 streamers tracked` },
          timestamp: new Date().toISOString(),
        }],
      });
    }
  },
};