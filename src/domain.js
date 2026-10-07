export function computeSaving(offer) {
  if (Number.isFinite(offer.savingAmount)) return roundMoney(offer.savingAmount);
  if (Number.isFinite(offer.basePrice) && Number.isFinite(offer.savingPercent)) {
    return roundMoney(offer.basePrice * offer.savingPercent / 100);
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

export function rankOffers(offers, sort = "percent") {
  return [...offers].sort((a, b) => {
    if (sort === "amount") return nullableNumber(computeSaving(b)) - nullableNumber(computeSaving(a));
    if (sort === "freshness") return new Date(b.verifiedAt) - new Date(a.verifiedAt);
    return nullableNumber(effectivePercent(b)) - nullableNumber(effectivePercent(a));
  });
}

export function filterOffers(offers, { store, channel=null, search = "" }) {
  const needle = search.trim().toLocaleLowerCase("fr");
  return offers.filter((offer) => {
    const storeMatch = offer.stores.includes(store) || offer.stores.includes("all");
    if (!storeMatch) return false;
    const channels=Array.isArray(offer.channels) ? offer.channels : [];
    const channelMatch=!channel || channels.length===0 || channels.includes(channel) || channels.includes("all");
    if(!channelMatch) return false;
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
  const daysUntil=Math.ceil((next.date-current)/(24*60*60*1000));
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
