export function estimateRetailerPromoSaving(unitPrice,quantity,offer){
  const price=Number(unitPrice);
  const qty=Math.max(1,Math.trunc(Number(quantity)||1));
  const formula=offer?.promoFormula;
  if(!Number.isFinite(price)||price<=0||!formula) return null;

  if(formula.type==="nth_percent"){
    const nth=Math.max(1,Math.trunc(Number(formula.nth)||2));
    const cycle=Math.max(nth,Math.trunc(Number(formula.cycle)||nth));
    const percent=Number(formula.percent);
    if(!Number.isFinite(percent)||percent<=0||percent>100||qty<nth) return null;
    const groups=formula.repeat===false ? 1 : Math.floor(qty/cycle);
    if(groups<1) return null;
    return round(Math.min(price*qty,groups*price*percent/100));
  }

  if(formula.type==="buy_x_get_y_free"){
    const buy=Math.max(1,Math.trunc(Number(formula.buy)||1));
    const free=Math.max(1,Math.trunc(Number(formula.free)||1));
    const group=buy+free;
    if(qty<group) return null;
    const groups=formula.repeat===false ? 1 : Math.floor(qty/group);
    return round(Math.min(price*qty,groups*free*price));
  }

  if(formula.type==="bundle_price"){
    const groupQty=Math.max(2,Math.trunc(Number(formula.groupQty)||2));
    const bundlePrice=Number(formula.bundlePrice);
    if(!Number.isFinite(bundlePrice)||bundlePrice<0||qty<groupQty) return null;
    const groups=formula.repeat===false ? 1 : Math.floor(qty/groupQty);
    const regular=price*groupQty;
    return round(Math.max(0,Math.min(price*qty,groups*(regular-bundlePrice))));
  }

  return null;
}

export function minimumQuantityForRetailerPromo(offer){
  const formula=offer?.promoFormula;
  if(!formula) return null;
  if(formula.type==="nth_percent"){
    return Math.max(1,Math.trunc(Number(formula.nth)||2));
  }
  if(formula.type==="buy_x_get_y_free"){
    const buy=Math.max(1,Math.trunc(Number(formula.buy)||1));
    const free=Math.max(1,Math.trunc(Number(formula.free)||1));
    return buy+free;
  }
  if(formula.type==="bundle_price"){
    return Math.max(2,Math.trunc(Number(formula.groupQty)||2));
  }
  return null;
}

export function effectiveRetailerPromoPercent(offer){
  const minQty=minimumQuantityForRetailerPromo(offer);
  const base=Number(offer?.basePrice);
  if(!minQty || !Number.isFinite(base) || base<=0) return null;
  const saving=estimateRetailerPromoSaving(base,minQty,offer);
  if(!Number.isFinite(saving)) return null;
  return round((saving/(base*minQty))*100);
}

function round(value){
  return Math.round((Number(value)+Number.EPSILON)*100)/100;
}
