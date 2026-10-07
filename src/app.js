import { DATASET_DATE, offers as baseOffers, providers } from "./data.js";
import { computeSaving, effectivePercent, filterOffers, offerDeadline, rankOffers } from "./domain.js";
import { fetchPricesByBarcode, fetchProductByBarcode, isFreshObservation, normalizeBarcode, priceFreshness, selectBestRecentPrice } from "./open-data.js";
import { optimizeStack } from "./stacking.js";
import { effectiveOfferPercent, estimateOfferSaving, findProductOffers, rankMatchedOffers } from "./matching.js";
import { loadImportedOffers, mergeOffers } from "./import-loader.js";
import {
  compareBasketStores,
  evaluateBasketLocations,
  evaluateBasketStore,
  estimateBasketCandidateSaving,
  normalizeQuantity,
  selectBestLocationScenario
} from "./basket.js";
import { scoreBasketConfidence } from "./confidence.js";
import { addHistoryEntry, createHistoryEntry, historyTrend } from "./history.js";
import { buildSavingsActionPlan } from "./action-plan.js";
import { summarizeBasketStrategies } from "./strategy.js";
import {
  buildProductLoyaltyOffers,
  normalizeLoyaltyProfile,
  resolveOffersForLoyalty
} from "./loyalty.js";
import { offerEvidenceStatus } from "./evidence.js";
import {
  confirmationKey,
  createStoreConfirmation,
  pruneStoreConfirmations
} from "./local-verification.js";
import {
  addPriceObservation,
  detectPriceDrops,
  productHistory,
  productPriceTrend
} from "./product-history.js";

const money = new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"});
let offers=[...baseOffers];
const els = {
  store:document.querySelector("#store"),
  channel:document.querySelector("#channel"),
  carrefourLoyalty:document.querySelector("#carrefourLoyalty"),
  leclercLoyalty:document.querySelector("#leclercLoyalty"),
  loyaltySummary:document.querySelector("#loyaltySummary"),
  sort:document.querySelector("#sort"),
  search:document.querySelector("#search"),
  offers:document.querySelector("#offers"),
  providers:document.querySelector("#providers"),
  sourceHealth:document.querySelector("#sourceHealth"),
  empty:document.querySelector("#empty"),
  stats:document.querySelector("#stats"),
  datasetDate:document.querySelector("#datasetDate"),
  tabs:[...document.querySelectorAll(".tab")],
  installButton:document.querySelector("#installButton"),
  barcodeForm:document.querySelector("#barcodeForm"),
  barcode:document.querySelector("#barcode"),
  scanButton:document.querySelector("#scanButton"),
  nearbyButton:document.querySelector("#nearbyButton"),
  radiusSelect:document.querySelector("#radiusSelect"),
  productStatus:document.querySelector("#productStatus"),
  productResult:document.querySelector("#productResult"),
  productOffers:document.querySelector("#productOffers"),
  priceResults:document.querySelector("#priceResults"),
  productPriceHistory:document.querySelector("#productPriceHistory"),
  listCount:document.querySelector("#listCount"),
  refreshList:document.querySelector("#refreshList"),
  listNearbyButton:document.querySelector("#listNearbyButton"),
  listRadiusSelect:document.querySelector("#listRadiusSelect"),
  clearList:document.querySelector("#clearList"),
  clearHistory:document.querySelector("#clearHistory"),
  dropThreshold:document.querySelector("#dropThreshold"),
  listStatus:document.querySelector("#listStatus"),
  shoppingListItems:document.querySelector("#shoppingListItems"),
  basketComparison:document.querySelector("#basketComparison"),
  comparisonHistory:document.querySelector("#comparisonHistory"),
  priceAlerts:document.querySelector("#priceAlerts"),
  basketAmount:document.querySelector("#basketAmount"),
  optimizerResult:document.querySelector("#optimizerResult"),
  scanDialog:document.querySelector("#scanDialog"),
  closeScan:document.querySelector("#closeScan"),
  scanVideo:document.querySelector("#scanVideo")
};

const views = {
  offers:document.querySelector("#offersView"),
  product:document.querySelector("#productView"),
  list:document.querySelector("#listView"),
  optimizer:document.querySelector("#optimizerView"),
  providers:document.querySelector("#providersView")
};

const state = {
  store:localStorage.getItem("promo-store") || "carrefour",
  channel:localStorage.getItem("promo-channel") || "store",
  loyaltyProfile:loadLoyaltyProfile(),
  storeConfirmations:loadStoreConfirmations(),
  sort:localStorage.getItem("promo-sort") || "percent",
  search:"",
  tab:"offers",
  productCode:null,
  product:null,
  priceObservations:[],
  nearbyEnabled:false,
  coords:null,
  radiusKm:25,
  shoppingList:loadShoppingList(),
  basketPriceData:{carrefour:{},leclerc:{}},
  comparisonHistory:loadComparisonHistory(),
  productPriceHistory:loadProductPriceHistory(),
  dropThreshold:Number(localStorage.getItem("promo-drop-threshold") || 10),
  basketRefreshing:false,
  sourceHealth:[],
  lookupToken:0
};

els.store.value=state.store;
els.channel.value=state.channel;
els.carrefourLoyalty.value=state.loyaltyProfile.carrefour;
els.leclercLoyalty.value=state.loyaltyProfile.leclerc;
els.sort.value=state.sort;
els.radiusSelect.value=String(state.radiusKm);
els.listRadiusSelect.value=String(state.radiusKm);
els.dropThreshold.value=String(state.dropThreshold);
els.datasetDate.textContent=`Offres vérifiées : ${new Date(DATASET_DATE+"T12:00:00").toLocaleDateString("fr-FR")}`;

els.store.addEventListener("change",async()=>{
  state.store=els.store.value;
  localStorage.setItem("promo-store",state.store);
  render();
  renderOptimizer();
  if(state.product) renderProductOffers(state.product,state.priceObservations);
  if(state.productCode) await refreshPrices(state.productCode);
});
els.channel.addEventListener("change",()=>{
  state.channel=els.channel.value;
  localStorage.setItem("promo-channel",state.channel);
  render();
  renderOptimizer();
  renderShoppingList();
  if(state.product) renderProductOffers(state.product,state.priceObservations);
});
els.carrefourLoyalty.addEventListener("change",()=>updateLoyaltyProfile("carrefour",els.carrefourLoyalty.value));
els.leclercLoyalty.addEventListener("change",()=>updateLoyaltyProfile("leclerc",els.leclercLoyalty.value));
els.sort.addEventListener("change",()=>{
  state.sort=els.sort.value;
  localStorage.setItem("promo-sort",state.sort);
  render();
});
els.search.addEventListener("input",()=>{
  state.search=els.search.value;
  render();
});
els.basketAmount.addEventListener("input",renderOptimizer);
els.barcodeForm.addEventListener("submit",(event)=>{
  event.preventDefault();
  lookupBarcode(els.barcode.value);
});
els.scanButton.addEventListener("click",startScanner);
els.nearbyButton.addEventListener("click",toggleNearbyPrices);
els.listNearbyButton.addEventListener("click",toggleNearbyPrices);
els.refreshList.addEventListener("click",refreshShoppingList);
els.clearList.addEventListener("click",()=>{
  state.shoppingList=[];
  state.basketPriceData={carrefour:{},leclerc:{}};
  saveShoppingList();
  renderShoppingList();
  setListStatus("Liste vidée.");
});
els.clearHistory.addEventListener("click",()=>{
  state.comparisonHistory=[];
  state.productPriceHistory=[];
  saveComparisonHistory();
  saveProductPriceHistory();
  renderComparisonHistory();
  renderProductPriceHistory();
  renderPriceAlerts();
  setListStatus("Historiques locaux effacés.");
});
els.productResult.addEventListener("click",(event)=>{
  if(event.target.closest('[data-action="add-current-product"]')) addCurrentProduct();
});
els.shoppingListItems.addEventListener("click",handleShoppingListAction);
els.basketComparison.addEventListener("click",handleBasketComparisonAction);
els.dropThreshold.addEventListener("change",()=>{
  state.dropThreshold=Number(els.dropThreshold.value)||10;
  localStorage.setItem("promo-drop-threshold",String(state.dropThreshold));
  renderPriceAlerts();
});
els.radiusSelect.addEventListener("change",async()=>{
  state.radiusKm=Number(els.radiusSelect.value)||25;
  els.listRadiusSelect.value=String(state.radiusKm);
  syncNearbyControls();
  if(state.nearbyEnabled){
    if(state.productCode) await refreshPrices(state.productCode);
    markBasketPricesStale();
  }
});
els.listRadiusSelect.addEventListener("change",async()=>{
  state.radiusKm=Number(els.listRadiusSelect.value)||25;
  els.radiusSelect.value=String(state.radiusKm);
  syncNearbyControls();
  if(state.nearbyEnabled){
    if(state.productCode) await refreshPrices(state.productCode);
    markBasketPricesStale();
  }
});
els.closeScan.addEventListener("click",()=>els.scanDialog.close());
els.scanDialog.addEventListener("close",stopScanner);

