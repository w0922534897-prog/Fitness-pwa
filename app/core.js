// @ts-check
/** @typedef {import('./types').Workspace} Workspace */
/** @typedef {import('./types').WorkoutSession} Session */
/** @typedef {import('./types').TimerState} TimerState */
import { day } from "./data.js";
export const uid = () => crypto.randomUUID();
/** @param {string} d */
export const tomorrow = (d) =>
  day(Date.parse(d + "T12:00:00+08:00") + 86400000);
/** @param {Workspace} s @param {string} date */
export function advance(s, date) {
  s.cursor = (s.cursor + 1) % s.cycle.length;
  s.due = tomorrow(date);
}
/** @param {number} kg @param {string} unit */
export const displayWeight = (kg, unit) =>
  unit === "lb" ? kg / 0.45359237 : kg;
/** @param {number} v @param {string} unit */
export const storeWeight = (v, unit) => (unit === "lb" ? v * 0.45359237 : v);
/** @param {number} seconds @returns {TimerState} */
export const timer = (seconds, now = Date.now()) => ({
  seconds,
  end: now + seconds * 1000,
  left: seconds,
  mode: "run",
});
/** @param {TimerState} t */
export const left = (t, now = Date.now()) =>
  t.mode === "run"
    ? Math.min(t.seconds, Math.max(0, Math.ceil((t.end - now) / 1000)))
    : t.left;
/** @param {TimerState} t @param {number} [now] */
export function pause(t, now) {
  t.left = left(t, now);
  t.mode = "pause";
}
/** @param {TimerState} t */
export function resume(t, now = Date.now()) {
  t.end = now + t.left * 1000;
  t.mode = "run";
}
/** @param {number} kg @param {number} reps @returns {import('./types').CompletedSet} */
export const newSet = (kg, reps) => ({
  kg,
  reps,
  right: reps,
  status: "待做",
  at: 0,
  rir: "",
  note: "",
});
/** @param {Workspace} s @param {import('./types').WorkoutPlan} p */
export function start(s, p, now = Date.now()) {
  if (s.active || !p.items.length)
    throw Error("請先處理草稿，並確認課表包含動作。");
  s.active = {
    id: uid(),
    plan: p.id,
    name: p.name,
    start: now,
    end: 0,
    paused: 0,
    pauseAt: 0,
    index: 0,
    note: "",
    status: "進行中",
    timer: null,
    items: p.items.map((item) => {
      const source = s.exercises.find((x) => x.id === item.id);
      if (!source) throw Error("找不到此課表動作。");
      const e = { ...source, ...item };
      const priorSets = s.settings.carry
        ? previous(s, e, now)?.logs.filter((log) => log.status === "完成")
        : undefined;
      return {
        e,
        logs: Array.from({ length: e.sets }, (_, i) => {
          const last = priorSets?.[i];
          return last
            ? { ...newSet(last.kg, last.reps), right: last.right }
            : newSet(e.kg, e.min);
        }),
      };
    }),
  };
}
/** @param {Workspace} s @param {import('./types').Exercise} e */
export function previous(s, e, before = Infinity) {
  let latest = -Infinity;
  let result;
  for (const h of s.history) {
    if (h.start >= before || h.start <= latest) continue;
    const match = h.items.find((i) => i.e.id === e.id && i.e.load === e.load &&
      i.e.side === e.side && i.e.timed === e.timed && i.logs.some((l) => l.status === "完成"));
    if (match) {
      latest = h.start;
      result = match;
    }
  }
  return result;
}
/** @param {Session} h */
export const completed = (h) =>
  h.items.flatMap((i) => i.logs.filter((l) => l.status === "完成"));
/** @param {Session} h */
export const duration = (h, now = Date.now()) =>
  Math.max(0, (h.end || h.pauseAt || now) - h.start - h.paused);
