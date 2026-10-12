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
  // Archival exceptions only affect the monitoring alert level; they do
  // not re-activate dated offers, grant a price, or suppress missing files.
  // Each exception must refer to a declared file and explain why that
  // historical snapshot remains in the PWA for audit.
  const archivedOnly={};
  if(manifest.archivedOnly!==undefined){
    if(!manifest.archivedOnly || typeof manifest.archivedOnly!=="object"
      || Array.isArray(manifest.archivedOnly)){
      issues.push("archivedOnly doit associer des fichiers déclarés à une justification.");
    }else{
      for(const [file,reason] of Object.entries(manifest.archivedOnly)){
        if(!seen.has(file)){
          issues.push("Archive non déclarée dans files : "+file+".");
        }else if(typeof reason!=="string" || !reason.trim()
          || reason.length>240){
          issues.push("Justification d'archive absente ou trop longue : "+file+".");
        }else{
          archivedOnly[file]=reason.trim();
        }
      }
    }
  }
  return {
    ok:issues.length===0,
    files:issues.length===0?files:[],
    archivedOnly:issues.length===0?archivedOnly:{},
    issues
  };
}
