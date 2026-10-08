import test from "node:test";
import assert from "node:assert/strict";
import {checkFrontendContract} from "../scripts/check-frontend.mjs";

const base={
  html:'<main id="root"></main><div id="output"></div>',
  sw:'const STATIC_ASSETS=["./src/app.js","./src/helper.js"]',
  readModule:(path)=>({
    "src/app.js":'import {helper} from "./helper.js"; const el=document.querySelector("#output");',
    "src/helper.js":'export const helper=1;'
  })[path]
};

test("le contrat valide les modules récursifs, le DOM et le cache",()=>{
  const result=checkFrontendContract(base);
  assert.equal(result.ok,true);
  assert.equal(result.moduleCount,2);
  assert.equal(result.selectorCount,1);
});

test("un sélecteur absent ou un id dupliqué fait échouer le contrôle",()=>{
  const result=checkFrontendContract({
    ...base,
    html:'<div id="root"></div><div id="root"></div>',
    readModule:(path)=>path==="src/app.js"
      ? 'document.getElementById("missing")'
      : ""
  });
  assert.equal(result.ok,false);
  assert.ok(result.errors.some((e)=>e.includes("dupliqué")));
  assert.ok(result.errors.some((e)=>e.includes("#missing")));
});

test("un module transitif absent du cache est détecté",()=>{
  const result=checkFrontendContract({
    ...base,
    sw:'const STATIC_ASSETS=["./src/app.js"]'
  });
  assert.equal(result.ok,false);
  assert.ok(result.errors.some((e)=>e.includes("src/helper.js")));
});

test("un module absent sur le disque produit une erreur claire",()=>{
  const result=checkFrontendContract({
    ...base,
    readModule:(path)=>{
      if(path==="src/app.js") return 'import "./helper.js";';
      throw new Error("ENOENT");
    }
  });
  assert.equal(result.ok,false);
  assert.ok(result.errors.some((e)=>e.includes("Module requis introuvable")));
});
