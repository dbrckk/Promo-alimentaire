import { DATASET_DATE, offers as baseOffers, providers } from "./data.js";
import {SOURCE_SCOPES,filterDiscoveryProviders} from "./source-discovery.js";
import { computeSaving, effectivePercent, filterOffers, offerDeadline, rankOffers } from "./domain.js";
import {parseSimulatedUnitPrice,parseSimulatedQuantity,simulateProductOffer} from "./offer-simulator.js";
import { fetchPricesByBarcode, fetchProductByBarcode, isFreshObservation, normalizeBarcode, priceFreshness, selectBestRecentPrice } from "./open-data.js";
import { optimizeStack } from "./stacking.js";
import { effectiveOfferPercent, estimateOfferSaving, findProductOffers, rankMatchedOffers } from "./matching.js";
import { loadImportedOffers, mergeOffers } from "./import-loader.js";
import { filterActiveOffers } from "./ingestion.js";
import {
  compareBasketStores,
  evaluateBasketLocations,
  evaluateBasketStore,
  estimateBasketCandidateSaving,
  normalizeQuantity,
  selectBestLocationScenario
} from "./basket.js";
import { scoreBasketConfidence } from "./confidence.js";
import {
  loadManualPrices as validateManualPrices,
  saveManualPrice,
  removeManualPrice,
  mergeManualPriceObservations
} from "./manual-prices.js";
import { addHistoryEntry, createHistoryEntry, historyTrend } from "./history.js";
import { buildSavingsActionPlan } from "./action-plan.js";
import { buildVerificationQueue } from "./verification-queue.js";
import { evaluateShoppingBudget, parseShoppingBudget } from "./budget.js";
import { MAX_BACKUP_BYTES, serializeShoppingList, parseShoppingListBackup } from "./shopping-list-transfer.js";
import { summarizeBasketStrategies } from "./strategy.js";
import {
  buildProductLoyaltyOffers,
  normalizeLoyaltyProfile,
  resolveOffersForLoyalty
} from "./loyalty.js";
import { offerEvidenceStatus } from "./evidence.js";
import {canonicalGtin} from "./gtin.js";
import {compareExactSku} from "./exact-sku-comparison.js";
import {
  confirmationKey,
  createStoreConfirmation,
  pruneStoreConfirmations
} from "./local-verification.js";
import {
  addPriceObservation,
  addStorePriceObservations,
  detectPriceDrops,
  productHistory,
  productPriceTrend
} from "./product-history.js";

const money = new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"});
let offers=[...baseOffers];
function activeOffers(){
  // Recheck deadlines at each interaction: long-running installed PWAs must
  // not continue counting an offer whose review date passed overnight.
  return filterActiveOffers(offers,new Date());
}
const els = {
  store:document.querySelector("#store"),
  channel:document.querySelector("#channel"),
  carrefourLoyalty:document.querySelector("#carrefourLoyalty"),
  leclercLoyalty:document.querySelector("#leclercLoyalty"),
  loyaltySummary:document.querySelector("#loyaltySummary"),
  sort:document.querySelector("#sort"),
  savingsFocus:document.querySelector("#savingsFocus"),
  simulatedPrice:document.querySelector("#simulatedPrice"),
  simulatedQuantity:document.querySelector("#simulatedQuantity"),
  simulatorSummary:document.querySelector("#simulatorSummary"),
  search:document.querySelector("#search"),
  offers:document.querySelector("#offers"),
  providers:document.querySelector("#providers"),
  sourceScope:document.querySelector("#sourceScope"),
  sourceSearch:document.querySelector("#sourceSearch"),
  sourceDiscoverySummary:document.querySelector("#sourceDiscoverySummary"),
  sourceHealth:document.querySelector("#sourceHealth"),
  empty:document.querySelector("#empty"),
  stats:document.querySelector("#stats"),
  datasetDate:document.querySelector("#datasetDate"),
  tabs:[...document.querySelectorAll(".tab")],
  installButton:document.querySelector("#installButton"),
  barcodeForm:document.querySelector("#barcodeForm"),
  barcode:document.querySelector("#barcode"),
  scanButton:document.querySelector("#scanButton"),
  compareExactSku:document.querySelector("#compareExactSku"),
  exactSkuQuantity:document.querySelector("#exactSkuQuantity"),
  exactSkuComparison:document.querySelector("#exactSkuComparison"),
  nearbyButton:document.querySelector("#nearbyButton"),
  radiusSelect:document.querySelector("#radiusSelect"),
  productStatus:document.querySelector("#productStatus"),
  productResult:document.querySelector("#productResult"),
  productOffers:document.querySelector("#productOffers"),
  priceResults:document.querySelector("#priceResults"),
  productPriceHistory:document.querySelector("#productPriceHistory"),
  listCount:document.querySelector("#listCount"),
  shoppingBudget:document.querySelector("#shoppingBudget"),
  budgetSummary:document.querySelector("#budgetSummary"),
  manualPriceForm:document.querySelector("#manualPriceForm"),
  manualPriceProduct:document.querySelector("#manualPriceProduct"),
  manualPriceStore:document.querySelector("#manualPriceStore"),
  manualPriceAmount:document.querySelector("#manualPriceAmount"),
  manualPriceStoreName:document.querySelector("#manualPriceStoreName"),
  manualPricePostcode:document.querySelector("#manualPricePostcode"),
  manualPriceDate:document.querySelector("#manualPriceDate"),
  manualPriceSubmit:document.querySelector("#manualPriceSubmit"),
  manualPriceStatus:document.querySelector("#manualPriceStatus"),
  manualPriceEntries:document.querySelector("#manualPriceEntries"),
  refreshList:document.querySelector("#refreshList"),
  listNearbyButton:document.querySelector("#listNearbyButton"),
  listRadiusSelect:document.querySelector("#listRadiusSelect"),
  clearList:document.querySelector("#clearList"),
  exportList:document.querySelector("#exportList"),
  importList:document.querySelector("#importList"),
  importListFile:document.querySelector("#importListFile"),
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
  savingsFocus:["all","at-least-50","full-refund"].includes(localStorage.getItem("promo-savings-focus"))
    ? localStorage.getItem("promo-savings-focus") : "all",
  search:"",
  simulatedPrice:"",
  simulatedQuantity:"1",
  sourceScope:SOURCE_SCOPES.has(localStorage.getItem("promo-source-scope"))
    ? localStorage.getItem("promo-source-scope") : "food",
  sourceSearch:"",
  tab:"offers",
  productCode:null,
  product:null,
  priceObservations:[],
  nearbyEnabled:false,
  coords:null,
  radiusKm:25,
  shoppingList:loadShoppingList(),
  shoppingBudget:loadShoppingBudget(),
  manualPrices:loadStoredManualPrices(),
  basketPriceData:{carrefour:{},leclerc:{}},
  basketPriceCoverageIncomplete:false,
  comparisonHistory:loadComparisonHistory(),
  productPriceHistory:loadProductPriceHistory(),
  dropThreshold:Number(localStorage.getItem("promo-drop-threshold") || 10),
  basketRefreshing:false,
  sourceHealth:[],
  lookupToken:0,
  skuCompareToken:0
};

