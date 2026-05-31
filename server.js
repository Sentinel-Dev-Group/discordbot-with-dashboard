const {
    Client,
    GatewayIntentBits,
    ChannelType,
    PermissionsBitField
} = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const TOKEN = 'YOUR_BOT_TOKEN';
const GUILD_ID = 'YOUR_GUILD_ID';

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const guild = client.guilds.cache.get(GUILD_ID);

    if (!guild) {
        console.log('Guild not found');
        return;
    }

    try {

        // =========================
        // ROLES
        // =========================

        async function createRole(options) {
            let role = guild.roles.cache.find(
                r => r.name === options.name
            );

            if (!role) {
                role = await guild.roles.create(options);
                console.log(`Created role: ${options.name}`);
            }

            return role;
        }

        const ownerRole = await createRole({
            name: '👑 Nova Owner',
            color: '#FF2D55',
            hoist: true,
            mentionable: true,
            permissions: [
                PermissionsBitField.Flags.Administrator
            ]
        });

        const devRole = await createRole({
            name: '⚡ Nova Developer',
            color: '#FF9500',
            hoist: true,
            mentionable: true,
            permissions: [
                PermissionsBitField.Flags.Administrator
            ]
        });

        const adminRole = await createRole({
            name: '🛡️ Administrator',
            color: '#FF3B30',
            hoist: true,
            mentionable: true,
            permissions: [
                PermissionsBitField.Flags.Administrator
            ]
        });

        const modRole = await createRole({
            name: '🔨 Moderator',
            color: '#007AFF',
            hoist: true,
            mentionable: true,
            permissions: [
                PermissionsBitField.Flags.KickMembers,
                PermissionsBitField.Flags.BanMembers,
                PermissionsBitField.Flags.ModerateMembers,
                PermissionsBitField.Flags.ManageMessages
            ]
        });

        const supportRole = await createRole({
            name: '🎫 Support Team',
            color: '#34C759',
            hoist: true,
            mentionable: true,
            permissions: [
                PermissionsBitField.Flags.ManageMessages
            ]
        });

        const testerRole = await createRole({
            name: '🤖 Bot Tester',
            color: '#AF52DE',
            hoist: true,
            mentionable: true
        });

        const botRole = await createRole({
            name: '🤖 Nova Bot',
            color: '#5865F2',
            hoist: true,
            mentionable: false
        });

        const memberRole = await createRole({
            name: '✨ Member',
            color: '#8E8E93',
            hoist: false,
            mentionable: false
        });

        // =========================
        // ROLE HIERARCHY
        // =========================

        await ownerRole.setPosition(100);
        await devRole.setPosition(99);
        await adminRole.setPosition(98);
        await modRole.setPosition(97);
        await supportRole.setPosition(96);
        await testerRole.setPosition(95);
        await botRole.setPosition(94);
        await memberRole.setPosition(1);

        // =========================
        // CATEGORY CREATOR
        // =========================

        async function createCategory(name) {
            let category = guild.channels.cache.find(
                c =>
                    c.name === name &&
                    c.type === ChannelType.GuildCategory
            );

            if (!category) {
                category = await guild.channels.create({
                    name,
                    type: ChannelType.GuildCategory
                });
            }

            return category;
        }

        // =========================
        // CHANNEL CREATOR
        // =========================

        async function createChannel(
            name,
            parent,
            readOnly = false,
            staffOnly = false
        ) {
            if (
                guild.channels.cache.find(
                    c => c.name === name
                )
            ) return;

            let overwrites = [];

            if (readOnly) {
                overwrites.push({
                    id: guild.roles.everyone.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel
                    ],
                    deny: [
                        PermissionsBitField.Flags.SendMessages
                    ]
                });
            }

            if (staffOnly) {
                overwrites = [
                    {
                        id: guild.roles.everyone.id,
                        deny: [
                            PermissionsBitField.Flags.ViewChannel
                        ]
                    },
                    {
                        id: adminRole.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel
                        ]
                    },
                    {
                        id: modRole.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel
                        ]
                    },
                    {
                        id: supportRole.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel
                        ]
                    }
                ];
            }

            await guild.channels.create({
                name,
                type: ChannelType.GuildText,
                parent,
                permissionOverwrites: overwrites
            });
        }

        async function createVoice(name, parent) {
            if (
                guild.channels.cache.find(
                    c => c.name === name
                )
            ) return;

            await guild.channels.create({
                name,
                type: ChannelType.GuildVoice,
                parent
            });
        }

        // =========================
        // CATEGORIES
        // =========================

        const info = await createCategory('📢 INFORMATION');
        const community = await createCategory('💬 COMMUNITY');
        const support = await createCategory('🎫 SUPPORT');
        const staff = await createCategory('👮 STAFF');
        const voice = await createCategory('🎙️ VOICE');

        // =========================
        // INFORMATION
        // =========================

        await createChannel('👋・welcome', info.id, true);
        await createChannel('📜・rules', info.id, true);
        await createChannel('📣・announcements', info.id, true);
        await createChannel('📝・nova-changelogs', info.id, true);
        await createChannel('🚀・roadmap', info.id, true);

        // =========================
        // COMMUNITY
        // =========================

        await createChannel('💭・general', community.id);
        await createChannel('🤖・bot-commands', community.id);
        await createChannel('💡・suggestions', community.id);
        await createChannel('📸・showcase', community.id);

        // =========================
        // SUPPORT
        // =========================

        await createChannel('🎫・create-ticket', support.id);
        await createChannel('❓・help', support.id);
        await createChannel('🐞・bug-reports', support.id);
        await createChannel('📚・faq', support.id);

        // =========================
        // STAFF
        // =========================

        await createChannel(
            '🔨・staff-chat',
            staff.id,
            false,
            true
        );

        await createChannel(
            '📋・mod-logs',
            staff.id,
            false,
            true
        );

        await createChannel(
            '🚨・reports',
            staff.id,
            false,
            true
        );

        // =========================
        // VOICE
        // =========================

        await createVoice(
            '🔊 General Voice',
            voice.id
        );

        await createVoice(
            '🎧 Support Voice',
            voice.id
        );

        console.log('Nova Support Server setup complete.');
    } catch (error) {
        console.error(error);
    }
});

client.login(TOKEN);