const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getConfig, setConfig, resetField }         = require('../utils/guildConfig');
const { auditLog }                                  = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Manage the auto-role assigned to new members')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)

    // ─── set ───────────────────────────────────────
    .addSubcommand(sub => sub
      .setName('set')
      .setDescription('Set the role to assign when a new member joins')
      .addRoleOption(opt => opt
        .setName('role')
        .setDescription('Role to assign on join')
        .setRequired(true)))

    // ─── view ──────────────────────────────────────
    .addSubcommand(sub => sub
      .setName('view')
      .setDescription('Show the current auto-role setting'))

    // ─── disable ───────────────────────────────────
    .addSubcommand(sub => sub
      .setName('disable')
      .setDescription('Disable auto-role assignment')),

  permissions: [PermissionFlagsBits.ManageRoles],
  cooldown: 5,

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const sub                        = interaction.options.getSubcommand();
    const { guild, user: moderator } = interaction;

    // ─── set ───────────────────────────────────────
    if (sub === 'set') {
      const role = interaction.options.getRole('role');

      // ── Safety checks ────────────────────────────
      if (role.id === guild.id) {
        return interaction.editReply({
          content: '❌ You cannot use `@everyone` as the auto-role.',
        });
      }

      if (role.managed) {
        return interaction.editReply({
          content: '❌ That role is managed by an integration and cannot be assigned manually.',
        });
      }

      // Check bot can assign this role (role hierarchy)
      const botMember = await guild.members.fetchMe();
      if (botMember.roles.highest.position <= role.position) {
        return interaction.editReply({
          content: `❌ I cannot assign **${role.name}** — it is higher than or equal to my highest role. Move my role above it first.`,
        });
      }

      await setConfig(guild.id, { auto_role: role.id });

      await auditLog({
        guildId:     guild.id,
        moderatorId: moderator.id,
        action:      'AUTOROLE_SET',
        metadata:    { roleId: role.id, roleName: role.name },
      });

      return interaction.editReply({
        embeds: [{
          color:  0x57f287,
          title:  '✅ Auto-role Set',
          fields: [
            { name: 'Role',       value: `${role} (${role.id})`, inline: true  },
            { name: 'Set by',     value: moderator.tag,           inline: true  },
          ],
          footer: {
            text: 'New members will automatically receive this role when they join.',
          },
          timestamp: new Date().toISOString(),
        }],
      });
    }

    // ─── view ──────────────────────────────────────
    if (sub === 'view') {
      const config = await getConfig(guild.id);

      if (!config.auto_role) {
        return interaction.editReply({
          content: '❌ No auto-role is currently configured. Use `/autorole set` to set one.',
        });
      }

      const role = guild.roles.cache.get(config.auto_role);

      if (!role) {
        return interaction.editReply({
          content: `⚠️ Auto-role was set to ID \`${config.auto_role}\` but that role no longer exists. Please update it with \`/autorole set\`.`,
        });
      }

      // Check bot can still assign it
      const botMember  = await guild.members.fetchMe();
      const canAssign  = botMember.roles.highest.position > role.position;

      return interaction.editReply({
        embeds: [{
          color:  canAssign ? 0x57f287 : 0xfee75c,
          title:  '⚙️ Auto-role Configuration',
          fields: [
            { name: 'Current role', value: `${role} (${role.id})`,                  inline: true  },
            { name: 'Members',      value: `${role.members.size} current holders`,  inline: true  },
            { name: 'Bot can assign', value: canAssign ? '✅ Yes' : '⚠️ No — check role hierarchy', inline: true },
          ],
          footer: {
            text: 'Use /autorole disable to turn off auto-role assignment.',
          },
          timestamp: new Date().toISOString(),
        }],
      });
    }

    // ─── disable ───────────────────────────────────
    if (sub === 'disable') {
      const config = await getConfig(guild.id);

      if (!config.auto_role) {
        return interaction.editReply({
          content: '❌ Auto-role is not currently configured.',
        });
      }

      await resetField(guild.id, 'auto_role');

      await auditLog({
        guildId:     guild.id,
        moderatorId: moderator.id,
        action:      'AUTOROLE_DISABLE',
        metadata:    { previousRoleId: config.auto_role },
      });

      return interaction.editReply({
        embeds: [{
          color:       0xed4245,
          title:       '✅ Auto-role Disabled',
          description: 'New members will no longer be automatically assigned a role.',
          timestamp:   new Date().toISOString(),
        }],
      });
    }
  },
};