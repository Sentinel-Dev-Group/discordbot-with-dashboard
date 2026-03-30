const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getConfig, setConfig, resetField } = require('../utils/guildConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('View or update server configuration')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    // ─── view ──────────────────────────────────────
    .addSubcommand(sub => sub
      .setName('view')
      .setDescription('Show current server configuration'))

    // ─── set log channel ───────────────────────────
    .addSubcommand(sub => sub
      .setName('logchannel')
      .setDescription('Set the mod-log channel')
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel to send mod logs to')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)))

    // ─── set welcome channel ───────────────────────
    .addSubcommand(sub => sub
      .setName('welcomechannel')
      .setDescription('Set the welcome message channel')
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel to send welcome messages to')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)))

    // ─── set welcome message ───────────────────────
    .addSubcommand(sub => sub
      .setName('welcomemessage')
      .setDescription('Set the welcome message text')
      .addStringOption(opt => opt
        .setName('message')
        .setDescription('Use {user} {username} {server} {membercount} as tokens')
        .setRequired(true)
        .setMaxLength(1000)))

    // ─── set mute role ─────────────────────────────
    .addSubcommand(sub => sub
      .setName('muterole')
      .setDescription('Set the mute role')
      .addRoleOption(opt => opt
        .setName('role')
        .setDescription('Role to assign when a member is muted')
        .setRequired(true)))

    // ─── set auto role ─────────────────────────────
    .addSubcommand(sub => sub
      .setName('autorole')
      .setDescription('Set the role automatically assigned to new members')
      .addRoleOption(opt => opt
        .setName('role')
        .setDescription('Role to assign on join')
        .setRequired(true)))

    // ─── set ticket category ───────────────────────
    .addSubcommand(sub => sub
      .setName('ticketcategory')
      .setDescription('Set the category where ticket channels are created')
      .addChannelOption(opt => opt
        .setName('category')
        .setDescription('Category channel for tickets')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(true)))

    // ─── set ticket log ────────────────────────────
    .addSubcommand(sub => sub
      .setName('ticketlog')
      .setDescription('Set the channel where closed tickets are logged')
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel for ticket logs')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)))

    // ─── reset a field ─────────────────────────────
    .addSubcommand(sub => sub
      .setName('reset')
      .setDescription('Reset a config field back to unset')
      .addStringOption(opt => opt
        .setName('field')
        .setDescription('Field to reset')
        .setRequired(true)
        .addChoices(
          { name: 'Log channel',       value: 'log_channel'      },
          { name: 'Welcome channel',   value: 'welcome_channel'  },
          { name: 'Welcome message',   value: 'welcome_message'  },
          { name: 'Mute role',         value: 'mute_role'        },
          { name: 'Auto role',         value: 'auto_role'        },
          { name: 'Ticket category',   value: 'ticket_category'  },
          { name: 'Ticket log',        value: 'ticket_log'       },
        ))),

  permissions: [PermissionFlagsBits.ManageGuild],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guildId } = interaction;

    await interaction.deferReply({ ephemeral: true });

    // ─── view ──────────────────────────────────────
    if (sub === 'view') {
      const config = await getConfig(guildId);

      const fmt = id => id ? `<#${id}>` : '`Not set`';
      const fmtRole = id => id ? `<@&${id}>` : '`Not set`';

      return interaction.editReply({
        embeds: [{
          color: 0x5865f2,
          title: '⚙️ Server Configuration',
          fields: [
            { name: 'Log channel',      value: fmt(config.log_channel),          inline: true  },
            { name: 'Welcome channel',  value: fmt(config.welcome_channel),      inline: true  },
            { name: 'Welcome message',  value: config.welcome_message
                ? `\`${config.welcome_message.slice(0, 100)}...\``
                : '`Not set`',                                                   inline: false },
            { name: 'Mute role',        value: fmtRole(config.mute_role),        inline: true  },
            { name: 'Auto role',        value: fmtRole(config.auto_role),        inline: true  },
            { name: 'Ticket category',  value: fmt(config.ticket_category),      inline: true  },
            { name: 'Ticket log',       value: fmt(config.ticket_log),           inline: true  },
          ],
          footer: { text: `Guild ID: ${guildId}` },
          timestamp: new Date().toISOString(),
        }],
      });
    }

    // ─── logchannel ────────────────────────────────
    if (sub === 'logchannel') {
      const channel = interaction.options.getChannel('channel');
      await setConfig(guildId, { log_channel: channel.id });
      return interaction.editReply({ content: `✅ Log channel set to ${channel}.` });
    }

    // ─── welcomechannel ────────────────────────────
    if (sub === 'welcomechannel') {
      const channel = interaction.options.getChannel('channel');
      await setConfig(guildId, { welcome_channel: channel.id });
      return interaction.editReply({ content: `✅ Welcome channel set to ${channel}.` });
    }

    // ─── welcomemessage ────────────────────────────
    if (sub === 'welcomemessage') {
      const message = interaction.options.getString('message');
      await setConfig(guildId, { welcome_message: message });
      return interaction.editReply({
        content: [
          '✅ Welcome message updated.',
          `**Preview:** ${message}`,
          '',
          'Available tokens: `{user}` `{username}` `{server}` `{membercount}`',
        ].join('\n'),
      });
    }

    // ─── muterole ──────────────────────────────────
    if (sub === 'muterole') {
      const role = interaction.options.getRole('role');
      await setConfig(guildId, { mute_role: role.id });
      return interaction.editReply({ content: `✅ Mute role set to ${role}.` });
    }

    // ─── autorole ──────────────────────────────────
    if (sub === 'autorole') {
      const role = interaction.options.getRole('role');
      await setConfig(guildId, { auto_role: role.id });
      return interaction.editReply({ content: `✅ Auto role set to ${role}.` });
    }

    // ─── ticketcategory ────────────────────────────
    if (sub === 'ticketcategory') {
      const category = interaction.options.getChannel('category');
      await setConfig(guildId, { ticket_category: category.id });
      return interaction.editReply({ content: `✅ Ticket category set to **${category.name}**.` });
    }

    // ─── ticketlog ─────────────────────────────────
    if (sub === 'ticketlog') {
      const channel = interaction.options.getChannel('channel');
      await setConfig(guildId, { ticket_log: channel.id });
      return interaction.editReply({ content: `✅ Ticket log channel set to ${channel}.` });
    }

    // ─── reset ─────────────────────────────────────
    if (sub === 'reset') {
      const field = interaction.options.getString('field');
      await resetField(guildId, field);
      return interaction.editReply({ content: `✅ \`${field}\` has been reset.` });
    }
  },
};