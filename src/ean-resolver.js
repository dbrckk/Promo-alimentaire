import { isValidGtin } from "./gtin.js";
import { normalizeText } from "./matching.js";

export function buildOpenFoodFactsSearchTerms(offer){
  const rules=offer?.productMatch || {};
  const values=[
    ...(rules.brands || []),
    ...(rules.all || []),
    ...(rules.any || []).slice(0,2)
  ];
  return [...new Set(values.map((value)=>String(value).trim()).filter(Boolean))].join(" ");
}

export function scoreOpenFoodFactsCandidate(offer,candidate){
  if(!candidate || !isValidGtin(candidate.code)) return {
    accepted:false,score:0,reasons:["gtin-invalid"]
  };

  const rules=offer?.productMatch || {};
  const candidateBrand=normalizeText(candidate.brands || "");
  const candidateName=normalizeText([
    candidate.product_name,
    candidate.generic_name,
    candidate.quantity
  ].filter(Boolean).join(" "));
  const haystack=normalizeText(candidateBrand+" "+candidateName);

  const brands=(rules.brands || []).map(normalizeText).filter(Boolean);
  const required=(rules.all || []).map(normalizeText).filter(Boolean);
  const optional=(rules.any || []).map(normalizeText).filter(Boolean);

  const brandMatched=!brands.length || brands.some((brand)=>
    candidateBrand.includes(brand) || brand.includes(candidateBrand)
  );
  const requiredMatched=required.every((term)=>contains(haystack,term));
  const optionalMatches=optional.filter((term)=>contains(haystack,term));

  let score=0;
  if(brandMatched) score+=45;
  if(required.length){
    score+=requiredMatched ? 30 : 0;
  }else{
    score+=15;
  }
  if(optional.length){
    score+=Math.min(25,Math.round((optionalMatches.length/optional.length)*25));
  }else{
    score+=15;
  }

  const titleTerms=normalizeText(offer?.title || "")
    .split(" ")
    .filter((term)=>term.length>=5)
    .filter((term)=>!["ticket","leclerc","offert","produit","promo","promotion"].includes(term));
  const titleHits=titleTerms.filter((term)=>contains(haystack,term)).length;
  if(titleTerms.length){
    score+=Math.min(10,Math.round((titleHits/titleTerms.length)*10));
  }

  const accepted=brandMatched && requiredMatched && score>=80;
  const reasons=[];
  if(!brandMatched) reasons.push("brand-mismatch");
  if(!requiredMatched) reasons.push("required-term-missing");
  if(score<80) reasons.push("score-too-low");

  return {
    accepted,
    score:Math.min(100,score),
    reasons,
    details:{
      brandMatched,
      requiredMatched,
      optionalMatches,
      titleHits
    }
  };
}

export function selectUniqueEanCandidate(offer,candidates,{
  minScore=80,
  minMargin=12
}={}){
  const evaluated=(candidates || [])
    .map((candidate)=>({
      candidate,
      evaluation:scoreOpenFoodFactsCandidate(offer,candidate)
    }))
    .sort((a,b)=>b.evaluation.score-a.evaluation.score);
  const ranked=evaluated
    .filter((entry)=>entry.evaluation.accepted && entry.evaluation.score>=minScore);

  if(!ranked.length){
    return {status:"none",candidate:null,ranked};
  }

  const first=ranked[0];
  const second=ranked[1] || null;
  const rules=offer?.productMatch || {};
  const required=(rules.all || []).map((value)=>String(value).trim()).filter(Boolean);
  const optional=(rules.any || []).map((value)=>String(value).trim()).filter(Boolean);
  const lowSpecificity=required.length===0 && optional.length<=1;
  const plausible=evaluated.filter((entry)=>
    entry.evaluation.details?.brandMatched
    && entry.evaluation.score>=55
  );
  if(
    (lowSpecificity && plausible.length>1)
    || (second && first.evaluation.score-second.evaluation.score<minMargin)
  ){
    return {
      status:"ambiguous",
      candidate:null,
      ranked,
      plausible
    };
  }

  return {
    status:"unique",
    candidate:first.candidate,
    score:first.evaluation.score,
    margin:second ? first.evaluation.score-second.evaluation.score : first.evaluation.score,
    ranked,
    plausible
  };
}

export async function fetchOpenFoodFactsCandidates(offer,{
  fetchImpl=fetch,
  pageSize=20
}={}){
  const terms=buildOpenFoodFactsSearchTerms(offer);
  if(!terms) return {terms,candidates:[],sourceUrl:null};

  const params=new URLSearchParams({
    search_terms:terms,
    search_simple:"1",
    action:"process",
    json:"1",
    page_size:String(Math.min(Math.max(Number(pageSize)||20,1),20)),
    fields:"code,product_name,generic_name,brands,quantity,countries_tags,stores_tags"
  });
  const sourceUrl="https://world.openfoodfacts.org/cgi/search.pl?"+params;
  const response=await fetchImpl(sourceUrl,{
    headers:{
      Accept:"application/json",
      "User-Agent":"PromoAlimentaire/0.1 conservative-ean-resolver"
    },
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok) throw new Error("Open Food Facts search HTTP "+response.status);
  const payload=await response.json();
  const candidates=(payload?.products || []).map((product)=>({
    code:String(product.code || ""),
    product_name:product.product_name || "",
    generic_name:product.generic_name || "",
    brands:product.brands || "",
    quantity:product.quantity || "",
    countries_tags:product.countries_tags || [],
    stores_tags:product.stores_tags || []
  }));
  return {terms,candidates,sourceUrl};
}

function contains(haystack,term){
  if(!term) return false;
  return (" "+haystack+" ").includes(" "+term+" ");
}
