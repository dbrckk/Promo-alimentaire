import { isOfferActive, validateImportBatch } from "./ingestion.js";

export async function loadImportedOffers({fetchImpl=fetch,now=new Date()}={}) {
  const manifestUrl=new URL("../data/import/index.json",import.meta.url);
  const manifestResponse=await fetchImpl(manifestUrl,{headers:{Accept:"application/json"}});
  if(!manifestResponse.ok) {
    throw new Error(`Manifest d'offres indisponible (${manifestResponse.status}).`);
  }
  const manifest=await manifestResponse.json();
  const files=Array.isArray(manifest?.files) ? manifest.files : [];
  const imported=[];
  const errors=[];
  const ids=new Set();

  for(const file of files){
    const url=new URL(`../data/import/${file}`,import.meta.url);
    try{
      const response=await fetchImpl(url,{headers:{Accept:"application/json"}});
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload=await response.json();
      const records=Array.isArray(payload) ? payload : payload?.offers;
      const result=validateImportBatch(records);
      if(!result.ok){
        errors.push({file,issues:result.errors});
        continue;
      }
      for(const offer of result.normalized){
        if(ids.has(offer.id)){
          errors.push({file,issues:[{errors:[`Identifiant dupliqué entre fichiers : ${offer.id}`]}]});
          continue;
        }
        ids.add(offer.id);
        if(isOfferActive(offer,now)) imported.push(offer);
      }
    }catch(error){
      errors.push({file,issues:[{errors:[error.message]}]});
    }
  }

  return {
    offers:imported,
    errors,
    manifestVerifiedAt:manifest?.verifiedAt || null,
    fileCount:files.length
  };
}

export function mergeOffers(baseOffers,importedOffers) {
  const map=new Map();
  for(const offer of [...(baseOffers || []),...(importedOffers || [])]){
    if(!offer?.id) continue;
    map.set(offer.id,offer);
  }
  return [...map.values()];
}