els.tabs.forEach((button)=>button.addEventListener("click",()=>setTab(button.dataset.tab)));

function setTab(tab){
  state.tab=tab;
  els.tabs.forEach((button)=>button.classList.toggle("active",button.dataset.tab===tab));
  for(const [name,view] of Object.entries(views)) view.classList.toggle("hidden",name!==tab);
  if(tab==="list") renderShoppingList();
}

function render(){
  const resolvedOffers=resolveOffersForLoyalty(offers,state.loyaltyProfile);
  const filtered=filterOffers(resolvedOffers,{store:state.store,channel:state.channel,search:state.search});
  const ranked=rankOffers(filtered,state.sort);
  els.offers.innerHTML=ranked.map(renderOffer).join("");
  els.empty.classList.toggle("hidden",ranked.length>0);

  const activeProviders=providers.filter((provider)=>provider.stores.includes(state.store) || provider.stores.includes("all"));
  els.providers.innerHTML=activeProviders.map(renderProvider).join("");

  const numericPercents=ranked.map(effectivePercent).filter(Number.isFinite);
  const maxPercent=numericPercents.length?Math.max(...numericPercents):null;
  els.stats.innerHTML=[
    stat(ranked.length,"offres chiffrées"),
    stat(activeProviders.length,"sources utiles"),
    stat(maxPercent===null?"—":formatPercent(maxPercent),"meilleure remise")
  ].join("");
  renderListCount();
}

function renderOffer(offer){
  const amount=computeSaving(offer);
  const pct=effectivePercent(offer);
  const savingMain=offerPercentLabel(offer) || (amount!==null?money.format(amount):(pct!==null?formatPercent(pct):"—"));
  const savingSub=amount!==null && pct!==null
    ? formatPercent(pct)
    : offer.scope==="panier"
      ? "sur le panier"
      : offer.scope==="bundle"
        ? "offre multi-produits"
        : "sur le produit";
  const stackBadge=offer.autoStack===true
    ? '<span class="badge good">Cumul automatisable</span>'
    : '<span class="badge warn">Cumul à vérifier</span>';
  const storeCheckBadge=offer.requiresStoreVerification
    ? '<span class="badge warn">Magasin à confirmer</span>'
    : "";
  const loyaltyBadge=offer.requiresLoyalty
    ? `<span class="badge ${offer.loyaltyEligibility==="eligible"?"good":"warn"}">${offer.loyaltyEligibility==="eligible"?"Carte confirmée":"Carte à confirmer"}</span>`
    : "";
  const deadline=offerDeadline(offer);
  const deadlineBadge=deadline
    ? `<span class="badge ${deadline.urgent||deadline.overdue?"warn":""}">${escapeHtml(deadline.label)}</span>`
    : "";
  return `
    <article class="card">
      <div class="card-head">
        <div>
          <h2>${escapeHtml(offer.title)}</h2>
          <div class="source">${escapeHtml(offer.provider)} · ${escapeHtml(offer.type)}</div>
        </div>
        <div class="saving"><strong>${savingMain}</strong><small>${savingSub}</small></div>
      </div>
      <div class="badges">
        <span class="badge">${offer.scope==="panier"?"Panier entier":offer.scope==="bundle"?"Multi-produits":"Produit ciblé"}</span>
        <span class="badge">${escapeHtml(offer.category)}</span>
        ${stackBadge}
        ${storeCheckBadge}
        ${loyaltyBadge}
        ${deadlineBadge}
      </div>
      <div class="meta">
        <div><span>Économie en €</span>${amount===null?"Dépend du prix":money.format(amount)}</div>
        <div><span>Vérifié</span>${formatDate(offer.verifiedAt)}</div>
      </div>
      <p class="conditions">${escapeHtml(offer.conditions)}</p>
      <div class="actions">
        <span class="verified">${escapeHtml(offer.stacking)}</span>
        <a class="open" href="${escapeHtml(offer.sourceUrl)}" target="_blank" rel="noreferrer">Voir la source</a>
      </div>
    </article>`;
}

function renderSourceHealth(){
  if(!els.sourceHealth) return;
  if(!state.sourceHealth.length){
    els.sourceHealth.innerHTML='<div class="panel price-source">État des snapshots indisponible.</div>';
    return;
  }
  const order={error:0,stale:1,"review-soon":2,ok:3};
  const rows=[...state.sourceHealth].sort((a,b)=>(order[a.status]??9)-(order[b.status]??9));
  els.sourceHealth.innerHTML=`
    <div class="product-offers-head">
      <h3>État des données importées</h3>
      <p>Nombre d’offres actuellement actives, date de vérification et prochaine échéance de révision.</p>
    </div>
    <div class="source-health-grid">
      ${rows.map((item)=>{
        const providerNames=(item.providerIds || [])
          .map((providerId)=>providers.find((entry)=>entry.id===providerId)?.name || providerId)
          .filter(Boolean);
        const label=providerNames.length>1
          ? providerNames.slice(0,3).join(" · ")+(providerNames.length>3?` +${providerNames.length-3}`:"")
          : providerNames[0] || item.file;
        const stateLabel={
          ok:"À jour",
          "review-soon":"À revoir bientôt",
          stale:"Obsolète",
          error:"Erreur"
        }[item.status] || item.status;
        const badgeClass=item.status==="ok" ? "good" : "warn";
        return `
          <article class="source-health-card">
            <div>
              <strong>${escapeHtml(label)}</strong>
              <div class="source">${escapeHtml(item.file)}</div>
            </div>
            <div class="badges">
              <span class="badge ${badgeClass}">${stateLabel}</span>
              <span class="badge">${item.mode==="automatic"?"Synchronisation auto":"Snapshot manuel"}</span>
            </div>
            <div class="source-health-metrics">
              <span><b>${item.activeCount}</b> actives</span>
              <span><b>${item.exactEanCount||0}</b> EAN exact(s)</span>
              <span><b>${item.heuristicCount||0}</b> heuristique(s)</span>
              ${item.resolutionBlockedCount
                ? `<span><b>${item.resolutionBlockedCount}</b> gamme(s) bloquée(s)</span>`
                : ""}
              ${item.storeVerificationCount
                ? `<span><b>${item.storeVerificationCount}</b> à confirmer en magasin</span>`
                : ""}
              <span>vérifié ${item.latestVerifiedAt?formatDate(item.latestVerifiedAt):"—"}</span>
              <span>révision ${item.nextDeadline?formatDate(item.nextDeadline):"—"}</span>
            </div>
          </article>`;
      }).join("")}
    </div>`;
}

function renderProvider(provider){
  const priority=provider.priority==="essentiel"?"Essentiel":provider.priority==="fort"?"Très utile":"Complément";
  return `
    <article class="card provider-card">
      <div class="card-head"><div><h3>${escapeHtml(provider.name)}</h3><div class="source">${priority}</div></div></div>
      <div class="badges">${provider.kinds.map((kind)=>`<span class="badge">${escapeHtml(kind)}</span>`).join("")}</div>
      <p>${escapeHtml(provider.note)}</p>
      <div class="actions"><span></span><a class="open" href="${escapeHtml(provider.url)}" target="_blank" rel="noreferrer">Ouvrir</a></div>
    </article>`;
}

async function lookupBarcode(rawValue){
  let code;
  try{
    code=normalizeBarcode(rawValue);
  }catch(error){
    setProductStatus(error.message,true);
    return;
  }
  state.productCode=code;
  els.barcode.value=code;
  const token=++state.lookupToken;
  setProductStatus("Recherche du produit et des prix…");
  els.productResult.classList.add("hidden");
  els.productOffers.innerHTML="";
  els.priceResults.innerHTML="";
  state.priceObservations=[];

  const [productResult,pricesResult]=await Promise.allSettled([
    fetchProductByBarcode(code),
    fetchPricesByBarcode(code,priceQueryOptions())
  ]);
  if(token!==state.lookupToken) return;

  if(productResult.status==="fulfilled"){
    state.product=productResult.value;
    renderProduct(productResult.value);
    renderProductOffers(productResult.value,state.priceObservations);
  }else{
    state.product=null;
    els.productOffers.innerHTML="";
    els.productResult.innerHTML=`<div class="source">Code-barres ${escapeHtml(code)} · fiche produit indisponible</div>`;
    els.productResult.classList.remove("hidden");
  }

  if(pricesResult.status==="fulfilled"){
    state.priceObservations=pricesResult.value.observations;
    renderPrices(state.priceObservations,pricesResult.value.sourceUrl);
    if(state.product){
      recordProductObservation(state.product,state.store,state.priceObservations);
      renderProductOffers(state.product,state.priceObservations);
      renderProductPriceHistory();
    }
  }else{
    els.priceResults.innerHTML=`<div class="panel price-source">Impossible de récupérer Open Prices pour le moment.</div>`;
  }

  if(productResult.status==="rejected" && pricesResult.status==="rejected"){
    setProductStatus("Les deux sources ouvertes sont momentanément indisponibles.",true);
  }else{
    setProductStatus("");
  }
}

