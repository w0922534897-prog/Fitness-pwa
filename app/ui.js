export const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const btn = (label, act, arg = "", cls = "") =>
  '<button class="' +
  cls +
  '" data-act="' +
  act +
  '" data-arg="' +
  esc(arg) +
  '">' +
  esc(label) +
  "</button>";
export const link = (label, path) =>
  '<a class="button" href="#' + path + '">' + esc(label) + "</a>";
export const field = (label, key, val, type = "text", attrs = "") =>
  "<label>" +
  esc(label) +
  '<input name="' +
  key +
  '" type="' +
  type +
  '" value="' +
  esc(val) +
  '" ' +
  attrs +
  "></label>";
export const opt = (label, key, val, choices) =>
  "<label>" +
  esc(label) +
  '<select name="' +
  key +
  '">' +
  choices
    .map(
      ([v, t]) =>
        '<option value="' +
        esc(v) +
        '" ' +
        (v === val ? "selected" : "") +
        ">" +
        esc(t) +
        "</option>",
    )
    .join("") +
  "</select></label>";
export const check = (label, key, val) =>
  '<label class="check"><input type="checkbox" name="' +
  key +
  '" ' +
  (val ? "checked" : "") +
  ">" +
  label +
  "</label>";
export const panel = (title, html) =>
  "<section><h2>" + esc(title) + "</h2>" + html + "</section>";
export const form = (name, html, label = "儲存") =>
  '<form data-form="' +
  name +
  '">' +
  html +
  '<button class="primary">' +
  label +
  "</button></form>";
export const dateTime = (t) =>
  new Date(t).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour12: false,
  });
export const clock = (s) =>
  Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
export const fmt = (n) => Number(n.toFixed(3));
export const slug = encodeURIComponent;
