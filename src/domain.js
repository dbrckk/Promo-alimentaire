import {simulateProductOffer} from "./offer-simulator.js";

export function computeSaving(offer) {
  const cap=Number.isFinite(offer.savingCapAmount) ? Math.max(0,offer.savingCapAmount) : Infinity;
  if (Number.isFinite(offer.savingAmount)) return roundMoney(Math.min(cap,offer.savingAmount));
  if (Number.isFinite(offer.basePrice) && Number.isFinite(offer.savingPercent)) {
    return roundMoney(Math.min(cap,offer.basePrice * offer.savingPercent / 100));
  }
  return null;
}

export function effectivePercent(offer) {
  if (Number.isFinite(offer.savingPercent)) return offer.savingPercent;
  if (Number.isFinite(offer.basePrice) && offer.basePrice > 0 && Number.isFinite(offer.savingAmount)) {
    return Math.round((offer.savingAmount / offer.basePrice) * 10000) / 100;
  }
  return null;
}

export function rankOffers(offers, sort = "percent", now=new Date(),scenario={}) {
  return [...offers].sort((a, b) => {
    if(sort==="estimated"){
      const av=simulateProductOffer(a,scenario);
      const bv=simulateProductOffer(b,scenario);
      const aGain=av?.status==="estimated" ? av.saving : null;
      const bGain=bv?.status==="estimated" ? bv.saving : null;
      // Unknown or ineligible offers always appear below numeric simulations.
      if(Number.isFinite(aGain) || Number.isFinite(bGain)){
        if(!Number.isFinite(aGain)) return 1;
        if(!Number.isFinite(bGain)) return -1;
        if(aGain!==bGain) return bGain-aGain;
      }
    }
    if (sort === "amount") return nullableNumber(computeSaving(b)) - nullableNumber(computeSaving(a));
    if (sort === "freshness") return new Date(b.verifiedAt) - new Date(a.verifiedAt);
    if (sort === "deadline") {
      const ad=offerDeadline(a,now);
      const bd=offerDeadline(b,now);
      const av=ad && ad.daysUntil>=0 ? ad.daysUntil : Infinity;
      const bv=bd && bd.daysUntil>=0 ? bd.daysUntil : Infinity;
      if(av!==bv) return av-bv;
    }
    return nullableNumber(effectivePercent(b)) - nullableNumber(effectivePercent(a));
  });
}

export function filterOffers(offers, { store, channel=null, search = "", savingsFocus="all" }) {
  const needle = search.trim().toLocaleLowerCase("fr");
  return offers.filter((offer) => {
    const storeMatch = offer.stores.includes(store) || offer.stores.includes("all");
    if (!storeMatch) return false;
    const channels=Array.isArray(offer.channels) ? offer.channels : [];
    const channelMatch=!channel || channels.length===0 || channels.includes(channel) || channels.includes("all");
    if(!channelMatch) return false;
    const pct=effectivePercent(offer);
    if(savingsFocus==="at-least-50" && (!Number.isFinite(pct) || pct<50)) return false;
    if(savingsFocus==="full-refund"
      && !(offer.scope==="produit" && offer.mechanism==="manufacturer_refund"
        && pct===100)) return false;
    if (!needle) return true;
    return [offer.title, offer.provider, offer.category, offer.type]
      .filter(Boolean).join(" ").toLocaleLowerCase("fr").includes(needle);
  });
}

export function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function nullableNumber(value) {
  return Number.isFinite(value) ? value : -Infinity;
}


export function offerDeadline(offer,now=new Date()){
  const current=new Date(now);
  if(Number.isNaN(current.getTime())) return null;
  const candidates=[
    {kind:"expires",value:offer?.expiresAt},
    {kind:"review",value:offer?.reviewAfter}
  ].filter((item)=>item.value).map((item)=>{
    const raw=String(item.value);
    const date=new Date(raw.length===10 ? raw+"T23:59:59" : raw);
    return {...item,date};
  }).filter((item)=>!Number.isNaN(item.date.getTime()));

  if(!candidates.length) return null;
  candidates.sort((a,b)=>a.date-b.date);
  const next=candidates[0];
  const currentDay=Date.UTC(
    current.getUTCFullYear(),current.getUTCMonth(),current.getUTCDate()
  );
  const deadlineDay=Date.UTC(
    next.date.getUTCFullYear(),next.date.getUTCMonth(),next.date.getUTCDate()
  );
  const daysUntil=Math.round((deadlineDay-currentDay)/(24*60*60*1000));
  const prefix=next.kind==="expires" ? "Expire" : "Révision";
  const label=daysUntil<0
    ? `${prefix} dépassée`
    : daysUntil===0
      ? `${prefix} aujourd’hui`
      : daysUntil===1
        ? `${prefix} demain`
        : `${prefix} dans ${daysUntil} j`;
  return {
    kind:next.kind,
    date:next.date.toISOString(),
    daysUntil,
    urgent:daysUntil>=0 && daysUntil<=3,
    overdue:daysUntil<0,
    label
  };
}
