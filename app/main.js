import { initial, plans, prescription, day } from "./data.js";
import {
  advance,
  start,
  finish,
  timer,
  left,
  pause,
  resume,
  newSet,
  storeWeight,
  displayWeight,
  completed,
  duration,
  backup,
  csv,
  uid,
  tomorrow,
} from "./core.js";
import { openDB, save, validate, parseBackup, merge } from "./storage.js";
import {
  home,
  pages,
  plansView,
  workout,
  library,
  settings,
  historyView,
} from "./views.js";
import { stats } from "./stats.js";
import { esc, btn, clock, fmt } from "./ui.js";
import { stopDemo, playDemo } from "./demo.js";
import { createAccount } from "./account.js";
const app = document.querySelector("#app"),
  notice = document.querySelector("#notice");
let state,
  route,
  id,
  recordIndex = 0,
  queue = Promise.resolve(),
  pending = null,
  filter = {},
  histFilter = {},
  statsFilter = {},
  alerted = "",
  sw,
  ctx;
const say = (t) => {
  notice.textContent = t;
};
const go = (path) => {
  if (location.hash === "#" + path) render();
  else location.hash = path;
};
const selectedPlan = () => state.plans.find((p) => p.id === id);
const session = () =>
  route === "record" ? state.history.find((h) => h.id === id) : state.active;
const currentIndex = () =>
  route === "record" ? recordIndex : state.active.index;
const item = () => session().items[currentIndex()];
const account = createAccount({
  getState: () => state, setState: value => { state = value; },
  serialize, render, say,
});
function render() {
  stopDemo();
  if (!state) return;
  [route, id] = location.hash.slice(1).split("/").map(decodeURIComponent);
  route = route || "home";
  app.classList.toggle("active-workout", route === "active" && !!state.active);
  app.dataset.page = route;
  const q = state.settings;
  document.documentElement.dataset.theme =
    q.theme === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : q.theme;
  const views = {
    home: () => home(state),
    plans: () => plansView(state, id),
    active: () => workout(state, state.active),
    library: () => library(state, id, filter.q, filter.muscle),
    settings: () => settings(state),
    history: () => historyView(state, histFilter),
    record: () => workout(state, session(), true, recordIndex),
    stats: () => stats(state, statsFilter),
  };
  app.innerHTML = (views[route] || views.home)();
  if (route === "settings") {
    const host = document.createElement("div");
    host.id = "account-panel";
    host.innerHTML = account.view();
    app.insertBefore(host, app.querySelector("section"));
  }
  if (route === "active" && state.active?.pauseAt)
    for (const el of app.querySelectorAll(
      "form:not([data-form=sessionnote]) input,form:not([data-form=sessionnote]) button,form select,button[data-act=timer],button[data-act=addset],button[data-act=skipex]",
    ))
      el.disabled = true;
  document.querySelector("nav").innerHTML = Object.entries(pages)
    .map(
      ([k, t]) =>
        '<a href="#' +
        k +
        '" ' +
        ((route === "record" ? "history" : route) === k
          ? 'aria-current="page"'
          : "") +
        ">" +
        t +
        "</a>",
    )
    .join("");
  if (document.querySelector("#loop")) playDemo(true);
  tick();
}
function serialize(fn) {
  queue = queue.then(fn).catch((e) => say(e.message || String(e)));
  return queue;
}
function change(fn, after = render, draftId = null) {
  return serialize(async () => {
    if (draftId && (route !== "active" || state.active?.id !== draftId))
      throw Error("訓練畫面已切換，請確認本組紀錄。");
    const old = structuredClone(draftId ? state.active : state);
    let result;
    try {
      result = fn();
      if (!draftId) validate(state);
      await save(state, !!draftId);
    } catch (e) {
      if (draftId) state.active = old;
      else state = old;
      render();
      throw e;
    }
    after?.(result);
    account.changed();
  });
}
let lastWall = Date.now(),
  lastMono = performance.now(),
  repairingClock = false;
