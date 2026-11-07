import { validate } from "./storage.js";

// Compare JSON values without depending on object key order.
export function equal(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length &&
    keys.every(k => Object.hasOwn(b, k) && equal(a[k], b[k]));
}

export function reconcile(base, local, remote, choices = {}) {
  validate(base); validate(local); validate(remote);
  const conflicts = [];
  function choose(key, before, here, there, label) {
    if (equal(here, there)) return here;
    if (equal(here, before)) return there;
    if (equal(there, before)) return here;
    if (choices[key] === "local") return here;
    if (choices[key] === "remote") return there;
    conflicts.push({ key, label, localDeleted: here === undefined, remoteDeleted: there === undefined });
    return here;
  }
  const merged = { version: 1 };
  for (const field of ["exercises", "plans", "history", "events"]) {
    const maps = [base, local, remote].map(s => new Map(s[field].map(x => [x.id, x])));
    merged[field] = [];
    const ids = new Set([...maps[0].keys(), ...maps[1].keys(), ...maps[2].keys()]);
    for (const id of ids) {
      const values = maps.map(m => m.get(id));
      const title = values[1]?.name || values[2]?.name || values[0]?.name || id;
      const labels = {exercises:"動作", plans:"課表", history:"訓練紀錄", events:"日曆"};
      const selected = choose(field + "/" + id, ...values, labels[field] + " · " + title);
      if (selected !== undefined) merged[field].push(selected);
    }
  }
  // Treat schedule fields together so a progress change cannot target another plan.
  const schedules = [base, local, remote].map(s => ({cycle:s.cycle, cursor:s.cursor, due:s.due}));
  Object.assign(merged, choose("schedule", ...schedules, "訓練循環與日期"));
  merged.settings = {};
  for (const key of Object.keys(base.settings))
    merged.settings[key] = choose("settings/" + key, base.settings[key], local.settings[key], remote.settings[key], "設定 · " + key);
  merged.active = choose("active", base.active, local.active, remote.active, "進行中的訓練");
  // A remote completion and a local continuation need an explicit choice.
  if (merged.active && merged.history.some(h => h.id === merged.active.id)) {
    const key = "finished/" + merged.active.id;
    if (choices[key] === "remote") merged.active = null;
    else if (choices[key] === "local") merged.history = merged.history.filter(h => h.id !== merged.active.id);
    else conflicts.push({key, label:"同一場訓練同時有草稿及已結束紀錄", localDeleted:false, remoteDeleted:false});
  }
  if (!conflicts.length) validate(merged);
  return { data: structuredClone(merged), conflicts };
}
