/**
 * Source discovery only. None of these entries is an active, priced offer.
 * "advertisedMaxPercent" is a possible marketing ceiling, NEVER a confirmed saving.
 */
export const SOURCE_SCOPES=new Set(["food","free-food","food-odr","other-50","all"]);

function norm(value){
  return String(value ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
}

export function filterDiscoveryProviders(providers,{scope="food",search=""}={}){
  const selection=SOURCE_SCOPES.has(scope)?scope:"food";
  const query=norm(search);
  const rank={essentiel:0,fort:1,"complément":2};
  return (Array.isArray(providers)?providers:[])
    .filter((source)=>{
      const segment=source.segment==="other"?"other":"food";
      if(selection==="food" && segment!=="food") return false;
      if(selection==="free-food"
        && !(segment==="food" && (source.potentialFree===true
          || (source.kinds || []).includes("aide alimentaire")))) return false;
      if(selection==="food-odr"
        && !(segment==="food" && (source.kinds || []).some((kind)=>
          /(?:ODR|cashback|remboursement|coupon|bons de réduction)/i.test(kind)))) return false;
      if(selection==="other-50"
        && !(segment==="other"
          && Number.isFinite(source.advertisedMaxPercent)
          && source.advertisedMaxPercent>=50)) return false;
      if(!query) return true;
      return norm([
        source.name,source.note,source.targetLabel,...(source.kinds || [])
      ].filter(Boolean).join(" ")).includes(query);
    })
    .sort((a,b)=>{
      const group=(a.segment==="other"?1:0)-(b.segment==="other"?1:0);
      if(group) return group;
      const priority=(rank[a.priority] ?? 3)-(rank[b.priority] ?? 3);
      if(priority) return priority;
      return a.name.localeCompare(b.name,"fr");
    });
}

export function validateDiscoveryProviders(providers){
  if(!Array.isArray(providers)) return ["Catalogue des sources invalide."];
  const errors=[];
  const ids=new Set();
  for(const [index,source] of providers.entries()){
    const id=String(source?.id ?? "");
    if(!id || ids.has(id)) errors.push("Identifiant manquant ou dupliqué à l'index "+index);
    ids.add(id);
    if(typeof source?.name!=="string" || !source.name.trim()) errors.push(id+": nom manquant.");
    for(const field of ["url",...(source.verificationUrl?["verificationUrl"]:[])]){
      try{
        const parsed=new URL(source[field]);
        if(parsed.protocol!=="https:") throw Error("HTTPS requis");
      }catch{
        errors.push(id+": "+field+" invalide.");
      }
    }
    if(source.segment==="other"
      && !(Number.isFinite(source.advertisedMaxPercent)
        && source.advertisedMaxPercent>=50 && source.advertisedMaxPercent<=100
        && source.verificationUrl)){
      errors.push(id+": une source hors alimentaire exige un plafond annoncé de 50 % ou plus avec preuve.");
    }
    if(source.discoveryStatus!==undefined && !["unconfirmed"].includes(source.discoveryStatus)){
      errors.push(id+": statut de découverte inconnu.");
    }
    if(source.discoveryStatus==="unconfirmed" && source.discoveryVerifiedAt){
      errors.push(id+": source non confirmée ne doit pas afficher une vérification récente.");
    }
    if(source.segment && !["food","other"].includes(source.segment)){
      errors.push(id+": segment inconnu.");
    }
    if(source.advertisedMaxPercent!==undefined
      && (!Number.isFinite(source.advertisedMaxPercent) || source.advertisedMaxPercent<0
        || source.advertisedMaxPercent>100)){
      errors.push(id+": taux annoncé invalide.");
    }
    if(source.potentialFree && source.advertisedMaxPercent!==undefined){
      errors.push(id+": ne pas transformer un don ou test en taux remboursé.");
    }
  }
  return errors;
}
