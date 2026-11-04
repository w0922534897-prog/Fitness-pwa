import test from "node:test";
import assert from "node:assert/strict";
import { initial, day, exercises } from "../app/data.js";
import {
  advance,
  start,
  finish,
  completed,
  volume,
  displayWeight,
  storeWeight,
  backup,
  csv,
  timer,
  left,
  pause,
  resume,
  advice,
} from "../app/core.js";
import { parseBackup, merge, validate } from "../app/storage.js";
import { drawing, demoIds } from "../app/demo.js";
test("三練一休與手動進度、跨午夜", () => {
  const s = initial();
  for (let i = 0; i < 4; i++) {
    assert.equal(s.cursor, i);
    advance(s, "2026-12-31");
  }
  assert.equal(s.cursor, 0);
  assert.equal(s.due, "2027-01-01");
  s.cursor = 2;
  assert.equal(s.cycle[s.cursor], "legs");
  assert.equal(day(Date.parse("2026-12-31T16:01Z")), "2027-01-01");
});
test("倒數時間戳、暫停、恢復、鎖屏與時鐘倒退", () => {
  let t = timer(90, 100000);
  assert.equal(left(t, 130000), 60);
  pause(t, 140000);
  assert.equal(left(t, 160000), 50);
  resume(t, 200000);
  assert.equal(left(t, 222000), 28);
  assert.equal(left(t, 400000), 0);
  assert.equal(left(t, 0), 90);
});
test("課表快照、單側、歷史、重量與訓練量", () => {
  const s = initial();
  s.cursor = 1;
  start(s, s.plans[1], 1000);
  assert.throws(() => start(s, s.plans[1]));
  const { e, logs } = s.active.items[0];
  Object.assign(logs[0], { status: "完成", reps: 10, right: 8, at: 2000 });
  assert.equal(volume(e, logs[0]), 90);
  assert.equal(volume({ ...e, side: false, load: "雙鈴" }, logs[0]), 100);
  assert.equal(volume({ ...e, timed: true }, logs[0]), 0);
  finish(s, "完成", 3000);
  s.plans[1].items[0].kg = 9;
  assert.equal(e.kg, 5);
  assert.equal(completed(s.history[0]).length, 1);
  assert.equal(s.cursor, 2);
  assert.equal(storeWeight(displayWeight(5, "lb"), "lb"), 5);
  validate(s);
});
test("備份驗證、合併去重、拒絕破損及未知版本", () => {
  const s = initial();
  start(s, s.plans[0]);
  const b = backup(s);
  assert.deepEqual(parseBackup(JSON.stringify(b)), s);
  assert.deepEqual(merge(s, s), s);
  assert.throws(() => parseBackup("{"));
  assert.throws(() => parseBackup(JSON.stringify({ ...b, schemaVersion: 2 })));
  s.active.items[0].logs[0].kg = -1;
  assert.throws(() => validate(s));
});
test("雙重漸進需要多次真實上限紀錄", () => {
  const s = initial();
  for (let n = 0; n < 2; n++) {
    start(s, s.plans[0]);
    const i = s.active.items[0];
    for (const l of i.logs)
      Object.assign(l, { status: "完成", reps: 20, rir: "2" });
    finish(s, "完成");
  }
  assert.match(advice(s, exercises[0]), /增加 0.5 kg/);
  assert.match(csv(s), /啞鈴臥推/);
});
test("十五種獨立姿勢與起終點，無外部媒體", () => {
  assert.equal(demoIds.length, 15);
  assert.equal(
    new Set(demoIds.map((id) => drawing(id, 0) + drawing(id, 1))).size,
    15,
  );
  for (const id of demoIds) {
    assert.notEqual(drawing(id, 0), drawing(id, 1));
    assert.doesNotMatch(drawing(id, 0.5), /NaN|undefined|http/);
  }
});
test("切換動作計量後只帶入相容的舊紀錄", () => {
  const s = initial(), plan = s.plans[0], e = s.exercises[0];
  start(s, plan, 1000);
  Object.assign(s.active.items[0].logs[0], {status:"完成", reps:19, kg:7, at:1500});
  finish(s, "完成", 2000);
  e.timed = true;
  start(s, plan, 3000);
  assert.equal(s.active.items[0].logs[0].reps, e.min);
  Object.assign(s.active.items[0].logs[0], {status:"完成", reps:60, at:3500});
  finish(s, "完成", 4000);
  e.timed = false;
  start(s, plan, 5000);
  assert.equal(s.active.items[0].logs[0].reps, 19);
  assert.equal(s.active.items[0].logs[0].kg, 7);
});
