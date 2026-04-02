const { SlashCommandBuilder } = require('discord.js');
const { useQueue }            = require('discord-player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the currently playing track'),

  cooldown: 5,

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

    const current   = queue.currentTrack;
    const progress  = queue.node.createProgressBar();
    const timestamp = queue.node.getTimestamp();

    return interaction.editReply({
      embeds: [{
        color:  0x5865f2,
        title:  '🎵 Now playing',
        fields: [
          {
            name:   'Track',
            value:  `[${current.title}](${current.url})`,
            inline: false,
          },
          {
            name:   'Progress',
            value:  progress ?? 'Unknown',
            inline: false,
          },
          {
            name:   'Duration',
            value:  current.duration,
            inline: true,
          },
          {
            name:   'Requested by',
            value:  `${current.requestedBy}`,
            inline: true,
          },
          {
            name:   'Volume',
            value:  `${queue.node.volume}%`,
            inline: true,
          },
          {
            name:   'Loop',
            value:  queue.repeatMode === 0
              ? 'Off'
              : queue.repeatMode === 1
                ? '🔂 Track'
                : '🔁 Queue',
            inline: true,
          },
          {
            name:   'Queue',
            value:  `${queue.tracks.size} track${queue.tracks.size !== 1 ? 's' : ''} remaining`,
            inline: true,
          },
          {
            name:   'Source',
            value:  current.source ?? 'Unknown',
            inline: true,
          },
        ],
        thumbnail:  { url: current.thumbnail },
        timestamp:  new Date().toISOString(),
        footer: {
          text: `${interaction.guild.name}`,
          icon_url: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
        },
      }],
    });
  },
};