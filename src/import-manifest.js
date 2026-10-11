// The manifest is data, not an authority to load arbitrary URLs/files.
// Restrict it to short lowercase JSON basenames under data/import/.
export const MAX_IMPORT_FILES=60;
const SAFE_FILENAME=/^[a-z0-9][a-z0-9-]{0,99}\.json$/;

export function inspectImportManifest(manifest){
  const issues=[];
  const files=[];
  if(!manifest || typeof manifest!=="object" || Array.isArray(manifest)
    || !Array.isArray(manifest.files)){
    return {ok:false,files:[],issues:["Manifeste invalide : files doit être un tableau."]};
  }
  if(manifest.files.length>MAX_IMPORT_FILES){
    issues.push("Le manifeste dépasse "+MAX_IMPORT_FILES+" fichiers.");
  }
  const seen=new Set();
  for(const [index,file] of manifest.files.entries()){
    if(typeof file!=="string" || !SAFE_FILENAME.test(file)
      || file==="index.json" || file.startsWith("source-sync-")){
      issues.push("Nom d'import non autorisé à la position "+index+".");
      continue;
    }
    if(seen.has(file)){
      issues.push("Fichier d'import répété : "+file+".");
      continue;
    }
    seen.add(file);
    files.push(file);
  }
  return {ok:issues.length===0,files:issues.length===0?files:[],issues};
}
