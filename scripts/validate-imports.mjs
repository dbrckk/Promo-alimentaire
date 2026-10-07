import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateImportBatch } from "../src/ingestion.js";

const directory=new URL("../data/import/",import.meta.url);
let files=[];
try{
  files=(await readdir(directory)).filter((name)=>name.endsWith(".json")).sort();
}catch(error){
  if(error.code!=="ENOENT") throw error;
}

let failed=false;
let total=0;

for(const file of files){
  const path=join(directory.pathname,file);
  const content=await readFile(path,"utf8");
  let parsed;
  try{
    parsed=JSON.parse(content);
  }catch(error){
    failed=true;
    console.error(`[import] ${file}: JSON invalide — ${error.message}`);
    continue;
  }
  const records=Array.isArray(parsed) ? parsed : parsed.offers;
  const result=validateImportBatch(records);
  total+=Array.isArray(records) ? records.length : 0;
  if(!result.ok){
    failed=true;
    console.error(`[import] ${file}: ${result.errors.length} erreur(s)`);
    for(const issue of result.errors){
      console.error(`  index ${issue.index}: ${issue.errors.join(" | ")}`);
    }
  }else{
    console.log(`[import] ${file}: ${result.normalized.length} offre(s) valides`);
  }
}

console.log(`[import] ${files.length} fichier(s), ${total} offre(s) examinées`);
if(failed) process.exitCode=1;
