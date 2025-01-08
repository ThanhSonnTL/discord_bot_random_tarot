const dotenv = require('dotenv');
dotenv.config();

const { Client, GatewayIntentBits } = require('discord.js');

const fs = require('fs');
const path = require('path');
const desk = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'card_data.json'), 'utf8'));

const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.AI_TOKEN);
const userDraws = new Map();


const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', () => {
    console.log('Bot is online!');

});

client.on('messageCreate', message => {
    if (message.content === '!ping') {
        message.channel.send('Pong!');
    }
});


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


client.login(process.env.DISCORD_TOKEN);



