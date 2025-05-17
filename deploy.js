const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Ping値を表示します'),
    new SlashCommandBuilder().setName('time').setDescription('現在の時刻を表示します'),
    new SlashCommandBuilder().setName('weather').setDescription('今日の天気予報を表示します'),
    new SlashCommandBuilder().setName('train').setDescription('遅延情報を表示します'),
    new SlashCommandBuilder().setName('roulette').setDescription('ルーレットを回します'),
    new SlashCommandBuilder().setName('nakasai').setDescription('中才チャンス！！'),
    new SlashCommandBuilder().setName('doi').setDescription('ドイドイスー！！'),
    new SlashCommandBuilder().setName('hayakawa').setDescription('ドイドイスー！！')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('スラッシュコマンドを登録中...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID), // グローバルコマンド
            { body: commands }
        );
        console.log('登録完了！');
    } catch (error) {
        console.error(error);
    }
})();