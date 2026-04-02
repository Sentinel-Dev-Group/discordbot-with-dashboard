const { SlashCommandBuilder } = require('discord.js');
const { useQueue }            = require('discord-player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the current track'),

  cooldown: 3,

  async execute(interaction) {
    await interaction.deferReply();

    const queue = useQueue(interaction.guild.id);

    if (!queue || !queue.isPlaying()) {
      return interaction.editReply({
        embeds: [{
          color:       0xed4245,
          description: '❌ Nothing is playing right now.',
        }],
      });
    }

    // ─── Check user is in same voice channel ──────
    if (interaction.member.voice.channelId !== queue.channel?.id) {
      return interaction.editReply({
        embeds: [{
          color:       0xed4245,
          description: '❌ You need to be in the same voice channel as the bot.',
        }],
      });
    }

    // ─── Already paused ───────────────────────────
    if (queue.node.isPaused()) {
      return interaction.editReply({
        embeds: [{
          color:       0xfee75c,
          description: '⏸️ The player is already paused. Use `/resume` to continue.',
        }],
      });
    }

    // ─── Pause ────────────────────────────────────
    queue.node.pause();

    const current = queue.currentTrack;

    return interaction.editReply({
      embeds: [{
        color:  0xfee75c,
        title:  '⏸️ Paused',
        fields: current
          ? [
              {
                name:   'Track',
                value:  `[${current.title}](${current.url})`,
                inline: false,
              },
              {
                name:   'Paused by',
                value:  interaction.user.tag,
                inline: true,
              },
            ]
          : [],
        footer: { text: 'Use /resume to continue playback.' },
        timestamp: new Date().toISOString(),
      }],
    });
  },
};