import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";

export function checkFrontendContract({html,sw,readModule}){
  const errors=[];
  const ids=[...String(html).matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map((match)=>match[1]);
  const idSet=new Set(ids);
  const seen=new Set();
  for(const id of ids){
    if(seen.has(id)) errors.push("Identifiant HTML dupliqué : #"+id);
    seen.add(id);
  }

  const cacheBody=String(sw).match(/const\s+STATIC_ASSETS\s*=\s*\[([\s\S]*?)\]/)?.[1] || "";
  const assets=new Set([...cacheBody.matchAll(/["'](\.\/[^"']+)["']/g)]
    .map((match)=>match[1].slice(2)));
  if(!assets.size) errors.push("Liste STATIC_ASSETS introuvable ou vide.");

  const queue=["src/app.js"];
  const checked=new Set();
  let checkedSelectors=0;
  while(queue.length){
    const modulePath=queue.shift();
    if(checked.has(modulePath)) continue;
    checked.add(modulePath);
    if(modulePath.startsWith("../") || path.posix.isAbsolute(modulePath)){
      errors.push("Import hors du projet : "+modulePath);
      continue;
    }
    let code;
    try{code=readModule(modulePath);}
    catch(error){
      errors.push("Module requis introuvable : "+modulePath);
      continue;
    }
    if(!assets.has(modulePath)){
      errors.push("Module manquant du cache PWA : "+modulePath);
    }

    // Only fixed ID selectors are part of the JavaScript / HTML contract.
    for(const match of code.matchAll(/document\.querySelector\(\s*["']#([\w-]+)["']\s*\)/g)){
      checkedSelectors+=1;
      if(!idSet.has(match[1])){
        errors.push("Élément HTML absent : #"+match[1]+" ("+modulePath+")");
      }
    }
    for(const match of code.matchAll(/document\.getElementById\(\s*["']([\w-]+)["']\s*\)/g)){
      checkedSelectors+=1;
      if(!idSet.has(match[1])){
        errors.push("Élément HTML absent : #"+match[1]+" ("+modulePath+")");
      }
    }
    for(const match of code.matchAll(/(?:from\s*|import\s*)["'](\.\.?\/[^"']+\.js)["']/g)){
      const resolved=path.posix.normalize(path.posix.join(
        path.posix.dirname(modulePath),match[1]
      ));
      queue.push(resolved);
    }
  }

  return {
    ok:errors.length===0,
    errors,
    moduleCount:checked.size,
    selectorCount:checkedSelectors,
    cachedAssetCount:assets.size
  };
}

const invokedPath=process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if(import.meta.url===invokedPath){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
  const read=(relative)=>readFileSync(path.join(root,relative),"utf8");
  const result=checkFrontendContract({
    html:read("index.html"),
    sw:read("sw.js"),
    readModule:read
  });
  if(!result.ok){
    for(const error of result.errors) console.error("[frontend] "+error);
    process.exitCode=1;
  }else{
    console.log(
      "[frontend] "+result.moduleCount+" modules importés, "+
      result.selectorCount+" sélecteurs DOM, "+
      result.cachedAssetCount+" assets PWA : OK"
    );
  }
}
