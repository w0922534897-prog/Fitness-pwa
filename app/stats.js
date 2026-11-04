import { day } from "./data.js";
import { volume, completed, duration, displayWeight, advice } from "./core.js";
import { esc, panel, field, form, opt, link, fmt, clock, slug } from "./ui.js";
const week = (d) => {
  const t = Date.parse(d),
    n = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - n * 86400000).toISOString().slice(0, 10);
};
function group(rows, key, value) {
  const m = new Map();
  for (const h of rows) {
    const k = key(h);
    m.set(k, (m.get(k) || 0) + value(h));
  }
  return [...m];
}
function chart(label, rows) {
  const max = Math.max(1, ...rows.map((x) => x[1]));
  return panel(
    label,
    rows.length
      ? rows
          .slice(-24)
          .map(
            ([k, v]) =>
              '<div class="bar"><span>' +
              esc(k) +
              '</span><meter min="0" max="' +
              max +
              '" value="' +
              v +
              '"></meter><b>' +
              fmt(v) +
              "</b></div>",
          )
          .join("")
      : "尚無紀錄。",
  );
}
export function stats(s, filter) {
  const now = day(Date.now()),
    month = filter.month || now.slice(0, 7),
    h = [...s.history].sort((a, b) => a.start - b.start),
    done = h.filter((x) => x.status === "完成");
  const ex = new Map(s.exercises.map((e) => [e.id, e]));
  for (const x of h)
    for (const i of x.items) if (!ex.has(i.e.id)) ex.set(i.e.id, i.e);
  const e = ex.get(filter.id) || ex.values().next().value;
  const rows = h
    .flatMap((x) =>
      x.items
        .filter(
          (i) =>
            i.e.id === e?.id &&
            i.e.timed === e.timed &&
            i.e.side === e.side &&
            i.e.load === e.load,
        )
        .map((i) => ({
          x,
          i,
          logs: i.logs.filter((l) => l.status === "完成"),
        })),
    )
    .filter((r) => r.logs.length);
  const best = new Map(),
    dates = new Map();
  for (const { x, i, logs } of rows) {
    const d = day(x.start),
      v = dates.get(d) || { kg: 0, reps: 0, vol: 0 };
    for (const l of logs) {
      const r = i.e.side ? Math.min(l.reps, l.right) : l.reps;
      v.kg = Math.max(v.kg, l.kg);
      v.reps = Math.max(v.reps, r);
      v.vol += volume(i.e, l);
      if (!best.has(l.kg) || best.get(l.kg).reps < r)
        best.set(l.kg, { reps: r, id: x.id });
    }
    dates.set(d, v);
  }
  const dateRows = [...dates],
    w = (kg) => fmt(displayWeight(kg, s.settings.unit));
  const days = new Date(
      Date.UTC(+month.slice(0, 4), +month.slice(5), 0),
    ).getUTCDate(),
    offset = (new Date(month + "-01T00:00Z").getUTCDay() + 6) % 7;
  return (
    "<small>INSIGHTS</small><h1>訓練統計</h1>" +
    panel(
      "總覽",
      "<p>累積 " +
        done.length +
        " 次 · 本週 " +
        done.filter((x) => week(day(x.start)) === week(now)).length +
        " 次 · 本月 " +
        done.filter((x) => day(x.start).startsWith(now.slice(0, 7))).length +
        " 次</p><p>共 " +
        h.reduce((a, x) => a + completed(x).length, 0) +
        " 組 · " +
        clock(h.reduce((a, x) => a + duration(x), 0) / 1000) +
        "（分：秒）</p>",
    ) +
    chart(
      "每週完成組數",
      group(
        h,
        (x) => week(day(x.start)),
        (x) => completed(x).length,
      ),
    ) +
    chart(
      "每月訓練次數",
      group(
        done,
        (x) => day(x.start).slice(0, 7),
        () => 1,
      ),
    ) +
    chart(
      "各課表完成次數",
      group(
        done,
        (x) => x.name,
        () => 1,
      ),
    ) +
    form(
      "stats",
      opt(
        "動作趨勢",
        "id",
        e?.id,
        [...ex].map(([id, e]) => [id, e.name]),
      ) + field("日曆月份", "month", month, "month", "required"),
      "查看",
    ) +
    chart(
      "單次最高重量 · " + s.settings.unit,
      dateRows.map(([k, v]) => [k, w(v.kg)]),
    ) +
    chart(
      "每日單組最高" + (e?.timed ? "秒數" : "次數"),
      dateRows.map(([k, v]) => [k, v.reps]),
    ) +
    chart(
      "外部負重訓練量 · kg × 次",
      dateRows.map(([k, v]) => [k, v.vol]),
    ) +
    panel(
      "同重量個人最佳",
      ([...best]
        .sort((a, b) => b[0] - a[0])
        .map(([kg, b]) =>
          link(
            w(kg) +
              " " +
              s.settings.unit +
              " × " +
              b.reps +
              (e.timed ? " 秒" : " 次"),
            "record/" + slug(b.id),
          ),
        )
        .join("") || "尚無紀錄。") +
        "<p>單側以較少的一側比較次數。負重總量按每組重量乘實際次數，雙鈴乘二，單側加總左右。徒手與計時組不計入負重總量。</p>",
    ) +
    (e
      ? panel(
          "下次訓練參考",
          esc(advice(s, e)) + "<p>若動作引發疼痛，請停止該動作。</p>",
        )
      : "") +
    panel(
      month + " 訓練日曆",
      '<div class="calendar">' +
        ["一", "二", "三", "四", "五", "六", "日"]
          .map((n) => "<b>" + n + "</b>")
          .join("") +
        "<i></i>".repeat(offset) +
        Array.from({ length: days }, (_, n) => {
          const d = month + "-" + String(n + 1).padStart(2, "0");
          return (
            "<div><strong>" +
            (n + 1) +
            "</strong>" +
            h
              .filter((x) => day(x.start) === d)
              .map((x) => link(x.name + " " + x.status, "record/" + slug(x.id)))
              .join("") +
            s.events
              .filter((x) => x.date === d)
              .map((x) => "<small>" + esc(x.label) + "</small>")
              .join("") +
            (s.due === d
              ? "<small>預定 " +
                esc(
                  s.plans.find((p) => p.id === s.cycle[s.cursor])?.name ||
                    "休息",
                ) +
                "</small>"
              : "") +
            "</div>"
          );
        }).join("") +
        "</div>",
    )
  );
}
