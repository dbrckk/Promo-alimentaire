import { observationAgeDays } from "./open-data.js";

export function scoreBasketConfidence(scenario,{now=new Date()}={}) {
  if(!scenario || !scenario.distinctCount){
    return emptyScore();
  }

  const coverageRatio=scenario.distinctCount>0
    ? scenario.pricedCount/scenario.distinctCount
    : 0;
  const coverageScore=coverageRatio*50;

  const pricedLines=(scenario.lines || []).filter((line)=>!line.missingPrice && line.bestPrice);
  const freshnessValues=pricedLines.map((line)=>freshnessWeight(line.bestPrice,now));
  const freshnessRatio=freshnessValues.length
    ? freshnessValues.reduce((sum,value)=>sum+value,0)/freshnessValues.length
    : 0;
  const freshnessScore=freshnessRatio*25;

  const locationReliable=Boolean(
    scenario.locationReliable
    || /^(id|geo):/.test(scenario.locationKey || "")
  );
  const locationScore=locationReliable ? 15 : scenario.location ? 6 : 0;

  const proofValues=pricedLines.map((line)=>
    line.bestPrice?.proofType && line.bestPrice.source!=="manual" && !line.bestPrice.manual
      ? 1 : 0
  );
  const proofRatio=proofValues.length
    ? proofValues.reduce((sum,value)=>sum+value,0)/proofValues.length
    : 0;
  const proofScore=proofRatio*10;

  const rawScore=Math.min(100,Math.max(
    0,coverageScore+freshnessScore+locationScore+proofScore
  ));
  const priceChannelReliable=scenario.priceChannelReliable!==false
    && !pricedLines.some((line)=>line.bestPrice.source==="manual" || line.bestPrice.manual);
  const score=Math.round(priceChannelReliable ? rawScore : rawScore*0.65);

  return {
    score,
    level:confidenceLevel(score),
    label:confidenceLabel(score),
    parts:{
      coverage:Math.round(coverageScore),
      freshness:Math.round(freshnessScore),
      location:Math.round(locationScore),
      proof:Math.round(proofScore)
    },
    coverageRatio:roundRatio(coverageRatio),
    freshnessRatio:roundRatio(freshnessRatio),
    proofRatio:roundRatio(proofRatio),
    locationReliable,
    priceChannelReliable
  };
}

export function confidenceLevel(score) {
  const value=Number(score)||0;
  if(value>=85) return "high";
  if(value>=65) return "medium";
  if(value>=40) return "low";
  return "very-low";
}

export function confidenceLabel(score) {
  const level=confidenceLevel(score);
  return {
    high:"Élevée",
    medium:"Moyenne",
    low:"Faible",
    "very-low":"Très faible"
  }[level];
}

function freshnessWeight(observation,now) {
  const age=observationAgeDays(observation,now);
  if(age===null) return 0;
  if(age<=7) return 1;
  if(age<=30) return 0.85;
  if(age<=60) return 0.6;
  if(age<=120) return 0.35;
  return 0;
}

function emptyScore(){
  return {
    score:0,level:"very-low",label:"Très faible",
    parts:{coverage:0,freshness:0,location:0,proof:0},
    coverageRatio:0,freshnessRatio:0,proofRatio:0,locationReliable:false,priceChannelReliable:false
  };
}

function roundRatio(value){
  return Math.round((Number(value)||0)*1000)/1000;
}
