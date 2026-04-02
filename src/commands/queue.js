const { SlashCommandBuilder } = require('discord.js');
const { useQueue }            = require('discord-player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current music queue')
    .addIntegerOption(opt => opt
      .setName('page')
      .setDescription('Page number (10 tracks per page)')
      .setMinValue(1)
      .setRequired(false)),

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

    const page     = interaction.options.getInteger('page') ?? 1;
    const pageSize = 10;
    const tracks   = queue.tracks.toArray();
    const total    = tracks.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    if (page > totalPages) {
      return interaction.editReply({
        embeds: [{
          color:       0xed4245,
          description: `❌ Page ${page} doesn't exist. There are only **${totalPages}** page(s).`,
        }],
      });
    }

    const offset     = (page - 1) * pageSize;
    const pageTracks = tracks.slice(offset, offset + pageSize);

    // ─── Current track ────────────────────────────
    const current = queue.currentTrack;

    // ─── Queue list ───────────────────────────────
    const trackList = pageTracks.length > 0
      ? pageTracks.map((t, i) =>
          `**${offset + i + 1}.** [${t.title}](${t.url}) — ${t.duration} — ${t.requestedBy}`
        ).join('\n')
      : 'No more tracks in queue.';

    // ─── Progress bar ─────────────────────────────
    const timestamp  = queue.node.getTimestamp();
    const progress   = queue.node.createProgressBar();

    return interaction.editReply({
      embeds: [{
        color: 0x5865f2,
        title: `🎵 Queue — ${interaction.guild.name}`,
        fields: [
          {
            name:  '▶️ Now playing',
            value: current
              ? `[${current.title}](${current.url}) — ${current.duration} — ${current.requestedBy}\n${progress}`
              : 'Nothing',
            inline: false,
          },
          {
            name:   '📋 Up next',
            value:  trackList,
            inline: false,
          },
        ],
        footer: {
          text: [
            `Page ${page}/${totalPages}`,
            `${total} track${total !== 1 ? 's' : ''} in queue`,
            `Loop: ${queue.repeatMode === 0 ? 'Off' : queue.repeatMode === 1 ? 'Track' : 'Queue'}`,
            `Volume: ${queue.node.volume}%`,
          ].join(' • '),
        },
        timestamp: new Date().toISOString(),
      }],
    });
  },
};