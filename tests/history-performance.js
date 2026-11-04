import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { build } from "../scripts/build.js";
import { serve } from "../scripts/serve.js";

await build();
const server = serve(4192);
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const url = "http://127.0.0.1:4192/";
  await page.goto(url);
  await page.locator("nav a").first().waitFor();
  const initialArchive = await page.evaluate(async () => {
    const { initial } = await import("./app/data.js");
    const { start, finish } = await import("./app/core.js");
    const { save } = await import("./app/storage.js");
    const s = initial();
    start(s, s.plans[0], 1000);
    for (const item of s.active.items)
      for (const log of item.logs) Object.assign(log, { status: "完成", at: 2000 });
    finish(s, "完成", 3000);
    const sample = s.history[0];
    s.history = Array.from({ length: 1200 }, (_, i) => ({
      ...structuredClone(sample), id: "perf-" + i, start: 1000 + i * 86400000, end: 3000 + i * 86400000,
    }));
    start(s, s.plans[0]);
    await save(s);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(s.history)));
    return [...new Uint8Array(digest)];
  });
  await page.goto(url + "#active");
  await page.reload();
  await page.locator('form[data-form="log"]').first().waitFor();
  const stale = await page.context().newPage();
  await stale.goto(url + "#active");
  await stale.locator('form[data-form="log"]').first().waitFor();
  const times = await page.evaluate(async () => {
    const input = document.querySelector('form[data-form="log"] [name="reps"]');
    const notice = document.querySelector("#notice");
    const results = [];
    for (let i = 0; i < 12; i++) {
      notice.textContent = "";
      const started = performance.now();
      await new Promise((resolve, reject) => {
        const observer = new MutationObserver(() => {
          observer.disconnect();
          if (notice.textContent === "本組輸入已保存") resolve();
          else reject(Error(notice.textContent));
        });
        observer.observe(notice, { childList: true });
        input.value = String(10 + i);
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      results.push(performance.now() - started);
    }
    return results.sort((a, b) => a - b);
  });
  const staleInput = stale.locator('form[data-form="log"] [name="reps"]').first();
  await staleInput.fill("90");
  await staleInput.press("Tab");
  await stale.waitForFunction(() => document.querySelector("#notice").textContent.includes("另一個分頁"));
  await stale.close();
  await page.reload();
  await page.locator('form[data-form="log"]').first().waitFor();
  const saved = await page.evaluate(async () => {
    const { openDB } = await import("./app/storage.js");
    const s = await openDB();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(s.history)));
    return { digest: [...new Uint8Array(digest)], reps: s.active.items[0].logs[0].reps };
  });
  assert.deepEqual(saved.digest, initialArchive);
  assert.equal(saved.reps, 21);
  console.log("1200 sessions, 12 input saves, median ms:", ((times[5]+times[6])/2).toFixed(1),
    "max ms:", times[11].toFixed(1), "archive unchanged");
} finally {
  await browser?.close();
  server.close();
}
