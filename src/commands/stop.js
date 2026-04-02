const { SlashCommandBuilder } = require('discord.js');
const { useQueue }            = require('discord-player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback and clear the queue'),

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

    const trackCount = queue.tracks.size;
    const currentTrack = queue.currentTrack;

    // ─── Delete the queue ─────────────────────────
    queue.delete();

    return interaction.editReply({
      embeds: [{
        color:  0xed4245,
        title:  '⏹️ Stopped',
        fields: [
          {
            name:   'Last track',
            value:  currentTrack
              ? `[${currentTrack.title}](${currentTrack.url})`
              : 'Unknown',
            inline: false,
          },
          {
            name:   'Tracks cleared',
            value:  `${trackCount}`,
            inline: true,
          },
          {
            name:   'Stopped by',
            value:  `${interaction.user.tag}`,
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
      }],
    });
  },
};