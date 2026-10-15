// Informational real-network integration check. Never make CI pass by
// fabricating an offer and never fail a code build on third-party outages.
import {fetchCommunityDiscounts} from "../src/community-deals.js";
let reachable=0;
for(const store of ["carrefour","leclerc"]){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),11000);
  try{
    const result=await fetchCommunityDiscounts({
      store,maxPages:1,signal:ctrl.signal
    });
    reachable++;
    console.log("[community] "+store+": API accessible, "+
      result.results.length+" remises prouvées / "+
      (result.scannedTotal??"?")+" résultats publics; couverture limitée");
    if(result.results.length===0)
      console.log("::notice title=Open Prices "+store+"::Aucune baisse exploitable dans la première page ; ne signifie pas absence de promotions.");
  }catch(error){
    console.log("::warning title=Open Prices "+store+" inaccessible::"+
      String(error?.message||error).replace(/[\r\n:%]/g," ").slice(0,150));
  }finally{
    clearTimeout(timer);
  }
}
if(!reachable) console.log("::warning title=Aucune source communautaire joignable::Les contrôles fonctionnels utilisent des réponses déterministes ; la PWA affiche une erreur transparente tant que les données publiques sont indisponibles.");


// Diagnose actual public coverage, not just HTTP availability. Keep the
// responses tiny and requests bounded. These counts do not create offers.
const probes=[
  ["global-discount",{"currency":"EUR","type":"PRODUCT","price_is_discounted":"true"}],
  ["global-discount-recent",{"currency":"EUR","type":"PRODUCT","price_is_discounted":"true","date__gte":"2026-09-15"}],
  ["carrefour-any",{"currency":"EUR","type":"PRODUCT","location__osm_name__contains":"Carrefour"}],
  ["carrefour-discount",{"currency":"EUR","type":"PRODUCT","price_is_discounted":"true","location__osm_name__contains":"Carrefour"}],
  ["leclerc-any",{"currency":"EUR","type":"PRODUCT","location__osm_name__contains":"Leclerc"}],
  ["leclerc-discount",{"currency":"EUR","type":"PRODUCT","price_is_discounted":"true","location__osm_name__contains":"Leclerc"}]
];
for(const [label,query] of probes){
  const params=new URLSearchParams({...query,size:"1",order_by:"-date"});
  try{
    const response=await fetch("https://prices.openfoodfacts.org/api/v1/prices?"+params,{
      headers:{Accept:"application/json"},signal:AbortSignal.timeout(10000)
    });
    if(!response.ok){console.log("[coverage] "+label+" HTTP "+response.status);continue;}
    const data=await response.json();
    const sample=data.items?.[0];
    console.log("[coverage] "+label+" total="+data.total+
      " exampleDate="+(sample?.date||"none")+
      " exampleStore="+String(sample?.location?.osm_name||"none").slice(0,60)+
      " examplePrice="+String(sample?.price||"none"));
  }catch(error){
    console.log("[coverage] "+label+" failed="+String(error.message||error).slice(0,100));
  }
}
