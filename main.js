const { Client, GatewayIntentBits, Partials, Events, ChannelType} = require('discord.js');
const cron = require('node-cron');
const axios = require('axios'); // fetchの代わりにaxiosを使用
const {JSDOM} = require('jsdom');
require('dotenv').config();

const env = process.env;
const token = env.DISCORD_TOKEN;
const apiKey = env.OPENWEATHER_API_KEY;
const city = "Osaka"
const weatherUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${apiKey}&lang=ja&units=metric`;
const trainUrl = "https://transit.yahoo.co.jp/diainfo/area/6";
const pickUpTrain = ["大阪環状線","京阪本線・中之島線","大阪メトロ御堂筋線","南海高野線"];
let preDelay = [];
console.log(weatherUrl);

const main = "main"
const weather = "weather";
const time = "time";
const train = "train";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

async function getTodayWeatherForecast() {
    try {
        const response = await axios.get(weatherUrl);
        const data = response.data;
        if (data.list && data.list.length > 0) {
            const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
            const today = nowJST.toISOString().slice(0, 10);
            // console.log(today);
            const todayForecasts = data.list.filter(item => {
                const dt = new Date(item.dt_txt + 'Z');
                return dt.toISOString().slice(0, 10) === today;
            });
            if (todayForecasts.length === 0) {
                return "本日の天気予報が見つかりませんでした。";
            }
            let reply = `【${city}の本日の天気予報】\n`;
            todayForecasts.forEach(item => {
                const dt = new Date(item.dt_txt);
                const time = dt.toTimeString().slice(0, 5); // "HH:MM"
                const weatherDesc = item.weather[0].description;
                const temp = item.main.temp;
                reply += `${time}：${weatherDesc}、${temp}℃\n`;
            });
            return reply;
        } else {
            return "天気予報を取得できませんでした。";
        }
    } catch (error) {
        return "天気予報の取得中にエラーが発生しました。";
    }
}

async function getDelay() {
    try {
        const response = await axios.get(trainUrl);
        const data = response.data;
        const html = new JSDOM(data, {url: trainUrl});
        const trouble = html.window.document.querySelector("#mdStatusTroubleLine > div.elmTblLstLine.trouble");
        const res = [];
        if (trouble.children.length > 0) {
            const tb = html.window.document.querySelector("#mdStatusTroubleLine > div.elmTblLstLine.trouble > table > tbody");
            const row = Array.from(tb.getElementsByTagName("tr")).filter((_,i) => i!==0);
            row.forEach(e => {
                const col = e.getElementsByTagName("td");
                const line = col[0].textContent;
                const situ = col[1].textContent;
                res.push([line, situ]);
                // console.log(line, situ);
            });
            return res;
        } else {
            console.log("遅延情報はありません。");
            return false;
        } 

    } catch (err) {
        console.error(err);
    }
}

// getDelay();

client.once(Events.ClientReady, () => {
    console.log('ログインしました');
    client.user.setActivity('server is running.');

    const channels = {
        main: client.channels.cache.get(env.CHANNEL_MAIN),
        weather: client.channels.cache.get(env.CHANNEL_WEATHER),
        time: client.channels.cache.get(env.CHANNEL_TIME),
        train: client.channels.cache.get(env.CHANNEL_TRAIN)
    };
    
    // console.log(channels["main"])
    
    function send(ch,mes) {
        // console.log(ch);
        const channel = channels[ch];
        if (!channel) {
            console.log("このチャンネルは存在しません");
            return;
        }
        channel.send(mes);
    }

    // 1分ごとに、ちょうど00秒で時報を送信
    cron.schedule('0 0 * * * *', () => { // 秒, 分, 時, 日, 月, 曜日
        const now = new Date();
        const formatted = now.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        const channel = channels.time;
        // if (channel) {
        //     channel.send(`現在の日時は ${formatted} です。`);
        // }
        send(time, `現在の日時は ${formatted} です。`);
    });

    // 毎朝6時に天気を送信
    cron.schedule('0 0 6 * * *', async () => {
        const forecast = await getTodayWeatherForecast();
        if (forecast.includes("雨")) send(main, "今日は雨が降ります。傘を持って行くといいでしょう。");
        // else send(main, "今日は雨降らんで。安心せい。");
        send(weather, forecast);
    });

    // 6時から18時まで5分ごとに遅延情報を送信
    cron.schedule('0 */5 6-18 * * *', async () => {
        const delayInfo = await getDelay();
        // 遅延中の路線を記録するためのSetを利用
        if (!global.currentDelayedLines) global.currentDelayedLines = new Set();

        if (delayInfo) {
            let output = "【遅延情報】\n";
            const lines = [];
            delayInfo.forEach(e => {
                const line = e[0];
                const situ = e[1];
                if (!pickUpTrain.includes(line)) return;
                // すでに遅延連絡済みならスキップ
                if (global.currentDelayedLines.has(line)) return;
                lines.push(line);
                global.currentDelayedLines.add(line);
                output += `${line}: ${situ}\n`;
            });
            // lines.length==0なら新規遅延なし
            if (lines.length === 0) return;
            send(train, output);
        } else {
            // 遅延情報がなくなった場合は記録をリセット
            if (global.currentDelayedLines && global.currentDelayedLines.size > 0) {
                global.currentDelayedLines.clear();
            }
            // send(train, "現在、遅延情報はありません。");
        }
    });
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    switch(message.content) {
		case "!ping": 
			var sent = await message.channel.send('Pinging...');
			sent.edit(`Ping: ${client.ws.ping}ms`);
			break;
		case "!time":
			const now = new Date();
			const formatted = now.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
			message.channel.send(`現在の日時は ${formatted} です。`);         
			break;
        case "!weather":
            const forecast = await getTodayWeatherForecast();
            message.channel.send(forecast);
            break;
        case "!train":
            const delayInfo = await getDelay();
            if(delayInfo) {
                // message.channel.send(`【遅延情報】\n${delayInfo}`);
                let output = "【遅延情報】\n";
                delayInfo.forEach(e => {
                    const line = e[0];
                    const situ = e[1];
                    output += `${line}: ${situ}\n`;
                });
                // console.log(output);
                message.channel.send(output);
            }
            else message.channel.send("現在、遅延情報はありません。");
            break;
        case "!stamp":
            message.channel.send(":smile:");
            break;
        
        case "!roulette":
            const list = ["smile", "smile_cat", "smiley"];
            var res = "";
            var sent = await message.channel.send("ルーレットを回しています...");
            var count = 0;
            var interval = setInterval(() => {
                count ++;
                const ram = Math.floor(Math.random() * list.length);
                res += `:${list[ram]}:`;
                sent.edit(res);
                if (count == 3) clearInterval(interval);
            }, 100);

            break;

        case "!nakasai":
            const nakasai = ["<:202_20250508102252:1369847239639437333>", "<:202_20250508101025:1369844190011199571>", "<:IMG_6097:1369843326643212398>"];
            var res = "";
            var sent = await message.channel.send("NAKSAIを回しています...");
            var count = 0;
            var interval = setInterval(() => {
                count ++;
                const ram = Math.floor(Math.random() * nakasai.length);
                res += nakasai[ram] + " ";
                sent.edit(res);
                if (count == 3) clearInterval(interval);
            }, 100);
            break;

        case "!doi":
            const doi = ["<:doi0:1367142984868433980>", "<:doi1:1334371978949165170>", "<:doi2:1371834157952667688>"];
            var res = "";
            var sent = await message.channel.send("dui roulette...");
            var count = 0;
            var interval = setInterval(() => {
                count ++;
                const ram = Math.floor(Math.random() * doi.length);
                res += doi[ram] + " ";
                sent.edit(res);
                if (count == 3) clearInterval(interval);
            }, 100);
            break;

		default: console.log("default case");
    }
});

// ここからスラッシュコマンド対応
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    switch (interaction.commandName) {
        case "ping":
            await interaction.reply(`Ping: ${client.ws.ping}ms`);
            break;
        case "time":
            const now = new Date();
            const formatted = now.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
            await interaction.reply(`現在の日時は ${formatted} です。`);
            break;
        case "weather":
            const forecast = await getTodayWeatherForecast();
            await interaction.reply(forecast);
            break;
        case "train":
            const delayInfo = await getDelay();
            if(delayInfo) {
                // message.channel.send(`【遅延情報】\n${delayInfo}`);
                let output = "【遅延情報】\n";
                delayInfo.forEach(e => {
                    const line = e[0];
                    const situ = e[1];
                    output += `${line}: ${situ}\n`;
                });
                // console.log(output);
                interaction.reply(output);
            }
            else interaction.reply("現在、遅延情報はありません。");
            break;
        case "roulette":
            const list = ["smile", "smile_cat", "smiley"];
            var res = "";
            await interaction.reply("ルーレットを回しています...");
            var count = 0;
            var spin = async () => {
                if (count < 3) {
                    const ram = Math.floor(Math.random() * list.length);
                    res += `:${list[ram]}:`;
                    await interaction.editReply(res);
                    count++;
                    setTimeout(spin, 100);
                }
            };
            spin();
            break;
            case "nakasai":
                const nakasai = ["<:202_20250508102252:1369847239639437333>", "<:202_20250508101025:1369844190011199571>", "<:IMG_6097:1369843326643212398>"];
                var res = "";
                await interaction.reply("NAKSAIを回しています...");
                var count = 0;
                var spin = async () => {
                    if (count < 3) {
                        const ram = Math.floor(Math.random() * nakasai.length);
                        res += `${nakasai[ram]} `;
                        await interaction.editReply(res);
                        count++;
                        setTimeout(spin, 100);
                    }
                };
                spin();
                break;
            
            case "doi":
                const doi = ["<:doi0:1367142984868433980>", "<:doi1:1334371978949165170>", "<:doi2:1371834157952667688>"];
                var res = "";
                await interaction.reply("doi roulette...");
                var count = 0;
                var spin = async () => {
                    if (count < 3) {
                        const ram = Math.floor(Math.random() * doi.length);
                        res += `${doi[ram]} `;
                        await interaction.editReply(res);
                        count++;
                        setTimeout(spin, 100);
                    }
                };
                spin();
                break;
        default:
            await interaction.reply("不明なコマンドです。");
    }
});
// ここまでスラッシュコマンド対応

    // if (message.channel.type === ChannelType.DM) {
    //     console.log(`DM from ${message.author.tag}: ${message.content}`);
    //     message.author.send('DMありがとう！どうしたの？');
    // }

client.login(token);
