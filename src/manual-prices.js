const STORES=new Set(["carrefour","leclerc"]);
const CODE_PATTERN=/^(?:\d{8}|\d{12,14})$/;
const MAX_PRICE=10000;
const MAX_AGE_DAYS=30;
const DAY_MS=24*60*60*1000;

export function normalizeManualPrice(input,{now=new Date()}={}){
  const code=String(input?.code || "").replace(/\s/g,"");
  const store=String(input?.store || "");
  const name=String(input?.storeName || "").trim().replace(/\s+/g," ");
  const postcode=String(input?.postcode || "").trim();
  const date=String(input?.date || "");
  const price=Number(String(input?.price ?? "").replace(",","."));
  const current=new Date(now);
  if(!CODE_PATTERN.test(code)) throw new Error("Code-barres du produit invalide.");
  if(!STORES.has(store)) throw new Error("Enseigne non prise en charge.");
  if(name.length<3 || name.length>90) throw new Error("Précise le nom du magasin (3 à 90 caractères).");
  if(!/^\d{5}$/.test(postcode)) throw new Error("Code postal du magasin invalide.");
  if(!Number.isFinite(price) || price<=0 || price>MAX_PRICE) {
    throw new Error("Prix strictement positif requis (maximum 10 000 €).");
  }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Date du relevé invalide.");
  const at=new Date(date+"T12:00:00.000Z");
  if(Number.isNaN(at.getTime()) || at.toISOString().slice(0,10)!==date
    || Number.isNaN(current.getTime()) || at.getTime()>current.getTime()+DAY_MS){
    throw new Error("Date du relevé invalide ou future.");
  }
  if(current.getTime()-at.getTime()>MAX_AGE_DAYS*DAY_MS){
    throw new Error("Relevé trop ancien : maximum 30 jours.");
  }
  return {
    id:JSON.stringify([store,code,name.toLocaleLowerCase("fr"),postcode,date]),
    code,store,storeName:name,postcode,date,
    price:Math.round(price*100)/100,
    source:"manual"
  };
}

export function loadManualPrices(value,{now=new Date(),limit=120}={}){
  const safe=Array.isArray(value) ? value : [];
  const unique=new Map();
  for(const candidate of safe){
    try{
      const record=normalizeManualPrice(candidate,{now});
      unique.set(record.id,record);
    }catch{ /* Ignore old or invalid records, never make false price claims. */ }
  }
  return [...unique.values()].slice(-Math.max(1,limit));
}

export function saveManualPrice(records,input,{now=new Date(),limit=120}={}){
  const entry=normalizeManualPrice(input,{now});
  return [...loadManualPrices(records,{now,limit}).filter((x)=>x.id!==entry.id),entry]
    .slice(-Math.max(1,limit));
}

export function removeManualPrice(records,id,{now=new Date()}={}){
  return loadManualPrices(records,{now}).filter((record)=>record.id!==id);
}

export function manualPriceObservations(records,{store,code,now=new Date()}={}){
  return loadManualPrices(records,{now})
    .filter((x)=>x.store===store && x.code===String(code))
    .map((x)=>({
      id:x.id,productCode:x.code,
      price:x.price,currency:"EUR",date:x.date,
      source:"manual",manual:true,proofType:"manual",
      isDiscounted:false,priceWithoutDiscount:null,discountType:null,
      locationId:null,locationLat:null,locationLon:null,distanceKm:null,
      storeName:x.storeName,postcode:x.postcode,city:"",
      retailerText:x.store==="carrefour"?"Carrefour":"E.Leclerc"
    }));
}

export function mergeManualPriceObservations(priceByCode,records,{store,now=new Date()}={}){
  const output={};
  for(const [code,observations] of Object.entries(priceByCode || {})){
    output[code]=Array.isArray(observations)?[...observations]:[];
  }
  for(const entry of loadManualPrices(records,{now})){
    if(entry.store!==store) continue;
    const manual=manualPriceObservations([entry],{
      store,code:entry.code,now
    });
    output[entry.code]=[...(output[entry.code] || []),...manual];
  }
  return output;
}
