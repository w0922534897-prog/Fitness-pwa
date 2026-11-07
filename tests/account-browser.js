import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium, webkit } from "playwright-core";
import { build } from "../scripts/build.js";
import { serve } from "../scripts/serve.js";

// Controlled Auth/REST test double. SQL permissions are exercised by sync.test.js.
const root=process.cwd(), temp=await mkdtemp(join(tmpdir(),"fitflow-account-test-"));
const accounts = new Map(), remote = new Map();
let browser, server;
try {
  for (const name of ["app","index.html","legacy.html","icon.svg","style.css","manifest.webmanifest"])
    await cp(join(root,name),join(temp,name),{recursive:true});
  await writeFile(join(temp,"app/cloud-config.js"),'export const cloudConfig={url:"https://fitflow-test.supabase.co",publishableKey:"sb_publishable_test"};');
  process.chdir(temp);
  await build();
  server=serve(4196);
  await new Promise(r=>server.once("listening",r));
  browser=process.argv.includes("--webkit") ? await webkit.launch() : await chromium.launch({
    executablePath:process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  async function device() {
    // Playwright cannot route requests handled by a service worker in WebKit.
    // Offline service-worker behavior is covered independently by browser.js.
    const context=await browser.newContext({serviceWorkers:"block"});
    await context.route("https://fitflow-test.supabase.co/**",async route=>{
      const req=route.request(), url=new URL(req.url());
      const reply=(data,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(data),
        headers:{"access-control-allow-origin":"*","access-control-allow-headers":"authorization,apikey,content-type,x-client-info,x-supabase-api-version",
          "access-control-allow-methods":"GET,POST,OPTIONS,PUT,DELETE"}});
      if(req.method()==="OPTIONS")return reply({});
      const body=req.postDataJSON();
      if(url.pathname==="/auth/v1/token") {
        let user=accounts.get(body.email);
        if(!user){user={id:crypto.randomUUID(),email:body.email,aud:"authenticated",role:"authenticated"};accounts.set(body.email,user)}
        const payload={...user,sub:user.id,exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)};
        const token=[{alg:"HS256",typ:"JWT"},payload].map(x=>Buffer.from(JSON.stringify(x)).toString("base64url")).join(".")+".test";
        return reply({access_token:token,refresh_token:"refresh-"+user.id,token_type:"bearer",expires_in:3600,user});
      }
      const token=req.headers().authorization?.split(" ")[1];
      let identity;
      try{identity=JSON.parse(Buffer.from(token.split(".")[1],"base64url")).sub}catch{}
      const user=[...accounts.values()].find(u=>u.id===identity);
      if(url.pathname==="/auth/v1/user")return user?reply(user):reply({message:"not authenticated"},401);
      if(url.pathname==="/auth/v1/logout")return reply({});
      if(!user)return reply({message:"not authenticated"},401);
      if(url.pathname==="/rest/v1/fitflow_workspaces"){
        if(url.searchParams.get("user_id")!=="eq."+identity)return reply([]);
        return reply(remote.has(identity)?[remote.get(identity)]:[]);
      }
      if(url.pathname==="/rest/v1/rpc/fitflow_save"){
        const previous=remote.get(identity);
        if(body.expected_revision!==(previous?.revision||0))return reply({code:"40001",message:"Revision conflict"},409);
        const revision=(previous?.revision||0)+1;
        remote.set(identity,{revision,data:body.document});
        return reply(revision);
      }
      return reply({message:"Unexpected test endpoint "+url.pathname},500);
    });
    const page=await context.newPage();
    page.on("pageerror",e=>console.log("page error",e.message));
    page.on("requestfailed",r=>console.log("request failed",new URL(r.url()).pathname,r.failure()?.errorText));
    page.on("dialog",d=>d.accept());
    await page.goto("http://127.0.0.1:4196/");
    await page.locator("nav a").first().waitFor();
    return {page,context};
  }
  const a=await device();
  await a.page.getByRole("button",{name:"開始訓練",exact:true}).click();
  await a.page.locator('form[data-form="log"]').first().getByRole("button",{name:"完成這組"}).click();
  await a.page.getByRole("button",{name:"結束並保存",exact:true}).click();
  await a.page.waitForURL("**/#record/**");
  async function login(page,email){
    await page.getByRole("link",{name:"設定",exact:true}).click();
    await page.locator('form[data-form="account-login"] [name="email"]').fill(email);
    await page.locator('form[data-form="account-login"] [name="password"]').fill("test-password");
    await page.getByRole("button",{name:"登入",exact:true}).click();
    try { await page.getByRole("button",{name:"登出",exact:true}).waitFor(); }
    catch(e) { console.log(await page.locator("#account-panel").innerText()); throw e; }
    await page.waitForFunction(()=>document.querySelector("#account-panel").textContent.includes("已同步"));
  }
  async function sync(page){
    await page.getByRole("link",{name:"設定",exact:true}).click();
    await page.getByRole("button",{name:"立即同步",exact:true}).click();
    await page.waitForFunction(()=>document.querySelector("#account-panel").textContent.includes("已同步"));
  }
  await login(a.page,"first@example.test");
  await a.page.getByRole("link",{name:"紀錄",exact:true}).click();
  await a.page.getByText("沒有符合條件的紀錄。",{exact:true}).waitFor();
  await a.page.getByRole("link",{name:"設定",exact:true}).click();
  await a.page.getByRole("button",{name:"帶入本機訪客資料",exact:true}).click();
  await a.page.waitForFunction(()=>document.querySelector("#account-panel").textContent.includes("已帶入"));
  await sync(a.page);
  assert.equal(remote.get(accounts.get("first@example.test").id).data.history.length,1);
  const b=await device();
  await login(b.page,"first@example.test");
  await b.page.getByRole("link",{name:"紀錄",exact:true}).click();
  await b.page.getByRole("link",{name:"詳細紀錄",exact:true}).waitFor();
  await a.page.getByRole("button",{name:"登出",exact:true}).click();
  await a.page.getByRole("button",{name:"登入",exact:true}).waitFor();
  await login(a.page,"second@example.test");
  await a.page.getByRole("link",{name:"紀錄",exact:true}).click();
  await a.page.getByText("沒有符合條件的紀錄。",{exact:true}).waitFor();
  assert.equal(remote.get(accounts.get("second@example.test").id).data.history.length,0);
  await a.page.getByRole("link",{name:"設定",exact:true}).click();
  await a.page.getByRole("button",{name:"登出",exact:true}).click();
  await a.page.getByRole("button",{name:"登入",exact:true}).waitFor();
  await a.page.getByRole("link",{name:"紀錄",exact:true}).click();
  await a.page.getByRole("link",{name:"詳細紀錄",exact:true}).waitFor();
  console.log("PASS Email login, explicit guest import, two-device sync, logout to guest and account isolation (simulated Auth/REST)");
} finally {
  await browser?.close();
  if(server)await new Promise(r=>server.close(r));
  process.chdir(root);
  await rm(temp,{recursive:true,force:true});
}
