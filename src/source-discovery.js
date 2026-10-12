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

export function filterDiscoveryProviders(providers,{scope="food",search="",store=null}={}){
  const selection=SOURCE_SCOPES.has(scope)?scope:"food";
  const query=norm(search);
  const selectedStore=["carrefour","leclerc"].includes(store) ? store : null;
  const rank={essentiel:0,fort:1,"complément":2};
  return (Array.isArray(providers)?providers:[])
    .filter((source)=>{
      // Match the same merchant chosen in the main filter. Independent
      // food-donation, cashback and assistance services (stores: [])
      // remain visible for either selection. The directory never treats
      // a merchant-specific program as eligible at the competing chain.
      const supportedStores=Array.isArray(source.stores) ? source.stores : [];
      if(selectedStore && supportedStores.length
        && !supportedStores.includes("all")
        && !supportedStores.includes(selectedStore)) return false;
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

function dateTodayParis(){
  // Catalogue verification is a civil day in France, not UTC midnight.
  const parts=new Intl.DateTimeFormat("en-GB",{
    timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(new Date());
  const get=(type)=>parts.find((part)=>part.type===type)?.value;
  return [get("year"),get("month"),get("day")].join("-");
}

function isActualPastOrTodayDate(value,today){
  if(typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed=new Date(value+"T00:00:00Z");
  return Number.isFinite(parsed.getTime())
    && parsed.toISOString().slice(0,10)===value
    && value<=today;
}

export function validateDiscoveryProviders(providers){
  if(!Array.isArray(providers)) return ["Catalogue des sources invalide."];
  const errors=[];
  const ids=new Set();
  const today=dateTodayParis();
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
    if(source.discoveryVerifiedAt!==undefined
      && !isActualPastOrTodayDate(source.discoveryVerifiedAt,today)){
      errors.push(id+": discoveryVerifiedAt doit être une date civile valide, non future.");
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
