# 蒼燼紀行 線上伺服器

提供：帳號（角色名稱＋密碼）、營地即時同步、世界／隊伍／附近聊天、組隊（最多 4 人）、查看裝備、雲端存檔。

## 部署到 Render（免費）
1. 把這個 `server` 資料夾放進你的 GitHub repo（例如 `ashgame/server`）。
2. 到 https://render.com 用 GitHub 登入 → New → Web Service → 選 `ashgame` repo。
3. 設定：Root Directory 填 `server`、Build Command `npm install`、Start Command `npm start`、方案選 Free。
4. 部署完成會得到網址，例如 `https://ashgame-server.onrender.com`。
5. 在遊戲上方按「線上：離線」，伺服器填 `wss://ashgame-server.onrender.com`，輸入密碼連線。

## 注意
- 免費方案閒置 15 分鐘會休眠，第一個人連線要等約 30～60 秒喚醒。
- 免費方案的硬碟不會永久保存：伺服器重啟後雲端存檔與帳號可能被清空（本機存檔不受影響）。要永久保存，可升級 Render 付費方案並掛載 Disk，或設定環境變數 `DATA_FILE` 指向持久化磁碟路徑。
- 環境變數 `MOTD` 可以修改登入歡迎訊息。

## 本機測試
```
cd server
npm install
npm start
```
遊戲中伺服器填 `ws://localhost:8787`。
