# FitFlow 帳號同步

使用既有 LinkRoom-Development 專案。FitFlow 使用獨立的 fitflow_workspaces 資料表；兩個 App 共用此專案的 Email 帳號系統及寄信設定。密碼修改會影響同一專案的帳號。

## 使用

設定 → 帳號與同步，以 Email 和密碼註冊並完成信箱驗證，或使用此專案已有的帳號登入。每個帳號具有獨立本機儲存；登出恢復訪客資料。訪客資料不會自動上傳，需選擇「帶入本機訪客資料」。另一裝置以同一帳號登入，選擇「立即同步」。離線修改保存在該裝置，重新連線後重試。不要在同步完成前清除網站資料。

修改後會排程同步，回到畫面與每分鐘亦會檢查。為避免中斷輸入，焦點仍在表單時會延後；可在設定手動同步。相同項目在兩台裝置都有修改時，需自行選擇保留版本。建議重大修改前匯出 JSON 備份。

## 部署

schema.sql 已以 fitflow_account_workspaces migration 套用。僅允許帳號讀取自己的紀錄；寫入經 fitflow_save 原子比對版本，拒絕過時覆寫。公開設定 app/cloud-config.js 只含 publishable key，不能放 service_role 或 secret key。

Auth 的 Site URL 保留 LinkRoom，Redirect URLs 新增 https://w0922534897-prog.github.io/Fitness-pwa/ 。此為驗證信與重設密碼回跳網址。

Supabase 預設寄信服務只提供有限測試用途，未設定自訂 SMTP 時可能限制收件人為組織成員並有頻率限制。若要開放其他人註冊，需由擁有者設定可用的 SMTP；不能將顯示寄信成功當作實際收件驗證。

## 驗證

- npm test：合併、衝突、重試、PostgreSQL 權限與版本競爭。
- node tests/account-browser.js（可加 --webkit）：真實 SDK 搭配模擬 Auth / REST，驗證兩個瀏覽器環境同步、訪客匯入、登出與不同帳號隔離。
- node tests/browser.js、node tests/pwa-update.js（可加 --webkit）：離線訓練及版本更新。
- 真實 Email 收信、驗證連結、兩台實體裝置同步、iPhone 鎖屏行為仍需使用者實測。

目前採整份文件同步，每個帳號上限 16 MiB。大量長期歷史的雲端傳輸效能尚未進行實體網路壓力測試。
