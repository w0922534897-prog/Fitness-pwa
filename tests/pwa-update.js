import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright-core";
import { build } from "../scripts/build.js";
import { serve } from "../scripts/serve.js";

// Build two releases in a disposable directory. Both use the production SW generator.
const root = process.cwd();
const temp = await mkdtemp(join(tmpdir(), "fitflow-upgrade-"));
let server, browser;
try {
  for (const name of ["app", "index.html", "legacy.html", "icon.svg", "style.css", "manifest.webmanifest"])
    await cp(join(root, name), join(temp, name), { recursive: true });
  process.chdir(temp);
  await build();
  server = serve(4193, "/fitflow/");
  await new Promise((resolve, reject) => server.once("listening", resolve).once("error", reject));
  browser = process.argv.includes("--webkit") ? await webkit.launch() : await chromium.launch({
    executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const ctx = await browser.newContext();
  const url = "http://127.0.0.1:4193/fitflow/";
  const observer = await ctx.newPage();
  // Same origin, outside the SW scope, so this page can observe activation without delaying it.
  await observer.goto(new URL("/observer", url).href);
  const old = await ctx.newPage();
  await old.goto(url);
  await old.waitForFunction(() => !!navigator.serviceWorker.controller);
  await old.getByRole("button", { name: "開始訓練", exact: true }).click();
  const log = old.locator('form[data-form="log"]').first();
  await log.locator('[name="reps"]').fill("17");
  await log.getByRole("button", { name: "完成這組" }).click();
  await old.waitForFunction(() => document.querySelector("#timerstatus")?.textContent === "倒數中");
  async function draft(page) {
    return page.evaluate(async () => {
      const { openDB } = await import("./app/storage.js");
      const s = await openDB();
      return { id: s.active.id, end: s.active.timer.end, set: s.active.items[0].logs[0] };
    });
  }
  const original = await draft(old);
  const source = await readFile("index.html", "utf8");
  await writeFile("index.html", source.replace("<head>", '<head><meta name="fitflow-test-release" content="2">'));
  await build();
  await rename("dist/icon-512.png", "dist/missing.png");
  const updateState = async () => old.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const result = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error("Timed out waiting for a replacement worker")), 30000);
      reg.addEventListener("updatefound", () => {
      const installing = reg.installing;
      const report = () => {
        if (["installed", "redundant"].includes(installing.state)) {
          clearTimeout(timeout);
          resolve(installing.state);
        }
      };
      installing.addEventListener("statechange", report);
      report();
      }, { once: true });
    });
    const [state] = await Promise.all([result, reg.update()]);
    return state;
  });
  assert.equal(await updateState(), "redundant");
  await ctx.setOffline(true);
  await old.reload();
  await old.waitForFunction(() => document.querySelector("#timerstatus")?.textContent === "倒數中");
  assert.deepEqual(await draft(old), original);
  await ctx.setOffline(false);
  await rename("dist/missing.png", "dist/icon-512.png");
  assert.equal(await updateState(), "installed");
  await old.getByText(/新版已準備好/).waitFor();
  const second = await ctx.newPage();
  await second.goto(url);
  assert.equal(await second.locator('meta[name="fitflow-test-release"]').count(), 0);
  await old.close();
  assert.ok(await second.evaluate(async () => !!(await navigator.serviceWorker.ready).waiting));
  await second.close();
  await observer.waitForFunction(async (scope) => {
    const r = await navigator.serviceWorker.getRegistration(scope);
    return r?.active?.state === "activated" && !r.waiting && !r.installing;
  }, url);
  await ctx.setOffline(true);
  const reopened = await ctx.newPage();
  await reopened.goto(url);
  assert.equal(await reopened.locator('meta[name="fitflow-test-release"]').getAttribute("content"), "2");
  await reopened.getByRole("link", { name: "查看與繼續" }).click();
  assert.deepEqual(await draft(reopened), original);
  console.log("PASS failed install retains old offline app; retry waits for both clients; new offline app preserves session ID, completed set and deadline");
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  process.chdir(root);
  await rm(temp, { recursive: true, force: true });
}