// Shared by both retailer lookups. Any change of product/filters aborts
// obsolete network traffic instead of merely discarding its eventual reply.
let skuComparisonController=null;
const EXACT_SKU_TIMEOUT_MS=18000;

els.store.value=state.store;
els.channel.value=state.channel;
els.carrefourLoyalty.value=state.loyaltyProfile.carrefour;
els.leclercLoyalty.value=state.loyaltyProfile.leclerc;
els.sort.value=state.sort;
els.savingsFocus.value=state.savingsFocus;
els.simulatedQuantity.value=state.simulatedQuantity;
els.sourceScope.value=state.sourceScope;
els.radiusSelect.value=String(state.radiusKm);
els.listRadiusSelect.value=String(state.radiusKm);
els.dropThreshold.value=String(state.dropThreshold);
els.manualPriceStore.value=state.store;
els.shoppingBudget.value=state.shoppingBudget===null?"":state.shoppingBudget.toFixed(2).replace(".",",");
els.manualPriceDate.value=new Date(Date.now()-new Date().getTimezoneOffset()*60000)
  .toISOString().slice(0,10);
els.manualPriceDate.max=els.manualPriceDate.value;
els.datasetDate.textContent=`Offres vérifiées : ${new Date(DATASET_DATE+"T12:00:00").toLocaleDateString("fr-FR")}`;

