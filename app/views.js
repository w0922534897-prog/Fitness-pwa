import { day } from "./data.js";
import {
  completed,
  duration,
  displayWeight,
  previous,
  advice,
  volume,
} from "./core.js";
import { demo } from "./demo.js";
import {
  esc,
  btn,
  link,
  field,
  opt,
  check,
  panel,
  form,
  dateTime,
  clock,
  fmt,
  slug,
} from "./ui.js";
export const pages = {
  home: "首頁",
  plans: "課表",
  active: "訓練中",
  library: "動作庫",
  history: "紀錄",
  stats: "統計",
  settings: "設定",
};
const blank = (t) => '<p class="muted">' + t + "</p>";
const title = (k, t) => "<small>" + esc(k) + "</small><h1>" + esc(t) + "</h1>";
const done = (h) => h.history.filter((x) => x.status === "完成");
const byDate = (a) => [...a].sort((x, y) => y.start - x.start);
const reduce = (s) =>
  s.settings.reduce || matchMedia("(prefers-reduced-motion: reduce)").matches;
const info = (e) =>
  "<p><b>" +
  esc(e.start) +
  "</b> " +
  esc(e.action) +
  "</p><p>" +
  esc(e.safety) +
  "</p><p>替代選擇 · " +
  esc(e.alternative) +
  "</p>";
const unit = (e) => (e.timed ? "秒" : "次") + (e.side ? "／側" : "");
const weight = (s, k) =>
  fmt(displayWeight(k, s.settings.unit)) + " " + s.settings.unit;
const target = (s, e) =>
  e.sets +
  " 組 × " +
  e.min +
  "–" +
  e.max +
  " " +
  unit(e) +
  " · " +
  weight(s, e.kg) +
  " · 休 " +
  e.rest +
  " 秒";
const choices = (s) => s.exercises.map((e) => [e.id, e.name]);
const names = (s) => s.plans.map((p) => [p.id, p.name]);
const wf = (s, k, v) =>
  field(
    "重量 (" + s.settings.unit + ")",
    k,
    fmt(displayWeight(v, s.settings.unit)),
    "number",
    'min="0" step="any" required data-kg="' + v + '"',
  );
const num = (name, k, v, min, max) =>
  field(name, k, v, "number", 'required min="' + min + '" max="' + max + '"');
