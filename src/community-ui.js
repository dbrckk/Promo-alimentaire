import {fetchCommunityDiscounts,selectCommunityDiscounts} from "./community-deals.js";

const euro=new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"});
const percent=new Intl.NumberFormat("fr-FR",{maximumFractionDigits:2});
const date=new Intl.DateTimeFormat("fr-FR",{timeZone:"Europe/Paris"});

function element(tag,className,text){
  const node=document.createElement(tag);
  if(className) node.className=className;
  if(text!==undefined) node.textContent=text;
  return node;
}

export function createCommunityFeed({getStore,getChannel,getSort,getBudget,getRadius}){
  const summary=document.querySelector("#communityStatus");
  const container=document.querySelector("#communityDeals");
  const refreshButton=document.querySelector("#communityRefresh");
  const nearbyButton=document.querySelector("#communityNearby");
  // An installed PWA can briefly serve an older HTML shell during an update.
  if(!summary || !container || !refreshButton || !nearbyButton){
    return {render(){},load(){},invalidate(){}};
  }
  let controller=null,token=0,coords=null,key=null,checkedAt=0;
  let records=[],incomplete=false,loading=false,error=null;

  function invalidate({clearCoords=false}={}){
    token++;
    if(controller) controller.abort();
    controller=null;
    key=null;
    records=[];
    checkedAt=0;
    incomplete=false;
    loading=false;
    error=null;
    if(clearCoords) coords=null;
    render();
  }

  function render(){
    if(getChannel()!=="store"){
      summary.textContent="Les relevés Open Prices concernent uniquement les magasins physiques, pas les prix Drive.";
      container.replaceChildren();
      return;
    }
    if(loading){
      summary.textContent="Interrogation des relevés publics Open Prices…";
      container.replaceChildren();
      return;
    }
    if(error){
      summary.textContent=error;
      container.replaceChildren();
      return;
    }
    if(!checkedAt){
      summary.textContent="Appuie sur Actualiser ou ouvre Promos du jour pour interroger les relevés disponibles.";
      container.replaceChildren();
      return;
    }
    const budget=getBudget();
    const sort=getSort();
    const now=new Date();
    const total=selectCommunityDiscounts(records,{sort,now,limit:30}).length;
    const selected=selectCommunityDiscounts(records,{sort,now,budget,limit:12});
    summary.textContent=total+" relevé(s) remisé(s) exploitables chez "+
      (getStore()==="leclerc"?"E.Leclerc":"Carrefour")+
      (coords?" dans un rayon de "+getRadius()+" km autour de la position autorisée":" dans l'échantillon national")+
      ". Sources observées il y a 7 jours au plus."+
      (incomplete?" Recherche non exhaustive (limite de pagination ou erreur de page).":"")+
      (budget!==null?" Plafond "+euro.format(budget)+" appliqué au prix remisé par article.":"")+
      " Ces observations ne garantissent pas une promotion disponible aujourd'hui.";
    container.replaceChildren();
    if(!selected.length){
      container.append(element("p","panel help",
        "Aucun relevé vérifiable pour cette sélection. Cela ne prouve pas l'absence de promotion en magasin."));
      return;
    }
    for(const item of selected){
      const card=element("article","card daily-offer");
      const header=element("div","card-head");
      const identity=element("div");
      identity.append(element("h4","",item.title));
      identity.append(element("div","source",
        [item.storeName,item.postcode,item.city].filter(Boolean).join(" · ")));
      header.append(identity);
      header.append(element("span","badge","−"+percent.format(item.percent)+" % relevés"));
      card.append(header);
      const price=element("p");
      const strong=element("strong","",euro.format(item.price)+" observés");
      price.append(strong,document.createTextNode(" au lieu de "+euro.format(item.regular)+
        " · différence constatée "+euro.format(item.saving)+"."));
      card.append(price);
      card.append(element("p","help",
        "Relevé du "+date.format(new Date(item.date+"T12:00:00Z"))+
        (Number.isFinite(item.distanceKm)?" · "+item.distanceKm.toLocaleString("fr-FR")+" km":"")+
        " · GTIN "+item.code+" · preuve "+item.proofType+
        ". À vérifier en magasin ; ne pas cumuler automatiquement avec d'autres réductions."));
      const link=element("a","open","Voir la preuve Open Prices");
      link.href=item.sourceUrl;
      link.target="_blank";
      link.rel="noopener noreferrer";
      card.append(link);
      container.append(card);
    }
  }

  async function load({force=false}={}){
    if(getChannel()!=="store"){
      invalidate();
      return;
    }
    const wanted=getStore()+"|"+(coords?"local":"national")+"|"+getRadius();
    if(!force && loading && key===wanted) return;
    if(!force && checkedAt && key===wanted && Date.now()-checkedAt<10*60*1000){
      render();
      return;
    }
    if(controller) controller.abort();
    controller=new AbortController();
    const request=controller;
    const id=++token;
    key=wanted;
    error=null;
    loading=true;
    render();
    const timeout=setTimeout(()=>request.abort(),12000);
    try{
      const data=await fetchCommunityDiscounts({
        store:getStore(),coords,radiusKm:getRadius(),signal:request.signal
      });
      if(id!==token) return;
      records=data.results;
      incomplete=data.searchIncomplete;
      checkedAt=Date.now();
    }catch(err){
      if(id!==token) return;
      records=[];
      incomplete=false;
      checkedAt=0;
      error=request.signal.aborted
        ?"Open Prices : délai dépassé ou recherche annulée. Relancer la consultation."
        :"Open Prices indisponible : "+(err.message||"erreur réseau")+
          ". Les catalogues officiels restent accessibles séparément.";
    }finally{
      clearTimeout(timeout);
      if(id===token){
        loading=false;
        controller=null;
        render();
      }
    }
  }

  refreshButton.addEventListener("click",()=>{
    coords=null;
    load({force:true});
  });
  nearbyButton.addEventListener("click",()=>{
    if(!navigator.geolocation){
      error="Position non disponible sur ce navigateur.";
      render();
      return;
    }
    summary.textContent="Autorisation de localisation nécessaire ; aucune position n'est conservée.";
    navigator.geolocation.getCurrentPosition((position)=>{
      const lat=position.coords.latitude,lon=position.coords.longitude;
      if(!Number.isFinite(lat)||!Number.isFinite(lon)){
        error="Position GPS invalide.";
        render();
        return;
      }
      coords={latitude:lat,longitude:lon};
      load({force:true});
    },()=>{
      error="Position indisponible ou refusée. Actualiser permet une recherche nationale sans GPS.";
      render();
    },{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
  });
  render();
  return {render,load,invalidate};
}
