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
  const text=textContent(html);
  const lower=text.toLocaleLowerCase("fr");
  const target=String(needle).toLocaleLowerCase("fr");
  let index=lower.indexOf(target);
  let best=null;
  while(index>=0){
    const snippet=text.slice(Math.max(0,index-window),Math.min(text.length,index+target.length+window));
    const values=[...snippet.matchAll(/(\d+(?:[,.]\d+)?)\s*%/g)]
      .map((match)=>Number(match[1].replace(",",".")))
      .filter((value)=>Number.isFinite(value)&&value>=0&&value<=100);
    if(values.length){
      const candidate=Math.max(...values);
      if(best===null || candidate>best) best=candidate;
    }
    index=lower.indexOf(target,index+target.length);
  }
  return best;
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

  return offers;
}

function giftCard({providerId,provider,rate,verifiedAt,sourceUrl,conditions}){
  return {
    providerId,provider,externalId:"carrefour-gift-card-current",
    title:"Bon d'achat Carrefour",type:"bon d'achat",category:"panier",
    stores:["carrefour"],savingPercent:rate,verifiedAt,reviewAfter:addDays(verifiedAt,7),
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
    title,type:"cashback carte",category:"panier",stores:[store],
    savingPercent:rate,verifiedAt,reviewAfter:addDays(verifiedAt,7),
    sourceUrl:"https://www.ebuyclub.com/cashback-connecte",
    scope:"panier",mechanism:"card_cashback",stackGroup:"card-cashback",
    stackOrder:60,savingBasis:"current",autoStack:false,stackingConfidence:"unknown",
    stacking:"cumul à vérifier selon la transaction et les autres activations",
    conditions:"Taux public du cashback connecté eBuyClub ; vérifier l'éligibilité avant paiement."
  };
}

function addDays(iso,days){const d=new Date(iso+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function todayIso(){return new Date().toISOString().slice(0,10);}
