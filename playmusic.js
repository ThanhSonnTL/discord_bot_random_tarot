const dotenv = require('dotenv');
dotenv.config();

const { Client, GatewayIntentBits } = require('discord.js');
const { createAudioPlayer, createAudioResource, StreamType, demuxProbe, joinVoiceChannel, NoSubscriberBehavior, AudioPlayerStatus, VoiceConnectionStatus, getVoiceConnection } = require('@discordjs/voice')


const play = require('play-dl')

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

client.on('messageCreate', async message => {
    if (message.content.startsWith('!play')) {

        if (!message.member.voice?.channel) return message.channel.send('Connect to a Voice Channel')

        const connection = joinVoiceChannel({
            channelId: message.member.voice.channel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator
        })

        let args = message.content.split('play ')[1].split(' ')[0]

        let stream = await play.stream(args)

        /*
        OR if you want to get info about soundcloud link and then stream it

        let so_info = await play.soundcloud(args) // Make sure that url is track url only. For playlist, make some logic.
        console.log(so_info.name) 
        let stream = await play.stream_from_info(so_info)
        */

        let resource = createAudioResource(stream.stream, {
            inputType: stream.type
        })

        let player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Play
            }
        })

        player.play(resource)

        connection.subscribe(player)
    }
})

client.on('ready', () => {
    console.log(`We have logged in as ${client.user.tag}!`)
})

client.login(process.env.DISCORD_TOKEN);
