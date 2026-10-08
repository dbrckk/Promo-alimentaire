import test from "node:test";
import assert from "node:assert/strict";
import {
  makeSourceSyncStatus,writeSourceSyncStatus,sourceSyncStatusFile
} from "../scripts/source-sync-status.mjs";

test("une source 0/11 doit signaler l'indisponibilité sans prolongation",()=>{
  const status=makeSourceSyncStatus({
    status:"unavailable",reason:"HTTP 403 sur 11 pages",
    extractedCount:0,previousSnapshotCount:11,
    checkedAt:"2026-10-08T14:00:00Z"
  });
  assert.equal(status.status,"unavailable");
  assert.equal(status.extractedCount,0);
  assert.equal(status.previousSnapshotCount,11);
});

test("une source partiellement confirmée a un état distinct",()=>{
  const status=makeSourceSyncStatus({
    status:"partial",extractedCount:2,previousSnapshotCount:5
  });
  assert.equal(status.status,"partial");
});

test("des nombres incohérents ou des dates invalides sont refusés",()=>{
  assert.throws(()=>makeSourceSyncStatus({
    status:"unknown",extractedCount:1,previousSnapshotCount:1
  }),/inconnu/);
  assert.throws(()=>makeSourceSyncStatus({
    status:"updated",extractedCount:-1,previousSnapshotCount:1
  }),/invalide/);
  assert.throws(()=>makeSourceSyncStatus({
    status:"updated",checkedAt:"not-a-date"
  }),/invalide/);
});

test("le mode lecture n'écrit jamais dans le dépôt",async()=>{
  const status=await writeSourceSyncStatus("carrefour",{
    status:"unavailable",extractedCount:0,previousSnapshotCount:11
  },{write:false});
  assert.equal(status.status,"unavailable");
});


test("chaque synchroniseur écrit un fichier différent, sans conflit Git",()=>{
  const a=sourceSyncStatusFile("carrefour").pathname;
  const b=sourceSyncStatusFile("leclerc").pathname;
  assert.ok(a.endsWith("/source-sync-carrefour.json"));
  assert.ok(b.endsWith("/source-sync-leclerc.json"));
  assert.notEqual(a,b);
});
