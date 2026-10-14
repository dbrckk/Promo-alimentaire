import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {inspectImportManifest} from "../src/import-manifest.js";

// Verify the actual public GitHub Pages release, not only the uploaded
// artifact. An old CDN version or missing asset must fail the deployment.
const rawUrl=String(process.env.DEPLOY_URL || "");
const expectedSha=String(process.env.EXPECTED_DEPLOY_SHA || "");
assert.match(expectedSha,/^[a-f0-9]{40}$/i,"EXPECTED_DEPLOY_SHA must be a full commit SHA.");
const root=new URL(rawUrl);
assert.equal(root.protocol,"https:","Pages must be served over HTTPS.");
assert.equal(root.hostname,"dbrckk.github.io","Unexpected deployment hostname.");
assert.equal(root.pathname,"/Promo-alimentaire/","Unexpected GitHub Pages base path.");

const delay=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const maxAttempts=20;
const retryDelayMs=5000;

async function fetchAsset(path){
  const url=new URL(path,root);
  // A commit-specific query prevents a previously cached snapshot from
  // passing as the currently deployed version.
  url.searchParams.set("release",expectedSha);
  const response=await fetch(url,{
    headers:{Accept:"*/*","Cache-Control":"no-cache"},
    redirect:"follow",
    signal:AbortSignal.timeout(12000),
    cache:"no-store"
  });
  assert.equal(new URL(response.url).origin,root.origin,"Asset redirect left the Pages origin.");
  assert.equal(response.ok,true,path+" returned HTTP "+response.status);
  return response;
}

async function inspectDeployment(){
  const marker=await (await fetchAsset("./deployment.json")).json();
  assert.equal(marker.commit,expectedSha,"GitHub Pages still serves a different commit.");

  const index=await (await fetchAsset("./index.html")).text();
  assert.match(index,/<title>Promo Alimentaire<\/title>/i);
  assert.match(index,/src\/app\.js/);
  assert.match(index,/manifest\.webmanifest/);

  const manifest=await (await fetchAsset("./manifest.webmanifest")).json();
  assert.equal(manifest.display,"standalone");
  assert.equal(manifest.start_url,"./");

  const js=await (await fetchAsset("./src/app.js")).text();
  assert.ok(js.length>10000,"Application JavaScript unexpectedly short.");

  const css=await (await fetchAsset("./styles.css")).text();
  assert.ok(css.length>1000,"Application CSS unexpectedly short.");

  const sw=await (await fetchAsset("./sw.js")).text();
  assert.match(sw,/STATIC_ASSETS/);

  const offerManifest=await (await fetchAsset("./data/import/index.json")).json();
  const validated=inspectImportManifest(offerManifest);
  assert.equal(validated.ok,true,
    "The published offers manifest contains invalid or unsafe filenames: "+
      validated.issues.join(" | "));

  // The release marker proves the *intended* commit, not the bytes that the
  // CDN actually served. Verify the complete application shell and every
  // imported offer snapshot against the checked-out, CI-validated commit.
  // This also catches stale/missing source status JSON and daily brochures.
  const localWorker=await readFile(new URL("../sw.js",import.meta.url),"utf8");
  const staticList=localWorker.match(/const\s+STATIC_ASSETS\s*=\s*\[([\s\S]*?)\]/)?.[1];
  assert.ok(staticList,"Service worker's static asset list is missing.");
  const staticAssets=[...staticList.matchAll(/["'](\.\/[^"']+)["']/g)]
    .map((item)=>item[1]);
  assert.ok(staticAssets.length>=25,"Unexpectedly few PWA offline assets.");
  const assets=new Set([
    "./index.html","./styles.css","./manifest.webmanifest","./icon.svg",
    "./sw.js","./data/import/index.json",
    ...staticAssets,
    ...validated.files.map((file)=>"./data/import/"+file)
  ]);
  assets.delete("./"); // Root navigation serves the same bytes as index.html.
  for(const asset of assets){
    assert.match(asset,/^\.\/[a-zA-Z0-9_./-]+$/,"Unsafe asset path.");
    assert.ok(!asset.includes("..") && !asset.includes("//"),
      "Unsafe PWA asset path: "+asset);
  }

  const wanted=[...assets];
  const digested=(buffer)=>createHash("sha256").update(buffer).digest("hex");
  // A small bounded pool keeps the publish check efficient, without
  // saturating the GitHub Pages CDN or Android smoke setup.
  let cursor=0;
  let verified=0;
  await Promise.all(Array.from({length:Math.min(6,wanted.length)},async()=>{
    while(cursor<wanted.length){
      const asset=wanted[cursor++];
      const path=asset.slice(2);
      const local=await readFile(new URL("../"+path,import.meta.url));
      const remote=Buffer.from(await (await fetchAsset(asset)).arrayBuffer());
      assert.equal(digested(remote),digested(local),
        "CDN asset differs from checked-out commit: "+asset);
      verified++;
    }
  }));

  console.log("[pages] Published commit "+expectedSha+
    " is accessible over HTTPS; SHA-256 matches for "+verified+
    " shell, JavaScript, CSS, service-worker, source status and offer-data assets.");
}

let lastError=null;
for(let attempt=1;attempt<=maxAttempts;attempt++){
  try{
    await inspectDeployment();
    lastError=null;
    break;
  }catch(error){
    lastError=error;
    console.warn("[pages] Public release attempt "+attempt+"/"+maxAttempts+": "+error.message);
    if(attempt<maxAttempts) await delay(retryDelayMs);
  }
}
if(lastError) throw lastError;
