import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { initial } from "../app/data.js";
import { reconcile } from "../app/sync-merge.js";
import { synchronize } from "../app/sync.js";
import { start, finish } from "../app/core.js";

test("同步合併不同資料、刪除與同筆衝突", () => {
  const base = initial(), a = structuredClone(base), b = structuredClone(base);
  a.settings.theme = "dark"; b.settings.sound = false;
  a.plans.push({...structuredClone(a.plans[0]),id:"extra",name:"額外課表"});
  const result = reconcile(base,a,b);
  assert.equal(result.conflicts.length,0);
  assert.equal(result.data.settings.theme,"dark");
  assert.equal(result.data.settings.sound,false);
  assert.equal(result.data.plans.length,4);
  const next = structuredClone(result.data), remote = structuredClone(next);
  next.plans.pop();
  assert.equal(reconcile(result.data,next,remote).data.plans.length,3);
  remote.plans.at(-1).name = "已編輯";
  const conflict = reconcile(result.data,next,remote);
  assert.equal(conflict.conflicts[0].key,"plans/extra");
  assert.equal(reconcile(result.data,next,remote,{"plans/extra":"remote"}).data.plans.length,4);
});
test("兩台裝置新增不同場次，及已結束／草稿的衝突", () => {
  const base = initial(), a = structuredClone(base), b = structuredClone(base);
  for (const s of [a,b]) {
    start(s,s.plans[0],1000);
    Object.assign(s.active.items[0].logs[0],{status:"完成",at:1500});
    finish(s,"完成",2000);
  }
  assert.equal(reconcile(base,a,b).data.history.length,2);
  const shared = initial();
  start(shared,shared.plans[0],1000);
  const local = structuredClone(shared), cloud = structuredClone(shared);
  local.active.note = "繼續訓練";
  Object.assign(cloud.active.items[0].logs[0],{status:"完成",at:1500});
  finish(cloud,"完成",2000);
  const r = reconcile(shared,local,cloud);
  assert.ok(r.conflicts.some(c=>c.key==="active"));
  const decisions = {active:"local",["finished/"+local.active.id]:"remote"};
  const resolved = reconcile(shared,local,cloud,decisions);
  assert.equal(resolved.data.active,null);
  assert.equal(resolved.data.history.length,1);
});
test("同步斷線、重試與拒絕過時的衝突選擇", async () => {
  const base = initial(), local = structuredClone(base);
  local.settings.theme="dark";
  let server={revision:1,data:structuredClone(base)}, writes=0;
  const args={local, metadata:{base,remoteRevision:1}, read:async()=>structuredClone(server),
    write:async(v,data)=>{assert.equal(v,server.revision);writes++;server={revision:v+1,data:structuredClone(data)};return server.revision}};
  await assert.rejects(()=>synchronize({...args,read:async()=>{throw Error("offline")}}),/offline/);
  assert.equal(writes,0);
  const saved = await synchronize(args);
  assert.equal(saved.metadata.remoteRevision,2);
  // Retry after the server succeeded but local acknowledgement was interrupted.
  const retried=await synchronize(args);
  assert.equal(writes,1);
  assert.deepEqual(retried.data,local);
  await assert.rejects(()=>synchronize({...args,expectedRemote:1}),/雲端資料已變更/);
});
test("PostgreSQL owner isolation, atomic revision checks and permissions", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
    `);
    await db.exec(await readFile("supabase/schema.sql","utf8"));
    await db.exec("set role authenticated");
    const asUser=async n=>db.query("select set_config('request.jwt.claim.sub',$1,false)",["00000000-0000-4000-8000-00000000000"+n]);
    await asUser(1);
    const save=async revision=>db.query("select public.fitflow_save($1,$2::jsonb) as revision",[revision,JSON.stringify(initial())]);
    assert.equal((await save(0)).rows[0].revision,1);
    await assert.rejects(()=>save(0),/Revision conflict/);
    assert.equal((await save(1)).rows[0].revision,2);
    await assert.rejects(()=>save(1),/Revision conflict/);
    await assert.rejects(()=>db.query("update public.fitflow_workspaces set revision=5"),/permission denied/);
    await asUser(2);
    assert.equal((await db.query("select * from public.fitflow_workspaces")).rows.length,0);
    assert.equal((await save(0)).rows[0].revision,1);
    await db.exec("reset role; set role anon");
    await assert.rejects(()=>save(0),/permission denied/);
    await assert.rejects(()=>db.query("select * from public.fitflow_workspaces"),/permission denied/);
  } finally { await db.close(); }
});