async function refreshPrices(code){
  const token=++state.lookupToken;
  setProductStatus("Actualisation des prix pour cette enseigne…");
  try{
    const result=await fetchPricesByBarcode(code,priceQueryOptions());
    if(token!==state.lookupToken) return;
    state.priceObservations=result.observations;
    renderPrices(state.priceObservations,result.sourceUrl);
    if(state.product){
      recordProductObservation(state.product,state.store,state.priceObservations);
      renderProductOffers(state.product,state.priceObservations);
      renderProductPriceHistory();
    }
    setProductStatus("");
  }catch(error){
    if(token!==state.lookupToken) return;
    setProductStatus("Impossible d'actualiser les prix Open Prices.",true);
  }
}

function renderProduct(product){
  const image=product.imageUrl
    ? `<img src="${escapeHtml(product.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
    : "";
  const nutri=product.nutriScore ? `Nutri-Score ${escapeHtml(String(product.nutriScore).toUpperCase())}` : "Nutri-Score non renseigné";
  els.productResult.innerHTML=`
    <div class="product-summary">
      ${image}
      <div>
        <h2>${escapeHtml(product.name)}</h2>
        <p>${escapeHtml([product.brands,product.quantity].filter(Boolean).join(" · ") || "Marque/quantité non renseignée")}</p>
        <p>${nutri} · EAN ${escapeHtml(product.code)}</p>
        <div class="actions">
          <a class="open" href="${escapeHtml(product.sourceUrl)}" target="_blank" rel="noreferrer">Fiche Open Food Facts</a>
          <button class="secondary" data-action="add-current-product" type="button">Ajouter à la liste</button>
        </div>
      </div>
    </div>`;
  els.productResult.classList.remove("hidden");
  renderProductPriceHistory();
}

function renderProductOffers(product,observations=[]){
  const resolvedOffers=resolveOffersForLoyalty(offers,state.loyaltyProfile);
  const loyaltyOffers=buildProductLoyaltyOffers(product,{
    store:state.store,
    profile:state.loyaltyProfile
  });
  const rawMatches=findProductOffers(
    product,
    [...resolvedOffers,...loyaltyOffers],
    {store:state.store,channel:state.channel}
  );
  const bestObserved=selectBestRecentPrice(observations);
  const recentPrice=bestObserved?.price ?? null;
  const matches=rankMatchedOffers(rawMatches,{price:recentPrice,quantity:1});
  if(!matches.length){
    els.productOffers.innerHTML=`
      <div class="panel price-source">
        Aucune offre produit de notre registre ne correspond actuellement à cette référence chez ${storeLabel(state.store)}.
      </div>`;
    return;
  }

  const cards=matches.map(({offer,match,action},index)=>{
    const potential=action.estimatedSaving;
    const confidenceLabel=match.exact
      ? "EAN exact"
      : match.confidence==="probable"
        ? "Correspondance forte"
        : "Référence à vérifier";
    const confidenceClass=match.exact ? "good" : "warn";
    const savingLabel=offerPercentLabel(offer)
      || (Number.isFinite(offer.savingAmount) ? money.format(offer.savingAmount) : "—");
    const amountLine=potential===null
      ? (action.quantitySatisfied
          ? "Montant potentiel indisponible sans prix récent"
          : `Acheter au moins ${action.minQty} article(s) pour activer cette offre`)
      : `Potentiel ≈ ${money.format(potential)} sur le meilleur prix récent`;
    const quantityLine=action.quantitySatisfied
      ? (action.minQty>1 ? `Quantité minimale atteinte : ${action.minQty}` : "Valable dès 1 article")
      : `Il manque ${action.missingQty} article(s) pour atteindre le minimum`;
    const safetyNote=match.exact
      ? "Correspondance EAN/GTIN explicite. Les conditions de l’offre restent à vérifier."
      : "Détection par marque/nom uniquement : ne pas considérer l’offre comme garantie avant vérification de la référence éligible.";
    const evidence=offerEvidenceStatus(offer,{
      match,
      loyaltyProfile:state.loyaltyProfile,
      storeVerified:false,
      channelPriceVerified:false
    });
    const evidenceHtml=`
      <div class="evidence-grid">
        <span class="badge ${evidence.productExact?"good":"warn"}">Produit : ${evidence.productExact?"EAN exact":"heuristique"}</span>
        <span class="badge ${evidence.storeVerified?"good":"warn"}">Magasin : ${evidence.storeVerified?"confirmé":"à confirmer"}</span>
        ${offer.requiresLoyalty
          ? `<span class="badge ${evidence.loyaltyVerified?"good":"warn"}">Fidélité : ${evidence.loyaltyVerified?"confirmée":"à confirmer"}</span>`
          : ""}
        ${offer.requiresChannelPriceVerification
          ? `<span class="badge ${evidence.channelPriceVerified?"good":"warn"}">Prix canal : ${evidence.channelPriceVerified?"confirmé":"à confirmer"}</span>`
          : ""}
      </div>
      ${evidence.blockers.length
        ? `<p class="evidence-blockers">${evidence.blockers.map(escapeHtml).join(" · ")}</p>`
        : '<p class="evidence-blockers good-text">Toutes les preuves requises sont présentes.</p>'}
    `;

    return `
      <article class="match-card ${index===0?"best-match":""}">
        <div class="match-top">
          <div>
            <h3>${escapeHtml(offer.title)}</h3>
            <div class="source">${escapeHtml(offer.provider)} · ${escapeHtml(offer.type)}</div>
          </div>
          <div class="match-saving">
            <strong>${savingLabel}</strong>
            <small>${escapeHtml(amountLine)}</small>
          </div>
        </div>
        <div class="badges">
          ${index===0?'<span class="badge good">Meilleur candidat</span>':""}
          <span class="badge ${confidenceClass}">${confidenceLabel}</span>
          <span class="badge">${escapeHtml(storeLabel(state.store))}</span>
          <span class="badge ${action.quantitySatisfied?"good":"warn"}">${escapeHtml(quantityLine)}</span>
          ${offerDeadline(offer)?`<span class="badge ${offerDeadline(offer).urgent?"warn":""}">${escapeHtml(offerDeadline(offer).label)}</span>`:""}
        </div>
        <p class="match-note">${escapeHtml(safetyNote)}</p>
        ${evidenceHtml}
        <div class="actions">
          <span class="verified">${escapeHtml(match.reason)}</span>
          <a class="open" href="${escapeHtml(offer.sourceUrl)}" target="_blank" rel="noreferrer">Vérifier l’offre</a>
        </div>
      </article>`;
  }).join("");

  els.productOffers.innerHTML=`
    <div class="product-offers-head">
      <h3>Offres compatibles détectées</h3>
      <p>Les correspondances non exactes sont des candidats à vérifier ; elles ne sont jamais intégrées automatiquement à l’économie garantie.</p>
    </div>
    ${cards}`;
}

function priceQueryOptions(){
  const options={store:state.store};
  if(state.nearbyEnabled && state.coords){
    options.coords=state.coords;
    options.radiusKm=state.radiusKm;
  }
  return options;
}

async function toggleNearbyPrices(){
  if(state.nearbyEnabled){
    state.nearbyEnabled=false;
    state.coords=null;
    syncNearbyControls();
    markBasketPricesStale();
    if(state.productCode) await refreshPrices(state.productCode);
    setListStatus("Mode proximité désactivé. Actualise la liste pour recalculer les prix.");
    return;
  }
  if(!navigator.geolocation){
    setProductStatus("La géolocalisation n'est pas disponible sur ce navigateur.",true);
    return;
  }
  setProductStatus("Demande de position pour limiter les prix à proximité…");
  navigator.geolocation.getCurrentPosition(async(position)=>{
    state.coords={
      latitude:position.coords.latitude,
      longitude:position.coords.longitude
    };
    state.nearbyEnabled=true;
    syncNearbyControls();
    markBasketPricesStale();
    if(state.productCode) await refreshPrices(state.productCode);
    else setProductStatus("Mode proximité activé. Recherche ou scanne un produit.");
    setListStatus(`Mode proximité activé (${state.radiusKm} km). Actualise la liste.`);
  },()=>{
    state.coords=null;
    state.nearbyEnabled=false;
    syncNearbyControls();
    setProductStatus("Position non disponible. Autorise la localisation ou utilise les prix globaux.",true);
    setListStatus("Position non disponible. Les prix locaux ne peuvent pas être calculés.",true);
  },{
    enableHighAccuracy:false,
    timeout:10000,
    maximumAge:300000
  });
}

function renderPrices(observations,sourceUrl){
  if(!observations.length){
    els.priceResults.innerHTML=`
      <div class="panel price-source">
        Aucun prix Open Prices trouvé pour ce code-barres chez ${storeLabel(state.store)}${state.nearbyEnabled?` dans un rayon de ${state.radiusKm} km`:""}.
        Cela ne signifie pas que le produit n'y est pas vendu : la base est communautaire et encore incomplète.
      </div>`;
    return;
  }
  const best=selectBestRecentPrice(observations);
  const bestSummary=best
    ? `<div class="panel price-source"><strong>Meilleur prix récent : ${money.format(best.price)}</strong> · ${escapeHtml(best.storeName)}${best.city?` · ${escapeHtml(best.city)}`:""}${Number.isFinite(best.distanceKm)?` · ${best.distanceKm.toLocaleString("fr-FR")} km`:""}</div>`
    : '<div class="panel price-source">Aucune observation assez récente pour établir un meilleur prix.</div>';

  const cards=observations.slice(0,12).map((item)=>{
    const freshness=priceFreshness(item);
    const previous=item.priceWithoutDiscount && item.priceWithoutDiscount>item.price
      ? ` · avant ${money.format(item.priceWithoutDiscount)}`
      : "";
    const place=[item.storeName,item.postcode,item.city].filter(Boolean).join(" · ");
    const distance=Number.isFinite(item.distanceKm) ? ` · ${item.distanceKm.toLocaleString("fr-FR")} km` : "";
    return `
      <article class="price-card">
        <div class="price-main">
          <strong>${money.format(item.price)}</strong>
          <small>${item.isDiscounted?"Prix signalé remisé":"Prix observé"}${previous}</small>
        </div>
        <div class="price-place">
          <strong>${escapeHtml(place || storeLabel(state.store))}</strong>
          <span>${formatDate(item.date)} · ${freshness.label}${distance}</span>
        </div>
      </article>`;
  }).join("");
  els.priceResults.innerHTML=`
    ${bestSummary}
    ${cards}
    <div class="panel price-source">
      ${observations.length} observation(s) ${storeLabel(state.store)} trouvée(s)${state.nearbyEnabled?` dans un rayon de ${state.radiusKm} km`:""}. Source : Open Prices / Open Food Facts.
      <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">Données brutes</a>
    </div>`;
}

function renderOptimizer(){
  const amount=Number(els.basketAmount.value);
  if(!Number.isFinite(amount) || amount<=0){
    els.optimizerResult.innerHTML='<div class="panel price-source">Entre un montant de panier supérieur à 0 €.</div>';
    return;
  }
  const basketOffers=resolveOffersForLoyalty(offers,state.loyaltyProfile)
    .filter((offer)=>offer.scope==="panier");
  const result=optimizeStack(amount,basketOffers,{store:state.store,channel:state.channel});
  const route=result.selected.length
    ? result.selected.map((offer)=>`
      <div class="route-step">
        <span>${escapeHtml(offer.provider)} · ${escapeHtml(offer.title)}</span>
        <strong>−${money.format(offer.calculatedSaving)}</strong>
      </div>`).join("")
    : '<div class="route-step"><span>Aucune remise panier suffisamment sûre n’est automatisée pour cette enseigne.</span><strong>—</strong></div>';
  const uncertain=result.considered.filter((offer)=>offer.autoStack!==true);
  const uncertainCandidates=uncertain
    .map((offer)=>({offer,saving:estimateBasketCandidateSaving(result.finalCost,offer)}))
    .filter((entry)=>Number.isFinite(entry.saving)&&entry.saving>0)
    .sort((a,b)=>b.saving-a.saving);
  const bestUncertain=uncertainCandidates[0] || null;
  const selectedPayment=result.selected.find((offer)=>offer.mechanism==="gift_card") || null;
  const paymentAlternatives=basketOffers
    .filter((offer)=>offer.mechanism==="gift_card")
    .filter((offer)=>offer.stores?.includes(state.store)||offer.stores?.includes("all"))
    .filter((offer)=>{
      const channels=Array.isArray(offer.channels) ? offer.channels : [];
      return channels.length===0 || channels.includes(state.channel) || channels.includes("all");
    })
    .sort((a,b)=>(b.savingPercent||0)-(a.savingPercent||0));
  const paymentAdvice=selectedPayment
    ? `<div class="payment-advice">
         <div>
           <span>Meilleur paiement actuel</span>
           <strong>${escapeHtml(selectedPayment.provider)} · ${formatPercent(selectedPayment.savingPercent)}</strong>
           <small>Économie estimée : ${money.format(selectedPayment.calculatedSaving)} sur ce panier.</small>
         </div>
         <a class="open" href="${escapeHtml(selectedPayment.sourceUrl)}" target="_blank" rel="noreferrer">Ouvrir</a>
         ${paymentAlternatives.length>1
           ? `<div class="payment-alternatives">${paymentAlternatives
               .filter((offer)=>offer.id!==selectedPayment.id)
               .slice(0,3)
               .map((offer)=>`<span>${escapeHtml(offer.provider)} ${formatPercent(offer.savingPercent)}</span>`)
               .join("")}</div>`
           : ""}
       </div>`
    : `<div class="payment-advice muted">
         <div>
           <span>Meilleur paiement actuel</span>
           <strong>Aucune carte cadeau remisée validée pour ${storeLabel(state.store)}</strong>
           <small>Les autres cashbacks restent affichés séparément quand leur cumul est incertain.</small>
         </div>
       </div>`;
  const potentialAdvice=bestUncertain
    ? `<div class="potential-advice">
         <div>
           <span>Meilleur cashback potentiel du canal</span>
           <strong>${escapeHtml(bestUncertain.offer.provider)} · jusqu’à ${money.format(bestUncertain.saving)}</strong>
           <small>Non inclus dans le total garanti : active et vérifie ses conditions avant achat.</small>
         </div>
         ${bestUncertain.offer.sourceUrl?`<a class="open" href="${escapeHtml(bestUncertain.offer.sourceUrl)}" target="_blank" rel="noreferrer">Vérifier</a>`:""}
       </div>`
    : "";
  const optimizerPlan=buildSavingsActionPlan({
    store:state.store,
    channel:state.channel,
    selectedPayment,
    uncertainBasketOffers:uncertain,
    productCandidates:[],
    bundleCandidates:[],
    providers,
    loyaltyProfile:state.loyaltyProfile
  });
  const optimizerPlanHtml=renderSavingsActionPlan(optimizerPlan);

  els.optimizerResult.innerHTML=`
    <section class="optimizer-card">
      <div class="optimizer-total">
        <div><span>Panier initial</span><strong>${money.format(result.basePrice)}</strong></div>
        <div><span>Économie validée</span><strong>−${money.format(result.totalSaving)} · ${formatPercent(result.savingPercent)}</strong></div>
        <div><span>Coût effectif estimé</span><strong>${money.format(result.finalCost)}</strong></div>
      </div>
      ${paymentAdvice}
      ${potentialAdvice}
      <div class="route">${route}</div>
      <p class="help">
        ${uncertain.length} offre(s) panier supplémentaire(s) sont volontairement exclues du total car leur cumul n'est pas assez certain.
        Le moteur choisit une seule offre par groupe incompatible, donc plusieurs cartes cadeaux ne sont jamais additionnées artificiellement.
      </p>
      ${optimizerPlanHtml}
    </section>`;
}


function loadShoppingList(){
  try{
    const parsed=JSON.parse(localStorage.getItem("promo-shopping-list-v1") || "[]");
    if(!Array.isArray(parsed)) return [];
    return parsed
      .filter((item)=>item?.product?.code)
      .slice(0,30)
      .map((item)=>({product:item.product,quantity:normalizeQuantity(item.quantity)}));
  }catch{
    return [];
  }
}

function saveShoppingList(){
  localStorage.setItem("promo-shopping-list-v1",JSON.stringify(state.shoppingList));
  renderListCount();
}

function renderListCount(){
  els.listCount.textContent=String(state.shoppingList.length);
}

function addCurrentProduct(){
  if(!state.product) return;
  const code=state.product.code;
  const existing=state.shoppingList.find((item)=>item.product.code===code);
  if(existing){
    existing.quantity=normalizeQuantity(existing.quantity+1);
  }else{
    state.shoppingList.push({
      product:{
        code:state.product.code,
        name:state.product.name,
        brands:state.product.brands,
        quantity:state.product.quantity,
        imageUrl:state.product.imageUrl,
        nutriScore:state.product.nutriScore,
        categories:state.product.categories,
        sourceUrl:state.product.sourceUrl
      },
      quantity:1
    });
  }
  state.basketPriceData[state.store][code]=state.priceObservations;
  saveShoppingList();
  renderShoppingList();
  setProductStatus("Produit ajouté à la liste.");
}

function handleShoppingListAction(event){
  const button=event.target.closest("[data-list-action]");
  if(!button) return;
  const code=button.dataset.code;
  const index=state.shoppingList.findIndex((item)=>item.product.code===code);
  if(index<0) return;
  const action=button.dataset.listAction;
  if(action==="remove"){
    state.shoppingList.splice(index,1);
    delete state.basketPriceData.carrefour[code];
    delete state.basketPriceData.leclerc[code];
  }else if(action==="increment"){
    state.shoppingList[index].quantity=normalizeQuantity(state.shoppingList[index].quantity+1);
  }else if(action==="decrement"){
    const next=state.shoppingList[index].quantity-1;
    if(next<1){
      state.shoppingList.splice(index,1);
      delete state.basketPriceData.carrefour[code];
      delete state.basketPriceData.leclerc[code];
    }else{
      state.shoppingList[index].quantity=next;
    }
  }
  saveShoppingList();
  renderShoppingList();
}

function renderShoppingList(){
  renderListCount();
  if(!state.shoppingList.length){
    els.shoppingListItems.innerHTML='<div class="panel price-source">Ta liste est vide. Scanne ou recherche un produit puis appuie sur « Ajouter à la liste ».</div>';
    els.basketComparison.innerHTML="";
    return;
  }

  els.shoppingListItems.innerHTML=state.shoppingList.map((item)=>{
    const product=item.product;
    const image=product.imageUrl
      ? `<img src="${escapeHtml(product.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
      : "";
    return `
      <article class="list-item">
        ${image}
        <div class="list-item-main">
          <h3>${escapeHtml(product.name || "Produit")}</h3>
          <p>${escapeHtml([product.brands,product.quantity,`EAN ${product.code}`].filter(Boolean).join(" · "))}</p>
          <button class="remove-item" data-list-action="remove" data-code="${escapeHtml(product.code)}" type="button">Retirer</button>
        </div>
        <div class="qty" aria-label="Quantité">
          <button data-list-action="decrement" data-code="${escapeHtml(product.code)}" type="button" aria-label="Diminuer">−</button>
          <strong>${item.quantity}</strong>
          <button data-list-action="increment" data-code="${escapeHtml(product.code)}" type="button" aria-label="Augmenter">+</button>
        </div>
      </article>`;
  }).join("");

  const scenarios=evaluateCurrentBasketScenarios();
  renderBasketComparison(scenarios);
  renderComparisonHistory();
  renderPriceAlerts();
}

