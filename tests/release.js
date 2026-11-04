import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium, webkit } from "playwright-core";

// Exercise the published site in a fresh, disposable device profile.
const url = "https://w0922534897-prog.github.io/Fitness-pwa/";
const browser = process.argv.includes("--webkit")
  ? await webkit.launch()
  : await chromium.launch({
      executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let page = await context.newPage();
  const button = (name) => page.getByRole("button", { name, exact: true });
  await page.goto(url);
  await button("開始訓練").click();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  const firstSet = page.locator('form[data-form="log"]').first();
  await firstSet.locator('[name="reps"]').fill("13");
  await firstSet.getByRole("button", { name: "完成這組" }).click();
  await page.waitForFunction(() => document.querySelector("#timerstatus")?.textContent === "倒數中");
  await page.locator('form[data-form="customtimer"] input').fill("3");
  await button("啟動").click();
  await page.waitForFunction(() => document.querySelector("#remaining")?.textContent === "0:03");
  await page.close();
  await new Promise((resolve) => setTimeout(resolve, 4100));

  page = await context.newPage();
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(url);
  await page.getByRole("link", { name: "查看與繼續" }).click();
  await page.waitForFunction(() => document.querySelector("#timerstatus")?.textContent === "休息結束");
  assert.equal(await page.locator('form[data-form="log"] [name="reps"]').first().inputValue(), "13");
  await page.getByRole("link", { name: "設定", exact: true }).click();
  await page.getByRole("link", { name: "開啟舊版 5kg 訓練器" }).click();
  await button("備份／說明").click();
  const fixture = { version: 1, data: {
    sessions: [{ id: 1000, date: new Date(1000).toISOString(), day: 0,
      entries: [{ exercise: "啞鈴臥推", sets: [{ set: 1, reps: 11, weight: 5 }] }] }],
    drafts: { 0: { "0-0-0": { reps: "9", weight: "4", done: true } } },
  } };
  await page.locator('input[type="file"]').setInputFiles({
    name: "legacy.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("fit5kg-v4"))?.sessions.length === 1);
  await page.reload();
  await page.getByText("1/9 組", { exact: true }).waitFor();
  await button("歷史紀錄").click();
  await page.getByText("啞鈴臥推：第1組 11次 / 5kg", { exact: true }).waitFor();
  await button("備份／說明").click();
  const download = page.waitForEvent("download");
  await button("匯出 JSON").click();
  const exported = JSON.parse(await readFile(await (await download).path(), "utf8"));
  assert.deepEqual(exported, fixture);
  await page.goto(url);
  await page.getByRole("link", { name: "查看與繼續" }).click();
  assert.equal(await page.locator('form[data-form="log"] [name="reps"]').first().inputValue(), "13");
  console.log("PASS published offline cold reopen, elapsed timer, legacy history/draft restore and export, and independent FitFlow draft");
} finally {
  await browser.close();
}
