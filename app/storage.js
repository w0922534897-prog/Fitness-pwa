import { initial, exercises } from "./data.js";
const ok = (v) => {
  if (!v) throw Error("資料欄位、參照或版本不相容。");
};
const str = (v) => typeof v === "string" && v.length <= 10000;
const num = (v, max = 1e15) => Number.isFinite(v) && v >= 0 && v <= max;
const int = (v, max, min = 0) => Number.isInteger(v) && v >= min && v <= max;
const list = (v, max) => Array.isArray(v) && v.length <= max;
const unique = (a) => new Set(a).size === a.length;
const date = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().startsWith(v);
function item(e) {
  ok(
    e &&
      str(e.id) &&
      e.id.length &&
      num(e.kg, 2000) &&
      int(e.sets, 100, 1) &&
      int(e.min, 10000, 1) &&
      int(e.max, 10000, e.min) &&
      int(e.rest, 86400, 1),
  );
}
function exercise(e) {
  item(e);
  ok(
    [
      "name",
      "en",
      "muscle",
      "secondary",
      "start",
      "action",
      "safety",
      "alternative",
    ].every((k) => str(e[k])) &&
      e.name.trim() &&
      ["單鈴", "雙鈴", "徒手"].includes(e.load) &&
      typeof e.side === "boolean" &&
      typeof e.timed === "boolean" &&
      (e.demo === "" || exercises.some((x) => x.id === e.demo)),
  );
}
function session(h, active) {
  ok(
    h &&
      str(h.id) &&
      h.id &&
      str(h.name) &&
      str(h.plan) &&
      num(h.start) &&
      num(h.end) &&
      num(h.pauseAt) &&
      num(h.paused) &&
      str(h.note) &&
      list(h.items, 500) &&
      int(h.index, h.items.length - 1) &&
      (active
        ? h.status === "進行中" && h.end === 0
        : ["完成", "未完成"].includes(h.status) && h.end >= h.start),
  );
  for (const i of h.items) {
    exercise(i.e);
    ok(list(i.logs, 500));
    for (const l of i.logs)
      ok(
        num(l.kg, 2000) &&
          int(l.reps, 10000) &&
          int(l.right, 10000) &&
          ["待做", "完成", "跳過"].includes(l.status) &&
          num(l.at) &&
          str(l.note) &&
          (l.rir === "" || /^(?:[0-9]|10)$/.test(l.rir)),
      );
  }
  if (h.timer !== null) {
    const t = h.timer;
    ok(
      t &&
        num(t.seconds, 86400) &&
        num(t.end) &&
        num(t.left, t.seconds) &&
        ["run", "pause", "done", "idle"].includes(t.mode),
    );
  }
}
export function validate(s) {
  ok(
    s &&
      s.version === 1 &&
      list(s.exercises, 5000) &&
      list(s.plans, 1000) &&
      list(s.history, 100000) &&
      list(s.events, 100000) &&
      list(s.cycle, 4) &&
      s.cycle.length === 4 &&
      s.cycle[3] === "rest" &&
      int(s.cursor, 3) &&
      date(s.due),
  );
  s.exercises.forEach(exercise);
  ok(unique(s.exercises.map((e) => e.id)));
  const ids = new Set(s.exercises.map((e) => e.id));
  for (const p of s.plans) {
    ok(
      str(p.id) &&
        p.id &&
        p.id !== "rest" &&
        str(p.name) &&
        p.name.trim() &&
        list(p.items, 500),
    );
    for (const i of p.items) {
      item(i);
      ok(ids.has(i.id));
    }
  }
  ok(
    unique(s.plans.map((p) => p.id)) &&
      s.cycle.slice(0, 3).every((id) => s.plans.some((p) => p.id === id)),
  );
  s.history.forEach((h) => session(h, false));
  if (s.active !== null) session(s.active, true);
  ok(unique([...s.history, ...(s.active ? [s.active] : [])].map((h) => h.id)));
  for (const ev of s.events) ok(str(ev.id) && date(ev.date) && str(ev.label));
  const q = s.settings;
  ok(
    q &&
      ["system", "dark", "light"].includes(q.theme) &&
      ["kg", "lb"].includes(q.unit) &&
      ["reduce", "auto", "sound", "rir", "carry"].every(
        (k) => typeof q[k] === "boolean",
      ) &&
      int(q.rest, 86400, 1) &&
      int(q.streak, 10, 2) &&
      num(q.step, 100) &&
      q.step > 0,
  );
  return s;
}
export function parseBackup(raw) {
  const b = JSON.parse(raw);
  ok(
    b.app === "FitFlow" &&
      b.schemaVersion === 1 &&
      str(b.appVersion) &&
      Number.isFinite(Date.parse(b.exportedAt)),
  );
  return validate(b.data);
}
export function merge(local, incoming) {
  const s = structuredClone(local);
  for (const k of ["exercises", "plans", "history", "events"]) {
    const ids = new Set(s[k].map((x) => x.id));
    for (const x of incoming[k])
      if (!ids.has(x.id) && !(k === "history" && s.active?.id === x.id)) {
        s[k].push(x);
        ids.add(x.id);
      }
  }
  if (
    !s.active &&
    incoming.active &&
    !s.history.some((h) => h.id === incoming.active.id)
  )
    s.active = incoming.active;
  return validate(s);
}
let db,
  revision = 0,
  archived = new Map();