/** @param {Workspace} s @param {'完成'|'未完成'} status */
export function finish(s, status, now = Date.now()) {
  const h = s.active;
  if (!h) return;
  if (status === "完成" && !completed(h).length)
    throw Error("請先完成至少一組，或儲存為未完成紀錄。");
  if (h.pauseAt) h.paused += now - h.pauseAt;
  Object.assign(h, { end: now, pauseAt: 0, status, timer: null });
  s.history.push(h);
  s.active = null;
  if (status === "完成" && h.plan === s.cycle[s.cursor]) advance(s, day(now));
}
/** @param {import('./types').Exercise} e @param {import('./types').CompletedSet} l */
export function volume(e, l) {
  if (e.timed || !l.kg || l.status !== "完成") return 0;
  return (
    l.kg * (e.side ? l.reps + l.right : l.reps) * (e.load === "雙鈴" ? 2 : 1)
  );
}
/** @param {Workspace} s @param {import('./types').Exercise} e */
export function advice(s, e) {
  const entries = s.history
    .filter((h) => h.status === "完成")
    .sort((a, b) => b.start - a.start)
    .flatMap((h) => {
      const i = h.items.find(
        (i) =>
          i.e.id === e.id &&
          i.e.timed === e.timed &&
          i.e.side === e.side &&
          i.e.load === e.load,
      );
      return i ? [{ ...i, date: h.start }] : [];
    });
  if (!entries.length) return "先以可控制的重量建立第一筆紀錄。";
  const last = entries[0],
    logs = last.logs.filter((l) => l.status === "完成");
  e = last.e;
  if (!logs.length) return "先建立完整的組數紀錄。";
  if (Date.now() - last.date > 14 * 86400000)
    return "距上次已超過兩週，可先減少組數，重新熟悉動作。";
  if (
    logs.some(
      (l) =>
        l.rir === "0" || Math.min(l.reps, e.side ? l.right : l.reps) < e.min,
    )
  )
    return "可維持或減輕負荷，必要時增加恢復日。";
  const series = entries.slice(0, s.settings.streak);
  if (
    series.length === s.settings.streak &&
    series.every(
      (i) =>
        i.logs.filter(
          (l) =>
            l.status === "完成" &&
            l.kg === e.kg &&
            l.reps >= e.max &&
            (!e.side || l.right >= e.max) &&
            l.rir !== "0",
        ).length >= e.sets,
    )
  )
    return e.load === "徒手"
      ? "若動作品質穩定，可評估下一階變式。"
      : "若動作品質良好且仍有餘力，可評估增加 " +
          s.settings.step +
          " kg，再從區間下限開始。";
  return "維持可控制的重量，有餘力時逐步增加" + (e.timed ? "秒數。" : "次數。");
}
/** @param {Workspace} s */
export function csv(s) {
  /** @type {(string|number)[][]} */
  const rows = [
    [
      "日期",
      "課表",
      "狀態",
      "動作",
      "組",
      "每支重量 kg",
      "計量",
      "次數或左側",
      "右側",
      "組狀態",
      "完成時間",
      "RIR",
      "備註",
    ],
  ];
  for (const h of s.history)
    for (const { e, logs } of h.items)
      logs.forEach((l, i) =>
        rows.push([
          day(h.start),
          h.name,
          h.status,
          e.name,
          i + 1,
          l.kg,
          e.timed ? "秒" : "次",
          l.reps,
          e.side ? l.right : "",
          l.status,
          l.at ? new Date(l.at).toISOString() : "",
          l.rir,
          l.note,
        ]),
      );
  return (
    "\uFEFF" +
    rows
      .map((r) =>
        r
          .map(
            (v) =>
              '"' +
              String(v)
                .replace(/^[\s]*[=+@-]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n")
  );
}
/** @param {Workspace} s */
export const backup = (s) => ({
  app: "FitFlow",
  appVersion: "1.0.0",
  schemaVersion: 1,
  exportedAt: new Date().toISOString(),
  data: s,
});