function tick() {
  const now = Date.now(),
    mono = performance.now(),
    backward = mono - lastMono - (now - lastWall) > 2000;
  const previousTime = lastWall;
  lastWall = now;
  lastMono = mono;
  const h = state?.active;
  if (!h) return;
  if (
    h.timer?.mode === "run" &&
    !repairingClock &&
    (backward || h.timer.end - now > h.timer.seconds * 1000 + 1000)
  ) {
    const originalEnd = h.timer.end,
      remaining = left(h.timer, backward ? previousTime : now);
    repairingClock = true;
    change(() => {
      const t = state.active?.timer;
      if (t?.mode === "run" && t.end === originalEnd)
        t.end = Date.now() + remaining * 1000;
    }, tick).finally(() => {
      repairingClock = false;
    });
  }
  const t = h.timer,
    n = t ? left(t) : h.items[h.index].e.rest;
  if (route === "active") {
    const dock = document.querySelector("#rest-dock");
    if (dock) {
      dock.hidden = !t || t.mode === "idle";
      document.querySelector("#dock-time").textContent = clock(n);
      document.querySelector("#dock-status").textContent =
        t?.mode === "pause" ? "休息已暫停" : n === 0 ? "休息結束" : "組間休息";
    }
    const el = document.querySelector("#remaining");
    if (el) {
      el.textContent = clock(n);
      document
        .querySelector("#ring")
        .style.setProperty(
          "--pct",
          (t?.seconds ? (100 * n) / t.seconds : 100) + "%",
        );
      document.querySelector("#timerstatus").textContent =
        { run: "倒數中", pause: "已暫停", done: "休息結束", idle: "準備開始" }[
          t?.mode
        ] || "準備開始";
      document.querySelector("#elapsed").textContent = clock(
        duration(h) / 1000,
      );
    }
  }
  if (t?.mode === "run" && n === 0 && alerted !== h.id + ":" + t.end) {
    alerted = h.id + ":" + t.end;
    const end = t.end;
    change(
      () => {
        const current = state.active?.timer;
        if (current?.mode === "run" && current.end === end) {
          current.mode = "done";
          current.left = 0;
        }
      },
      () => {
        say("休息結束，可以準備下一組。");
        tick();
        try {
          navigator.vibrate?.(180);
          if (state.settings.sound && ctx) {
            const o = ctx.createOscillator(),
              g = ctx.createGain();
            g.gain.value = 0.08;
            o.connect(g);
            g.connect(ctx.destination);
            o.start();
            o.stop(ctx.currentTime + 0.22);
          }
        } catch {
          /* Visual feedback remains available. */
        }
      },
    );
  }
}
function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function timerAction(n) {
  const h = state.active,
    seconds = h.timer?.seconds || item().e.rest;
  let t = h.timer;
  if (!t) {
    t = timer(seconds);
    t.mode = "idle";
    h.timer = t;
  }
  if (n === 0) h.timer = timer(seconds);
  if (n === 1 && t.mode === "run") pause(t);
  if (n === 2 && t.mode === "pause") resume(t);
  if (n === 3) {
    t.mode = "idle";
    t.left = t.seconds;
  }
  if (n === 4) {
    t.mode = "done";
    t.left = 0;
  }
  if (n === 5 || n === 6) {
    const remain = left(t),
      delta = n === 5 ? 15 : -15;
    t.left = Math.max(0, Math.min(86400, remain + delta));
    t.seconds = Math.max(1, t.left, Math.min(86400, t.seconds + delta));
    if (t.mode === "run") resume(t);
    else t.mode = t.left ? "pause" : "done";
  }
}
function finishAction(status) {
  const h = state.active;
  if (!h || !confirm("將本次訓練儲存為「" + status + "」？")) return;
  const previous = state.history.filter((x) => x.plan === h.plan).at(-1),
    diff = previous ? completed(h).length - completed(previous).length : null;
  change(
    () => finish(state, status),
    () => {
      go("record/" + encodeURIComponent(h.id));
      say(
        "已保存 " +
          h.name +
          " · " +
          h.items.filter((i) => i.logs.some((l) => l.status === "完成"))
            .length +
          " 個動作 · " +
          completed(h).length +
          " 組 · " +
          clock(duration(h) / 1000) +
          (diff !== null
            ? " · 比上次 " + (diff > 0 ? "+" : "") + diff + " 組"
            : ""),
      );
    },
  );
}
app.addEventListener("click", (ev) => {
  const b = ev.target.closest("button");
  if (!b) return;
  if (b.dataset.ui) {
    if (b.dataset.ui === "timer" || b.dataset.ui === "next") {
      const target = b.dataset.ui === "timer"
        ? document.querySelector("#ring")?.closest("section")
        : document.querySelector('form[data-form="log"][data-status="待做"]') ||
          document.querySelector('form[data-form="switch"]');
      if (target) {
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: "center", behavior: "instant" });
      }
      return;
    }
    playDemo(b.dataset.ui === "replay");
    return;
  }
  const act = b.dataset.act;
  if (!act) return;
  ev.preventDefault();
  if (act.startsWith("account-")) { void account.action(act).catch(e => say(e.message)); return; }
  const arg = b.dataset.arg,
    n = Number(arg),
    today = day(Date.now());
  if (act === "finish" || act === "partial") {
    finishAction(act === "finish" ? "完成" : "未完成");
    return;
  }
  if (act === "json" || act === "csv") {
    serialize(() =>
      download(
        "FitFlow-" + today + "." + act,
        act === "json" ? JSON.stringify(backup(state), null, 2) : csv(state),
        act === "json" ? "application/json" : "text/csv;charset=utf-8",
      ),
    );
    return;
  }
  if (act === "draft") {
    go("home");
    return;
  }
  if (act === "cancelimport") {
    pending = null;
    render();
    return;
  }
  if (
    [
      "discard",
      "delhistory",
      "resetplans",
      "replace",
      "merge",
      "removeitem",
    ].includes(act) &&
    !confirm(
      {
        discard: "放棄整筆草稿？取消可保留。",
        delhistory: "確定刪除此訓練紀錄？",
        resetplans: "重設三份內建課表？自訂課表與歷史會保留。",
        replace: "取代本機全部資料？建議先匯出備份。",
        merge: "合併備份？相同 ID 保留本機版本。",
        removeitem: "從課表移除此動作？",
      }[act],
    )
  )
    return;
  let dest = "";
  change(
    () => {
      const h = state.active,
        p = selectedPlan();
      switch (act) {
        case "start":
          start(
            state,
            state.plans.find((x) => x.id === arg),
          );
          dest = "active";
          break;
        case "delay":
          state.events.push({
            id: uid(),
            date: today,
            label: "手動延後／額外休息",
          });
          state.due = tomorrow(state.due > today ? state.due : today);
          break;
        case "restday":
          state.events.push({ id: uid(), date: today, label: "休息日" });
          advance(state, today);
          break;
        case "resetplans":
          for (const p of structuredClone(plans)) {
            const i = state.plans.findIndex((x) => x.id === p.id);
            if (i < 0) state.plans.push(p);
            else state.plans[i] = p;
          }
          break;
        case "copy": {
          const copy = structuredClone(p);
          copy.id = uid();
          copy.name += " 副本";
          state.plans.push(copy);
          dest = "plans/" + copy.id;
          break;
        }
        case "up":
        case "down": {
          const j = n + (act === "up" ? -1 : 1);
          if (j >= 0 && j < p.items.length)
            [p.items[n], p.items[j]] = [p.items[j], p.items[n]];
          break;
        }
        case "removeitem":
          p.items.splice(n, 1);
          break;
        case "discard":
          state.active = null;
          dest = "home";
          break;
        case "delhistory":
          state.history = state.history.filter((h) => h.id !== arg);
          dest = "history";
          break;
        case "timer":
          timerAction(n);
          break;
        case "pausework":
          if (h.pauseAt) {
            h.paused += Date.now() - h.pauseAt;
            h.pauseAt = 0;
          } else {
            h.pauseAt = Date.now();
            if (h.timer?.mode === "run") pause(h.timer);
          }
          break;
        case "addset": {
          const i = item();
          i.logs.push(newSet(i.logs.at(-1)?.kg ?? i.e.kg, i.e.min));
          break;
        }
        case "skipex":
          for (const l of item().logs)
            if (l.status === "待做") l.status = "跳過";
          h.index = Math.min(h.items.length - 1, h.index + 1);
          break;
        case "merge":
        case "replace":
          if (!pending) throw Error("請重新選擇備份。");
          state =
            act === "merge" ? merge(state, pending) : structuredClone(pending);
          break;
        default:
          throw Error("未知操作。");
      }
    },
    () => {
      if (act === "merge" || act === "replace") pending = null;
      say("已儲存");
      if (dest) go(dest);
      else render();
    },
  );
});
function getForm(f) {
  const d = Object.fromEntries(new FormData(f));
  if (f.elements.kg) {
    const input = f.elements.kg,
      k = Number(input.dataset.kg);
    d.kg =
      Number(d.kg) === fmt(displayWeight(k, state.settings.unit))
        ? k
        : storeWeight(Number(d.kg), state.settings.unit);
  }
  return d;
}
function updateLog(l, d) {
  Object.assign(l, {
    kg: d.kg,
    reps: Number(d.reps),
    right: Number(d.right ?? d.reps),
    rir: d.rir ?? l.rir,
    note: d.note,
  });
}
app.addEventListener("change", async (ev) => {
  const el = ev.target;
  if (el.id === "backupfile") {
    pending = null;
    document.querySelector("#preview").textContent = "";
    try {
      const f = el.files[0];
      if (!f) return;
      if (f.size > 64 * 1024 * 1024) throw Error("備份超過 64 MiB。");
      pending = parseBackup(await f.text());
      document.querySelector("#preview").innerHTML =
        "<p>" +
        pending.plans.length +
        " 份課表 · " +
        pending.exercises.length +
        " 個動作 · " +
        pending.history.length +
        " 筆紀錄 · " +
        (pending.active ? "含草稿" : "無草稿") +
        "</p>" +
        btn("合併", "merge") +
        btn("取代", "replace") +
        btn("取消", "cancelimport");
    } catch (e) {
      say("讀取失敗：" + e.message);
    }
    return;
  }
  const f = el.closest("form");
  if (f?.dataset.form === "log" && f.checkValidity()) {
    const d = getForm(f),
      h = session(),
      i = item(),
      n = +f.dataset.n;
    change(
      () => {
        if (session() !== h || !h.items.includes(i)) throw Error("紀錄已變更。");
        updateLog(i.logs[n], d);
      },
      () => say("本組輸入已保存"),
      route === "active" ? h.id : null,
    );
  }
});
app.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = ev.target,
    d = getForm(f),
    action = f.dataset.form,
    n = Number(f.dataset.n),
    submit = ev.submitter?.value;
  if (action.startsWith("account-")) { void account.submit(action, d, submit).catch(e => say(e.message)); return; }
  if (action === "search") {
    filter = d;
    render();
    return;
  }
  if (action === "historyfilter") {
    histFilter = d;
    render();
    return;
  }
  if (action === "stats") {
    statsFilter = d;
    render();
    return;
  }
  if (action === "switch" && route === "record") {
    recordIndex = +d.index;
    render();
    return;
  }
  let dest = "",
    feedback = "已儲存";
  change(
    () => {
      const p = selectedPlan(),
        h = session(),
        q = state.settings;
      const rx = () => ({
        kg: d.kg,
        sets: +d.sets,
        min: +d.min,
        max: +d.max,
        rest: +d.rest,
      });
      switch (action) {
        case "newplan": {
          const id = uid();
          state.plans.push({ id, name: d.name.trim(), items: [] });
          dest = "plans/" + id;
          break;
        }
        case "rename":
          p.name = d.name.trim();
          break;
        case "additem":
          p.items.push(
            prescription(state.exercises.find((e) => e.id === d.id)),
          );
          break;
        case "prescription":
          p.items[+d.index] = { id: d.id, ...rx() };
          break;
        case "exercise": {
          const old = state.exercises.find((e) => e.id === id),
            x = {
              ...d,
              ...rx(),
              side: !!d.side,
              timed: !!d.timed,
              id: old?.id || uid(),
              demo: old?.demo || "",
            };
          if (old) Object.assign(old, x);
          else state.exercises.push(x);
          dest = "library/" + encodeURIComponent(x.id);
          break;
        }
        case "switch":
          h.index = +d.index;
          break;
        case "customtimer":
          h.timer = timer(+d.seconds);
          break;
        case "sessionnote":
          h.note = d.note;
          break;
        case "log": {
          const i = item(),
            l = i.logs[n];
          if (submit === "delete") {
            if (l.status !== "完成") i.logs.splice(n, 1);
            break;
          }
          updateLog(l, d);
          if (submit === "skip") {
            l.status = "跳過";
            l.at = 0;
            break;
          }
          if (l.reps < 1 || (i.e.side && l.right < 1))
            throw Error("完成組需填入正數。");
          const was = l.status === "完成";
          l.status = "完成";
          if (!was) {
            l.at = route === "record" ? h.end : Date.now();
            if (route === "active") {
              if (q.auto) h.timer = timer(i.e.rest);
              const earlier = state.history
                .flatMap((x) => x.items)
                .filter(
                  (x) =>
                    x.e.id === i.e.id &&
                    x.e.side === i.e.side &&
                    x.e.timed === i.e.timed &&
                    x.e.load === i.e.load,
                )
                .flatMap((x) => x.logs)
                .filter((a) => a.status === "完成");
              if (earlier.length && earlier.every((a) => a.kg < l.kg))
                feedback = "已儲存 · 此動作創下個人最高重量";
              else {
                const same = earlier.filter((a) => a.kg === l.kg),
                  score = (a) =>
                    i.e.side ? Math.min(a.reps, a.right) : a.reps;
                if (same.length && same.every((a) => score(a) < score(l)))
                  feedback = "已儲存 · 此重量創下個人最佳表現";
              }
            }
          }
          break;
        }
        case "settings":
          Object.assign(q, {
            theme: d.theme,
            unit: d.unit,
            rest: +d.rest,
            step: +d.step,
            streak: +d.streak,
          });
          for (const k of ["reduce", "sound", "auto", "carry", "rir"])
            q[k] = !!d[k];
          break;
        case "cycle":
          state.cycle = [d.day0, d.day1, d.day2, "rest"];
          state.cursor = +d.cursor;
          state.due = d.due;
          state.events.push({
            id: uid(),
            date: day(Date.now()),
            label: "手動調整進度",
          });
          break;
        default:
          throw Error("未知表單。");
      }
    },
    () => {
      say(feedback);
      if (dest) go(dest);
      else render();
    },
    route === "active" && ["log", "switch", "customtimer", "sessionnote"].includes(action)
      ? state.active.id : null,
  );
});
window.addEventListener("hashchange", () => {
  recordIndex = 0;
  pending = null;
  render();
  window.scrollTo(0, 0);
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) tick();
});
window.addEventListener("pageshow", tick);
document.addEventListener("click", () => {
  try {
    if (state?.settings.sound) {
      ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
    }
  } catch {}
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
  "change",
  render,
);
try {
  state = await account.open();
  render();
  setInterval(tick, 350);
} catch (e) {
  app.textContent = "無法開啟本機訓練資料：" + e.message;
}
if ("serviceWorker" in navigator) {
  try {
    sw = await navigator.serviceWorker.register("./sw.js");
    const update = () =>
      say("新版已準備好。儲存後關閉所有 FitFlow 分頁，再開啟即可更新。");
    if (sw.waiting) update();
    sw.addEventListener("updatefound", () => {
      const w = sw.installing;
      w?.addEventListener("statechange", () => {
        if (w.state === "installed" && navigator.serviceWorker.controller)
          update();
      });
    });
  } catch (e) {
    say("離線快取尚未就緒：" + e.message);
  }
}
