import { reconcile, equal } from "./sync-merge.js";
import { validate } from "./storage.js";

// No local commit until the server has accepted the revision. Retrying is idempotent.
export async function synchronize({ local, metadata, read, write, choices, expectedRemote }) {
  validate(local);
  const remote = await read();
  const version = remote?.revision || 0;
  if (expectedRemote !== undefined && expectedRemote !== version)
    throw Error("雲端資料已變更，請重新同步並確認衝突。");
  if (!remote) {
    if (metadata.remoteRevision > 0) throw Error("雲端紀錄目前不存在，請確認服務狀態後重試。");
    const revision = await write(0, local);
    return {data:local, metadata:{base:structuredClone(local), remoteRevision:revision, lastSync:Date.now()}, conflicts:[]};
  }
  const result = reconcile(metadata.base, local, remote.data, choices);
  if (result.conflicts.length) return {...result, remoteRevision:version};
  const revision = equal(result.data, remote.data) ? version : await write(version, result.data);
  return {...result, metadata:{base:structuredClone(result.data), remoteRevision:revision, lastSync:Date.now()}};
}
