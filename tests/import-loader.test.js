import test from "node:test";
import assert from "node:assert/strict";
import { loadImportedOffers, mergeOffers } from "../src/import-loader.js";

const manifest={verifiedAt:"2026-10-07",files:["one.json"]};
const payload=[{
  providerId:"shopmium",externalId:"x",title:"Offre",
  stores:["all"],savingPercent:20,verifiedAt:"2026-10-07",
  startsAt:"2026-10-01",expiresAt:"2026-10-31",
  sourceUrl:"https://example.com/offer",productMatch:{brands:["Test"]}
}];

test("loadImportedOffers valide et filtre les lots actifs",async()=>{
  const fetchImpl=async(url)=>{
    const text=String(url);
    if(text.endsWith("/index.json")) return {ok:true,json:async()=>manifest};
    if(text.endsWith("/one.json")) return {ok:true,json:async()=>payload};
    return {ok:false,status:404,json:async()=>({})};
  };
  const result=await loadImportedOffers({
    fetchImpl,
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(result.offers.length,1);
  assert.equal(result.offers[0].id,"shopmium-x");
  assert.equal(result.errors.length,0);
  assert.equal(result.sourceStats.length,1);
  assert.equal(result.sourceStats[0].activeCount,1);
  assert.equal(result.sourceStats[0].providerIds[0],"shopmium");
});

test("loadImportedOffers masque une offre expirée",async()=>{
  const fetchImpl=async(url)=>{
    const text=String(url);
    if(text.endsWith("/index.json")) return {ok:true,json:async()=>manifest};
    return {ok:true,json:async()=>payload};
  };
  const result=await loadImportedOffers({
    fetchImpl,
    now:new Date("2026-11-05T12:00:00Z")
  });
  assert.equal(result.offers.length,0);
});

test("mergeOffers remplace un id existant par l'import",()=>{
  const result=mergeOffers(
    [{id:"a",title:"ancien"}],
    [{id:"a",title:"nouveau"},{id:"b",title:"autre"}]
  );
  assert.equal(result.length,2);
  assert.equal(result.find((x)=>x.id==="a").title,"nouveau");
});


test("loadImportedOffers marque une source expirée comme stale",async()=>{
  const fetchImpl=async(url)=>{
    const text=String(url);
    if(text.endsWith("/index.json")) return {ok:true,json:async()=>manifest};
    return {ok:true,json:async()=>payload};
  };
  const result=await loadImportedOffers({
    fetchImpl,
    now:new Date("2026-11-05T12:00:00Z")
  });
  assert.equal(result.sourceStats[0].status,"stale");
  assert.equal(result.sourceStats[0].activeCount,0);
});
