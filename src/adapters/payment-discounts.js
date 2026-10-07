function textContent(html){
  return String(html ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;|&#160;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/\s+/g," ")
    .trim();
}

export function extractNearbyPercent(html,needle,{window=260}={}){
  return extractClosestMetric(
    html,
    needle,
    /(\d+(?:[,.]\d+)?)\s*%/g,
    {window,validate:(value)=>value>=0&&value<=100}
  );
}

export function extractNearbyAmount(html,needle,{window=260}={}){
  return extractClosestMetric(
    html,
    needle,
    /(\d+(?:[,.]\d+)?)\s*€/g,
    {window,validate:(value)=>value>=0}
  );
}

function extractClosestMetric(html,needle,pattern,{window,validate}){
  const text=textContent(html);
  const lower=text.toLocaleLowerCase("fr");
  const target=String(needle ?? "").trim().toLocaleLowerCase("fr");
  if(!target) return null;

  const targetPositions=[];
  let targetIndex=lower.indexOf(target);
  while(targetIndex>=0){
    targetPositions.push(targetIndex);
    targetIndex=lower.indexOf(target,targetIndex+target.length);
  }
  if(!targetPositions.length) return null;

  const metrics=[...text.matchAll(pattern)]
    .map((match)=>{
      const value=Number(match[1].replace(",","."));
      return {
        value,
        start:match.index,
        end:match.index+match[0].length
      };
    })
    .filter((metric)=>Number.isFinite(metric.value)&&validate(metric.value));

  let best=null;
  for(const start of targetPositions){
    const end=start+target.length;
    for(const metric of metrics){
      const after=metric.start>=end;
      const distance=after
        ? metric.start-end
        : start>=metric.end
          ? start-metric.end+12
          : 0;
      if(distance>window) continue;
      const candidate={...metric,distance,after};
      if(
        !best
        || candidate.distance<best.distance
        || (
          candidate.distance===best.distance
          && candidate.after
          && !best.after
        )
      ){
        best=candidate;
      }
    }
  }
  return best?.value ?? null;
}

export function parsePaymentDiscountPages(pages,{verifiedAt=todayIso()}={}){
  const offers=[];
  const fidme=extractNearbyPercent(pages.fidme,"Carrefour");
  if(Number.isFinite(fidme)) offers.push(giftCard({
    providerId:"fidme-courses",provider:"Fidme Courses",rate:fidme,
    verifiedAt,sourceUrl:"https://www.fidme.com/nos-avantages/bons-dachats/",
    conditions:"Bon d'achat Carrefour remisé. Vérifier les conditions et canaux d'utilisation au moment de l'achat."
  }));

  const widilo=extractNearbyPercent(pages.widilo,"Carte cadeau Carrefour");
  if(Number.isFinite(widilo)) offers.push(giftCard({
    providerId:"widilo",provider:"Widilo",rate:widilo,
    verifiedAt,sourceUrl:"https://www.widilo.fr/bon-d-achat/carrefour",
    conditions:"Carte cadeau Carrefour avec cashback Widilo. Vérifier les conditions en vigueur."
  }));

  const ebuy=extractNearbyPercent(pages.ebuyclubGiftCard,"CARTE CADEAU CARREFOUR");
  if(Number.isFinite(ebuy)) offers.push(giftCard({
    providerId:"ebuyclub",provider:"eBuyClub",rate:ebuy,
    verifiedAt,sourceUrl:"https://www.ebuyclub.com/selection-bons-d-achat/carrefour-courses-alimentaires-10310",
    conditions:"Carte cadeau Carrefour avec remboursement immédiat eBuyClub. Vérifier les conditions en vigueur."
  }));

  const poulpeo=extractNearbyPercent(pages.poulpeo,"Carrefour");
  if(Number.isFinite(poulpeo)) offers.push(giftCard({
    providerId:"poulpeo",provider:"Poulpeo",rate:poulpeo,
    verifiedAt,sourceUrl:"https://www.poulpeo.com/cashback-bon-d-achat.html",
    conditions:"Bon d'achat Carrefour avec cashback immédiat Poulpeo. Vérifier les conditions en vigueur."
  }));

  const connectedCarrefour=extractNearbyPercent(pages.ebuyclubConnected,"Carrefour");
  if(Number.isFinite(connectedCarrefour)) offers.push(cardCashback({
    store:"carrefour",title:"Cashback connecté Carrefour",rate:connectedCarrefour,
    verifiedAt
  }));
  const connectedLeclerc=extractNearbyPercent(pages.ebuyclubConnected,"E.Leclerc");
  if(Number.isFinite(connectedLeclerc)) offers.push(cardCashback({
    store:"leclerc",title:"Cashback connecté E.Leclerc",rate:connectedLeclerc,
    verifiedAt
  }));

  const carrefourOnlineAmount=extractNearbyAmount(pages.ebuyclubOnline,"Carrefour");
  if(Number.isFinite(carrefourOnlineAmount)) offers.push(onlineAmountCashback({
    store:"carrefour",title:"Cashback en ligne Carrefour",amount:carrefourOnlineAmount,verifiedAt
  }));
  const leclercOnlinePercent=extractNearbyPercent(pages.ebuyclubOnline,"E.Leclerc");
  if(Number.isFinite(leclercOnlinePercent)) offers.push(onlinePercentCashback({
    store:"leclerc",title:"Cashback en ligne E.Leclerc",rate:leclercOnlinePercent,verifiedAt
  }));

  return offers;
}

function giftCard({providerId,provider,rate,verifiedAt,sourceUrl,conditions}){
  return {
    providerId,provider,externalId:"carrefour-gift-card-current",
    title:"Bon d'achat Carrefour",type:"bon d'achat",category:"panier",
    stores:["carrefour"],channels:["store"],savingPercent:rate,verifiedAt,reviewAfter:addDays(verifiedAt,7),
    sourceUrl,scope:"panier",mechanism:"gift_card",stackGroup:"payment-discount",
    stackOrder:30,savingBasis:"current",autoStack:true,stackingConfidence:"high",
    stacking:"une seule remise de paiement est retenue ; vérifier les conditions du bon",
    conditions
  };
}

function cardCashback({store,title,rate,verifiedAt}){
  return {
    providerId:"ebuyclub",provider:"eBuyClub",
    externalId:store+"-connected-cashback-current",
    title,type:"cashback carte",category:"panier",stores:[store],channels:["store"],
    savingPercent:rate,verifiedAt,reviewAfter:addDays(verifiedAt,7),
    sourceUrl:"https://www.ebuyclub.com/cashback-connecte",
    scope:"panier",mechanism:"card_cashback",stackGroup:"card-cashback",
    stackOrder:60,savingBasis:"current",autoStack:false,stackingConfidence:"unknown",
    stacking:"cumul à vérifier selon la transaction et les autres activations",
    conditions:"Taux public du cashback connecté eBuyClub ; vérifier l'éligibilité avant paiement."
  };
}

function onlineAmountCashback({store,title,amount,verifiedAt}){
  return {
    providerId:"ebuyclub",provider:"eBuyClub",
    externalId:store+"-online-cashback-current",
    title,type:"cashback en ligne",category:"panier",stores:[store],channels:["online"],
    savingAmount:amount,savingAmountMode:"per-offer",
    verifiedAt,reviewAfter:addDays(verifiedAt,7),
    sourceUrl:"https://www.ebuyclub.com/cashback",
    scope:"panier",mechanism:"affiliate_cashback",stackGroup:"affiliate-cashback",
    stackOrder:70,savingBasis:"current",autoStack:false,stackingConfidence:"unknown",
    stacking:"cumul et catégories éligibles à vérifier avant commande",
    conditions:"Jusqu'à "+amount+" € remboursés sur les achats en ligne éligibles. Offre variable selon conditions."
  };
}

function onlinePercentCashback({store,title,rate,verifiedAt}){
  return {
    providerId:"ebuyclub",provider:"eBuyClub",
    externalId:store+"-online-cashback-current",
    title,type:"cashback en ligne",category:"panier",stores:[store],channels:["online"],
    savingPercent:rate,verifiedAt,reviewAfter:addDays(verifiedAt,7),
    sourceUrl:"https://www.ebuyclub.com/cashback",
    scope:"panier",mechanism:"affiliate_cashback",stackGroup:"affiliate-cashback",
    stackOrder:70,savingBasis:"current",autoStack:false,stackingConfidence:"unknown",
    stacking:"cumul et catégories éligibles à vérifier avant commande",
    conditions:"Jusqu'à "+rate+" % remboursés sur les achats en ligne éligibles. Offre variable selon conditions."
  };
}

function addDays(iso,days){const d=new Date(iso+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function todayIso(){return new Date().toISOString().slice(0,10);}


export function validatePaymentRateSafety(offer){
  if(!offer || offer.scope!=="panier") return {ok:true};
  const percent=Number(offer.savingPercent);
  const amount=Number(offer.savingAmount);

  const percentCaps={
    gift_card:15,
    card_cashback:5,
    affiliate_cashback:5
  };
  const amountCaps={
    affiliate_cashback:20
  };

  const percentCap=percentCaps[offer.mechanism];
  if(Number.isFinite(percent) && Number.isFinite(percentCap) && percent>percentCap){
    return {
      ok:false,
      reason:`${offer.mechanism} à ${percent}% dépasse le plafond de sécurité ${percentCap}%`
    };
  }

  const amountCap=amountCaps[offer.mechanism];
  if(Number.isFinite(amount) && Number.isFinite(amountCap) && amount>amountCap){
    return {
      ok:false,
      reason:`${offer.mechanism} à ${amount}€ dépasse le plafond de sécurité ${amountCap}€`
    };
  }

  return {ok:true};
}
