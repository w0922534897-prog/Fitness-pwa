import { cloudConfig } from "./cloud-config.js";
import { validate } from "./storage.js";
import { esc, field, form, btn, panel, dateTime } from "./ui.js";

export const configured = !!(cloudConfig.url && cloudConfig.publishableKey);
export async function createCloud(onAuth) {
  if (!configured) return null;
  const url = new URL(cloudConfig.url);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co"))
    throw Error("請設定正確的 Supabase HTTPS 專案網址。");
  if (!cloudConfig.publishableKey.startsWith("sb_publishable_"))
    throw Error("請使用 Supabase Publishable key。");
  const { createClient } = await import("../vendor/supabase.js");
  const client = createClient(cloudConfig.url, cloudConfig.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { fetch: async (url, options = {}) => {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 15000);
      const cancel = () => abort.abort();
      options.signal?.addEventListener("abort", cancel, { once: true });
      if (options.signal?.aborted) cancel();
      try { return await fetch(url, {...options, signal:abort.signal}); }
      finally { clearTimeout(timer); options.signal?.removeEventListener("abort", cancel); }
    } },
  });
  client.auth.onAuthStateChange((event, session) => {
    setTimeout(() => onAuth(event, session?.user || null), 0);
  });
  return client;
}
export async function readCloud(client, userId, token) {
  const {data, error} = await client.from("fitflow_workspaces")
    .select("revision,data").eq("user_id", userId).setHeader("Authorization", "Bearer " + token).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (!Number.isSafeInteger(data.revision) || data.revision < 1) throw Error("雲端版本無效。");
  validate(data.data);
  return data;
}
export async function writeCloud(client, expected, data, token) {
  validate(data);
  const {data:version, error} = await client.rpc("fitflow_save", {expected_revision:expected, document:data})
    .setHeader("Authorization", "Bearer " + token);
  if (error) throw error;
  if (!Number.isSafeInteger(version) || version < 1) throw Error("無法確認雲端寫入結果。請重試同步。");
  return version;
}
export function cloudError(error) {
  if (!navigator.onLine) return "目前離線，資料已保存在這台裝置，連線後會重試。";
  if (["invalid_credentials","email_not_confirmed"].includes(error?.code))
    return "請確認 Email、密碼及信箱驗證狀態。";
  if (error?.code === "40001") return "另一台裝置剛更新資料，請再同步一次。";
  if (error?.code === "23514" || error?.code === "22023") return "雲端拒絕此資料格式或大小，請先匯出備份。";
  if (error?.code === "PGRST205" || error?.code === "PGRST202")
    return "同步服務尚未完成資料庫設定。";
  return error?.message || "連線失敗，請稍後重試。";
}
export function accountPanel({ user, status, busy, conflicts, lastSync, recovery }) {
  if (!configured) return panel("帳號與同步", "<p>跨裝置同步尚未啟用，等待雲端專案設定。</p><p>目前的訓練會儲存在這台裝置。</p>");
  const message = '<p role="status">' + esc(status) + '</p>';
  if (!user) return panel("帳號與同步", message +
    '<p>使用同一個 Email 登入，即可同步個人課表與訓練紀錄。</p>' +
    '<form data-form="account-login">' +
    field("Email", "email", "", "email", 'autocomplete="email" required') +
    field("密碼", "password", "", "password", 'autocomplete="current-password" minlength="8" required') +
    '<button value="login" class="primary">登入</button><button value="signup">註冊帳號</button><button value="reset" formnovalidate>忘記密碼</button></form>');
  let content = '<p>' + esc(user.email) + '</p>' + message +
    (lastSync ? '<p>上次同步 · ' + esc(dateTime(lastSync)) + '</p>' : '') +
    '<p>目前顯示此帳號在本機的資料。訪客紀錄可從下方帶入。</p>';
  if (recovery) content += form("account-password", field("新密碼", "password", "", "password", 'autocomplete="new-password" minlength="8" required'), "更新密碼");
  if (conflicts.length) {
    content += '<p>兩台裝置修改了相同資料。請先匯出本機 JSON 備份，再逐項選擇保留版本。</p><form data-form="account-conflicts">';
    conflicts.forEach((c, i) => {
      const finished = c.key.startsWith("finished/");
      content += '<label>' + esc(c.label) + '<select name="c' + i + '" required><option value="">選擇保留版本</option>' +
        '<option value="local">' + (finished ? '保留進行中草稿' : c.localDeleted ? '本機已刪除' : '保留本機版本') +
        '</option><option value="remote">' + (finished ? '保留已結束紀錄' : c.remoteDeleted ? '雲端已刪除' : '保留雲端版本') +
        '</option></select></label>';
    });
    content += '<button class="primary">確認合併並同步</button></form>';
  } else content += '<button data-act="account-sync"' + (busy ? ' disabled' : '') + '>立即同步</button>';
  content += btn("帶入本機訪客資料", "account-import") + btn("登出", "account-logout");
  return panel("帳號與同步", content);
}