export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("fitflow-local", 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("workspace"))
        req.result.createObjectStore("workspace");
      const history = req.result.createObjectStore("history", {
        keyPath: "id",
      });
      history.createIndex("start", "start");
      history.createIndex("plan", "plan");
      const meta = req.transaction.objectStore("workspace"),
        r = meta.get("current");
      r.onsuccess = () => {
        if (!r.result) return;
        const { data, revision } = r.result;
        try {
          validate(data);
          for (const h of data.history) history.put(h);
          meta.put({ revision, data: { ...data, history: [] } }, "current");
        } catch {
          req.transaction.abort();
        }
      };
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(Error("請關閉其他 FitFlow 分頁。"));
    req.onsuccess = () => {
      db = req.result;
      db.onversionchange = () => db.close();
      const tx = db.transaction(["workspace", "history"]),
        r = tx.objectStore("workspace").get("current"),
        rows = tx.objectStore("history").index("start").getAll();
      tx.onabort = () => reject(tx.error);
      tx.oncomplete = () => {
        try {
          revision = r.result?.revision || 0;
          archived = new Map(rows.result.map((h) => [h.id, JSON.stringify(h)]));
          resolve(
            r.result
              ? validate({ ...r.result.data, history: rows.result })
              : initial(),
          );
        } catch (e) {
          reject(e);
        }
      };
    };
  });
}
export function save(s) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["workspace", "history"], "readwrite"),
      store = tx.objectStore("workspace"),
      history = tx.objectStore("history"),
      r = store.get("current");
    let conflict = false;
    const next = new Map();
    r.onsuccess = () => {
      if ((r.result?.revision || 0) !== revision) {
        conflict = true;
        tx.abort();
        return;
      }
      for (const h of s.history) {
        const json = JSON.stringify(h);
        next.set(h.id, json);
        if (archived.get(h.id) !== json) history.put(h);
      }
      for (const id of archived.keys()) if (!next.has(id)) history.delete(id);
      store.put(
        { revision: revision + 1, data: { ...s, history: [] } },
        "current",
      );
    };
    tx.oncomplete = () => {
      revision++;
      archived = next;
      resolve();
    };
    tx.onabort = () =>
      reject(
        conflict
          ? Error("另一個分頁已更新資料，請重新整理。")
          : tx.error || Error("儲存失敗，請檢查裝置空間。"),
      );
  });
}