async function refreshShoppingList(){
  if(state.basketRefreshing || !state.shoppingList.length) return;
  state.basketRefreshing=true;
  els.refreshList.disabled=true;
  const next={carrefour:{},leclerc:{}};
  let failures=0;

  try{
    for(let index=0;index<state.shoppingList.length;index+=1){
      const item=state.shoppingList[index];
      setListStatus(`Actualisation ${index+1}/${state.shoppingList.length} : ${item.product.name || item.product.code}…`);
      const [carrefour,leclerc]=await Promise.allSettled([
        fetchPricesByBarcode(item.product.code,basketQueryOptions("carrefour")),
        fetchPricesByBarcode(item.product.code,basketQueryOptions("leclerc"))
      ]);
      if(carrefour.status==="fulfilled"){
        next.carrefour[item.product.code]=carrefour.value.observations;
        recordProductObservation(item.product,"carrefour",carrefour.value.observations);
      }else { next.carrefour[item.product.code]=[]; failures+=1; }
      if(leclerc.status==="fulfilled"){
        next.leclerc[item.product.code]=leclerc.value.observations;
        recordProductObservation(item.product,"leclerc",leclerc.value.observations);
      }else { next.leclerc[item.product.code]=[]; failures+=1; }
    }
    state.basketPriceData=next;
    const scenarios=evaluateCurrentBasketScenarios();
    recordComparisonHistory(scenarios);
    renderShoppingList();
    const locality=state.nearbyEnabled ? ` dans un rayon de ${state.radiusKm} km` : " sans filtre géographique";
    setListStatus(
      failures
        ? `Actualisation terminée avec ${failures} requête(s) indisponible(s)${locality}.`
        : `Prix actualisés pour Carrefour et E.Leclerc${locality}.`,
      failures>0
    );
  }finally{
    state.basketRefreshing=false;
    els.refreshList.disabled=false;
  }
}

