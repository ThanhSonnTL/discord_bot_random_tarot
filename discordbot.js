const dotenv = require('dotenv');
dotenv.config();

const { Client, GatewayIntentBits } = require('discord.js');
const { createAudioPlayer, createAudioResource, StreamType, demuxProbe, joinVoiceChannel, NoSubscriberBehavior, AudioPlayerStatus, VoiceConnectionStatus, getVoiceConnection } = require('@discordjs/voice')

const playdl = require('play-dl');
const ytpl = require('ytpl');

const fs = require('fs');
const path = require('path');
const desk = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'card_data.json'), 'utf8'));

const { GoogleGenerativeAI } = require('@google/generative-ai');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages,
    ]
});

const PREFIX = '!';

let queue = [];
let isPlaying = false;
let genAI = new GoogleGenerativeAI(process.env.AI_TOKEN);
let userDraws = new Map();

// Reset userDraws at the start of a new day
setInterval(() => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const timeUntilMidnight = nextMidnight - now;

    setTimeout(() => {
        userDraws.clear();
    }, timeUntilMidnight);
}, 24 * 60 * 60 * 1000);

client.on('interactionCreate', interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'view_again') {
        const userId = interaction.user.id;
        if (userDraws.has(userId)) {
            const { description } = userDraws.get(userId);
            interaction.reply({
                embeds: [{
                    color: 0x3498db,
                    title: "Lá bài của bạn hôm nay",
                    description: description
                }],
                ephemeral: true
            });
        } else {
            interaction.reply({
                content: "Bạn chưa rút lá bài nào hôm nay.",
                ephemeral: true
            });
        }
    }
});

client.on('messageCreate', async message => {
    if (message.content === '!draw') {
        const userId = message.author.id;
        const today = new Date().toDateString();

        if (userDraws.has(userId) && userDraws.get(userId).date === today) {
            message.channel.send({
                embeds: [{
                    color: 0x3498db,
                    title: "Bạn đã rút một lá bài hôm nay rồi. Hãy thử lại vào ngày mai!",
                }],
                components: [{
                    type: 1,
                    components: [{
                        type: 2,
                        label: "Xem lại",
                        style: 1,
                        custom_id: "view_again"
                    }]
                }]
            });
            return;
        }


        // Pick a random card
        const randomCard = desk.cards[Math.floor(Math.random() * desk.cards.length)];

        // Determine if the card is upright or reversed
        const isReversed = Math.random() < 0.5;

        // Prepare the response
        const cardName = `${randomCard.name} (${isReversed ? 'Reversed' : 'Upright'})`;
        const meaning = isReversed ? randomCard.meaning_reversed : randomCard.meaning_upright;
        const associations = randomCard.associations.planet;
        const astrological_sign = randomCard.associations.astrological_sign;

        try {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const prompt = "Giải nghĩa lá " + cardName + " " + (isReversed ? "Ngược" : "Xuôi") + " Tình duyên, Công việc, Tiền vận ngày hôm nay! Một cách tóm tắt";
            const result = await model.generateContent(prompt);
            const description = `**Ý nghĩa:** ${result.response.text()}\n\n**Liên kết đặc biệt:** ${associations}\n\n**Cung Mệnh:** ${astrological_sign}`
            message.channel.send({
                embeds: [{
                    color: 0x3498db,
                    title: cardName,
                    description: description
                }]
            });

            // Record the draw for the user
            userDraws.set(userId, { date: today, description: description });
        } catch (error) {
            console.error("Error generating content:", error);
            message.channel.send("Sorry, something went wrong.");
        }
    }
});

async function playSong(connection) {
    if (queue.length === 0) {
        isPlaying = false;
        return;
    }

    isPlaying = true;
    const song = queue.shift();

    try {
        const stream = await playdl.stream(song.url);
        const resource = createAudioResource(stream.stream, {
            inputType: stream.type
        });
        const player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Play
            }
        });

        player.play(resource);
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Idle, () => {
            playSong(connection);
        });

        player.on('error', error => {
            console.error(`Error: ${error.message}`);
            playSong(connection);
        });

        console.log(`Now playing: ${song.title}`);
    } catch (error) {
        console.error("Error streaming audio:", error);
    }
}

client.on('messageCreate', async (message) => {
    if (!message.content.startsWith(PREFIX) || message.author.bot) return;

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    if (command === 'play') {

        const updatedMember = await message.guild.members.fetch(message.member.id);
        const voiceChannel = updatedMember.voice.channel;

        if (!voiceChannel) {
            return message.reply('You need to be in a voice channel to play music!');
        }

        const permissions = voiceChannel.permissionsFor(message.client.user);
        if (!permissions?.has('CONNECT') || !permissions.has('SPEAK')) {
            return message.reply('I need permissions to join and speak in your voice channel!');
        }

        const url = args[0];
        //console.log(url);

        if (!ytpl.validateID(url)) {
            return message.reply('Please provide a valid YouTube playlist URL!');
        }

        const playlist = await ytpl(url, { pages: 1 });
        playlist.items.forEach(item => {
            queue.push({ title: item.title, url: item.url });
        });

        message.channel.send(`Added ${playlist.items.length} songs to the queue!`);

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator
        });

        if (!isPlaying) playSong(connection);
    }

    if (command === 'skip') {
        if (queue.length > 0) {
            message.reply('Skipping the current song...');
            playSong();
        } else {
            message.reply('There are no songs in the queue to skip!');
        }
    }

    if (command === 'stop') {
        queue = [];
        isPlaying = false;
        message.reply('Stopping the music and clearing the queue!');
    }
});


// client.on('voiceStateUpdate', (oldState, newState) => {
//     const member = newState.member;

//     // User joined a voice channel
//     if (!oldState.channel && newState.channel) {
//         console.log(`${member.user.tag} joined the voice channel: ${newState.channel.name}`);
//     }

//     // User left a voice channel
//     if (oldState.channel && !newState.channel) {
//         console.log(`${member.user.tag} left the voice channel: ${oldState.channel.name}`);
//     }

//     // User switched voice channels
//     if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
//         console.log(`${member.user.tag} switched from ${oldState.channel.name} to ${newState.channel.name}`);
//     }
// });

client.once('ready', () => {
    console.log('Bot is online!');

});

client.login(process.env.DISCORD_TOKEN);



