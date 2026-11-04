# FitFlow 個人訓練日誌

免帳號的繁體中文居家啞鈴 PWA。首次開啟為空白訓練歷史，內建三練一休課表與 15 種原創向量演示。資料保存在目前瀏覽器。

## 在 Windows 本機使用

在本資料夾使用 Node.js 24 與 PowerShell。

```powershell
npm.cmd ci
npm.cmd run dev
```

瀏覽器開啟 http://127.0.0.1:4173/ 。啟動指令會先建置再提供正式靜態檔案。修改原始檔後重新啟動。手機需使用已部署的 HTTPS 網址。

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
```

若要在 Windows 另驗 WebKit，先執行 `.\node_modules\.bin\playwright-core.cmd install webkit`，再執行 `npm.cmd run test:webkit`。兩個瀏覽器測試共用本機 4187 埠，請依序執行。

## 專案導覽

| 檔案 | 用途 |
|---|---|
| app/data.js、app/types.ts | 初始動作、處方、循環與資料型別 |
| app/core.js | 具 TypeScript JSDoc 檢查的訓練、時間戳計時、單位與進步建議 |
| app/main.js、app/views.js、app/ui.js | Hash 路由、表單、訓練頁、歷史與設定 |
| app/demo.js、app/stats.js | 關節姿勢插值、控制器、圖表、個人最佳與台北日期日曆 |
| app/storage.js | IndexedDB 交易、版本遷移、衝突檢查與備份驗證 |
| scripts/build.js、scripts/serve.js | 產生 PNG 圖示、內容版本快取、可部署目錄與本機伺服器 |
| tests/core.test.js、tests/browser.js | 核心單元、Chrome 離線整合與遷移測試 |

正式網站使用原生 ES modules、SVG、CSS、IndexedDB 及 Service Worker，執行時無第三方套件或服務。TypeScript、ESLint、Playwright Core 僅供開發。使用說明見 [操作手冊](USER_GUIDE.md)、[備份說明](DATA_BACKUP.md)、[部署手冊](DEPLOYMENT.md) 與 [測試報告](TESTING.md)。