function basketQueryOptions(store){
  const options={store};
  if(state.nearbyEnabled && state.coords){
    options.coords=state.coords;
    options.radiusKm=state.radiusKm;
  }
  return options;
}

function markBasketPricesStale(){
  state.basketPriceData={carrefour:{},leclerc:{}};
  renderShoppingList();
}

function syncNearbyControls(){
  const label=state.nearbyEnabled ? `À moins de ${state.radiusKm} km` : "Autour de moi";
  for(const button of [els.nearbyButton,els.listNearbyButton]){
    button.textContent=label;
    button.classList.toggle("active",state.nearbyEnabled);
  }
  els.radiusSelect.value=String(state.radiusKm);
  els.listRadiusSelect.value=String(state.radiusKm);
}

function evaluateCurrentBasketScenarios(){
  return ["carrefour","leclerc"].map((store)=>{
    const locationScenarios=evaluateBasketLocations(state.shoppingList,{
      store,
      channel:state.channel,
      priceByCode:state.basketPriceData[store],
      offers,
      loyaltyProfile:state.loyaltyProfile,
      storeConfirmations:state.storeConfirmations
    });
    const locationScenario=selectBestLocationScenario(locationScenarios);
    let scenario;
    if(locationScenario){
      scenario={
        ...locationScenario,
        locationReliable:/^(id|geo):/.test(locationScenario.locationKey || "")
      };
    }else{
      scenario={
        ...evaluateBasketStore(state.shoppingList,{
          store,
          channel:state.channel,
          priceByCode:state.basketPriceData[store],
          offers,
          loyaltyProfile:state.loyaltyProfile,
          storeConfirmations:state.storeConfirmations
        }),
        location:null,
        locationKey:null,
        locationReliable:false
      };
    }
    const enrichedScenario={
      ...scenario,
      priceChannelReliable:state.channel==="store"
    };
    return {
      ...enrichedScenario,
      confidence:scoreBasketConfidence(enrichedScenario)
    };
  });
}

function loadStoreConfirmations(){
  try{
    const parsed=JSON.parse(localStorage.getItem("promo-store-confirmations-v1") || "[]");
    return pruneStoreConfirmations(Array.isArray(parsed)?parsed:[]);
  }catch{
    return [];
  }
}

function saveStoreConfirmations(){
  state.storeConfirmations=pruneStoreConfirmations(state.storeConfirmations);
  localStorage.setItem(
    "promo-store-confirmations-v1",
    JSON.stringify(state.storeConfirmations)
  );
}

function handleBasketComparisonAction(event){
  const button=event.target.closest('[data-basket-action="toggle-store-confirmation"]');
  if(!button) return;

  const offerId=button.dataset.offerId;
  const store=button.dataset.store;
  const locationKey=button.dataset.locationKey;
  const locationName=button.dataset.locationName || "";
  const key=confirmationKey({offerId,store,locationKey});
  const existing=state.storeConfirmations.findIndex((entry)=>
    (entry.key || confirmationKey(entry))===key
  );

  if(existing>=0){
    state.storeConfirmations.splice(existing,1);
    saveStoreConfirmations();
    setListStatus("Confirmation magasin retirée.");
    renderShoppingList();
    return;
  }

  const offer=offers.find((entry)=>entry.id===offerId);
  if(!offer){
    setListStatus("Offre introuvable dans les données actuelles.",true);
    return;
  }

  try{
    const confirmation=createStoreConfirmation(offer,{
      store,
      locationKey,
      locationName
    });
    state.storeConfirmations=[
      ...state.storeConfirmations.filter((entry)=>
        (entry.key || confirmationKey(entry))!==confirmation.key
      ),
      confirmation
    ];
    saveStoreConfirmations();
    setListStatus(
      "Promo confirmée localement pour ce magasin jusqu’à son expiration."
    );
    renderShoppingList();
  }catch(error){
    setListStatus(error.message || "Confirmation impossible.",true);
  }
}

function loadLoyaltyProfile(){
  try{
    const parsed=JSON.parse(localStorage.getItem("promo-loyalty-profile-v1") || "{}");
    return normalizeLoyaltyProfile(parsed);
  }catch{
    return normalizeLoyaltyProfile({});
  }
}

function saveLoyaltyProfile(){
  localStorage.setItem("promo-loyalty-profile-v1",JSON.stringify(state.loyaltyProfile));
}

function updateLoyaltyProfile(key,value){
  state.loyaltyProfile=normalizeLoyaltyProfile({
    ...state.loyaltyProfile,
    [key]:value
  });
  saveLoyaltyProfile();
  renderLoyaltySummary();
  render();
  renderOptimizer();
  renderShoppingList();
  if(state.product) renderProductOffers(state.product,state.priceObservations);
}

