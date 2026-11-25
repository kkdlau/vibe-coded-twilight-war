# 光暈戰記 (Twilight Wars)

2D 俯視角 2.5D 戰術競技場射擊遊戲，支援單機對戰、自訂戰場編輯器，以及基於 **Cloudflare Workers + Durable Objects** 的即時多人連線對戰。

---

## 本機開發與驗證指令

```bash
npm install
npm run dev        # 啟動本機開發伺服器 (http://localhost:3000/)，包含 Vite HMR 與本地 Durable Objects 模擬
npm run lint       # 型別檢查：前端 (tsc --noEmit) + Worker (tsc -p tsconfig.worker.json --noEmit)
npm test -- --run  # 執行全部 Vitest 單元與整合測試
npm run build      # 建置靜態網頁 (dist/client/) 與 Worker (dist/twilight_wars/)
```

> 專案根目錄的 `.npmrc` 已設定 `legacy-peer-deps=true`（與 `.github/workflows/ci.yml` 一致），讓本機與 Cloudflare Workers Builds 安裝依賴時無須手動帶入額外參數。

---

## 掛載 GitHub Repo 自動部署至 Cloudflare Workers（Workers Builds）

透過 Cloudflare **Workers Builds** 連接 GitHub Repository 後，每次 `push` 到 `main` 分支都會自動建置與上線，讓朋友可直接透過公開 `*.workers.dev` 網址跨網絡遊玩。

### 1. 初次連接 Repository（由 Cloudflare 帳戶擁有者操作一次）

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/) → 左側選單 **Workers & Pages**。
2. 點選 **Create** → **Workers** → **Continue with GitHub**，授權並選擇本 Repository（分支選 `main`）。
3. 確認 **Settings > Builds** 建置指令：
   - **Build command**：`npm run build`
   - **Deploy command**：`npx wrangler deploy`（會自動讀取根目錄的 [wrangler.jsonc](wrangler.jsonc)）
4. 按 **Save and Deploy** 即可完成部署並取得專屬線上網址（例如 `https://vibe-coded-twilight-war.<subdomain>.workers.dev`）。

### 2. 協作者安全權限（無需 Cloudflare 帳號即可開發與 Push）

- 本 Repository **不包含任何 Cloudflare `account_id`、API Token、帳號信箱或硬編碼密碼**（[wrangler.jsonc](wrangler.jsonc) 與 `.github/workflows/ci.yml` 皆為無帳號依賴配置）。
- 任何擁有 GitHub Repository 寫入權限的朋友／協作者都可以正常開發、commit 並 push 程式碼；Cloudflare Workers Builds 會由帳戶擁有者已連接的 GitHub 整合自動觸發部署，協作者完全不需要擁有或登入你的 Cloudflare 帳號。

### 3. 上游單一來源與自動 Git Mirror 同步（`sync-upstream.yml`）

- 開發請一律推往主倉庫 **`lwclwclwc60/vibe-coded-twilight-war`（`upstream/main`）**；切勿直接對個人 Mirror（`kkdlau/vibe-coded-twilight-war`）額外提交未合併的改動。
- 個人 Mirror 倉庫透過 [.github/workflows/sync-upstream.yml](.github/workflows/sync-upstream.yml) 每 15 分鐘（或於 GitHub Actions 手動點擊 **Run workflow**）自動向 `upstream/main` 執行 Fast-forward 同步並觸發 Cloudflare Workers Builds 自動部署。
- *注意*：若上游有直接修改 `.github/workflows/` 目錄下的檔案，受限於 GitHub Actions 內建 `GITHUB_TOKEN` 預設不具備 `workflow` 寫入權限，該次變更需於本機補跑一次 `git push origin main`。

---

## 設定私人房間通行密碼（`ROOM_PASSCODE`）

### 什麼是「Cloudflare Secret」？
白話來說，**Secret（加密環境變數）** 就是把密碼只存在 Cloudflare 雲端後台、**絕對不寫進 GitHub 程式碼** 的設定方式：
- Repo 裡沒有密碼，外人看 GitHub 原始碼也猜不到密碼。
- 只有你部署在 Cloudflare 上的 Worker 執行時能讀取到這組密碼。

### 設定步驟（在 Cloudflare Dashboard 設定，不經過 Git）

1. 進入 Cloudflare Dashboard → **Workers & Pages** → 點進你的 Worker（`vibe-coded-twilight-war`）。
2. 前往 **Settings** → **Variables and Secrets** → 點 **Add**。
3. **Type** 選擇 **Secret**（加密變數）。
4. **Variable name** 填入 `ROOM_PASSCODE`，**Value** 填入只有你與朋友知道的自訂密碼。
5. 點 **Deploy** / **Save** 生效。

### 運作邏輯
- **本機開發（未設定 `ROOM_PASSCODE`）**：`/api/health` 回傳 `passcodeRequired: false`，本機雙分頁測試免密碼直接開房。
- **線上環境（已設定 `ROOM_PASSCODE`）**：`/api/health` 自動告知前端需要密碼（大廳介面會主動顯示密碼欄），且 Worker 在 **進入 Durable Object 之前** 就會在邊緣節點直接驗證 `?passcode=`——密碼不符一律回傳 `403`，**不會喚醒任何 Durable Object 或消耗免費方案儲存／連線額度**。

---

## 免費方案（Free Tier）省資源與自動清理機制

為確保長時間白嫖 Cloudflare Free Tier 不被刷爆或殘留費用，房間生命週期設計如下：

- **人數上限**：每房最多 **8 名真人玩家**（空位由房主端 AI 自動補齊）。
- **WebSocket Hibernation API**：房間閒置等待期間 Durable Object 會自動休眠。
- **房主離線或全員離開**：`webSocketClose` / `webSocketError` 立即關閉全部連線並執行 `storage.deleteAlarm()` 與 `storage.deleteAll()` 徹底清除房間資源。
- **戰局結束後 60 秒自動銷毀**：主戰場結算後排程 **60 秒** Alarm；若房主無點擊「返回多人房間（再戰一局）」，房間與儲存自動清除。
- **逾時保護**：大廳無操作超過 **5 分鐘**、或單場對戰超過 **30 分鐘** 均會觸發 Alarm 自動清理釋放。
