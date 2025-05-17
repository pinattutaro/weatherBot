const express = require('express');
const app = express();
const port = 3000;
const axios = require("axios");

app.get('/callback', async (req, res) => {
    const code = req.query.code;
    console.log(code);
    
    try {
      const response = await axios.post('https://discord.com/api/oauth2/token', null, {
        params: {
          client_id: '1366390461476114502',
          client_secret: 'HQELWh_7QWW8xxd1WdMv3ysbCdQVRz75',
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: 'http://localhost:3000/callback',
          scope: 'bot'
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      console.log('アクセストークン:', response.data.access_token);
      res.send('認証成功！アクセストークンを取得しました。');
    } catch (error) {
      console.error('アクセストークン取得エラー:', error);
      res.send('認証に失敗しました。');
    }
  });

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