function prescriptionFields(s, e) {
  return (
    '<div class="grid">' +
    wf(s, "kg", e.kg) +
    num("組數", "sets", e.sets, 1, 100) +
    num("區間下限", "min", e.min, 1, 10000) +
    num("區間上限", "max", e.max, 1, 10000) +
    num("休息秒數", "rest", e.rest, 1, 86400) +
    "</div>"
  );
}
export function home(s) {
  const p = s.plans.find((p) => p.id === s.cycle[s.cursor]),
    recent = byDate(s.history)[0],
    today = day(Date.now());
  return (
    title("FITFLOW  /  訓練日誌", today.replaceAll("-", ".")) +
    (s.active
      ? panel(
          "偵測到尚未完成的訓練",
          esc(s.active.name) +
            " · " +
            completed(s.active).length +
            " 組 " +
            link("查看與繼續", "active") +
            btn("儲存為未完成", "partial") +
            btn("放棄", "discard"),
        )
      : "") +
    '<section class="hero"><small>三練一休　／　DAY 0' +
    (s.cursor + 1) +
    "</small><h2>" +
    (p ? esc(p.name) + "日" : "今日休息") +
    "</h2><p>" +
    (p
      ? p.items.length +
        " 個動作 · " +
        p.items.reduce((a, i) => a + i.sets, 0) +
        " 組"
      : "今天留給恢復。可以依體感散步或休息。") +
    "</p><p>預定 " +
    esc(s.due) +
    " · 下一日 " +
    esc(
      s.plans.find((p) => p.id === s.cycle[(s.cursor + 1) % 4])?.name || "休息",
    ) +
    "</p>" +
    (s.active
      ? link("回到訓練", "active")
      : p
        ? btn("開始訓練", "start", p.id, "primary")
        : btn("結束休息日", "restday", "", "primary")) +
    btn("延後一天", "delay") +
    "</section>" +
    panel(
      "近期紀錄",
      recent
        ? link(
            recent.name + " · " + dateTime(recent.start),
            "record/" + slug(recent.id),
          )
        : blank("完成第一場訓練後，這裡會顯示你的紀錄。"),
    ) +
    panel(
      "訓練累積",
      done(s).length +
        " 次完成訓練 · " +
        s.history.reduce((a, h) => a + completed(h).length, 0) +
        " 組 " +
        link("查看紀錄", "history"),
    )
  );
}
export function plansView(s, id) {
  const p = s.plans.find((x) => x.id === id);
  if (!p)
    return (
      title("PROGRAM", "我的課表") +
      s.plans
        .map((p) =>
          panel(
            p.name,
            p.items.length +
              " 個動作　" +
              link("編輯課表", "plans/" + slug(p.id)) +
              btn("開始", "start", p.id),
          ),
        )
        .join("") +
      panel(
        "建立課表",
        form("newplan", field("名稱", "name", "", "text", "required")),
      ) +
      btn("重設內建課表", "resetplans")
    );
  return (
    title("PROGRAM / 編輯", p.name) +
    form("rename", field("課表名稱", "name", p.name, "text", "required")) +
    btn("複製課表", "copy", p.id) +
    p.items
      .map((i, n) => {
        const e = s.exercises.find((x) => x.id === i.id);
        return panel(
          n + 1 + " · " + e.name,
          form(
            "prescription",
            field("", "index", n, "hidden") +
              opt("替換動作", "id", i.id, choices(s)) +
              prescriptionFields(s, i),
          ) +
            btn("上移", "up", n) +
            btn("下移", "down", n) +
            btn("移除動作", "removeitem", n),
        );
      })
      .join("") +
    panel(
      "加入動作",
      form("additem", opt("動作", "id", "", choices(s)), "加入"),
    ) +
    link("返回課表", "plans")
  );
}
export function library(s, id, q = "", muscle = "") {
  const e = s.exercises.find((x) => x.id === id);
  if (id === "new" || e) {
    const x = e || {
      id: "",
      name: "",
      en: "",
      muscle: "",
      secondary: "",
      side: false,
      timed: false,
      load: "單鈴",
      kg: 5,
      sets: 3,
      min: 8,
      max: 12,
      rest: s.settings.rest,
      start: "",
      action: "",
      safety: "",
      alternative: "",
    };
    return (
      title("MOVEMENT", e ? e.name : "新增動作") +
      (e
        ? panel(e.en, demo(e, reduce(s)) + info(e) + blank(target(s, e)))
        : "") +
      "<details " +
      (!e ? "open" : "") +
      "><summary>編輯動作資料</summary>" +
      form(
        "exercise",
        [
          "name",
          "en",
          "muscle",
          "secondary",
          "start",
          "action",
          "safety",
          "alternative",
        ]
          .map((k, i) =>
            field(
              [
                "中文名稱",
                "英文名稱",
                "主要肌群",
                "次要肌群",
                "起始姿勢",
                "操作重點",
                "常見錯誤與安全提醒",
                "替代動作",
              ][i],
              k,
              x[k],
              "text",
              k === "name" ? "required" : "",
            ),
          )
          .join("") +
          opt(
            "器材",
            "load",
            x.load,
            ["徒手", "單鈴", "雙鈴"].map((t) => [t, t]),
          ) +
          check("分左右側", "side", x.side) +
          check("以秒計量", "timed", x.timed) +
          prescriptionFields(s, x),
      ) +
      "</details>" +
      link("返回動作庫", "library")
    );
  }
  return (
    title("MOVEMENT LIBRARY", "動作庫") +
    form(
      "search",
      field("搜尋中英文名稱", "q", q) +
        opt("主要肌群", "muscle", muscle, [
          ["", "全部"],
          ...Array.from(new Set(s.exercises.map((e) => e.muscle)), (m) => [
            m,
            m,
          ]),
        ]),
      "篩選",
    ) +
    link("新增自訂動作", "library/new") +
    s.exercises
      .filter(
        (e) =>
          (e.name + e.en).toLowerCase().includes(q.toLowerCase()) &&
          (!muscle || e.muscle === muscle),
      )
      .map((e) =>
        panel(
          e.name,
          esc(e.en) +
            " · " +
            esc(e.muscle) +
            " " +
            link("教學與編輯", "library/" + slug(e.id)),
        ),
      )
      .join("")
  );
}
function logForm(s, e, l, n, history = false) {
  return (
    '<form data-form="log" data-n="' +
    n +
    '" class="set"><b>第 ' +
    (n + 1) +
    " 組 · " +
    l.status +
    '</b><div class="grid">' +
    wf(s, "kg", l.kg) +
    num(
      (e.side ? "左側" : "實際") + unit(e).replace("／側", ""),
      "reps",
      l.reps,
      0,
      10000,
    ) +
    (e.side
      ? num("右側" + (e.timed ? "秒" : "次"), "right", l.right, 0, 10000)
      : "") +
    "</div><details><summary>備註與細節</summary>" +
    field("備註", "note", l.note) +
    (s.settings.rir
      ? field("保留次數 RIR", "rir", l.rir, "number", 'min="0" max="10"')
      : "") +
    (l.at ? blank(dateTime(l.at)) : "") +
    '</details><button class="primary" value="done">' +
    (l.status === "完成" ? "儲存修改" : "完成這組") +
    "</button>" +
    (history
      ? ""
      : '<button value="skip">跳過</button>' +
        (l.status !== "完成" ? '<button value="delete">刪除</button>' : "")) +
    "</form>"
  );
}
export function workout(s, h, history = false, idx = h?.index || 0) {
  if (!h) return title("SESSION", "目前沒有訓練") + link("選擇課表", "plans");
  const i = h.items[idx],
    e = i.e,
    prev = previous(s, e, h.start),
    all = h.items.reduce((a, i) => a + i.logs.length, 0);
  return (
    title(
      history
        ? "訓練紀錄 · " + dateTime(h.start)
        : "ACTIVE SESSION · " + esc(h.name),
      history ? h.name : e.name,
    ) +
    "<p>" +
    completed(h).length +
    " / " +
    all +
    ' 組　<span id="elapsed">' +
    clock(duration(h) / 1000) +
    "</span>　" +
    esc(h.status) +
    '</p><progress max="' +
    (all || 1) +
    '" value="' +
    completed(h).length +
    '"></progress>' +
    form(
      "switch",
      opt(
        "目前動作",
        "index",
        String(idx),
        h.items.map((x, n) => [String(n), x.e.name]),
      ),
      "切換動作",
    ) +
    panel(
      e.name,
      demo(e, reduce(s)) +
        blank(target(s, e)) +
        "<details><summary>動作教學</summary>" +
        info(e) +
        "</details>",
    ) +
    (history
      ? ""
      : panel(
          "組間休息",
          '<div id="ring"><strong id="remaining"></strong></div><p id="timerstatus"></p><p>' +
            esc(e.name) +
            " · 已完成 " +
            i.logs.filter((l) => l.status === "完成").length +
            " 組 · " +
            (i.logs.some((l) => l.status === "待做")
              ? "下一組 " + (i.logs.findIndex((l) => l.status === "待做") + 1)
              : "此動作已結束") +
            "</p>" +
            ["開始", "暫停", "繼續", "重設", "跳過", "+15 秒", "−15 秒"]
              .map((l, n) => btn(l, "timer", n))
              .join("") +
            form(
              "customtimer",
              num("自訂秒數", "seconds", h.timer?.seconds || e.rest, 1, 86400),
              "啟動",
            ),
        )) +
    panel(
      "逐組紀錄",
      blank(
        prev
          ? "上次完成 · " +
              esc(
                prev.logs
                  .filter((l) => l.status === "完成")
                  .map(
                    (l) =>
                      weight(s, l.kg) +
                      " × " +
                      l.reps +
                      (e.side ? "/" + l.right : ""),
                  )
                  .join("、"),
              )
          : "尚無上次紀錄。",
      ) +
        i.logs.map((l, n) => logForm(s, e, l, n, history)).join("") +
        (history ? "" : btn("新增一組", "addset") + btn("跳過動作", "skipex")),
    ) +
    panel("訓練筆記", form("sessionnote", field("當天感受", "note", h.note))) +
    (history
      ? btn("刪除此紀錄", "delhistory", h.id)
      : btn(h.pauseAt ? "繼續訓練" : "暫停訓練", "pausework") +
        btn("結束並保存", "finish", "", "primary") +
        btn("保留草稿離開", "draft") +
        btn("放棄訓練", "discard"))
  );
}
export function historyView(s, f) {
  const a = byDate(s.history).filter(
    (h) =>
      (h.name + h.note + h.items.map((i) => i.e.name).join("")).includes(
        f.q || "",
      ) &&
      (!f.date || day(h.start) === f.date) &&
      (!f.plan || h.plan === f.plan),
  );
  return (
    title("TRAINING LOG", "訓練紀錄") +
    form(
      "historyfilter",
      field("搜尋", "q", f.q) +
        field("日期", "date", f.date, "date") +
        opt("課表", "plan", f.plan, [
          ["", "全部"],
          ...new Map(s.history.map((h) => [h.plan, h.name])).entries(),
        ]),
      "篩選",
    ) +
    (a
      .map((h) =>
        panel(
          h.name,
          esc(dateTime(h.start)) +
            " · " +
            h.status +
            " · " +
            completed(h).length +
            " 組 " +
            link("詳細紀錄", "record/" + slug(h.id)),
        ),
      )
      .join("") || blank("沒有符合條件的紀錄。"))
  );
}
export function settings(s) {
  const q = s.settings;
  return (
    title("PREFERENCES", "個人設定") +
    panel(
      "外觀與訓練",
      form(
        "settings",
        opt("主題", "theme", q.theme, [
          ["system", "跟隨系統"],
          ["dark", "深色"],
          ["light", "淺色"],
        ]) +
          opt("重量單位", "unit", q.unit, [
            ["kg", "kg"],
            ["lb", "lb"],
          ]) +
          [
            ["reduce", "減少動畫"],
            ["auto", "完成組後自動休息"],
            ["sound", "結束音效"],
            ["carry", "帶入上次重量與次數"],
            ["rir", "顯示 RIR"],
          ]
            .map(([k, t]) => check(t, k, q[k]))
            .join("") +
          num("自訂動作預設休息秒數", "rest", q.rest, 1, 86400) +
          field(
            "最小增重 kg",
            "step",
            q.step,
            "number",
            'min=".001" max="100" step="any" required',
          ) +
          num("建議加重前連續達標次數", "streak", q.streak, 2, 10),
      ),
    ) +
    panel(
      "三練一休",
      form(
        "cycle",
        s.cycle
          .slice(0, 3)
          .map((id, n) => opt("第 " + (n + 1) + " 天", "day" + n, id, names(s)))
          .join("") +
          opt(
            "目前進度",
            "cursor",
            String(s.cursor),
            ["第一天", "第二天", "第三天", "休息日"].map((x, n) => [
              String(n),
              x,
            ]),
          ) +
          field("目前訓練日預定日期", "due", s.due, "date", "required"),
      ),
    ) +
    panel(
      "資料管理",
      '<p><a href="./legacy.html">開啟舊版 5kg 訓練器</a>，可在原裝置查看及匯出舊版紀錄。</p>' +
      "<p>請定期將備份存至其他位置。清除網站資料或更換裝置可能使本機紀錄遺失。</p>" +
        btn("匯出 JSON", "json") +
        btn("匯出 CSV", "csv") +
        '<label>讀取 JSON 備份<input id="backupfile" type="file" accept=".json,application/json"></label><div id="preview"></div>',
    )
  );
}