els.store.addEventListener("change",async()=>{
  invalidateExactSkuComparison();
  state.store=els.store.value;
  localStorage.setItem("promo-store",state.store);
  els.manualPriceStore.value=state.store;
  render();
  renderOptimizer();
  if(state.product) renderProductOffers(state.product,state.priceObservations);
  if(state.productCode) await refreshPrices(state.productCode);
});
els.channel.addEventListener("change",()=>{
  invalidateExactSkuComparison();
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
els.savingsFocus.addEventListener("change",()=>{
  state.savingsFocus=els.savingsFocus.value;
  localStorage.setItem("promo-savings-focus",state.savingsFocus);
  render();
});
els.simulatedPrice.addEventListener("input",()=>{
  state.simulatedPrice=els.simulatedPrice.value;
  render();
});
els.simulatedQuantity.addEventListener("input",()=>{
  state.simulatedQuantity=els.simulatedQuantity.value;
  render();
});
els.sourceScope.addEventListener("change",()=>{
  state.sourceScope=SOURCE_SCOPES.has(els.sourceScope.value)
    ? els.sourceScope.value : "food";
  localStorage.setItem("promo-source-scope",state.sourceScope);
  render();
});
els.sourceSearch.addEventListener("input",()=>{
  state.sourceSearch=els.sourceSearch.value;
  render();
});
els.basketAmount.addEventListener("input",renderOptimizer);
els.barcodeForm.addEventListener("submit",(event)=>{
  event.preventDefault();
  lookupBarcode(els.barcode.value);
});
els.scanButton.addEventListener("click",startScanner);
els.compareExactSku.addEventListener("click",()=>compareCurrentExactSku());
els.exactSkuQuantity.addEventListener("input",invalidateExactSkuComparison);
els.exactSkuComparison.addEventListener("click",(event)=>{
  if(event.target.closest('[data-action="expand-exact-sku"]')){
    compareCurrentExactSku({deep:true});
  }
});
els.nearbyButton.addEventListener("click",toggleNearbyPrices);
els.listNearbyButton.addEventListener("click",toggleNearbyPrices);
els.refreshList.addEventListener("click",refreshShoppingList);
els.exportList.addEventListener("click",downloadShoppingListBackup);
els.importList.addEventListener("click",()=>{
  if(state.basketRefreshing){
    setListStatus("Attends la fin de l'actualisation des prix avant de restaurer.",true);
    return;
  }
  els.importListFile.click();
});
els.importListFile.addEventListener("change",restoreShoppingListBackup);
els.shoppingBudget.addEventListener("input",()=>{
  const input=els.shoppingBudget.value.trim();
  state.shoppingBudget=parseShoppingBudget(input);
  if(state.shoppingBudget===null){
    localStorage.removeItem("promo-shopping-budget-v1");
  }else{
    localStorage.setItem("promo-shopping-budget-v1",String(state.shoppingBudget));
  }
  renderBudgetSummary(evaluateCurrentBasketScenarios());
});
els.clearList.addEventListener("click",()=>{
  state.shoppingList=[];
  state.basketPriceData={carrefour:{},leclerc:{}};
  state.basketPriceCoverageIncomplete=false;
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
els.manualPriceForm.addEventListener("submit",handleManualPriceSubmit);
els.manualPriceEntries.addEventListener("click",handleManualPriceEntryAction);
els.basketComparison.addEventListener("click",handleBasketComparisonAction);
els.dropThreshold.addEventListener("change",()=>{
  state.dropThreshold=Number(els.dropThreshold.value)||10;
  localStorage.setItem("promo-drop-threshold",String(state.dropThreshold));
  renderPriceAlerts();
});
els.radiusSelect.addEventListener("change",async()=>{
  invalidateExactSkuComparison();
  state.radiusKm=Number(els.radiusSelect.value)||25;
  els.listRadiusSelect.value=String(state.radiusKm);
  syncNearbyControls();
  if(state.nearbyEnabled){
    if(state.productCode) await refreshPrices(state.productCode);
    markBasketPricesStale();
  }
});
els.listRadiusSelect.addEventListener("change",async()=>{
  invalidateExactSkuComparison();
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
  const resolvedOffers=resolveOffersForLoyalty(activeOffers(),state.loyaltyProfile);
  const filtered=filterOffers(resolvedOffers,{
    store:state.store,channel:state.channel,search:state.search,
    savingsFocus:state.savingsFocus
  });
  const scenario={unitPrice:state.simulatedPrice,quantity:state.simulatedQuantity};
  const ranked=rankOffers(filtered,state.sort,new Date(),scenario);
  els.offers.innerHTML=ranked.map((offer)=>renderOffer(offer,scenario)).join("");
  const entered=state.simulatedPrice.trim();
  const price=parseSimulatedUnitPrice(entered);
  const quantity=parseSimulatedQuantity(state.simulatedQuantity);
  if(!entered){
    els.simulatorSummary.textContent="Simulation désactivée : aucun prix saisi. Aucun prix de produit n'est supposé.";
  }else if(price===null || quantity===null){
    els.simulatorSummary.textContent="Saisir un prix positif en euros (2 décimales max.) et une quantité entière entre 1 et 100.";
  }else{
    const applicable=ranked.filter((offer)=>simulateProductOffer(offer,scenario)?.status==="estimated").length;
    els.simulatorSummary.textContent=applicable+" offre(s) chiffrable(s) avec "+quantity+
      " article(s) à "+money.format(price)+" chacun. Tous les résultats restent conditionnels et doivent être vérifiés sur la fiche officielle.";
  }
  els.empty.classList.toggle("hidden",ranked.length>0);
  els.empty.textContent=state.savingsFocus==="full-refund"
    ? "Aucun remboursement intégral de produit identifié actuellement pour ce magasin et ce canal. Ne pas acheter en anticipant une offre absente."
    : state.savingsFocus==="at-least-50"
      ? "Aucune offre de 50 % ou plus annoncée actuellement selon les données disponibles."
      : "Aucune offre ne correspond aux filtres.";

  const activeProviders=filterDiscoveryProviders(providers,{
    scope:state.sourceScope,search:state.sourceSearch
  });
  els.providers.innerHTML=activeProviders.length
    ? activeProviders.map(renderProvider).join("")
    : '<div class="panel price-source">Aucun service ne correspond à la recherche.</div>';
  const scopeLabels={
    food:"toutes les économies alimentaires",
    "free-food":"dons, tests gratuits et aide alimentaire",
    "food-odr":"ODR, remboursements, cashback et coupons",
    "other-50":"autres domaines, réduction maximale annoncée d’au moins 50 %",
    all:"toutes catégories"
  };
  els.sourceDiscoverySummary.textContent=activeProviders.length+" service(s) référencé(s) · "+
    scopeLabels[state.sourceScope]+
    ". Disponibilité et économies exactes à vérifier auprès de chaque source.";

  const numericPercents=ranked.map(effectivePercent).filter(Number.isFinite);
  const maxPercent=numericPercents.length?Math.max(...numericPercents):null;
  els.stats.innerHTML=[
    stat(ranked.length,"offres chiffrées"),
    stat(activeProviders.length,"sources utiles"),
    stat(maxPercent===null?"—":formatPercent(maxPercent),"meilleure remise")
  ].join("");
  renderListCount();
}

function renderOffer(offer,scenario={}){
  const simulation=simulateProductOffer(offer,scenario);
  const simulated=simulation?.status==="estimated"
    ? `<div class="simulated-offer">
        <strong>Simulation indicative · ${simulation.quantity} article(s) à ${money.format(simulation.unitPrice)}</strong>
        <div class="simulated-facts">
          <div><span>${simulation.isRefund?"Débours initial":"Coût avant réduction"}</span><b>${money.format(simulation.upfront)}</b></div>
          <div><span>Économie potentielle</span><b>${money.format(simulation.saving)}</b></div>
          <div><span>${simulation.isRefund?"Coût après remboursement éventuel":"Coût après remise théorique"}</span><b>${money.format(simulation.netCost)}</b></div>
        </div>
        <p>${simulation.realizedPercent.toLocaleString("fr-FR",{maximumFractionDigits:2})} % effectifs au prix saisi. ${escapeHtml(simulation.reason)} Référence exacte et conditions à confirmer.</p>
      </div>`
    : simulation
      ? `<div class="simulated-offer not-eligible"><p>Simulation non applicable : ${escapeHtml(simulation.reason)}</p></div>`
      : "";
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
  const refundConditionsBadge=offer.requiresUnlock
    ? '<span class="badge warn">Déblocage préalable obligatoire</span>' : "";
  const capBadge=Number.isFinite(offer.savingCapAmount)
    ? `<span class="badge warn">Plafond de remboursement : ${money.format(offer.savingCapAmount)}</span>`
    : "";
  const fullRefundBadge=offer.scope==="produit"
    && offer.mechanism==="manufacturer_refund" && pct===100
    ? '<span class="badge warn">100 % annoncés · éligibilité à vérifier</span>' : "";
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
        ${refundConditionsBadge}
        ${capBadge}
        ${fullRefundBadge}
        ${loyaltyBadge}
        ${deadlineBadge}
      </div>
      <div class="meta">
        <div><span>Économie en €</span>${amount===null?"Dépend du prix":money.format(amount)}</div>
        <div><span>Vérifié</span>${formatDate(offer.verifiedAt)}</div>
      </div>
      ${simulated}
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
  const order={error:0,stale:1,"sync-warning":2,"review-soon":3,ok:4};
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
          "sync-warning":"Source non actualisée",
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
              ${item.validityStatus==="review-soon" && item.status==="sync-warning"
                ? '<span class="badge warn">Révision imminente</span>' : ""}
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
            ${["unavailable","partial"].includes(item.syncState?.status)?`<p class="sync-warning">
              Dernière tentative : ${escapeHtml(formatDateTime(item.syncState.checkedAt))}.
              ${Number.isInteger(item.syncState.confirmedCount) && Number.isInteger(item.syncState.previousSnapshotCount)
                ? `Offres reconfirmées : <strong>${item.syncState.confirmedCount}/${item.syncState.previousSnapshotCount}</strong>.` : ""}
              La source n'a pas actualisé toutes ses offres.
              ${item.validityStatus==="review-soon" && item.nextDeadline
                ? `Révision exigée au plus tard le <strong>${formatDate(item.nextDeadline)}</strong>.` : ""}
              Les anciennes offres expirent normalement et ne sont pas garanties.
              ${escapeHtml(item.syncState.reason)}
            </p>`:""}
          </article>`;
      }).join("")}
    </div>`;
}

function renderProvider(provider){
  const priority=provider.priority==="essentiel"?"Essentiel":provider.priority==="fort"?"Très utile":"Complément";
  const tags=[
    ...(provider.discoveryStatus==="unconfirmed" ? ['Activité récente non confirmée'] : []),
    ...(provider.potentialFree ? ['Gratuit selon éligibilité'] : []),
    ...(Number.isFinite(provider.advertisedMaxPercent)
      ? ['Jusqu’à '+provider.advertisedMaxPercent+' % annoncés, non garantis'] : []),
    ...provider.kinds
  ];
  const target=provider.targetLabel || (provider.stores?.includes("all")
    ? "Plusieurs enseignes (conditions à vérifier)"
    : (provider.stores || []).map((store)=>store==="leclerc"?"E.Leclerc":"Carrefour").join(" / "));
  return `
    <article class="card provider-card">
      <div class="card-head"><div><h3>${escapeHtml(provider.name)}</h3><div class="source">${priority}</div></div></div>
      <div class="source">Où : ${escapeHtml(target || "Service indépendant")}</div>
      <div class="badges">${tags.map((kind)=>`<span class="badge">${escapeHtml(kind)}</span>`).join("")}</div>
      <p>${escapeHtml(provider.note)}</p>
      <div class="actions">
        <span class="source">${provider.discoveryStatus==="unconfirmed"
          ? "Service identifié, offres actuelles non vérifiées"
          : provider.discoveryVerifiedAt
            ? "Page du service consultée le "+escapeHtml(formatDate(provider.discoveryVerifiedAt))
            : "Conditions à confirmer chez le fournisseur"}</span>
        <a class="open" href="${escapeHtml(provider.url)}" target="_blank" rel="noopener noreferrer">Ouvrir</a>
        ${provider.verificationUrl && provider.verificationUrl!==provider.url
          ? `<a class="open" href="${escapeHtml(provider.verificationUrl)}" target="_blank" rel="noopener noreferrer">Justificatif</a>`
          : ""}
      </div>
    </article>`;
}

async function lookupBarcode(rawValue){
  let code;
  try{
    code=normalizeBarcode(rawValue);
  }catch(error){
    invalidateExactSkuComparison();
    els.compareExactSku.disabled=true;
    setProductStatus(error.message,true);
    return;
  }
  state.productCode=code;
  els.barcode.value=code;
  const token=++state.lookupToken;
  ++state.skuCompareToken;
  els.exactSkuComparison.innerHTML="";
  els.compareExactSku.disabled=true;
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
  els.compareExactSku.disabled=!canonicalGtin(code);

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
    renderPrices(state.priceObservations,pricesResult.value.sourceUrl,pricesResult.value);
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
    renderPrices(state.priceObservations,result.sourceUrl,result);
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

function invalidateExactSkuComparison(){
  skuComparisonController?.abort();
  skuComparisonController=null;
  ++state.skuCompareToken;
  els.exactSkuComparison.innerHTML="";
  els.compareExactSku.disabled=!canonicalGtin(state.productCode);
}

async function compareCurrentExactSku({deep=false}={}){
  const code=state.productCode;
  const rawQuantity=els.exactSkuQuantity.value.trim();
  const quantity=/^\d+$/.test(rawQuantity)?Number(rawQuantity):NaN;
  if(!Number.isInteger(quantity) || quantity<1 || quantity>100){
    invalidateExactSkuComparison();
    els.exactSkuComparison.innerHTML=
      '<div class="panel price-source" role="alert">Indiquer une quantité entière de 1 à 100 articles avant la comparaison.</div>';
    return;
  }
  if(!canonicalGtin(code)){
    els.exactSkuComparison.innerHTML=
      '<div class="panel price-source">Un code-barres EAN/GTIN valide est requis pour comparer deux enseignes.</div>';
    return;
  }
  const token=++state.skuCompareToken;
  skuComparisonController?.abort();
  skuComparisonController=null;
  const lookupToken=state.lookupToken;
  const channel=state.channel;
  // A checkout/shelf observation cannot quote a Drive or delivery price.
  // Do not consume two Open Prices requests to compute an unavailable price.
  if(channel!=="store"){
    const normalizedProduct={...(state.product||{}),code};
    const candidates=resolveOffersForLoyalty(activeOffers(),state.loyaltyProfile);
    const comparison=compareExactSku(normalizedProduct,candidates,{
      carrefour:[],leclerc:[]
    },{
      channel,quantity,now:new Date(),
      coverageByStore:{carrefour:{skipped:true},leclerc:{skipped:true}}
    });
    els.exactSkuComparison.innerHTML=renderExactSkuComparison(comparison);
    return;
  }
  els.compareExactSku.disabled=true;
  els.exactSkuComparison.innerHTML=
    `<div class="panel price-source" role="status">${deep
      ? "Recherche approfondie des relevés Carrefour et E.Leclerc (jusqu’à 3 pages par requête)…"
      : "Comparaison des relevés Carrefour et E.Leclerc pour ce même EAN…"
    }</div>`;
  const options=priceQueryOptions();
  const stores=["carrefour","leclerc"];
  const controller=new AbortController();
  skuComparisonController=controller;
  // Network stalls are especially disruptive on mobile data connections.
  // A bounded request also ensures that the compare button is re-enabled.
  const timeout=setTimeout(()=>controller.abort(),EXACT_SKU_TIMEOUT_MS);
  let fetched;
  try{
    fetched=await Promise.allSettled(stores.map((store)=>
      fetchPricesByBarcode(code,{...options,store,
        signal:controller.signal,
        ...(deep ? {maxPages:3,minimumMatches:20} : {})})
    ));
  }finally{
    clearTimeout(timeout);
    if(skuComparisonController===controller) skuComparisonController=null;
  }
  // An old scan, changed channel or a newer comparison must never replace
  // the currently displayed product with a different SKU.
  if(token!==state.skuCompareToken || lookupToken!==state.lookupToken
    || code!==state.productCode || channel!==state.channel) return;
  els.compareExactSku.disabled=false;
  const observations={};
  const coverageByStore={};
  const errors=new Set();
  for(let i=0;i<stores.length;i++){
    const entry=fetched[i];
    if(entry.status==="fulfilled"){
      observations[stores[i]]=entry.value.observations;
      coverageByStore[stores[i]]={
        partial:entry.value.partial,
        moreAvailable:entry.value.moreAvailable,
        pagesFetched:entry.value.pagesFetched
      };
    }else{
      observations[stores[i]]=[];
      errors.add(stores[i]);
    }
  }
  if(errors.size===2){
    els.exactSkuComparison.innerHTML=controller.signal.aborted
      ? '<div class="panel price-source" role="alert">La recherche de prix a dépassé 18 secondes. Réessayer lorsque la connexion est stable ; aucun prix n’a été inventé.</div>'
      : '<div class="panel price-source">Open Prices est indisponible pour les deux enseignes. Aucun prix n’a été inventé.</div>';
    return;
  }
  const normalizedProduct={...(state.product||{}),code};
  const candidates=resolveOffersForLoyalty(activeOffers(),state.loyaltyProfile);
  const comparison=compareExactSku(normalizedProduct,candidates,observations,{
    channel,quantity,now:new Date(),coverageByStore
  });
  els.exactSkuComparison.innerHTML=renderExactSkuComparison(comparison,errors,{deep});
}

function renderExactSkuComparison(result,errors=new Set(),{deep=false}={}){
  if(result.status!=="ok"){
    return '<div class="panel price-source">Impossible de comparer : code GTIN ou quantité invalide.</div>';
  }
  const quantityLabel=result.quantity===1?"1 article":result.quantity+" articles";
  const storeCards=result.stores.map((row)=>{
    const unresolved=errors.has(row.store);
    const observed=row.observation;
    const priceMarkup=unresolved
      ? '<strong>Source temporairement indisponible</strong>'
      : observed
        ? `<strong>${money.format(row.price)}</strong><small>Relevé du ${escapeHtml(formatDate(observed.date))} · ${escapeHtml(observed.storeName)}${observed.city?" · "+escapeHtml(observed.city):""}</small>`
        : '<strong>Prix récent non disponible</strong>';
    const coverage=row.coverage||{};
    const coverageLabel=unresolved
      ? "Couverture inconnue : service de prix indisponible"
      : coverage.status==="not-queried"
        ? "Prix physiques non interrogés : canal Drive/livraison"
        : coverage.status==="no-observation"
        ? "Aucun relevé trouvé pour cet EAN dans les pages consultées"
        : coverage.status==="invalid-observations"
          ? "Relevés consultés mais non exploitables"
          : coverage.status==="stale-observations"
            ? "Relevés consultés uniquement anciens (plus de 30 jours)"
            : coverage.status==="recent-but-not-comparable"
              ? "Relevés des 30 derniers jours, aucun des 7 derniers jours"
              : "Au moins un relevé des 7 derniers jours";
    const limitedCoverage=unresolved ? ""
      : coverage.lookupInterrupted
        ? " · Recherche partiellement interrompue : d'autres relevés peuvent manquer"
        : coverage.moreAvailable
          ? " · Recherche limitée aux premières pages : d'autres relevés peuvent exister"
          : "";
    const coverageMarkup=`<p class="help exact-sku-coverage">
      <strong>Couverture des données :</strong> ${escapeHtml(coverageLabel)}
      ${!unresolved && coverage.valid ? ` · ${coverage.valid} relevé(s) exploitable(s) dans les pages consultées` : ""}
      ${!unresolved && coverage.latestDate
        ? ` · Dernier relevé consulté : ${escapeHtml(formatDate(coverage.latestDate))}` : ""}
      ${escapeHtml(limitedCoverage)}
      <span>Ces données sont limitées à la recherche effectuée. Une absence de relevé ne signifie pas que le produit est absent du magasin.</span>
    </p>`;
    const offers=row.exactOffers.slice(0,6).map((offer)=>{
      const amount=offer.saving!==null
        ? `Économie éventuelle : ${money.format(offer.saving)} sur ${quantityLabel}`
        : offer.status==="already-discounted"
          ? "Relevé déjà remisé : aucun second gain déduit"
          : offer.status==="retailer-price-required"
            ? "Prix magasin ou canal à confirmer : gain non calculé"
            : offer.status==="quantity-required"
              ? `Quantité minimale : ${offer.minQuantity} article(s)`
              : "Économie non calculable sans prix récent";
      return `<li class="exact-sku-offer">
        <div>
          <strong>${escapeHtml(offer.title)}</strong>
          <small>${escapeHtml(offer.provider)} · ${offer.retailerProof?"GTIN lié à une fiche distributeur":"GTIN présent dans l’offre"}</small>
          <span>${escapeHtml(amount)}</span>
        </div>
        <a href="${escapeHtml(offer.sourceUrl)}" target="_blank" rel="noopener noreferrer">Conditions</a>
      </li>`;
    }).join("");
    const remaining=row.exactOffers.length>6
      ? `<p class="help">${row.exactOffers.length-6} autre(s) offre(s) à code exact disponibles dans le registre.</p>`
      : "";
    return `<article class="exact-sku-store">
      <h4>${storeLabel(row.store)}</h4>
      <div class="exact-sku-observation">${priceMarkup}</div>
      ${row.initialCost!==null
        ? `<p class="help exact-sku-initial-cost">Débours estimé avant remboursements pour ${escapeHtml(quantityLabel)} : <strong>${money.format(row.initialCost)}</strong> (prix communautaire indicatif).</p>`
        : ""}
      ${coverageMarkup}
      <p class="help">${escapeHtml(unresolved
        ? "Impossible de charger les relevés de cette enseigne."
        : row.note)}</p>
      <strong class="exact-sku-heading">${row.exactCount} offre(s) avec GTIN explicite</strong>
      ${offers ? `<ul class="exact-sku-offers">${offers}</ul>`
        : '<p class="help">Aucune promotion actuelle avec cet EAN exact dans le registre. Une correspondance de marque n’est pas suffisante.</p>'}
      ${remaining}
      ${row.possibleNetCost!==null
        ? `<p class="exact-sku-net">Coût hypothétique après la meilleure offre séparée sur ${escapeHtml(quantityLabel)} : <strong>${money.format(row.possibleNetCost)}</strong> · sous conditions, non garanti.</p>`
        : ""}
    </article>`;
  }).join("");
  const comparabilityReasons={
    "missing-price":"Comparaison impossible : il manque un prix récent dans au moins une des deux enseignes.",
    "invalid-date":"Comparaison impossible : la date d'un relevé n'est pas exploitable.",
    "observations-old":"Comparaison non concluante : les deux relevés ne datent pas tous de moins de 7 jours.",
    "dates-too-far":"Comparaison non concluante : les dates des deux relevés sont espacées de plus de 3 jours.",
    "too-far":"Comparaison non concluante : les deux magasins observés sont éloignés de plus de 15 km.",
    "location-unverified":"Comparaison non concluante : localisation des magasins insuffisante (coordonnées ou même commune et code postal)."
  };
  const incomplete=result.stores.some((row)=>row.coverage?.searchIncomplete===true)
    || errors.size>0;
  const coverageActions=!deep && incomplete
    ? `<div class="exact-sku-deep-search">
        <button type="button" class="secondary" data-action="expand-exact-sku">
          Approfondir la recherche (jusqu’à 3 pages par enseigne)
        </button>
        <p class="help">Recherche volontaire, limitée à 3 pages et à 20 relevés par enseigne. Aucun tarif ou stock en temps réel garanti.</p>
      </div>`
    : deep
      ? `<p class="help exact-sku-search-depth">Recherche approfondie terminée : jusqu’à 3 pages consultées par enseigne.${incomplete
        ? " Couverture toujours partielle ou service indisponible : aucun résultat exhaustif garanti."
        : " Les relevés restent communautaires et non contractuels."}</p>`
      : "";
  const confidence=result.comparisonEvidence || {};
  const difference=result.observedPriceDifference;
  const paired=result.comparisonPair;
  const best=result.channel!=="store"
    ? "Aucun tarif Drive ou livraison ne peut être déduit de relevés physiques. Les offres compatibles avec ce canal restent consultables."
    : confidence.comparable && result.lowerObservedStore
    ? `${incomplete ? "Parmi les relevés consultés, relevé inférieur" : "Relevé inférieur"} sur la paire comparable : ${storeLabel(result.lowerObservedStore)} (écart observé ${money.format(difference)} par unité). Il ne s'agit pas d'un prix actuel confirmé.`
    : confidence.comparable && difference===0
      ? "Les deux relevés comparables indiquent le même prix ; aucune enseigne n'est moins chère."
      : comparabilityReasons[confidence.status]
        || "Aucune comparaison de prix fiable possible avec les relevés disponibles.";
  const pairedDetails=paired ? `<p>Relevés retenus pour la comparaison locale :
      Carrefour ${money.format(Number(paired.carrefour.price))} (${escapeHtml(formatDate(paired.carrefour.date))}, ${escapeHtml(paired.carrefour.storeName || "magasin non précisé")})
      · E.Leclerc ${money.format(Number(paired.leclerc.price))} (${escapeHtml(formatDate(paired.leclerc.date))}, ${escapeHtml(paired.leclerc.storeName || "magasin non précisé")}).
      Les cartes ci-dessous montrent séparément le dernier prix observé de chaque enseigne : il peut être issu d'un autre magasin.</p>` : "";
  return `<div class="exact-sku-header">
    <h3>Même produit, deux enseignes</h3>
    <p>Identité GTIN ${escapeHtml(result.gtin)} · Quantité : ${escapeHtml(quantityLabel)} · ${escapeHtml(best)}</p>
    ${pairedDetails}
    <p>Comparaison seulement si les relevés sont récents (7 jours maximum), espacés de 3 jours au plus, et géographiquement proches : coordonnées à 15 km maximum, ou à défaut même commune et même code postal. Prix Open Prices communautaires : disponibilité, remise et cumul non garantis.</p>
  </div>
  ${coverageActions}
  <div class="exact-sku-grid">${storeCards}</div>`;
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
  const resolvedOffers=resolveOffersForLoyalty(activeOffers(),state.loyaltyProfile);
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
      : `Potentiel ≈ ${money.format(potential)} sur le dernier prix observé`;
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
        ${!match.exact && offer.eanSuggestion?.code===product.code
          ? `<p class="match-note">Ce GTIN apparaît comme candidat dans Open Food Facts, mais E.Leclerc n'a pas confirmé son éligibilité à cette promotion. <a href="${escapeHtml(offer.eanSuggestion.sourceUrl)}" target="_blank" rel="noopener noreferrer">Examiner la fiche candidate</a>.</p>`
          : ""}
        ${evidenceHtml}
        <div class="actions">
          <span class="verified">${escapeHtml(match.reason)}</span>
          ${match.exact && offer.eanEvidenceUrl
            ? `<a class="open" href="${escapeHtml(offer.eanEvidenceUrl)}" target="_blank" rel="noopener noreferrer">Preuve EAN</a>`
            : ""}
          <a class="open" href="${escapeHtml(offer.sourceUrl)}" target="_blank" rel="noopener noreferrer">Conditions de l’offre</a>
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
    invalidateExactSkuComparison();
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
    invalidateExactSkuComparison();
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

function renderPrices(observations,sourceUrl,metadata={}){
  const fetchedPages=Math.max(1,Number(metadata.pagesFetched)||1);
  const coverageNote=metadata.partial
    ? '<div class="panel price-source">Recherche partielle : une page Open Prices supplémentaire est indisponible. Les prix affichés sont indicatifs et peuvent ne pas couvrir tous les magasins.</div>'
    : fetchedPages>1
      ? `<div class="panel price-source">${fetchedPages} pages Open Prices consultées pour rechercher davantage de relevés.</div>`
      : "";
  if(!observations.length){
    els.priceResults.innerHTML=`
      <div class="panel price-source">
        Aucun prix Open Prices trouvé pour ce code-barres chez ${storeLabel(state.store)}${state.nearbyEnabled?` dans un rayon de ${state.radiusKm} km`:""}.
        Cela ne signifie pas que le produit n'y est pas vendu : la base est communautaire et encore incomplète.
      </div>${coverageNote}`;
    return;
  }
  const best=selectBestRecentPrice(observations);
  const bestSummary=best
    ? `<div class="panel price-source"><strong>Dernier prix observé : ${money.format(best.price)}</strong> · ${escapeHtml(best.storeName)}${best.city?` · ${escapeHtml(best.city)}`:""}${Number.isFinite(best.distanceKm)?` · ${best.distanceKm.toLocaleString("fr-FR")} km`:""}<div class="price-age-note">Observation du ${formatDate(best.date)} ; prix indicatif, à vérifier avant achat.</div></div>`
    : '<div class="panel price-source">Aucune observation datée utilisable pour estimer ce prix.</div>';

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
    ${coverageNote}
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
  const basketOffers=resolveOffersForLoyalty(activeOffers(),state.loyaltyProfile)
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



function loadStoredManualPrices(){
  try{
    return validateManualPrices(
      JSON.parse(localStorage.getItem("promo-manual-prices-v1") || "[]")
    );
  }catch{
    return [];
  }
}

function renderManualPriceControls(){
  const previous=els.manualPriceProduct.value;
  const options=state.shoppingList.map((item)=>
    '<option value="'+escapeHtml(String(item.product.code))+'">'
    +escapeHtml(item.product.name || "Produit")+" · "
    +escapeHtml(String(item.product.code))+"</option>"
  );
  els.manualPriceProduct.innerHTML=options.join("");
  if(state.shoppingList.some((item)=>String(item.product.code)===previous)){
    els.manualPriceProduct.value=previous;
  }
  els.manualPriceSubmit.disabled=state.shoppingList.length===0;

  els.manualPriceEntries.innerHTML=state.manualPrices.length
    ? state.manualPrices.slice().reverse().map((entry)=>{
      const label=entry.store==="carrefour"?"Carrefour":"E.Leclerc";
      return '<article class="manual-price-entry">'
        +'<div class="manual-price-entry-main"><strong>'
        +escapeHtml(label+" · "+entry.storeName)
        +'</strong><span>'
        +escapeHtml(entry.code+" · "+entry.postcode+" · "+entry.date)
        +" · "+money.format(entry.price)+" / unité"
        +'</span><span>Relevé personnel · non vérifié · 30 jours maximum</span></div>'
        +'<button class="secondary danger-action" type="button" data-remove-manual-price="'
        +escapeHtml(entry.id)+'" aria-label="Supprimer ce relevé">Supprimer</button></article>';
    }).join("")
    : '<p class="help">Aucun relevé manuel enregistré sur cet appareil.</p>';
}

function handleManualPriceSubmit(event){
  event.preventDefault();
  try{
    const code=els.manualPriceProduct.value;
    if(!state.shoppingList.some((item)=>String(item.product.code)===code)){
      throw new Error("Ajoute d’abord le produit à la liste.");
    }
    const next=saveManualPrice(state.manualPrices,{
      code,
      store:els.manualPriceStore.value,
      price:els.manualPriceAmount.value,
      storeName:els.manualPriceStoreName.value,
      postcode:els.manualPricePostcode.value,
      date:els.manualPriceDate.value
    });
    localStorage.setItem("promo-manual-prices-v1",JSON.stringify(next));
    state.manualPrices=next;
    els.manualPriceStatus.textContent="Prix personnel enregistré. Il reste indicatif et n'active aucun cumul automatique.";
    els.manualPriceAmount.value="";
    renderShoppingList();
  }catch(error){
    els.manualPriceStatus.textContent=error.message || "Enregistrement impossible.";
  }
}

function handleManualPriceEntryAction(event){
  const button=event.target.closest("[data-remove-manual-price]");
  if(!button) return;
  try{
    const next=removeManualPrice(state.manualPrices,button.dataset.removeManualPrice);
    localStorage.setItem("promo-manual-prices-v1",JSON.stringify(next));
    state.manualPrices=next;
    els.manualPriceStatus.textContent="Relevé manuel supprimé.";
    renderShoppingList();
  }catch(error){
    els.manualPriceStatus.textContent=error.message || "Suppression impossible.";
  }
}

function downloadShoppingListBackup(){
  try{
    const data=serializeShoppingList(state.shoppingList,state.shoppingBudget);
    const blob=new Blob([data],{type:"application/json;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement("a");
    const today=new Date(Date.now()-new Date().getTimezoneOffset()*60000)
      .toISOString().slice(0,10);
    anchor.href=url;
    anchor.download="promo-alimentaire-liste-"+today+".json";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),5000);
    setListStatus("Sauvegarde créée : "+state.shoppingList.length+" produit(s), avec le budget. Aucun prix ou emplacement exporté.");
  }catch(error){
    setListStatus("Sauvegarde impossible : "+(error.message || "erreur inconnue"),true);
  }
}

async function restoreShoppingListBackup(){
  const file=els.importListFile.files?.[0];
  els.importListFile.value="";
  if(!file) return;
  if(file.size>MAX_BACKUP_BYTES){
    setListStatus("Fichier trop volumineux : maximum 100 Ko.",true);
    return;
  }
  try{
    const {items,budget}=parseShoppingListBackup(await file.text());
    if(state.basketRefreshing){
      setListStatus("Attends la fin de l'actualisation avant de restaurer.",true);
      return;
    }
    if(!window.confirm("Remplacer la liste actuelle et son budget par "+items.length+" produit(s) de la sauvegarde ?")){
      setListStatus("Restauration annulée.");
      return;
    }
    const previousList=localStorage.getItem("promo-shopping-list-v1");
    const previousBudget=localStorage.getItem("promo-shopping-budget-v1");
    try{
      localStorage.setItem("promo-shopping-list-v1",JSON.stringify(items));
      if(budget===null){
        localStorage.removeItem("promo-shopping-budget-v1");
      }else{
        localStorage.setItem("promo-shopping-budget-v1",String(budget));
      }
    }catch{
      try{
        if(previousList===null) localStorage.removeItem("promo-shopping-list-v1");
        else localStorage.setItem("promo-shopping-list-v1",previousList);
        if(previousBudget===null) localStorage.removeItem("promo-shopping-budget-v1");
        else localStorage.setItem("promo-shopping-budget-v1",previousBudget);
      }catch{}
      throw new Error("Impossible d'enregistrer la sauvegarde sur cet appareil.");
    }
    state.shoppingList=items;
    state.shoppingBudget=budget;
    els.shoppingBudget.value=budget===null?"":budget.toFixed(2).replace(".",",");
    state.basketPriceData={carrefour:{},leclerc:{}};
    state.basketPriceCoverageIncomplete=false;
    renderShoppingList();
    setListStatus("Liste restaurée : "+items.length+" produit(s). Actualise les prix pour recalculer le panier.");
  }catch(error){
    setListStatus("Restauration impossible : "+(error.message || "fichier invalide"),true);
  }
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
    if(state.shoppingList.length>=30){
      setProductStatus("La liste est limitée à 30 produits distincts. Retire un produit avant d'en ajouter.",true);
      return;
    }
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

function loadShoppingBudget(){
  try{
    return parseShoppingBudget(localStorage.getItem("promo-shopping-budget-v1"));
  }catch{
    return null;
  }
}

function renderBudgetSummary(scenarios=[]){
  if(!els.budgetSummary) return;
  const raw=els.shoppingBudget.value.trim();
  if(!raw){
    els.budgetSummary.innerHTML='<p class="help">Aucun budget défini : indique un plafond pour voir les dépenses estimées par enseigne.</p>';
    return;
  }
  if(state.shoppingBudget===null){
    els.budgetSummary.innerHTML='<p class="budget-alert">Entre un montant valide compris entre 0,01 € et 10 000 € (deux décimales maximum).</p>';
    return;
  }
  if(!state.shoppingList.length){
    els.budgetSummary.innerHTML='<p class="help">Budget enregistré sur cet appareil. Ajoute au moins un produit à ta liste pour voir une estimation.</p>';
    return;
  }

  const evaluation=evaluateShoppingBudget(scenarios,{
    budget:state.shoppingBudget,
    channel:state.channel,
    nearbyEnabled:state.nearbyEnabled,
    coverageIncomplete:state.basketPriceCoverageIncomplete
  });
  const labels={
    within:"Sous ton plafond estimé",
    over:"Plafond estimé dépassé",
    "partial-over":"Déjà au-dessus du plafond",
    "partial-unknown":"Montant partiel : résultat inconnu",
    "indicative-within":"Sous le plafond sur les données disponibles",
    "indicative-over":"Plafond dépassé sur les données disponibles",
    unavailable:"Prix indisponibles"
  };
  const items=evaluation.results.map((result)=>{
    const danger=["over","partial-over","indicative-over"].includes(result.status);
    const incomplete=["partial-over","partial-unknown","unavailable"].includes(result.status);
    const complete=result.checkoutCost!==null;
    const difference=result.difference;
    const gap=complete
      ? difference<0
        ? `Dépassement : ${money.format(Math.abs(difference))}`
        : incomplete
          ? `Marge provisoire : ${money.format(difference)}`
          : `Reste estimé : ${money.format(difference)}`
      : "Aucun montant estimable";
    const warnings=result.reasons?.length
      ? `<p class="budget-warnings">${result.reasons.map(escapeHtml).join(" · ")}</p>`
      : '<p class="budget-warnings">Prix observés : le ticket final reste prioritaire.</p>';
    return `<div class="budget-card ${danger?"over":incomplete?"partial":"within"}">
      <div class="budget-card-header">
        <strong>${storeLabel(result.store)}</strong>
        <span class="budget-state">${escapeHtml(labels[result.status] || result.status)}</span>
      </div>
      <div class="budget-card-values">
        <span>${complete?money.format(result.checkoutCost):"—"} <small>caisse estimée</small></span>
        <strong>${escapeHtml(gap)}</strong>
      </div>
      ${warnings}
    </div>`;
  }).join("");
  els.budgetSummary.innerHTML=`
    <p class="budget-context">Plafond personnel : <strong>${money.format(evaluation.budget)}</strong>. Les valeurs restent des estimations : la disponibilité et les prix peuvent changer.</p>
    <div class="budget-cards">${items}</div>
  `;
}

function renderShoppingList(){
  renderListCount();
  renderManualPriceControls();
  if(!state.shoppingList.length){
    renderBudgetSummary([]);
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
  renderBudgetSummary(scenarios);
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
  let partialRequests=0;

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
        if(carrefour.value.partial) partialRequests+=1;
        recordProductObservation(item.product,"carrefour",carrefour.value.observations);
      }else { next.carrefour[item.product.code]=[]; failures+=1; }
      if(leclerc.status==="fulfilled"){
        next.leclerc[item.product.code]=leclerc.value.observations;
        if(leclerc.value.partial) partialRequests+=1;
        recordProductObservation(item.product,"leclerc",leclerc.value.observations);
      }else { next.leclerc[item.product.code]=[]; failures+=1; }
    }
    state.basketPriceData=next;
    state.basketPriceCoverageIncomplete=partialRequests>0;
    const scenarios=evaluateCurrentBasketScenarios();
    recordComparisonHistory(scenarios);
    renderShoppingList();
    const locality=state.nearbyEnabled ? ` dans un rayon de ${state.radiusKm} km` : " sans filtre géographique";
    setListStatus(
      failures || partialRequests
        ? `Actualisation indicative : ${failures} requête(s) indisponible(s), ${partialRequests} recherche(s) paginée(s) partielles${locality}.`
        : `Prix actualisés pour Carrefour et E.Leclerc${locality}.`,
      failures>0 || partialRequests>0
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
  state.basketPriceCoverageIncomplete=false;
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
    const priceByCode=state.channel==="store"
      ? mergeManualPriceObservations(state.basketPriceData[store],state.manualPrices,{store})
      : state.basketPriceData[store];
    const locationScenarios=evaluateBasketLocations(state.shoppingList,{
      store,
      channel:state.channel,
      priceByCode,
      offers:activeOffers(),
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
          priceByCode,
          offers:activeOffers(),
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
      priceChannelReliable:state.channel==="store" && !state.basketPriceCoverageIncomplete && scenario.manualPriceCount===0
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

  const offer=activeOffers().find((entry)=>entry.id===offerId);
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
  invalidateExactSkuComparison();
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
  if(!product?.code) return;
  state.productPriceHistory=addStorePriceObservations(state.productPriceHistory,{
    product,store,observations,recordedAt:new Date()
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
    : '<div class="history-trend">Tendance indisponible : compare le même panier, dans le même magasin physique et le même rayon de proximité. Les anciens historiques sans preuve de magasin ne sont pas comparés.</div>';

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
  }else if(state.basketPriceCoverageIncomplete){
    recommendation='<div class="basket-recommendation"><strong>Recherche Open Prices incomplète.</strong> Une page supplémentaire n’a pas pu être récupérée ; les résultats restent indicatifs et aucun magasin gagnant n’est annoncé.</div>';
  }else if(!state.nearbyEnabled){
    recommendation='<div class="basket-recommendation"><strong>Comparaison locale non activée.</strong> Active « Autour de moi » puis actualise pour comparer des magasins dans le même secteur.</div>';
  }else if(scenarios.some((scenario)=>scenario.manualPriceCount>0)){
    recommendation='<div class="basket-recommendation"><strong>Relevé personnel.</strong> Les prix ajoutés par toi servent à estimer un budget ; ils ne constituent pas une preuve commerciale ni un classement fiable des enseignes.</div>';
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
  const totalLabel=scenario.manualPriceCount>0
    ? "Budget indicatif"
    : scenario.priceChannelReliable===false
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
    const priceAge=priceFreshness(line.bestPrice);
    const priceObservationNote=`<div class="price-age-note ${priceAge.ageDays!==null && priceAge.ageDays>30?"outdated":""}">
      Relevé du ${formatDate(line.bestPrice?.date)} · ${priceAge.ageDays===null?"âge inconnu":priceAge.ageDays+" jour(s)"}
      ${priceAge.ageDays!==null && priceAge.ageDays>30?" · Ancien prix : reconfirmer avant achat":""}
    </div>`;
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
      ${line.manualPrice?'<div class="source"><strong>Prix saisi personnellement — non vérifié.</strong> Aucun cumul automatique sur cette référence.</div>':""}
      ${priceObservationNote}
      ${line.alreadyRetailDiscounted?'<div class="source">Prix observé déjà remisé en magasin : promotion enseigne non déduite une seconde fois.</div>':""}
      ${line.retailerPromoPriceConflict?'<div class="source">Prix observé différent du tarif normal annoncé : promotion catalogue non redéduite sans nouvelle vérification.</div>':""}
      ${line.retailerPromoAgeWarning?'<div class="source">Le dernier prix normal a plus de 7 jours : promotion catalogue conservée comme candidate, non déduite automatiquement.</div>':""}
      ${line.incompatibleCouponCount?'<div class="source">Coupon Network : remboursement non cumulable avec une remise magasin déjà incluse dans ce prix. Vérifier les conditions sur le site officiel.</div>':""}
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
      <div class="lever potential"><span>Offres produits · gain additionnel</span><strong>jusqu’à ${money.format(breakdown.productPotentialExtra||0)}</strong></div>
      <div class="lever potential"><span>Bundles · gain additionnel</span><strong>jusqu’à ${money.format(breakdown.bundlePotentialExtra||0)}</strong></div>
      <div class="lever potential"><span>Cashback panier candidat</span><strong>jusqu’à ${money.format(breakdown.basketPotential||0)}</strong></div>
    </div>`;
  const potential=scenario.potentialProductSaving>0
    ? `<p class="help">Offres produits candidates : économie brute maximale ${money.format(scenario.potentialProductSaving)} ; gain restant après remises déjà retenues jusqu’à ${money.format(scenario.potentialAdditionalProductSaving||0)}. Les références et les cumuls doivent être confirmés.</p>`
    : "";
  const bundlePotential=scenario.potentialBundleSaving>0
    ? `<p class="help"><strong>Offre multi-produits potentielle :</strong> ${money.format(scenario.potentialBundleSaving)} brut, jusqu’à ${money.format(scenario.potentialAdditionalBundleSaving||0)} de gain supplémentaire après remises produit déjà retenues. Références, achat simultané et cumul à vérifier.</p>`
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
  const verificationQueue=buildVerificationQueue(scenario,{
    loyaltyProfile:state.loyaltyProfile,
    limit:4
  });
  const verificationHtml=renderBasketVerificationQueue(verificationQueue);
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
          ${scenario.manualPriceCount>0?'<span class="badge warn">Relevé personnel non vérifié</span>':""}
          ${scenario.priceChannelReliable===false
            ? `<span class="badge warn">${state.channel==="store"?"recherche de prix partielle":"prix magasin indicatif pour ce canal"}</span>`
            : ""}
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
        <div><span>Remboursement différé</span><strong>+${money.format(scenario.deferredRefund||0)}</strong></div>
        <div><span>Économie validée totale</span><strong>−${money.format(scenario.guaranteedSaving)}</strong></div>
        <div><span>${totalLabel}</span><strong>${money.format(scenario.finalCost)}</strong></div>
      </div>
      ${scenario.deferredRefund>0?'<p class="help">Le remboursement différé est pris en compte dans le coût économique, pas dans le montant payé en caisse. Vérifie les justificatifs et délais de demande.</p>':""}
      ${levers}
      <div class="scenario-lines">${lines}</div>
      <p class="help">${basketRoute}</p>
      ${potential}
      ${bundlePotential}
      ${basketPotential}
      ${prudentBestCase}
      ${verificationHtml}
      ${actionPlanHtml}
    </article>`;
}

function renderBasketVerificationQueue(queue){
  if(!queue?.items?.length) return "";
  return `
    <section class="verification-queue">
      <div class="product-offers-head">
        <h3>Vérifications prioritaires</h3>
        <p>${queue.totalCount} offre(s) candidates à examiner, classées par gain additionnel potentiel. Les gains ne sont pas additionnés au panier garanti.</p>
      </div>
      <ol class="verification-items">
        ${queue.items.map((task)=>`
          <li class="verification-item">
            <div>
              <strong>${escapeHtml(task.name)}</strong>
              <span>${escapeHtml(task.provider)} · ${escapeHtml(task.title)}</span>
              <div class="verification-blockers">
                ${task.blockers.length
                  ? task.blockers.map((blocker)=>`<span>${escapeHtml(blocker)}</span>`).join("")
                  : '<span>Vérifier les conditions de cumul avant achat</span>'}
              </div>
              ${task.sourceUrl?`<a href="${escapeHtml(task.sourceUrl)}" target="_blank" rel="noopener noreferrer">Vérifier l’offre à la source</a>`:""}
            </div>
            <div class="verification-value">
              <strong>+${money.format(task.additionalSaving)}</strong>
              <small>potentiel, non garanti</small>
            </div>
          </li>`).join("")}
      </ol>
    </section>`;
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
