import { chromium, webkit } from "playwright-core";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { serve } from "../scripts/serve.js";
import { build } from "../scripts/build.js";
import { demoIds } from "../app/demo.js";
await build();
const server = serve(4187, "/fitflow/");
await new Promise((r) => server.once("listening", r));
let browser;
try {
  const executablePath =
    process.env.CHROME_PATH ||
    [
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      "/usr/bin/chromium",
      "/usr/bin/google-chrome",
    ].find(existsSync);
  browser = process.argv.includes("--webkit")
    ? await webkit.launch()
    : await chromium.launch({ executablePath, headless: true });
  const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 },
    }),
    page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const url = "http://127.0.0.1:" + server.address().port + "/fitflow/";
  const button = (t) => page.getByRole("button", { name: t, exact: true });
  const nav = async (path) => {
    await page.goto(url + "#" + path);
    await page.waitForFunction(() => document.querySelector("nav a"));
  };
  await nav("home");
  assert.equal(await page.locator('.cycle-strip [aria-current="step"]').count(), 1);
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "home layout " + width);
    if (width === 1280) assert.ok(await page.evaluate(() => {
      const nav = document.querySelector("nav").getBoundingClientRect();
      const hero = document.querySelector(".hero").getBoundingClientRect();
      return nav.right <= hero.left && nav.width < 250;
    }), "desktop navigation sits beside content");
  }
  await page.setViewportSize({width:375, height:812});
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await ctx.setOffline(true);
  await page.reload();
  await button("開始訓練").click();
  const log = page.locator("form[data-form=log]").first();
  await log.locator("[name=kg]").fill("6");
  await log.locator("[name=reps]").fill("14");
  await log.getByRole("button", { name: "完成這組" }).click();
  await page.waitForFunction(
    () => document.querySelector("#timerstatus")?.textContent === "倒數中",
  );
  await page.locator("#rest-dock").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "下一組", exact: true }).click();
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.n), "1");
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({width, height:844});
    assert.ok(await page.evaluate(() => {
      const dock = document.querySelector("#rest-dock").getBoundingClientRect();
      const nav = document.querySelector("nav").getBoundingClientRect();
      return dock.left >= 0 && dock.right <= innerWidth && dock.bottom <= nav.top &&
        document.documentElement.scrollWidth <= innerWidth;
    }), "rest shortcuts fit width " + width);
  }
  await page.setViewportSize({width:375, height:812});
  await page.getByRole("button", { name: "倒數控制", exact: true }).click();
  assert.ok(await page.evaluate(() => document.activeElement?.contains(document.querySelector("#ring"))));
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("#timerstatus")?.textContent === "倒數中",
  );
  assert.equal(await log.locator("[name=kg]").inputValue(), "6");
  await page.locator('[data-act=timer][data-arg="1"]').click();
  await page.waitForFunction(
    () => document.querySelector("#timerstatus").textContent === "已暫停",
  );
  await page.locator('[data-act=timer][data-arg="2"]').click();
  await page.locator("select[name=index]").selectOption("1");
  await button("切換動作").click();
  await button("結束並保存").click();
  await page.waitForURL("**/#record/**");
  await log.locator("[name=reps]").fill("15");
  await button("儲存修改").first().click();
  await nav("settings");
  const dl = page.waitForEvent("download");
  await button("匯出 JSON").click();
  const file = await (await dl).path(),
    raw = await readFile(file, "utf8");
  assert.equal(JSON.parse(raw).data.history.length, 1);
  await page
    .locator("#backupfile")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(raw),
    });
  await button("合併").click();
  await page.waitForFunction(() => !document.querySelector("[data-act=merge]"));
  for (const id of demoIds) {
    await nav("library/" + id);
    const svg = page.locator(".demo svg");
    await svg.waitFor();
    await page.locator("[data-ui=play]").click();
    const before = await svg.innerHTML();
    await page.waitForTimeout(65);
    assert.equal(await svg.innerHTML(), before);
    await page.locator("[data-ui=replay]").click();
    await page.waitForFunction(
      (b) => document.querySelector(".demo svg")?.innerHTML !== b,
      before,
    );
    console.log("offline playback / pause / replay: " + id);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(
    () => document.querySelectorAll(".demo svg").length === 2,
  );
  await nav("plans/push");
  const rx = page.locator("form[data-form=prescription]").first();
  await rx.locator("select").selectOption("floor");
  await rx.getByRole("button").click();
  await page.getByRole("heading", { name: "1 · 地板臥推" }).waitFor();
  await nav("plans");
  await page.locator("[data-act=start][data-arg=push]").click();
  await page
    .getByRole("heading", { name: "地板臥推", exact: true })
    .first()
    .waitFor();
  await page.locator("form[data-form=customtimer] input").fill("60");
  await button("啟動").click();
  await page.waitForFunction(
    () => document.querySelector("#timerstatus").textContent === "倒數中",
  );
  await page.locator('[data-act=timer][data-arg="1"]').click();
  await button("+15 秒").click();
  await page.waitForFunction(
    () => document.querySelector("#remaining").textContent === "1:15",
  );
  await button("−15 秒").click();
  await page.waitForFunction(
    () => document.querySelector("#remaining").textContent === "1:00",
  );
  await button("重設").click();
  await page.waitForFunction(
    () => document.querySelector("#timerstatus").textContent === "準備開始",
  );
  await page.locator('[data-act=timer][data-arg="4"]').click();
  await page.waitForFunction(
    () => document.querySelector("#remaining").textContent === "0:00",
  );
  await button("保留草稿離開").click();
  await page.getByRole("heading", { name: "偵測到尚未完成的訓練" }).waitFor();
  await button("儲存為未完成").click();
  await page.waitForURL("**/#record/**");
  for (const path of [
    "home",
    "plans",
    "library",
    "history",
    "stats",
    "settings",
  ]) {
    await nav(path);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      path,
    );
  }
  const upload = async (text) =>
    page
      .locator("#backupfile")
      .setInputFiles({
        name: "restore.json",
        mimeType: "application/json",
        buffer: Buffer.from(text),
      });
  await upload("{");
  await page.waitForFunction(() =>
    document.querySelector("#notice").textContent.includes("讀取失敗"),
  );
  const replacement = JSON.parse(raw);
  replacement.data.history[0].name = "還原驗收";
  await upload(JSON.stringify(replacement));
  await button("取代").click();
  await page.waitForFunction(
    () => !document.querySelector("[data-act=replace]"),
  );
  await nav("history");
  await page.getByRole("heading", { name: "還原驗收" }).waitFor();
  const stale = await ctx.newPage();
  await stale.goto(url + "#home");
  await stale.locator("[data-act=delay]").waitFor();
  await nav("home");
  await button("延後一天").click();
  await page.waitForFunction(
    () => document.querySelector("#notice").textContent === "已儲存",
  );
  await stale.locator("[data-act=delay]").click();
  await stale.waitForFunction(() =>
    document.querySelector("#notice").textContent.includes("另一個分頁"),
  );
  await stale.close();
  await nav("settings");
  const exported = page.waitForEvent("download");
  await button("匯出 CSV").click();
  assert.match(
    await readFile(await (await exported).path(), "utf8"),
    /還原驗收/,
  );
  const migration = await browser.newContext();
  const m = await migration.newPage();
  await m.goto(url + "manifest.webmanifest");
  await m.evaluate(
    (data) =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("fitflow-local", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("workspace");
        r.onsuccess = () => {
          const tx = r.result.transaction("workspace", "readwrite");
          tx.objectStore("workspace").put({ revision: 3, data }, "current");
          tx.oncomplete = () => {
            r.result.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        };
      }),
    replacement.data,
  );
  await m.goto(url + "#history");
  await m.getByRole("heading", { name: "還原驗收" }).waitFor();
  await migration.close();
  for (const width of [320, 390, 430, 812]) {
    await page.setViewportSize({ width, height: width === 812 ? 375 : 844 });
    await nav("stats");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "layout " + width,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS offline subpath, mobile layouts, plan editing, session, timer controls, reload, history edit, JSON merge/replace, invalid JSON, CSV, concurrent conflict, DB upgrade and all demos",
  );
} finally {
  await browser?.close();
  server.close();
}
