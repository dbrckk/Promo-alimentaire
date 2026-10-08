import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const source=readFileSync(new URL("../sw.js",import.meta.url),"utf8");

test("le nettoyage des caches ne touche qu'à Promo-alimentaire",()=>{
  assert.match(source,/CACHE_PREFIX="promo-alimentaire-"/);
  assert.match(source,/key\.startsWith\(CACHE_PREFIX\) && key!==CACHE/);
  assert.doesNotMatch(source,/filter\(\(key\)=>key!==CACHE\)/);
});

test("seules les réponses HTTP réussies remplacent un asset hors ligne",()=>{
  assert.match(source,/if\(response\.ok\)\s*\{/);
  assert.match(source,/event\.waitUntil\(\s*caches\.open\(CACHE\)/);
  assert.match(source,/caches\.match\(event\.request\)/);
});

test("une nouvelle version PWA peut prendre le contrôle des clients",()=>{
  assert.match(source,/self\.skipWaiting\(\)/);
  assert.match(source,/self\.clients\.claim\(\)/);
});
