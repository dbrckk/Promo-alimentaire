import assert from "node:assert/strict";

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
    signal:AbortSignal.timeout(12000)
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
  assert.ok(Array.isArray(offerManifest.files),"Offers manifest is missing its files list.");

  console.log("[pages] Published commit "+expectedSha+
    " is accessible over HTTPS, with application, styles, service worker and offers manifest.");
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
