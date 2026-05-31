const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require('discord.js');
const { execute: dbExecute, query } = require('../db');
const { getConfig }                 = require('../utils/guildConfig');
const { auditLog }                  = require('../utils/logger');

// ─── HTML Transcript Builder ──────────────────────────────────────────────────
/**
 * Fetch up to 500 messages from a ticket channel and render them as a
 * self-contained HTML file. Returns a Buffer.
 *
 * @param {import('discord.js').TextChannel} channel
 * @param {Object} ticket   — DB row
 * @param {string} closedByTag
 * @param {string} reason
 * @returns {Promise<Buffer>}
 */
async function buildTranscript(channel, ticket, closedByTag, reason) {
  // Fetch messages oldest-first (API returns newest-first, so we reverse)
  const fetched = await channel.messages.fetch({ limit: 100 });
  let messages  = [...fetched.values()].reverse();

  // If the channel has more than 100 messages, paginate
  while (fetched.size === 100) {
    const oldest = messages[0];
    const more   = await channel.messages.fetch({ limit: 100, before: oldest.id });
    if (more.size === 0) break;
    messages = [...[...more.values()].reverse(), ...messages];
    if (more.size < 100) break;
  }

  const escapeHtml = str =>
    String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const formatTs = date =>
    new Date(date).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });

  // Render each message row
  const messageRows = messages.map(msg => {
    const avatarUrl = msg.author.displayAvatarURL({ extension: 'png', size: 64 });
    const isBot     = msg.author.bot;

    // Attachments
    const attachmentHtml = msg.attachments.size
      ? [...msg.attachments.values()].map(att => {
          if (att.contentType?.startsWith('image/')) {
            return `<div class="attachment"><img src="${escapeHtml(att.url)}" alt="${escapeHtml(att.name)}" loading="lazy"></div>`;
          }
          return `<div class="attachment file"><a href="${escapeHtml(att.url)}" target="_blank">📎 ${escapeHtml(att.name)}</a></div>`;
        }).join('')
      : '';

    // Embeds (basic summary)
    const embedHtml = msg.embeds.length
      ? msg.embeds.map(e => `
          <div class="embed" style="border-left-color: #${(e.color ?? 0x5865f2).toString(16).padStart(6,'0')}">
            ${e.title   ? `<div class="embed-title">${escapeHtml(e.title)}</div>` : ''}
            ${e.description ? `<div class="embed-desc">${escapeHtml(e.description)}</div>` : ''}
          </div>`).join('')
      : '';

    return `
      <div class="message${isBot ? ' bot' : ''}">
        <img class="avatar" src="${escapeHtml(avatarUrl)}" alt="" onerror="this.style.display='none'">
        <div class="msg-body">
          <div class="msg-header">
            <span class="author${isBot ? ' bot-tag' : ''}">${escapeHtml(msg.author.tag)}</span>
            <span class="ts">${formatTs(msg.createdAt)}</span>
          </div>
          ${msg.content ? `<div class="content">${escapeHtml(msg.content)}</div>` : ''}
          ${attachmentHtml}
          ${embedHtml}
        </div>
      </div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ticket #${ticket.id} — Transcript</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #313338;
    color: #dcddde;
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.5;
  }
  a { color: #00aff4; }

  /* ── Header ── */
  .header {
    background: #1e1f22;
    border-bottom: 2px solid #5865f2;
    padding: 20px 32px;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .header-icon { font-size: 2rem; }
  .header-info h1 { font-size: 1.2rem; color: #fff; }
  .header-info p  { font-size: 0.85rem; color: #949ba4; margin-top: 2px; }
  .badge {
    margin-left: auto;
    background: #ed4245;
    color: #fff;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 999px;
  }

  /* ── Meta bar ── */
  .meta {
    background: #2b2d31;
    padding: 12px 32px;
    display: flex;
    gap: 32px;
    flex-wrap: wrap;
    font-size: 0.82rem;
    color: #949ba4;
    border-bottom: 1px solid #1e1f22;
  }
  .meta span strong { color: #dcddde; }

  /* ── Messages ── */
  .messages { padding: 16px 32px; max-width: 900px; margin: 0 auto; }
  .message {
    display: flex;
    gap: 12px;
    padding: 8px 4px;
    border-radius: 4px;
    transition: background 0.1s;
  }
  .message:hover { background: #2e3035; }
  .message.bot .author { color: #5865f2; }
  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 2px;
    background: #5865f2;
  }
  .msg-body { flex: 1; min-width: 0; }
  .msg-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 2px; }
  .author { font-weight: 600; color: #f2f3f5; font-size: 0.9rem; }
  .author.bot-tag::after {
    content: 'BOT';
    background: #5865f2;
    color: #fff;
    font-size: 0.6rem;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 3px;
    margin-left: 4px;
    vertical-align: middle;
  }
  .ts { font-size: 0.75rem; color: #949ba4; }
  .content { white-space: pre-wrap; word-break: break-word; }

  /* ── Attachments ── */
  .attachment { margin-top: 6px; }
  .attachment img { max-width: 400px; max-height: 300px; border-radius: 4px; display: block; }
  .attachment.file { font-size: 0.85rem; }

  /* ── Embeds ── */
  .embed {
    margin-top: 6px;
    background: #2b2d31;
    border-left: 4px solid #5865f2;
    border-radius: 0 4px 4px 0;
    padding: 10px 12px;
    max-width: 520px;
  }
  .embed-title { font-weight: 600; color: #fff; margin-bottom: 4px; }
  .embed-desc  { font-size: 0.85rem; color: #b5bac1; white-space: pre-wrap; }

  /* ── Reason banner ── */
  .close-reason {
    margin: 16px 32px;
    background: #2b2d31;
    border: 1px solid #ed4245;
    border-radius: 6px;
    padding: 12px 16px;
    font-size: 0.85rem;
    color: #ed4245;
  }
  .close-reason strong { display: block; margin-bottom: 4px; color: #f23f42; }

  /* ── Footer ── */
  .footer {
    text-align: center;
    padding: 24px;
    font-size: 0.78rem;
    color: #949ba4;
    border-top: 1px solid #1e1f22;
    margin-top: 16px;
  }
</style>
</head>
<body>

<div class="header">
  <div class="header-icon">🎫</div>
  <div class="header-info">
    <h1>Ticket #${ticket.id} — Transcript</h1>
    <p>${escapeHtml(channel.guild?.name ?? 'Unknown Server')} · #${escapeHtml(channel.name)}</p>
  </div>
  <div class="badge">CLOSED</div>
</div>

<div class="meta">
  <span><strong>Opened by</strong> ${escapeHtml(ticket.user_id)}</span>
  <span><strong>Closed by</strong> ${escapeHtml(closedByTag)}</span>
  <span><strong>Opened</strong> ${formatTs(ticket.created_at)}</span>
  <span><strong>Closed</strong> ${formatTs(new Date())}</span>
  <span><strong>Messages</strong> ${messages.length}</span>
</div>

${reason && reason !== 'No reason provided' ? `
<div class="close-reason">
  <strong>🔒 Close Reason</strong>
  ${escapeHtml(reason)}
</div>` : ''}

<div class="messages">
${messageRows}
</div>

<div class="footer">
  Generated by the bot · Ticket #${ticket.id}
</div>

</body>
</html>`;

  return Buffer.from(html, 'utf-8');
}

// ─── Command definition ───────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket system')

    // ─── panel ─────────────────────────────────────
    .addSubcommand(sub => sub
      .setName('panel')
      .setDescription('Post the ticket panel in a channel')
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel to post the panel in')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)))

    // ─── close ─────────────────────────────────────
    .addSubcommand(sub => sub
      .setName('close')
      .setDescription('Close the current ticket channel')
      .addStringOption(opt => opt
        .setName('reason')
        .setDescription('Reason for closing')
        .setRequired(false)
        .setMaxLength(300)))

    // ─── add ───────────────────────────────────────
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add a member to this ticket')
      .addUserOption(opt => opt
        .setName('user')
        .setDescription('Member to add')
        .setRequired(true)))

    // ─── remove ────────────────────────────────────
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove a member from this ticket')
      .addUserOption(opt => opt
        .setName('user')
        .setDescription('Member to remove')
        .setRequired(true))),

  permissions: [],
  cooldown: 5,

  async execute(interaction, client) {
    const sub                        = interaction.options.getSubcommand();
    const { guild, user: invoker }   = interaction;
    const config                     = await getConfig(guild.id);

    // ─── panel ─────────────────────────────────────────────────────────────
    if (sub === 'panel') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          content: '🔒 You need **Manage Server** permission to deploy the ticket panel.',
          ephemeral: true,
        });
      }

      if (!config.ticket_category) {
        return interaction.reply({
          content: '❌ Ticket category not configured. Use `/config ticketcategory` first.',
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const channel = interaction.options.getChannel('channel');

      const openButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_open')
          .setLabel('Open a Ticket')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🎫'),
      );

      const panelMsg = await channel.send({
        embeds: [{
          color: 0x5865f2,
          title: '🎫 Support Tickets',
          description: [
            'Need help? Click the button below to open a support ticket.',
            '',
            'A private channel will be created just for you.',
          ].join('\n'),
          footer: { text: guild.name },
          timestamp: new Date().toISOString(),
        }],
        components: [openButton],
      });

      await dbExecute(
        `UPDATE guild_config
         SET ticket_panel_channel = ?, ticket_panel_message = ?
         WHERE guild_id = ?`,
        [channel.id, panelMsg.id, guild.id],
      );

      return interaction.editReply({
        content: `✅ Ticket panel posted in ${channel}.`,
      });
    }

    // ─── button_open (called from interactionCreate) ────────────────────────
    if (sub === 'button_open') {
      await interaction.deferReply({ ephemeral: true });

      if (!config.ticket_category) {
        return interaction.editReply({
          content: '❌ Ticket category not configured. Ask an admin to set it up.',
        });
      }

      // Check for existing open ticket
      const existing = await query(
        `SELECT channel_id FROM tickets
         WHERE guild_id = ? AND user_id = ? AND status = 'open'`,
        [guild.id, invoker.id],
      );

      if (existing.length > 0) {
        return interaction.editReply({
          content: `❌ You already have an open ticket: <#${existing[0].channel_id}>`,
        });
      }

      // Create ticket channel
      let ticketChannel;
      try {
        ticketChannel = await guild.channels.create({
          name:   `ticket-${invoker.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
          type:   ChannelType.GuildText,
          parent: config.ticket_category,
          topic:  `Ticket opened by ${invoker.tag}`,
          permissionOverwrites: [
            {
              id:   guild.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id:    invoker.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
            {
              id:    client.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
          ],
        });
      } catch (err) {
        return interaction.editReply({
          content: `❌ Failed to create ticket channel: ${err.message}`,
        });
      }

      // Record in DB
      const result = await dbExecute(
        `INSERT INTO tickets (guild_id, channel_id, user_id, subject, status)
         VALUES (?, ?, ?, ?, 'open')`,
        [guild.id, ticketChannel.id, invoker.id, 'Support ticket'],
      );

      const ticketId = result.insertId;

      // Send opening message with close button
      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel('Close Ticket')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒'),
      );

      await ticketChannel.send({
        content: `${invoker} — your ticket has been created.`,
        embeds: [{
          color: 0x5865f2,
          title: `🎫 Ticket #${ticketId}`,
          fields: [
            { name: 'Opened by', value: invoker.tag, inline: true },
          ],
          footer: { text: 'Support will be with you shortly. Click Close to resolve.' },
          timestamp: new Date().toISOString(),
        }],
        components: [closeButton],
      });

      await auditLog({
        guildId:     guild.id,
        moderatorId: invoker.id,
        action:      'TICKET_OPEN',
        metadata:    { ticketId, channelId: ticketChannel.id },
      });

      return interaction.editReply({
        content: `✅ Ticket opened: ${ticketChannel}`,
      });
    }

    // ─── close ─────────────────────────────────────────────────────────────
    if (sub === 'close') {
      await interaction.deferReply({ ephemeral: true });

      // getString can return null — fall back to a clear default
      const reason = interaction.options.getString('reason')?.trim() || 'No reason provided';

      const ticketRows = await query(
        `SELECT * FROM tickets WHERE channel_id = ? AND status = 'open'`,
        [interaction.channelId],
      );

      if (ticketRows.length === 0) {
        return interaction.editReply({
          content: '❌ This channel is not an open ticket.',
        });
      }

      const ticket = ticketRows[0];

      const isMod = interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);
      if (ticket.user_id !== invoker.id && !isMod) {
        return interaction.editReply({
          content: '❌ Only the ticket opener or a moderator can close this ticket.',
        });
      }

      // ── Mark ticket closed in DB ──────────────────────────────────────────
      await dbExecute(
        `UPDATE tickets
         SET status = 'closed', closed_by = ?, closed_at = NOW()
         WHERE channel_id = ?`,
        [invoker.id, interaction.channelId],
      );

      // ── Build HTML transcript ─────────────────────────────────────────────
      let transcriptBuffer = null;
      const filename = `ticket-${ticket.id}-transcript.html`;

      try {
        transcriptBuffer = await buildTranscript(
          interaction.channel,
          ticket,
          invoker.tag,
          reason,
        );
      } catch (err) {
        console.error('[Ticket] Failed to build transcript:', err.message);
      }

      const attachment = transcriptBuffer
        ? new AttachmentBuilder(transcriptBuffer, { name: filename })
        : null;

      // ── Post to ticket_log channel ────────────────────────────────────────
      if (config.ticket_log) {
        const logChannel = guild.channels.cache.get(config.ticket_log);
        if (logChannel) {
          try {
            const logPayload = {
              embeds: [{
                color: 0xed4245,
                title: `🔒 Ticket #${ticket.id} Closed`,
                fields: [
                  { name: 'Opened by', value: `<@${ticket.user_id}>`,       inline: true  },
                  { name: 'Closed by', value: `${invoker.tag} (<@${invoker.id}>)`, inline: true  },
                  { name: 'Subject',   value: ticket.subject || 'Support ticket', inline: false },
                  { name: 'Reason',    value: reason,                        inline: false },
                ],
                footer: { text: `Ticket #${ticket.id} · Channel: #${interaction.channel.name}` },
                timestamp: new Date().toISOString(),
              }],
            };

            if (attachment) {
              logPayload.files = [new AttachmentBuilder(transcriptBuffer, { name: filename })];
              logPayload.embeds[0].fields.push({
                name:   'Transcript',
                value:  `📄 Attached above`,
                inline: false,
              });
            }

            await logChannel.send(logPayload);
          } catch (err) {
            console.error('[Ticket] Failed to send to log channel:', err.message);
          }
        }
      }

      // ── DM the transcript to the ticket opener ────────────────────────────
      try {
        const opener = await client.users.fetch(ticket.user_id).catch(() => null);
        if (opener) {
          const dmPayload = {
            embeds: [{
              color: 0x5865f2,
              title: `🎫 Your ticket in ${guild.name} has been closed`,
              fields: [
                { name: 'Ticket',    value: `#${ticket.id}`,          inline: true  },
                { name: 'Closed by', value: invoker.tag,               inline: true  },
                { name: 'Reason',    value: reason,                    inline: false },
              ],
              footer: { text: guild.name },
              timestamp: new Date().toISOString(),
            }],
          };

          if (attachment) {
            dmPayload.files   = [new AttachmentBuilder(transcriptBuffer, { name: filename })];
            dmPayload.content = '📄 Your full conversation transcript is attached below.';
          }

          await opener.send(dmPayload).catch(err => {
            // User has DMs closed — not a fatal error
            console.warn(`[Ticket] Could not DM transcript to ${opener.tag}:`, err.message);
          });
        }
      } catch (err) {
        console.error('[Ticket] Error fetching opener for DM:', err.message);
      }

      // ── Audit log ─────────────────────────────────────────────────────────
      await auditLog({
        guildId:     guild.id,
        moderatorId: invoker.id,
        targetId:    ticket.user_id,
        action:      'TICKET_CLOSE',
        reason,
        metadata:    { ticketId: ticket.id, channelId: ticket.channel_id },
      });

      // ── Close message in the ticket channel ───────────────────────────────
      await interaction.channel.send({
        embeds: [{
          color:       0xed4245,
          title:       '🔒 Ticket Closed',
          description: `Closed by **${invoker.tag}**\n**Reason:** ${reason}`,
          footer:      { text: 'This channel will be deleted in 5 seconds.' },
          timestamp:   new Date().toISOString(),
        }],
      }).catch(() => null);

      await interaction.editReply({ content: '🔒 Closing ticket in 5 seconds…' });

      setTimeout(async () => {
        await interaction.channel.delete(`Ticket closed by ${invoker.tag}`).catch(() => null);
      }, 5000);

      return;
    }

    // ─── add ───────────────────────────────────────────────────────────────
    if (sub === 'add') {
      await interaction.deferReply({ ephemeral: true });

      const target = interaction.options.getUser('user');

      const ticketRows = await query(
        `SELECT * FROM tickets WHERE channel_id = ? AND status = 'open'`,
        [interaction.channelId],
      );

      if (ticketRows.length === 0) {
        return interaction.editReply({
          content: '❌ This channel is not an open ticket.',
        });
      }

      try {
        await interaction.channel.permissionOverwrites.create(target.id, {
          ViewChannel:        true,
          SendMessages:       true,
          ReadMessageHistory: true,
        });
      } catch (err) {
        return interaction.editReply({
          content: `❌ Failed to add user: ${err.message}`,
        });
      }

      await interaction.channel.send({
        content: `✅ ${target} has been added to this ticket by ${invoker}.`,
      });

      return interaction.editReply({
        content: `✅ Added ${target.tag} to the ticket.`,
      });
    }

    // ─── remove ────────────────────────────────────────────────────────────
    if (sub === 'remove') {
      await interaction.deferReply({ ephemeral: true });

      const target = interaction.options.getUser('user');

      const ticketRows = await query(
        `SELECT * FROM tickets WHERE channel_id = ? AND status = 'open'`,
        [interaction.channelId],
      );

      if (ticketRows.length === 0) {
        return interaction.editReply({
          content: '❌ This channel is not an open ticket.',
        });
      }

      if (ticketRows[0].user_id === target.id) {
        return interaction.editReply({
          content: '❌ You cannot remove the ticket opener.',
        });
      }

      try {
        await interaction.channel.permissionOverwrites.delete(target.id);
      } catch (err) {
        return interaction.editReply({
          content: `❌ Failed to remove user: ${err.message}`,
        });
      }

      await interaction.channel.send({
        content: `✅ ${target.tag} has been removed from this ticket by ${invoker}.`,
      });

      return interaction.editReply({
        content: `✅ Removed ${target.tag} from the ticket.`,
      });
    }
  },
};