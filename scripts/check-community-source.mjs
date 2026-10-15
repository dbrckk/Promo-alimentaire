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
