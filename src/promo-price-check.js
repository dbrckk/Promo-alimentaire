const CENTS_TOLERANCE=3;

export function assessRetailerPromoPrice(observation,offer){
  if(offer?.mechanism!=="retailer_promo"){
    return {eligible:true,reason:null};
  }
  if(observation?.isDiscounted===true){
    return {eligible:false,reason:"already-discounted"};
  }
  const price=positiveCents(observation?.price);
  if(price===null){
    return {eligible:false,reason:"unusable-observed-price"};
  }

  const regular=positiveCents(offer?.sourceRegularPrice);
  const promotional=positiveCents(offer?.sourcePromoPrice);

  // If both source prices are available, trust the promotion only when
  // the observed price matches the pre-promotion price. Otherwise a second
  // subtraction would be speculative or outright incorrect.
  if(regular!==null && promotional!==null && promotional<regular){
    if(Math.abs(price-regular)<=CENTS_TOLERANCE){
      return {eligible:true,reason:null};
    }
    if(Math.abs(price-promotional)<=CENTS_TOLERANCE || price<regular-CENTS_TOLERANCE){
      return {eligible:false,reason:"source-promo-may-already-be-included"};
    }
    return {eligible:false,reason:"observed-price-not-source-regular"};
  }

  // Without a regular price, a price already at or below a published
  // promotional price is not evidence that a further discount applies.
  if(promotional!==null && price<=promotional+CENTS_TOLERANCE){
    return {eligible:false,reason:"source-promo-may-already-be-included"};
  }
  if(regular!==null && Math.abs(price-regular)>CENTS_TOLERANCE){
    return {eligible:false,reason:"observed-price-not-source-regular"};
  }

  return {eligible:true,reason:null};
}

function positiveCents(value){
  if(value===null || value===undefined || value==="") return null;
  const number=Number(value);
  if(!Number.isFinite(number) || number<=0) return null;
  return Math.round(number*100);
}
