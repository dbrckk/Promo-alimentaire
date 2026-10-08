import {canonicalGtin} from "./gtin.js";

const RETAILER_PAGES={
  carrefour:{hosts:new Set(["carrefour.fr","www.carrefour.fr"]),prefix:"/p/"},
  leclerc:{hosts:new Set(["e.leclerc","www.e.leclerc"]),prefix:"/fp/"}
};

/**
 * Check that a merchant product URL identifies the very SKU claimed by
 * the import record. This validates *identity provenance*, NOT whether
 * the advertised promotion is still available locally.
 */
export function validateRetailerGtinEvidence({providerId,eans=[],eanEvidenceUrl}={}){
  const rules=RETAILER_PAGES[providerId];
  if(!rules || !Array.isArray(eans) || eans.length===0){
    return {ok:true,reason:null};
  }
  if(eans.length!==1){
    return {ok:false,reason:"Une fiche distributeur ne peut pas prouver plusieurs GTIN distincts."};
  }
  const expected=canonicalGtin(eans[0]);
  if(!expected){
    return {ok:false,reason:"GTIN déclaré invalide."};
  }
  let url;
  try{
    url=new URL(String(eanEvidenceUrl || ""));
  }catch{
    return {ok:false,reason:"URL de preuve distributeur invalide."};
  }
  if(url.protocol!=="https:" || !rules.hosts.has(url.hostname.toLowerCase())
    || !url.pathname.startsWith(rules.prefix)){
    return {ok:false,reason:"La preuve doit être une fiche produit officielle du distributeur."};
  }
  const match=/-([0-9]{8}|[0-9]{12,14})\/?$/.exec(url.pathname);
  if(!match || canonicalGtin(match[1])!==expected){
    return {ok:false,reason:"Le GTIN de la fiche produit ne correspond pas au GTIN déclaré."};
  }
  return {ok:true,reason:null};
}