function renderLoyaltySummary(){
  if(!els.loyaltySummary) return;
  const c=state.loyaltyProfile.carrefour;
  const l=state.loyaltyProfile.leclerc;
  const carrefourText=c==="pass"
    ? "Carte PASS + Club : 15% sur fruits/légumes et Carrefour Bio éligibles ; Journée PASS à vérifier selon le magasin."
    : c==="club"
      ? "Club Carrefour : 10% sur fruits/légumes et Carrefour Bio éligibles."
      : c==="none"
        ? "Carrefour : aucun avantage carte compté."
        : "Carrefour : profil non renseigné — les avantages Club restent potentiels.";
  const leclercText=l==="card"
    ? "Carte E.Leclerc : les Tickets fidélité éligibles peuvent être pris en compte après confirmation du produit et du magasin."
    : l==="none"
      ? "E.Leclerc : aucun Ticket fidélité compté."
      : "E.Leclerc : profil non renseigné — les Tickets restent potentiels.";

  els.loyaltySummary.innerHTML=`
    <div><strong>Carrefour</strong><span>${escapeHtml(carrefourText)}</span></div>
    <div><strong>E.Leclerc</strong><span>${escapeHtml(leclercText)}</span></div>
  `;
}

function loadProductPriceHistory(){
  try{
    const parsed=JSON.parse(localStorage.getItem("promo-product-price-history-v1") || "[]");
    return Array.isArray(parsed) ? parsed.slice(0,500) : [];
  }catch{
    return [];
  }
}

function saveProductPriceHistory(){
  localStorage.setItem("promo-product-price-history-v1",JSON.stringify(state.productPriceHistory));
}

function recordProductObservation(product,store,observations){
  const best=selectBestRecentPrice(observations);
  if(!best || !product?.code) return;
  state.productPriceHistory=addPriceObservation(state.productPriceHistory,{
    product,store,observation:best
  });
  saveProductPriceHistory();
}

function renderProductPriceHistory(){
  if(!els.productPriceHistory) return;
  if(!state.product?.code){
    els.productPriceHistory.innerHTML="";
    return;
  }
  const rows=productHistory(state.productPriceHistory,{
    code:state.product.code,
    store:state.store,
    limit:6
  });
  if(!rows.length){
    els.productPriceHistory.innerHTML='<div class="panel price-source">Pas encore d’historique local pour ce produit et cette enseigne.</div>';
    return;
  }
  const trend=productPriceTrend(state.productPriceHistory,{
    code:state.product.code,
    store:state.store
  });
  const trendHtml=trend
    ? `<div class="history-trend ${trend.direction==="down"?"good":trend.direction==="up"?"bad":""}">${trend.direction==="down"?"Baisse":trend.direction==="up"?"Hausse":"Stable"} de ${money.format(Math.abs(trend.delta))} (${Math.abs(trend.percent).toLocaleString("fr-FR",{maximumFractionDigits:1})} %) dans le même magasin : ${escapeHtml(trend.latest.storeName || "magasin identifié")}.</div>`
    : '<div class="history-trend">Tendance indisponible : il faut deux dates de prix distinctes dans le même magasin physique identifié.</div>';

  els.productPriceHistory.innerHTML=`
    <div class="product-offers-head">
      <h3>Historique prix local · ${storeLabel(state.store)}</h3>
      <p>Les coordonnées GPS ne sont pas stockées. Seuls le prix, la date et l’identifiant/nom du magasin sont conservés localement.</p>
    </div>
    ${trendHtml}
    <div class="price-history-list">
      ${rows.map((row)=>`
        <div class="price-history-row">
          <strong>${money.format(row.price)}</strong>
          <span>${formatDate(row.date)} · ${escapeHtml(row.storeName || storeLabel(row.store))}${row.city?` · ${escapeHtml(row.city)}`:""}</span>
        </div>`).join("")}
    </div>`;
}

function renderPriceAlerts(){
  if(!els.priceAlerts) return;
  const listCodes=new Set(state.shoppingList.map((item)=>String(item.product.code)));
  const alerts=detectPriceDrops(state.productPriceHistory,{
    thresholdPercent:state.dropThreshold
  }).filter((alert)=>listCodes.has(String(alert.code)));

  if(!alerts.length){
    els.priceAlerts.innerHTML="";
    return;
  }
  els.priceAlerts.innerHTML=`
    <div class="product-offers-head">
      <h3>Baisses de prix détectées</h3>
      <p>Prix comparés seulement dans un même magasin identifié, sur deux dates différentes. Détection à l’actualisation, sans surveillance en arrière-plan.</p>
    </div>
    ${alerts.slice(0,8).map((alert)=>`
      <article class="price-alert-card">
        <div>
          <strong>${escapeHtml(alert.name)}</strong>
          <div class="source">${storeLabel(alert.store)} · ${escapeHtml(alert.storeName || "Magasin identifié")} · ${money.format(alert.previousPrice)} → ${money.format(alert.latestPrice)}</div>
        </div>
        <span class="badge good">−${alert.dropPercent.toLocaleString("fr-FR",{maximumFractionDigits:1})} %</span>
      </article>`).join("")}`;
}

function loadComparisonHistory(){
  try{
    const parsed=JSON.parse(localStorage.getItem("promo-comparison-history-v1") || "[]");
    return Array.isArray(parsed) ? parsed.slice(0,20) : [];
  }catch{
    return [];
  }
}

function saveComparisonHistory(){
  localStorage.setItem("promo-comparison-history-v1",JSON.stringify(state.comparisonHistory));
}

function recordComparisonHistory(scenarios){
  if(!state.shoppingList.length) return;
  const hasAnyPrice=scenarios.some((scenario)=>scenario.pricedCount>0);
  if(!hasAnyPrice) return;
  const entry=createHistoryEntry({
    scenarios,
    shoppingList:state.shoppingList,
    radiusKm:state.radiusKm,
    nearbyEnabled:state.nearbyEnabled,
    channel:state.channel
  });
  state.comparisonHistory=addHistoryEntry(state.comparisonHistory,entry,{limit:20});
  saveComparisonHistory();
}

function renderComparisonHistory(){
  if(!els.comparisonHistory) return;
  if(!state.comparisonHistory.length){
    els.comparisonHistory.innerHTML='<div class="panel price-source">Aucun historique de comparaison pour le moment.</div>';
    return;
  }
  const trend=historyTrend(state.comparisonHistory);
  const trendHtml=trend
    ? `<div class="history-trend ${trend.direction==="down"?"good":trend.direction==="up"?"bad":""}">${trend.direction==="down"?"Baisse":trend.direction==="up"?"Hausse":"Stable"} de ${money.format(Math.abs(trend.delta))} par rapport à la comparaison valide précédente.</div>`
    : '<div class="history-trend">Pas encore assez de comparaisons valides pour calculer une tendance.</div>';

  els.comparisonHistory.innerHTML=`
    <div class="product-offers-head">
      <h3>Historique local</h3>
      <p>Maximum 20 comparaisons. Aucun historique n'est envoyé à un serveur par l'application.</p>
    </div>
    ${trendHtml}
    ${state.comparisonHistory.slice(0,6).map((entry)=>{
      const best=entry.bestStore
        ? `${storeLabel(entry.bestStore)} · ${money.format(entry.bestFinalCost)}`
        : "Comparaison incomplète";
      return `
        <article class="history-card">
          <div class="history-head">
            <strong>${best}</strong>
            <time datetime="${escapeHtml(entry.createdAt)}">${formatDateTime(entry.createdAt)}</time>
          </div>
          <div class="history-meta">
            <span class="badge">${entry.distinctCount} référence(s)</span>
            <span class="badge">${entry.itemCount} article(s)</span>
            <span class="badge">${entry.nearbyEnabled?`${entry.radiusKm} km`:"sans proximité"}</span>
          </div>
        </article>`;
    }).join("")}`;
}

function renderBasketComparison(scenarios){
  const ranked=compareBasketStores(scenarios);
  const strategySummary=summarizeBasketStrategies(scenarios,{
    channel:state.channel,
    nearbyEnabled:state.nearbyEnabled
  });
  const strategyHtml=renderStrategySummary(strategySummary);
  const allComplete=scenarios.length>0 && scenarios.every((scenario)=>scenario.isComplete);
  const allLocationsReliable=scenarios.length>0 && scenarios.every((scenario)=>scenario.locationReliable);
  let recommendation="";
  if(state.channel!=="store"){
    recommendation='<div class="basket-recommendation"><strong>Prix indicatifs seulement.</strong> Open Prices contient des observations de magasins physiques ; en mode Drive ou En ligne, ces prix ne permettent pas de déclarer une enseigne gagnante. Les offres du canal sélectionné restent filtrées correctement.</div>';
  }else if(!state.nearbyEnabled){
    recommendation='<div class="basket-recommendation"><strong>Comparaison locale non activée.</strong> Active « Autour de moi » puis actualise pour comparer des magasins dans le même secteur.</div>';
  }else if(!allComplete){
    recommendation='<div class="basket-recommendation"><strong>Comparaison incomplète.</strong> Au moins une enseigne manque d’un prix récent pour un produit ; aucun gagnant n’est déclaré.</div>';
  }else if(!allLocationsReliable){
    recommendation='<div class="basket-recommendation"><strong>Point de vente insuffisamment identifié.</strong> Les prix sont affichés, mais aucun gagnant n’est déclaré tant que chaque panier ne correspond pas clairement à un magasin physique unique.</div>';
  }else if(ranked.length>=2){
    const best=ranked[0];
    const second=ranked[1];
    const difference=Math.round((second.finalCost-best.finalCost+Number.EPSILON)*100)/100;
    recommendation=difference>0
      ? `<div class="basket-recommendation"><strong>${storeLabel(best.store)} est le meilleur scénario observé</strong> : environ ${money.format(difference)} de moins sur ce panier, après remises automatiquement validées.</div>`
      : '<div class="basket-recommendation"><strong>Égalité sur les données disponibles.</strong> Les deux scénarios ont le même coût effectif estimé.</div>';
  }

  els.basketComparison.innerHTML=`
    ${strategyHtml}
    ${recommendation}
    <div class="scenario-grid">
      ${scenarios.map(renderBasketScenario).join("")}
    </div>`;
}

