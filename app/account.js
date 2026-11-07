import { createCloud, configured, accountPanel, readCloud, writeCloud, cloudError } from "./cloud.js";
import { openDB, save, getSyncMetadata, validate, merge } from "./storage.js";
import { synchronize } from "./sync.js";
import { equal } from "./sync-merge.js";

export function createAccount({getState, setState, serialize, render, say}) {
  let client = null, user = null, starting = true, syncing = false, recovery = false;
  let status = "使用 Email 登入以啟用同步。", conflicts = [], conflictVersion, conflictSnapshot;
  let pendingTimer;
  function draw(force = false) {
    const host = document.querySelector("#account-panel");
    if (host && (force || !host.contains(document.activeElement))) host.innerHTML = view();
  }
  function view() {
    return accountPanel({user,status,busy:syncing,conflicts,lastSync:getSyncMetadata()?.lastSync,recovery});
  }
  function schedule(delay = 4000) {
    clearTimeout(pendingTimer);
    if (!user || conflicts.length) return;
    pendingTimer = setTimeout(() => {
      if (document.hidden) return;
      if (document.querySelector("#app")?.contains(document.activeElement)) { schedule(15000); return; }
      void sync();
    }, delay);
  }
  async function loadProfile(nextUser) {
    const data = await openDB(nextUser?.id || null);
    if (nextUser && !getSyncMetadata()) {
      await save(data, false, {base:structuredClone(data),remoteRevision:0,lastSync:0});
    }
    return data;
  }
  async function switchUser(nextUser) {
    if (user?.id === nextUser?.id) return;
    clearTimeout(pendingTimer);
    const next = await loadProfile(nextUser);
    user = nextUser;
    conflicts = [];
    setState(next);
    status = user ? "登入成功，正在準備同步。" : "已登出，目前顯示本機訪客資料。";
    location.hash = "settings";
    render();
    if (user) schedule(100);
  }
  async function open() {
    try {
      client = await createCloud((event, nextUser) => {
        if (event === "PASSWORD_RECOVERY") recovery = true;
        if (starting) return;
        void serialize(async () => {
          await switchUser(nextUser);
          if (recovery) { location.hash = "settings"; draw(); }
        });
      });
      if (client) {
        const {data,error} = await client.auth.getSession();
        if (error) throw error;
        user = data.session?.user || null;
      }
    } catch (e) { status = cloudError(e); }
    const next = await loadProfile(user);
    starting = false;
    if (user) schedule(1000);
    if (recovery) location.hash = "settings";
    return next;
  }
  async function sync(choices, expectedRemote) {
    return serialize(async () => {
      if (!user || !client || syncing) return;
      if (!navigator.onLine) { status = "離線中，資料已儲存，連線後同步。"; draw(); return; }
      const snapshot = structuredClone(getState());
      if (choices && JSON.stringify(snapshot) !== conflictSnapshot) {
        status = "本機資料已變更，請重新同步後再選擇版本。";
        conflicts = []; draw(); return;
      }
      syncing = true; status = "正在同步…"; draw();
      const app = document.querySelector("#app"), nav = document.querySelector("nav");
      if (app) app.inert = true;
      if (nav) nav.inert = true;
      try {
        const identity = user.id;
        const login = await client.auth.getSession();
        if (login.error) throw login.error;
        const token = login.data.session?.access_token;
        if (!token) throw Error("登入已到期，請重新登入。");
        const { data, error } = await client.auth.getUser(token);
        if (error) throw error;
        if (data.user?.id !== identity) throw Error("登入帳號已切換，請重新整理。");
        const result = await synchronize({
          local:snapshot, metadata:getSyncMetadata(),
          read:()=>readCloud(client,identity,token), write:(v,d)=>writeCloud(client,v,d,token),
          choices, expectedRemote,
        });
        if (result.conflicts.length) {
          conflicts = result.conflicts; conflictVersion = result.remoteRevision;
          conflictSnapshot = JSON.stringify(snapshot);
          status = "有 " + conflicts.length + " 項資料需要你選擇保留版本。";
        } else {
          if (!equal(snapshot, result.data) || getSyncMetadata().remoteRevision !== result.metadata.remoteRevision) {
            await save(result.data, false, result.metadata);
            setState(result.data);
            render();
          }
          conflicts = [];
          status = "已同步";
        }
      } catch (e) {
        status = cloudError(e);
        conflicts = [];
        schedule(30000);
      } finally {
        syncing = false;
        if (app) app.inert = false;
        if (nav) nav.inert = false;
        draw(true);
      }
    });
  }
  async function submit(action, data, submitter) {
    if (!client) { say("同步服務尚未設定。"); return; }
    if (action === "account-conflicts") {
      const choices = Object.fromEntries(conflicts.map((c,i)=>[c.key,data["c"+i]]));
      await sync(choices, conflictVersion);
      return;
    }
    try {
      let result;
      if (action === "account-password") {
        result = await client.auth.updateUser({password:data.password});
        if (!result.error) { recovery = false; status = "密碼已更新。"; }
      } else if (submitter === "reset") {
        if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw Error("請先填寫有效的 Email。");
        result = await client.auth.resetPasswordForEmail(data.email, {redirectTo:new URL("./", location.href).href});
        if (!result.error) status = "若此信箱已註冊，將收到密碼重設信。";
      } else if (submitter === "signup") {
        result = await client.auth.signUp({email:data.email,password:data.password,
          options:{emailRedirectTo:new URL("./", location.href).href}});
        if (!result.error) status = "請檢查信箱中的驗證信，完成驗證後登入。";
      } else {
        result = await client.auth.signInWithPassword({email:data.email,password:data.password});
        if (!result.error) status = "登入成功。";
      }
      if (result.error) throw result.error;
    } catch (e) { status = cloudError(e); }
    // Explicit submit has finished, so replacing the password form is intentional.
    document.activeElement?.blur();
    draw();
  }
  async function action(name) {
    if (name === "account-sync") { await sync(); return; }
    if (name === "account-logout") {
      if (!confirm("登出後將顯示訪客資料。尚未同步的帳號紀錄會保留在此裝置，重新登入後可再同步。")) return;
      const {error} = await client.auth.signOut({scope:"local"});
      if (error) say(cloudError(error));
      return;
    }
    if (name === "account-import" && user) {
      if (!confirm("將此裝置的訪客課表與紀錄合併到目前帳號？同 ID 項目保留帳號版本。")) return;
      await serialize(async () => {
        try {
          const guest = await readGuest();
          const next = merge(getState(), guest);
          await save(next);
          setState(next); render(); status = "已帶入訪客資料，等待同步。"; draw(); schedule();
        } catch (e) { say(cloudError(e)); }
      });
    }
  }
  function changed() {
    if (user) { status = navigator.onLine ? "已儲存於本機，等待同步。" : "離線中，資料已儲存。"; draw(); schedule(); }
  }
  window.addEventListener("online", () => schedule(500));
  window.addEventListener("offline", () => { if (user) {status="離線中，資料已儲存。";draw();} });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(1000); });
  setInterval(() => { if (!document.hidden) schedule(100); }, 60000);
  return {open,view,submit,action,changed,configured};
}

async function readGuest() {
  return new Promise((resolve,reject) => {
    const req = indexedDB.open("fitflow-local", 2);
    req.onupgradeneeded = () => {req.transaction.abort(); reject(Error("這台裝置沒有訪客資料。"));};
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction(["workspace","history"]);
      const meta = tx.objectStore("workspace").get("current"), rows = tx.objectStore("history").index("start").getAll();
      tx.oncomplete = () => {db.close();try {
        if (!meta.result) throw Error("這台裝置沒有已儲存的訪客紀錄。");
        resolve(validate({...meta.result.data,history:rows.result}));
      } catch(e) {reject(e)} };
      tx.onabort = () => {db.close();reject(tx.error)};
    };
  });
}
