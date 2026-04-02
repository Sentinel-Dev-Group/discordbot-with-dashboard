const { SlashCommandBuilder } = require('discord.js');
const { useQueue }            = require('discord-player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume the paused track'),

  cooldown: 3,

  async execute(interaction) {
    await interaction.deferReply();

    const queue = useQueue(interaction.guild.id);

    if (!queue) {
      return interaction.editReply({
        embeds: [{
          color:       0xed4245,
          description: '❌ Nothing is in the queue right now.',
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

    // ─── Not paused ───────────────────────────────
    if (!queue.node.isPaused()) {
      return interaction.editReply({
        embeds: [{
          color:       0xfee75c,
          description: '▶️ The player is already playing. Use `/pause` to pause.',
        }],
      });
    }

    // ─── Resume ───────────────────────────────────
    queue.node.resume();

    const current = queue.currentTrack;

    return interaction.editReply({
      embeds: [{
        color:  0x57f287,
        title:  '▶️ Resumed',
        fields: current
          ? [
              {
                name:   'Track',
                value:  `[${current.title}](${current.url})`,
                inline: false,
              },
              {
                name:   'Resumed by',
                value:  interaction.user.tag,
                inline: true,
              },
            ]
          : [],
        timestamp: new Date().toISOString(),
      }],
    });
  },
};