function renderStrategySummary(summary){
  if(!summary) return "";
  if(summary.status!=="ready"){
    return `<div class="strategy-summary muted">
      <div>
        <span>Stratégie globale</span>
        <strong>Comparaison prudente indisponible</strong>
        <small>${escapeHtml(summary.reason || "")}</small>
      </div>
    </div>`;
  }
  const g=summary.guaranteed;
  const p=summary.prudent;
  const payment=g.payment
    ? `${escapeHtml(g.payment.provider)} · ${formatPercent(g.payment.savingPercent)}`
    : "aucun bon remisé retenu";
  const potentialLine=summary.sameStore
    ? `Même enseigne en scénario prudent : ${storeLabel(p.store)} · ${money.format(p.cost)}`
    : `Le meilleur potentiel prudent bascule vers ${storeLabel(p.store)} · ${money.format(p.cost)}`;

  return `<section class="strategy-summary">
    <div class="strategy-main">
      <span>Meilleure stratégie garantie</span>
      <strong>${storeLabel(g.store)} · ${money.format(g.finalCost)}</strong>
      <small>Économie validée ${money.format(g.saving)} · confiance ${g.confidence ?? "—"}/100</small>
    </div>
    <div class="strategy-facts">
      <div><span>Paiement</span><strong>${payment}</strong></div>
      <div><span>ODR candidates</span><strong>${g.candidateProductCount}</strong></div>
      <div><span>Potentiel prudent</span><strong>${money.format(p.cost)}</strong></div>
    </div>
    <p>${potentialLine}. Les économies candidates restent à confirmer.</p>
  </section>`;
}

function renderBasketScenario(scenario){
  const coverageClass=scenario.isComplete ? "coverage-good" : "coverage-warn";
  const totalLabel=scenario.priceChannelReliable===false
    ? "Coût effectif indicatif"
    : scenario.isComplete ? "Coût effectif" : "Total partiel";
  const locationText=scenario.location
    ? [scenario.location.name,scenario.location.postcode,scenario.location.city].filter(Boolean).join(" · ")
    : "Point de vente non identifié";
  const distanceText=Number.isFinite(scenario.location?.distanceKm)
    ? ` · ${scenario.location.distanceKm.toLocaleString("fr-FR")} km`
    : "";
  const locationWarning=scenario.locationReliable
    ? ""
    : '<span class="badge warn">magasin à confirmer</span>';
  const confidence=scenario.confidence || scoreBasketConfidence(scenario);
  const lines=scenario.lines.map((line)=>{
    if(line.missingPrice){
      return `<div class="scenario-line"><span>${escapeHtml(line.product?.name || line.code)} × ${line.quantity}</span><strong class="missing">prix manquant</strong></div>`;
    }
    const place=line.bestPrice?.storeName ? ` · ${escapeHtml(line.bestPrice.storeName)}` : "";
    const candidate=line.bestProductCandidate;
    const maxCandidate=line.bestSavingCandidate;
    const maxCandidateDiff=maxCandidate && candidate
      && maxCandidate.offer?.id!==candidate.offer?.id
      && maxCandidate.saving>candidate.saving;
    const canConfirmStore=Boolean(
      candidate
      && candidate.match.exact
      && candidate.offer?.requiresStoreVerification
      && state.channel==="store"
      && state.nearbyEnabled
      && scenario.locationReliable
      && scenario.locationKey
    );
    const locallyConfirmed=Boolean(candidate?.offer?.storeVerified);
    const confirmationButton=canConfirmStore
      ? `<button
          class="confirm-store-offer ${locallyConfirmed?"active":""}"
          type="button"
          data-basket-action="toggle-store-confirmation"
          data-offer-id="${escapeHtml(candidate.offer.id)}"
          data-store="${escapeHtml(scenario.store)}"
          data-location-key="${escapeHtml(scenario.locationKey)}"
          data-location-name="${escapeHtml(scenario.location?.name || "")}"
        >${locallyConfirmed?"Confirmée dans ce magasin ✓":"J’ai vérifié cette promo ici"}</button>`
      : "";
    const localVerificationHint=candidate
      && candidate.match.exact
      && candidate.offer?.requiresStoreVerification
      && state.channel==="store"
      && scenario.locationReliable
      && !state.nearbyEnabled
      ? '<span class="local-verify-hint">Active « Autour de moi » pour confirmer cette promo dans un magasin précis.</span>'
      : "";
    const candidateHtml=candidate
      ? `<div class="line-offer">
           <span class="badge ${candidate.match.exact?"good":"warn"}">${candidate.match.exact?"EAN exact":"à vérifier"}</span>
           <span>${escapeHtml(candidate.offer.provider)} · ${escapeHtml(candidate.offer.title)}${offerDeadline(candidate.offer)?` · ${escapeHtml(offerDeadline(candidate.offer).label)}`:""}</span>
           <strong>≈ −${money.format(candidate.saving)}</strong>
           ${confirmationButton}
           ${localVerificationHint}
         </div>`
      : "";
    return `<div class="scenario-line-wrap">
      <div class="scenario-line"><span>${escapeHtml(line.product?.name || line.code)} × ${line.quantity}${place}</span><strong>${money.format(line.baseCost)}</strong></div>
      ${candidateHtml}
      ${maxCandidateDiff?`<div class="line-offer potential-max">
        <span class="badge warn">Gain max à vérifier</span>
        <span>${escapeHtml(maxCandidate.offer.provider)} · ${escapeHtml(maxCandidate.offer.title)}</span>
        <strong>≈ −${money.format(maxCandidate.saving)}</strong>
      </div>`:""}
    </div>`;
  }).join("");
  const basketRoute=scenario.basketOptimization.selected.length
    ? scenario.basketOptimization.selected.map((offer)=>`${escapeHtml(offer.provider)} −${money.format(offer.calculatedSaving)}`).join(" · ")
    : "Aucune remise panier automatiquement retenue";
  const breakdown=scenario.savingsBreakdown || {
    productGuaranteed:0,productImmediateGuaranteed:0,loyaltyGuaranteed:0,refundGuaranteed:0,
    checkoutGuaranteed:0,paymentGuaranteed:0,otherBasketGuaranteed:0,
    productPotential:scenario.potentialProductSaving||0,bundlePotential:scenario.potentialBundleSaving||0,
    basketPotential:0,uncertainBasketCount:0
  };
  const levers=`
    <div class="saving-levers">
      <div class="lever guaranteed"><span>Promo immédiate</span><strong>−${money.format(breakdown.productImmediateGuaranteed||0)}</strong></div>
      <div class="lever guaranteed"><span>Fidélité cagnottée</span><strong>+${money.format(breakdown.loyaltyGuaranteed||0)}</strong></div>
      <div class="lever guaranteed"><span>Paiement remisé</span><strong>−${money.format(breakdown.paymentGuaranteed)}</strong></div>
      <div class="lever guaranteed"><span>Autres garanties</span><strong>−${money.format(breakdown.otherBasketGuaranteed)}</strong></div>
      <div class="lever potential"><span>ODR candidates</span><strong>jusqu’à ${money.format(breakdown.productPotential)}</strong></div>
      <div class="lever potential"><span>Bundles candidats</span><strong>jusqu’à ${money.format(breakdown.bundlePotential)}</strong></div>
      <div class="lever potential"><span>Cashback panier candidat</span><strong>jusqu’à ${money.format(breakdown.basketPotential||0)}</strong></div>
    </div>`;
  const potential=scenario.potentialProductSaving>0
    ? `<p class="help">ODR/coupons produits candidats : jusqu’à ${money.format(scenario.potentialProductSaving)} potentiels, non inclus tant que l’éligibilité/cumul n’est pas confirmé.</p>`
    : "";
  const bundlePotential=scenario.potentialBundleSaving>0
    ? `<p class="help"><strong>Offre multi-produits potentielle :</strong> jusqu’à ${money.format(scenario.potentialBundleSaving)} supplémentaires. Elle n’est jamais intégrée au coût garanti avant confirmation des références, de l’achat simultané et des règles de cumul.</p>`
    : "";
  const basketPotential=breakdown.basketPotential>0
    ? `<p class="help"><strong>Cashback panier potentiel :</strong> jusqu’à ${money.format(breakdown.basketPotential)} selon le meilleur cashback non garanti compatible avec ce canal. Il reste exclu du coût garanti.</p>`
    : "";
  const selectedPayment=scenario.basketOptimization.selected.find((offer)=>offer.mechanism==="gift_card") || null;
  const uncertainBasketOffers=scenario.basketOptimization.considered.filter((offer)=>offer.autoStack!==true);
  const productCandidates=scenario.lines.flatMap((line)=>line.matches || []);
  const actionPlan=buildSavingsActionPlan({
    store:scenario.store,
    channel:scenario.channel || state.channel,
    selectedPayment,
    uncertainBasketOffers,
    productCandidates,
    bundleCandidates:scenario.bundleCandidates || [],
    providers
  });
  const actionPlanHtml=renderSavingsActionPlan(actionPlan);
  const prudentBestCase=scenario.conservativePotentialExtraSaving>0
    ? `<div class="best-case-box">
         <span>Meilleur cas prudent</span>
         <strong>${money.format(scenario.conservativeBestCaseCost)}</strong>
         <small>Coût économique après le meilleur levier candidat, sans additionner artificiellement des offres potentiellement incompatibles. Le prix payé en caisse peut être supérieur si une partie revient en cagnotte/remboursement.</small>
       </div>`
    : "";

  return `
    <article class="scenario-card">
      <div>
        <h3>${storeLabel(scenario.store)}</h3>
        <div class="source">${escapeHtml(locationText)}${distanceText}</div>
        <div class="${coverageClass} source">${scenario.pricedCount}/${scenario.distinctCount} références avec prix récent</div>
        <div class="badges">
          ${locationWarning}
          ${scenario.priceChannelReliable===false?'<span class="badge warn">prix magasin indicatif pour ce canal</span>':""}
        </div>
      </div>
      <div class="confidence-box">
        <div class="confidence-score ${confidence.level}">${confidence.score}/100</div>
        <div>
          <strong>Confiance ${confidence.label.toLocaleLowerCase("fr")}</strong>
          <div class="confidence-parts">
            <span>Couverture ${confidence.parts.coverage}/50</span>
            <span>Fraîcheur ${confidence.parts.freshness}/25</span>
            <span>Magasin ${confidence.parts.location}/15</span>
            <span>Preuve ${confidence.parts.proof}/10</span>
          </div>
        </div>
      </div>
      <div class="scenario-summary">
        <div><span>Prix caisse estimé</span><strong>${money.format(scenario.checkoutCost ?? scenario.observedSubtotal)}</strong></div>
        <div><span>Cagnotte fidélité</span><strong>+${money.format(scenario.loyaltyCredit||0)}</strong></div>
        <div><span>Économie validée totale</span><strong>−${money.format(scenario.guaranteedSaving)}</strong></div>
        <div><span>${totalLabel}</span><strong>${money.format(scenario.finalCost)}</strong></div>
      </div>
      ${levers}
      <div class="scenario-lines">${lines}</div>
      <p class="help">${basketRoute}</p>
      ${potential}
      ${bundlePotential}
      ${basketPotential}
      ${prudentBestCase}
      ${actionPlanHtml}
    </article>`;
}

