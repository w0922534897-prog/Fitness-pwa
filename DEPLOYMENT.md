# 靜態部署

本專案的正式儲存庫為 w0922534897-prog/Fitness-pwa。正式產物在 dist，毋須後端或資料庫憑證。使用分支根目錄發布時，應將 dist 的內容同步到發布根目錄；使用 Actions 時，工作流程直接上傳 dist。

1. 在本機執行 npm.cmd ci、npm.cmd test、npm.cmd run build。
2. 使用有發布權限的 GitHub 公開儲存庫。將本專案原始碼與 .github/workflows/pages.yml 推送至 main 或 master。在 Settings → Pages → Source 選 GitHub Actions。
3. 在 Actions 選 FitFlow Pages，手動執行，或推送更新。工作流程會檢查型別、lint、測試及 build，再將 dist 上傳至 Pages。公開儲存庫可使用 GitHub Free。[GitHub Pages 官方工作流程](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
4. 開啟工作流程回報的 HTTPS 網址。保留儲存庫子路徑與尾端斜線。首頁、manifest、圖示和 sw.js 應回傳成功；檢查 Service Worker 的 scope 指向該子目錄。若出現 404，核對 Pages 指定來源、部署工作狀態與上傳目錄。
5. 進入 #plans 與 #history 並重新整理；第一次快取完成後斷網重開。路由位於網址片段，伺服器只需提供靜態入口。資源皆為相對路徑。

每次建置以資源內容雜湊建立新快取。已開啟的分頁收到更新提示，儲存並關閉所有分頁後再開啟。新版本僅清理相同 scope 的舊應用程式快取。若改用其他 HTTPS 靜態主機，直接上傳 dist 的內容，並確保 sw.js 可重新驗證；更換主機前先匯出 JSON。