function renderSavingsActionPlan(plan){
  if(!plan?.steps?.length) return "";
  const phaseLabels={avant:"Avant",paiement:"Paiement",achat:"En caisse",après:"Après achat"};
  return `
    <section class="action-plan">
      <div class="product-offers-head">
        <h3>Ordre recommandé</h3>
        <p>Les étapes incertaines restent des vérifications et ne sont pas incluses dans l’économie garantie.</p>
      </div>
      <ol class="action-plan-list">
        ${plan.steps.map((step)=>`
          <li class="action-step ${escapeHtml(step.kind)}">
            <div class="action-step-order">${step.order}</div>
            <div>
              <div class="action-step-phase">${escapeHtml(phaseLabels[step.phase] || step.phase)}</div>
              <strong>${escapeHtml(step.title)}</strong>
              <p>${escapeHtml(step.detail)}</p>
              ${step.sourceUrl?`<a class="action-source" href="${escapeHtml(step.sourceUrl)}" target="_blank" rel="noreferrer">Vérifier la source</a>`:""}
            </div>
          </li>`).join("")}
      </ol>
    </section>`;
}

function setListStatus(message,isError=false){
  els.listStatus.textContent=message;
  els.listStatus.classList.toggle("error",Boolean(isError));
}

let scannerStream=null;
let scannerFrame=null;
let scannerBusy=false;

async function startScanner(){
  if(!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia){
    setProductStatus("Le scanner natif n'est pas disponible sur ce navigateur. Saisis le code-barres manuellement.",true);
    setTab("product");
    return;
  }
  try{
    const detector=new BarcodeDetector({formats:["ean_13","ean_8","upc_a","upc_e"]});
    scannerStream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:{ideal:"environment"}},audio:false
    });
    els.scanVideo.srcObject=scannerStream;
    els.scanDialog.showModal();
    await els.scanVideo.play();

    const detect=async()=>{
      if(!scannerStream || scannerBusy) return;
      scannerBusy=true;
      try{
        const codes=await detector.detect(els.scanVideo);
        const raw=codes?.[0]?.rawValue;
        if(raw){
          els.barcode.value=raw;
          els.scanDialog.close();
          setTab("product");
          await lookupBarcode(raw);
          return;
        }
      }catch{}
      finally{scannerBusy=false;}
      if(scannerStream) scannerFrame=requestAnimationFrame(detect);
    };
    scannerFrame=requestAnimationFrame(detect);
  }catch(error){
    stopScanner();
    setProductStatus("Impossible d'ouvrir la caméra. Vérifie l'autorisation caméra ou saisis le code manuellement.",true);
    setTab("product");
  }
}

function stopScanner(){
  if(scannerFrame) cancelAnimationFrame(scannerFrame);
  scannerFrame=null;
  scannerBusy=false;
  if(scannerStream){
    scannerStream.getTracks().forEach((track)=>track.stop());
    scannerStream=null;
  }
  els.scanVideo.srcObject=null;
}

function setProductStatus(message,isError=false){
  els.productStatus.textContent=message;
  els.productStatus.classList.toggle("error",Boolean(isError));
}

function offerPercentLabel(offer){
  const tiers=Array.isArray(offer.quantityTiers) ? offer.quantityTiers : [];
  if(tiers.length){
    const values=tiers.map((tier)=>Number(tier.savingPercent)).filter(Number.isFinite);
    if(values.length){
      const min=Math.min(...values);
      const max=Math.max(...values);
      return min===max ? formatPercent(min) : `${formatPercent(min).replace(" %","")}–${formatPercent(max)}`;
    }
  }
  const percent=effectiveOfferPercent(offer,1);
  return Number.isFinite(percent) ? formatPercent(percent) : null;
}

async function hydrateImportedOffers(){
  try{
    const result=await loadImportedOffers();
    offers=mergeOffers(baseOffers,result.offers);
    state.sourceHealth=result.sourceStats || [];
    const suffix=result.errors.length
      ? ` · ${result.offers.length} offres publiques chargées, ${result.errors.length} lot(s) en erreur`
      : ` · ${result.offers.length} offres publiques chargées`;
    els.datasetDate.textContent=`Offres vérifiées : ${new Date(DATASET_DATE+"T12:00:00").toLocaleDateString("fr-FR")}${suffix}`;
    render();
    renderSourceHealth();
    renderOptimizer();
    renderShoppingList();
    if(state.product) renderProductOffers(state.product,state.priceObservations);
  }catch(error){
    state.sourceHealth=[];
    renderSourceHealth();
    els.datasetDate.textContent=`Offres vérifiées : ${new Date(DATASET_DATE+"T12:00:00").toLocaleDateString("fr-FR")} · imports indisponibles`;
  }
}

function stat(value,label){return `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`;}
function formatPercent(value){return `${new Intl.NumberFormat("fr-FR",{maximumFractionDigits:2}).format(value)} %`;}
function formatDateTime(value){
  const date=new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date inconnue"
    : date.toLocaleString("fr-FR",{dateStyle:"short",timeStyle:"short"});
}
function formatDate(value){
  if(!value) return "Date inconnue";
  const date=new Date(String(value).length===10 ? value+"T12:00:00" : value);
  return Number.isNaN(date.getTime()) ? "Date inconnue" : date.toLocaleDateString("fr-FR");
}
function storeLabel(store){return store==="leclerc"?"E.Leclerc":"Carrefour";}
function escapeHtml(value){return String(value ?? "").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));}

let deferredPrompt;
window.addEventListener("beforeinstallprompt",(event)=>{
  event.preventDefault();
  deferredPrompt=event;
  els.installButton.classList.remove("hidden");
});
els.installButton.addEventListener("click",async()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt=undefined;
  els.installButton.classList.add("hidden");
});

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}

syncNearbyControls();
renderLoyaltySummary();
render();
renderOptimizer();
renderShoppingList();
renderComparisonHistory();
renderSourceHealth();
renderProductPriceHistory();
renderPriceAlerts();
hydrateImportedOffers();
