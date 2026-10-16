import { DATASET_DATE, offers as baseOffers, providers } from "./data.js";
import {SOURCE_SCOPES,filterDiscoveryProviders} from "./source-discovery.js";
import {
  selectDailyCatalogue,selectFoodRefundOpportunities,selectSavedFoodRefunds,
  normalizeSavedFoodRefundIds,formatSavedFoodRefundChecklist,dailyCampaignRefreshNotice,
  selectAlternativeCatalogues
} from "./daily-catalogue.js";
import {fetchObservedDiscounts,selectObservedDiscounts,lookupPostalCodeCommunes} from "./community-deals.js";
import { computeSaving, effectivePercent, filterOffers, isOfferWithinShoppingScope, offerDeadline, rankOffers } from "./domain.js";
import {parseSimulatedUnitPrice,parseSimulatedQuantity,simulateProductOffer} from "./offer-simulator.js";
import { createSharedPriceFetch, fetchPricesByBarcode, fetchProductByBarcode, isFreshObservation, normalizeBarcode, priceFreshness, priceObservationPublicUrl, priceOutletMapUrl, selectBestRecentPrice } from "./open-data.js";
import { optimizeStack } from "./stacking.js";
import { effectiveOfferPercent, estimateOfferSaving, findProductOffers, rankMatchedOffers, canEstimateProductOffer, selectProductOfferPriceObservation } from "./matching.js";
import { loadImportedOffers, mergeOffers } from "./import-loader.js";
import { filterActiveOffers, parisCivilDay } from "./ingestion.js";
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
  historyProductKey,
  productHistory,
  productPriceTrend
} from "./product-history.js";

const money = new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"});
let offers=[...baseOffers];
const FOOD_REFUND_SAVED_KEY="promo-food-refund-saved-v1";
const savedFoodRefundIdsInitial=()=>{
  try{return normalizeSavedFoodRefundIds(localStorage.getItem(FOOD_REFUND_SAVED_KEY));}
  catch{return [];}
};
let savedFoodRefundIds=savedFoodRefundIdsInitial();
function activeOffers(){
  // Recheck deadlines at each interaction: long-running installed PWAs must
  // not continue counting an offer whose review date passed overnight.
  return filterActiveOffers(offers,new Date()).filter(isOfferWithinShoppingScope);
}
const els = {
  store:document.querySelector("#store"),
  channel:document.querySelector("#channel"),
  carrefourLoyalty:document.querySelector("#carrefourLoyalty"),
  leclercLoyalty:document.querySelector("#leclercLoyalty"),
  loyaltySummary:document.querySelector("#loyaltySummary"),
  sort:document.querySelector("#sort"),
  savingsFocus:document.querySelector("#savingsFocus"),
  sourceProof:document.querySelector("#sourceProof"),
  offerVerificationSummary:document.querySelector("#offerVerificationSummary"),
  simulatedPrice:document.querySelector("#simulatedPrice"),
  simulatedQuantity:document.querySelector("#simulatedQuantity"),
  simulatorSummary:document.querySelector("#simulatorSummary"),
  search:document.querySelector("#search"),
  offers:document.querySelector("#offers"),
  dailyStatus:document.querySelector("#dailyStatus"),
  dailyHighlights:document.querySelector("#dailyHighlights"),
  dailyPriceSpots:document.querySelector("#dailyPriceSpots"),
  dailySort:document.querySelector("#dailySort"),
  dailyMaxSpend:document.querySelector("#dailyMaxSpend"),
  dailyRetailer:document.querySelector("#dailyRetailer"),
  dailyUnconfirmed:document.querySelector("#dailyUnconfirmed"),
  dailyExtras:document.querySelector("#dailyExtras"),
  foodRefundSearch:document.querySelector("#foodRefundSearch"),
  foodRefundProvider:document.querySelector("#foodRefundProvider"),
  foodRefundSort:document.querySelector("#foodRefundSort"),
  foodRefundStatus:document.querySelector("#foodRefundStatus"),
  foodRefundDeals:document.querySelector("#foodRefundDeals"),
  foodRefundMore:document.querySelector("#foodRefundMore"),
  foodRefundSavedStatus:document.querySelector("#foodRefundSavedStatus"),
  foodRefundSaved:document.querySelector("#foodRefundSaved"),
  foodRefundCopy:document.querySelector("#foodRefundCopy"),
  foodRefundPrune:document.querySelector("#foodRefundPrune"),
  dailyCampaigns:document.querySelector("#dailyCampaigns"),
  dailyAlternativeCatalogues:document.querySelector("#dailyAlternativeCatalogues"),
  brochureCompareForm:document.querySelector("#brochureCompareForm"),
  brochureProductCode:document.querySelector("#brochureProductCode"),
  brochureCompareStatus:document.querySelector("#brochureCompareStatus"),
  brochureScanButton:document.querySelector("#brochureScanButton"),
  brochureCompareNotice:document.querySelector("#brochureCompareNotice"),
  dailyFreshnessStatus:document.querySelector("#dailyFreshnessStatus"),
  dailyOfficialLink:document.querySelector("#dailyOfficialLink"),
  dailyAlternativeLink:document.querySelector("#dailyAlternativeLink"),
  observedPostcode:document.querySelector("#observedPostcode"),
  observedByPostcode:document.querySelector("#observedByPostcode"),
  observedPostalCommuneField:document.querySelector("#observedPostalCommuneField"),
  observedPostalCommune:document.querySelector("#observedPostalCommune"),
  observedSort:document.querySelector("#observedSort"),
  observedAgeDays:document.querySelector("#observedAgeDays"),
  observedRadius:document.querySelector("#observedRadius"),
  observedNearby:document.querySelector("#observedNearby"),
  observedGeoNote:document.querySelector("#observedGeoNote"),
  observedRefresh:document.querySelector("#observedRefresh"),
  observedStatus:document.querySelector("#observedStatus"),
  observedDeals:document.querySelector("#observedDeals"),
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
  cancelBarcodeLookup:document.querySelector("#cancelBarcodeLookup"),
  scanButton:document.querySelector("#scanButton"),
  compareExactSku:document.querySelector("#compareExactSku"),
  exactSkuQuantity:document.querySelector("#exactSkuQuantity"),
  exactSkuAreaForm:document.querySelector("#exactSkuAreaForm"),
  exactSkuAreaPostcode:document.querySelector("#exactSkuAreaPostcode"),
  exactSkuAreaSearch:document.querySelector("#exactSkuAreaSearch"),
  exactSkuAreaCommuneField:document.querySelector("#exactSkuAreaCommuneField"),
  exactSkuAreaCommune:document.querySelector("#exactSkuAreaCommune"),
  exactSkuAreaRadius:document.querySelector("#exactSkuAreaRadius"),
  exactSkuAreaClear:document.querySelector("#exactSkuAreaClear"),
  exactSkuAreaStatus:document.querySelector("#exactSkuAreaStatus"),
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
  cancelRefreshList:document.querySelector("#cancelRefreshList"),
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
  daily:document.querySelector("#dailyView"),
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
  dailySort:["percent","euros","budget"].includes(localStorage.getItem("promo-daily-sort"))
    ? localStorage.getItem("promo-daily-sort") : "percent",
  dailyMaxSpend:["all","3","5","10","20"].includes(localStorage.getItem("promo-daily-budget"))
    ? localStorage.getItem("promo-daily-budget") : "all",
  savingsFocus:["all","at-least-50","full-refund"].includes(localStorage.getItem("promo-savings-focus"))
    ? localStorage.getItem("promo-savings-focus") : "all",
  sourceProof:["without-failure","all","failed"].includes(localStorage.getItem("promo-source-proof"))
    ? localStorage.getItem("promo-source-proof") : "without-failure",
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
  dailyCampaigns:[],
  dailyAlternatives:[],
  dailyFeedCheckedAt:null,
  dailyFeedLastAttemptAt:null,
  dailySourceChecks:{},
  lookupToken:0,
  skuCompareToken:0
};

// Discovery options are transient; only explicitly saved official source IDs
// are persisted in the dedicated, local-only refund checklist.
const foodRefundState={limit:24};

// Community observations are independent of the merchant promotion importer.
// Never turn them into automatically stackable product or basket offers.
const communityState={store:null,records:[],status:"idle",checkedAt:null,
  incomplete:false,total:null,token:0,controller:null,checkedDay:null,
  checkedSearchKey:null,coords:null,radiusKm:25,geoPending:false,
  geoError:"",positionRequestToken:0,
  postalOrigin:false,postalLocationLabel:"",
  postcodeCandidates:[],postcodeCandidateZip:"",
  postcodePending:false,postcodeLookupToken:0,postcodeController:null};

// Shared by both retailer lookups. Any change of product/filters aborts
// obsolete network traffic instead of merely discarding its eventual reply.
let skuComparisonController=null;
// A municipality centre is a requested search origin, not the user's GPS.
// Keep the chosen place transient and independent of basket/community prices.
const comparisonArea={
  commune:null,postcode:"",radiusKm:25,candidates:[],pendingZip:"",
  controller:null,lookupToken:0
};
const EXACT_SKU_TIMEOUT_MS=18000;
let productLookupController=null;
let productLookupTimeout=null;
const PRODUCT_LOOKUP_TIMEOUT_MS=15000;
// An obsolete basket lookup must not commit its old prices after UI changes.
let basketRefreshController=null;
let basketRefreshToken=0;

els.store.value=state.store;
els.channel.value=state.channel;
els.carrefourLoyalty.value=state.loyaltyProfile.carrefour;
els.leclercLoyalty.value=state.loyaltyProfile.leclerc;
els.sort.value=state.sort;
els.dailySort.value=state.dailySort;
els.dailyMaxSpend.value=state.dailyMaxSpend;
els.savingsFocus.value=state.savingsFocus;
els.sourceProof.value=state.sourceProof;
els.simulatedQuantity.value=state.simulatedQuantity;
els.sourceScope.value=state.sourceScope;
els.radiusSelect.value=String(state.radiusKm);
els.listRadiusSelect.value=String(state.radiusKm);
els.dropThreshold.value=String(state.dropThreshold);
els.manualPriceStore.value=state.store;
els.shoppingBudget.value=state.shoppingBudget===null?"":state.shoppingBudget.toFixed(2).replace(".",",");
els.manualPriceDate.value=parisCivilDay(new Date());
els.manualPriceDate.max=els.manualPriceDate.value;
// Installed PWAs can remain open overnight: refresh the date ceiling before
// opening the Android picker, without overwriting a date the shopper chose.
els.manualPriceDate.addEventListener("focus",()=>{
  els.manualPriceDate.max=parisCivilDay(new Date());
});
els.datasetDate.textContent=`Catalogue de référence : ${formatDate(DATASET_DATE)} · chargement des offres publiques…`;

els.store.addEventListener("change",async()=>{
  communityState.positionRequestToken++;
  communityState.geoPending=false;
  invalidateCommunityObservations();
  invalidateExactSkuComparison();
  state.store=els.store.value;
  localStorage.setItem("promo-store",state.store);
  els.manualPriceStore.value=state.store;
  render();
  renderOptimizer();
  if(state.product) renderProductOffers(state.product,state.priceObservations);
  if(state.productCode) await refreshPrices(state.productCode);
  if(state.tab==="daily") void refreshCommunityObservations();
});
els.channel.addEventListener("change",()=>{
  communityState.positionRequestToken++;
  communityState.geoPending=false;
  invalidateCommunityObservations();
  invalidateExactSkuComparison();
  cancelBasketPriceRefresh();
  state.channel=els.channel.value;
  localStorage.setItem("promo-channel",state.channel);
  render();
  renderSourceHealth();
  renderOptimizer();
  renderShoppingList();
  if(state.product) renderProductOffers(state.product,state.priceObservations);
  if(state.tab==="daily") void refreshCommunityObservations();
});
els.carrefourLoyalty.addEventListener("change",()=>updateLoyaltyProfile("carrefour",els.carrefourLoyalty.value));
els.leclercLoyalty.addEventListener("change",()=>updateLoyaltyProfile("leclerc",els.leclercLoyalty.value));
els.sort.addEventListener("change",()=>{
  state.sort=els.sort.value;
  localStorage.setItem("promo-sort",state.sort);
  render();
});
els.dailySort.addEventListener("change",()=>{
  state.dailySort=els.dailySort.value;
  localStorage.setItem("promo-daily-sort",state.dailySort);
  renderDailyCatalogue();
  renderCommunityObservations();
});
els.foodRefundSearch.addEventListener("input",()=>{
  foodRefundState.limit=24;
  renderFoodRefundExplorer();
});
els.foodRefundProvider.addEventListener("change",()=>{
  foodRefundState.limit=24;
  renderFoodRefundExplorer();
});
els.foodRefundSort.addEventListener("change",()=>{
  foodRefundState.limit=24;
  renderFoodRefundExplorer();
});
els.foodRefundDeals.addEventListener("click",handleFoodRefundSavedClick);
els.foodRefundSaved.addEventListener("click",handleFoodRefundSavedClick);
els.foodRefundCopy.addEventListener("click",async()=>{
  const saved=selectSavedFoodRefunds({
    savedIds:savedFoodRefundIds,
    offers:resolveOffersForLoyalty(activeOffers(),state.loyaltyProfile),
    store:state.store,channel:state.channel,now:new Date()
  });
  if(!saved.available.length) return;
  const checklist=formatSavedFoodRefundChecklist(saved.available,{store:state.store});
  try{
    if(!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(checklist);
    els.foodRefundSavedStatus.textContent=
      "Liste copiée : "+saved.available.length+
      " offre(s) à revérifier. Aucun remboursement ni prix en caisse garanti.";
  }catch{
    els.foodRefundSavedStatus.textContent=
      "Copie impossible : autorisez le presse-papiers dans le navigateur ou utilisez les liens officiels.";
  }
});
els.foodRefundPrune.addEventListener("click",()=>{
  const current=selectSavedFoodRefunds({
    savedIds:savedFoodRefundIds,
    offers:resolveOffersForLoyalty(activeOffers(),state.loyaltyProfile),
    store:state.store,channel:state.channel,now:new Date()
  });
  saveFoodRefundIds(current.available.map((item)=>item.id));
});
els.foodRefundMore.addEventListener("click",()=>{
  foodRefundState.limit=Math.min(240,foodRefundState.limit+24);
  renderFoodRefundExplorer();
});
els.dailyMaxSpend.addEventListener("change",()=>{
  state.dailyMaxSpend=els.dailyMaxSpend.value;
  localStorage.setItem("promo-daily-budget",state.dailyMaxSpend);
  renderDailyCatalogue();
  renderCommunityObservations();
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
els.sourceProof.addEventListener("change",()=>{
  state.sourceProof=els.sourceProof.value;
  localStorage.setItem("promo-source-proof",state.sourceProof);
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
  els.brochureCompareNotice.classList.add("hidden");
  lookupBarcode(els.barcode.value);
});
// This path uses ONLY an exact code supplied by the visitor. The Bonial
// flyer provides dates/links, not a verified price or product association.
// Reuse the existing source-scoped, cancellable Open Prices comparison.
els.brochureCompareForm.addEventListener("submit",async(event)=>{
  event.preventDefault();
  if(state.store!=="carrefour" || state.channel!=="store"
    || !selectAlternativeCatalogues({
      catalogues:state.dailyAlternatives,store:state.store,
      channel:state.channel,now:new Date()
    }).length) return;
  let code;
  try{
    code=normalizeBarcode(els.brochureProductCode.value);
  }catch(error){
    els.brochureCompareStatus.textContent=error.message;
    els.brochureProductCode.focus();
    return;
  }
  els.brochureCompareStatus.textContent="";
  els.brochureProductCode.value=code;
  els.exactSkuQuantity.value="1";
  els.brochureCompareNotice.classList.remove("hidden");
  setTab("product");
  els.barcode.value=code;
  // A newer lookup, canceled scan or tab change must not launch a stale
  // comparison when the first request eventually resolves.
  const previousLookup=state.lookupToken;
  await lookupBarcode(code);
  if(state.lookupToken!==previousLookup+1
    || state.productCode!==code || state.tab!=="product"
    || state.channel!=="store") return;
  await compareCurrentExactSku();
});
els.brochureScanButton.addEventListener("click",()=>{
  if(state.store!=="carrefour" || state.channel!=="store"
    || !selectAlternativeCatalogues({
      catalogues:state.dailyAlternatives,store:state.store,
      channel:state.channel,now:new Date()
    }).length) return;
  els.brochureCompareNotice.classList.remove("hidden");
  setTab("product");
  void startScanner();
});
els.cancelBarcodeLookup.addEventListener("click",()=>{
  if(!productLookupController) return;
  ++state.lookupToken;
  abortProductLookup();
  state.productCode=null;
  invalidateExactSkuComparison();
  clearProductLookupView();
  els.compareExactSku.disabled=true;
  setProductStatus("Recherche annulée. Aucun nouveau résultat retenu ; vous pouvez réessayer.");
});
els.scanButton.addEventListener("click",startScanner);
els.compareExactSku.addEventListener("click",()=>compareCurrentExactSku());
els.exactSkuAreaForm.addEventListener("submit",(event)=>{
  event.preventDefault();
  void searchComparisonAreaPostcode();
});
els.exactSkuAreaPostcode.addEventListener("input",()=>{
  clearComparisonArea(false);
  els.exactSkuAreaStatus.textContent=
    "Code postal modifié : le précédent secteur n'est plus appliqué. Cherchez la commune avant de comparer localement.";
});
els.exactSkuAreaCommune.addEventListener("change",()=>{
  const value=els.exactSkuAreaCommune.value;
  const selected=comparisonArea.candidates.find((place)=>place.code===value);
  if(selected && comparisonArea.pendingZip===els.exactSkuAreaPostcode.value.trim()){
    applyComparisonArea(selected,comparisonArea.pendingZip);
  }else{
    comparisonArea.commune=null;
    invalidateExactSkuComparison();
    els.exactSkuAreaStatus.textContent="Sélectionnez explicitement une commune.";
  }
});
els.exactSkuAreaRadius.addEventListener("change",()=>{
  const radius=Number(els.exactSkuAreaRadius.value);
  if(![5,10,25,50].includes(radius)) return;
  comparisonArea.radiusKm=radius;
  invalidateExactSkuComparison();
  if(comparisonArea.commune){
    els.exactSkuAreaStatus.textContent="Secteur choisi : "+
      comparisonArea.commune.nom+" ("+comparisonArea.postcode+
      "), rayon "+radius+" km autour du centre communal approximatif. "+
      "Appuyez sur « Comparer cet EAN » pour actualiser les relevés.";
  }
});
els.exactSkuAreaClear.addEventListener("click",()=>clearComparisonArea(true));
els.exactSkuQuantity.addEventListener("input",invalidateExactSkuComparison);
els.exactSkuComparison.addEventListener("click",(event)=>{
  if(event.target.closest('[data-action="cancel-exact-sku"]')){
    // Actively abort outstanding network calls and invalidate their token.
    // An old result must not reappear after the user cancels the search.
    if(skuComparisonController){
      invalidateExactSkuComparison();
      els.exactSkuComparison.innerHTML=
        '<div class="panel price-source" role="status">Recherche annulée. Aucun nouveau prix n’a été retenu. Vous pouvez relancer la comparaison.</div>';
    }
    return;
  }
  if(event.target.closest('[data-action="expand-exact-sku"]')){
    compareCurrentExactSku({deep:true});
  }
});
els.nearbyButton.addEventListener("click",toggleNearbyPrices);
els.listNearbyButton.addEventListener("click",toggleNearbyPrices);
els.refreshList.addEventListener("click",refreshShoppingList);
els.cancelRefreshList.addEventListener("click",cancelBasketPriceRefresh);
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
  cancelBasketPriceRefresh();
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
    // Invalidate immediately, before the asynchronous product lookup.
    markBasketPricesStale();
    if(state.productCode) await refreshPrices(state.productCode);
  }
});
els.listRadiusSelect.addEventListener("change",async()=>{
  invalidateExactSkuComparison();
  state.radiusKm=Number(els.listRadiusSelect.value)||25;
  els.radiusSelect.value=String(state.radiusKm);
  syncNearbyControls();
  if(state.nearbyEnabled){
    // Invalidate immediately, before the asynchronous product lookup.
    markBasketPricesStale();
    if(state.productCode) await refreshPrices(state.productCode);
  }
});
els.closeScan.addEventListener("click",()=>els.scanDialog.close());
els.scanDialog.addEventListener("close",stopScanner);

els.observedPostcode.addEventListener("input",()=>{
  // Editing the postal code invalidates any earlier commune chooser and
  // prevents a delayed response from applying a different postal code.
  communityState.postcodeLookupToken++;
  communityState.postcodeController?.abort();
  communityState.postcodePending=false;
  communityState.postcodeCandidates=[];
  renderCommunityObservations();
});
els.observedByPostcode.addEventListener("click",()=>void searchPostalCodeCentre());
els.observedPostalCommune.addEventListener("change",()=>{
  const selected=communityState.postcodeCandidates.find(
    (item)=>item.code===els.observedPostalCommune.value
  );
  if(selected) usePostalCommune(selected,communityState.postcodeCandidateZip);
});
els.observedSort.addEventListener("change",()=>renderCommunityObservations());
els.observedAgeDays.addEventListener("change",()=>renderCommunityObservations());
els.observedRadius.addEventListener("change",()=>{
  communityState.radiusKm=Number(els.observedRadius.value);
  if(communityState.coords){
    invalidateCommunityObservations();
    if(state.tab==="daily" && state.channel==="store")
      void refreshCommunityObservations(true);
  }else renderCommunityObservations();
});
els.observedNearby.addEventListener("click",toggleCommunityNearby);
els.observedRefresh.addEventListener("click",()=>void refreshCommunityObservations(true));
els.tabs.forEach((button)=>button.addEventListener("click",()=>setTab(button.dataset.tab)));

function setTab(tab){
  state.tab=tab;
  els.tabs.forEach((button)=>button.classList.toggle("active",button.dataset.tab===tab));
  for(const [name,view] of Object.entries(views)) view.classList.toggle("hidden",name!==tab);
  if(tab==="list") renderShoppingList();
  if(tab==="daily"){
    renderDailyCatalogue();
    renderCommunityObservations();
    void refreshCommunityObservations();
  }
}

function render(){
  const resolvedOffers=resolveOffersForLoyalty(activeOffers(),state.loyaltyProfile);
  const matching=filterOffers(resolvedOffers,{
    store:state.store,channel:state.channel,search:state.search,
    savingsFocus:state.savingsFocus
  });
  const nonReconfirmed=matching.filter((offer)=>Boolean(offer.sourceSyncWarning)).length;
  const filtered=matching.filter((offer)=>
    state.sourceProof==="all"
    || (state.sourceProof==="failed" ? Boolean(offer.sourceSyncWarning) : !offer.sourceSyncWarning)
  );
  els.offerVerificationSummary.textContent=state.sourceProof==="without-failure"
    ? nonReconfirmed+" offre(s) dont la source n'a pas pu reconfirmer les données sont masquée(s). Choisir « Toutes » pour les examiner. Absence d'alerte ≠ économie garantie."
    : state.sourceProof==="failed"
      ? nonReconfirmed+" offre(s) anciennes non reconfirmées : ne pas acheter sans vérification officielle."
      : nonReconfirmed+" offre(s) non reconfirmée(s) sur "+matching.length+" candidate(s). Les gains affichés sont conditionnels.";
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
      : "Aucune offre ne correspond aux filtres ou aucune source sans échec récent n'est disponible. Le filtre « Toutes » permet de consulter les offres non reconfirmées.";

  const activeProviders=filterDiscoveryProviders(providers,{
    scope:state.sourceScope,search:state.sourceSearch,store:state.store
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
  const merchant=state.store==="leclerc"?"E.Leclerc":"Carrefour";
  els.sourceDiscoverySummary.textContent=activeProviders.length+" service(s) référencé(s) · "+
    scopeLabels[state.sourceScope]+" · "+merchant+
    " et services indépendants. Disponibilité et économies exactes à vérifier auprès de chaque source.";

  const numericPercents=ranked.map(effectivePercent).filter(Number.isFinite);
  const maxPercent=numericPercents.length?Math.max(...numericPercents):null;
  els.stats.innerHTML=[
    stat(ranked.length,"offres consultables"),
    stat(nonReconfirmed,"offres de sources non reconfirmées"),
    stat(maxPercent===null?"—":formatPercent(maxPercent),"remise maximale annoncée")
  ].join("");
  renderListCount();
  renderDailyCatalogue();
}

function invalidateCommunityObservations(){
  communityState.controller?.abort();
  communityState.controller=null;
  communityState.token++;
  communityState.records=[];
  communityState.status="idle";
  communityState.store=null;
  communityState.checkedAt=null;
  communityState.checkedDay=null;
  communityState.checkedSearchKey=null;
  communityState.incomplete=false;
  communityState.total=null;
  renderCommunityObservations();
}
function usePostalCommune(place,postcode){
  if(!place || !/^\d{5}$/.test(postcode)) return;
  // Cancel pending GPS callbacks and never persist the centre in localStorage.
  communityState.positionRequestToken++;
  communityState.geoPending=false;
  communityState.coords={latitude:place.latitude,longitude:place.longitude};
  communityState.postalOrigin=true;
  communityState.postalLocationLabel=place.nom+" ("+postcode+")";
  communityState.postcodeCandidates=[];
  communityState.postcodeCandidateZip="";
  communityState.geoError="";
  // A postal-code exact filter must not exclude shops in adjacent towns.
  els.observedPostcode.value="";
  invalidateCommunityObservations();
  if(state.tab==="daily" && state.channel==="store")
    void refreshCommunityObservations(true);
}
async function searchPostalCodeCentre(){
  if(state.channel!=="store") return;
  const postcode=els.observedPostcode.value.trim();
  if(!/^\d{5}$/.test(postcode)){
    communityState.geoError="Saisir un code postal de cinq chiffres avant de lancer la recherche.";
    renderCommunityObservations();return;
  }
  // A postal-code search never accesses navigator.geolocation.
  communityState.positionRequestToken++;
  communityState.geoPending=false;
  communityState.postcodeController?.abort();
  const controller=new AbortController();
  const token=++communityState.postcodeLookupToken;
  communityState.postcodeController=controller;
  communityState.postcodePending=true;
  communityState.postcodeCandidates=[];
  communityState.geoError="";
  renderCommunityObservations();
  const timer=setTimeout(()=>controller.abort(),9000);
  try{
    const places=await lookupPostalCodeCommunes(postcode,{
      signal:controller.signal
    });
    if(token!==communityState.postcodeLookupToken || controller.signal.aborted) return;
    if(!places.length) throw new Error("Aucune commune avec un centre valide pour ce code postal.");
    if(places.length===1){
      usePostalCommune(places[0],postcode);
    }else{
      communityState.postcodeCandidates=places;
      communityState.postcodeCandidateZip=postcode;
      els.observedPostalCommune.replaceChildren(
        new Option("Choisir une commune…","")
      );
      for(const place of places){
        els.observedPostalCommune.add(new Option(place.nom,place.code));
      }
      communityState.geoError=places.length+
        " communes correspondent à "+postcode+". Choisir la bonne commune pour démarrer la recherche.";
    }
  }catch(error){
    if(token!==communityState.postcodeLookupToken) return;
    communityState.postcodeCandidates=[];
    communityState.geoError=controller.signal.aborted
      ?"Recherche du code postal interrompue : réessayer."
      :String(error?.message||"Recherche du code postal indisponible.");
  }finally{
    clearTimeout(timer);
    if(token===communityState.postcodeLookupToken){
      communityState.postcodePending=false;
      communityState.postcodeController=null;
      renderCommunityObservations();
    }
  }
}
function toggleCommunityNearby(){
  // The browser asks for position only after a deliberate tap on this
  // control, never on load, tab navigation or a normal refresh.
  const requestId=++communityState.positionRequestToken;
  // A manual postal search is independent from permission-based GPS.
  communityState.postcodeLookupToken++;
  communityState.postcodeController?.abort();
  communityState.postcodePending=false;
  communityState.postcodeCandidates=[];
  if(communityState.geoPending){
    communityState.geoPending=false;
    communityState.geoError="";
    renderCommunityObservations();
    return;
  }
  if(communityState.coords){
    communityState.coords=null;
    communityState.postalOrigin=false;
    communityState.postalLocationLabel="";
    communityState.geoError="";
    invalidateCommunityObservations();
    if(state.tab==="daily" && state.channel==="store")
      void refreshCommunityObservations(true);
    return;
  }
  if(state.channel!=="store") return;
  if(!navigator.geolocation){
    communityState.geoError="La position n’est pas disponible sur cet appareil.";
    renderCommunityObservations();return;
  }
  communityState.geoPending=true;
  communityState.geoError="";
  renderCommunityObservations();
  navigator.geolocation.getCurrentPosition((position)=>{
    if(requestId!==communityState.positionRequestToken) return;
    communityState.geoPending=false;
    if(state.channel!=="store") return;
    const latitude=position?.coords?.latitude;
    const longitude=position?.coords?.longitude;
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude)
      || latitude < -90 || latitude > 90
      || longitude < -180 || longitude > 180){
      communityState.geoError="Position invalide : recherche nationale conservée.";
      renderCommunityObservations();return;
    }
    // Approx. 100 m granularity, session memory only, never localStorage.
    communityState.coords={
      latitude:Math.round(latitude*1000)/1000,
      longitude:Math.round(longitude*1000)/1000
    };
    communityState.postalOrigin=false;
    communityState.postalLocationLabel="";
    // A postcode is an exact filter on already fetched receipts. Keeping it
    // enabled here would accidentally hide nearby stores in adjacent towns.
    els.observedPostcode.value="";
    invalidateCommunityObservations();
    if(state.tab==="daily") void refreshCommunityObservations(true);
  },()=>{
    if(requestId!==communityState.positionRequestToken) return;
    communityState.geoPending=false;
    communityState.geoError="Localisation refusée ou indisponible. La recherche nationale reste accessible.";
    renderCommunityObservations();
  },{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
}
function renderCommunityObservations(){
  if(!els.observedStatus) return;
  const near=Boolean(communityState.coords);
  const distanceOption=els.observedSort.querySelector('option[value="distance"]');
  distanceOption.disabled=!near;
  if(!near && els.observedSort.value==="distance") els.observedSort.value="percent";
  els.observedByPostcode.textContent=communityState.postcodePending
    ?"Recherche des communes…" : "Chercher autour du code postal";
  els.observedByPostcode.disabled=communityState.postcodePending
    || state.channel!=="store";
  els.observedPostalCommuneField.classList.toggle(
    "hidden",communityState.postcodeCandidates.length<2
  );
  els.observedNearby.textContent=communityState.geoPending
    ? "Annuler la demande de position"
    :near?"Désactiver la proximité":"Chercher près de moi";
  els.observedNearby.setAttribute("aria-pressed",String(near));
  els.observedNearby.classList.toggle("active",near);
  els.observedNearby.disabled=state.channel!=="store" && !near
    && !communityState.geoPending;
  els.observedRadius.value=String(communityState.radiusKm);
  els.observedGeoNote.textContent=communityState.postcodePending
    ? "Lecture du référentiel public des communes, sans GPS du téléphone."
    :communityState.postcodeCandidates.length>1
      ?communityState.geoError
      :near && communityState.postalOrigin
        ? "Recherche dans un rayon de "+communityState.radiusKm+
          " km autour du centre approximatif de "+communityState.postalLocationLabel+
          ". Il ne s'agit PAS de votre position. Le centre public est transmis à Open Prices pour cette recherche, sans sauvegarde."
        :communityState.geoPending
          ? "Demande de position en cours. Annuler est possible sans activer la recherche locale."
          :near
            ? "Recherche dans un rayon de "+communityState.radiusKm+
              " km. Position arrondie à environ 100 m, transmise uniquement à Open Prices pendant cette recherche, jamais enregistrée. Désactiver la proximité pour l’effacer."
            :communityState.geoError ||
              "GPS uniquement sur demande ; sinon saisissez un code postal puis choisissez la commune. Un simple code postal sans recherche locale filtre seulement les relevés déjà récupérés.";
  if(state.channel!=="store"){
    els.observedStatus.textContent="Les relevés Open Prices concernent les magasins physiques, pas les Drives ni la livraison.";
    els.observedDeals.innerHTML="";
    els.observedRefresh.disabled=true;
    return;
  }
  els.observedRefresh.disabled=communityState.status==="loading";
  const zip=els.observedPostcode.value.trim();
  if(zip && !/^\d{5}$/.test(zip)){
    els.observedStatus.textContent="Saisir exactement cinq chiffres, ou laisser le code postal vide pour une recherche nationale.";
    els.observedDeals.innerHTML="";
    return;
  }
  if(communityState.status==="loading"){
    els.observedStatus.textContent="Recherche de relevés communautaires récents en cours…";
    els.observedDeals.innerHTML="";
    return;
  }
  if(communityState.status==="error"){
    els.observedStatus.textContent="Open Prices est momentanément inaccessible. Aucun ancien relevé n'est présenté comme actuel. Réessayez.";
    els.observedDeals.innerHTML="";
    return;
  }
  if(communityState.status!=="done" || communityState.store!==state.store){
    els.observedStatus.textContent="La consultation recherche les relevés publiés pour cette enseigne.";
    els.observedDeals.innerHTML="";
    return;
  }
  const budget=state.dailyMaxSpend==="all"?null:Number(state.dailyMaxSpend);
  const requestedSort=els.observedSort.value;
  const observedSort=requestedSort==="distance" && !near?"percent":requestedSort;
  els.observedSort.querySelector('option[value="distance"]').disabled=!near;
  if(requestedSort==="distance" && !near) els.observedSort.value="percent";
  const ageDays=Number(els.observedAgeDays.value);
  const picks=selectObservedDiscounts(communityState.records,{
    postcode:zip,sort:observedSort,maxSpend:budget,limit:15,
    maxCalendarDays:ageDays,now:new Date()
  });
  const checked=communityState.checkedAt
    ?parisCivilDay(new Date(communityState.checkedAt)):"date inconnue";
  const warning=communityState.incomplete
    ?" Échantillon limité ou partiellement accessible : recherche non exhaustive.":"";
  const scope=communityState.coords
    ?communityState.postalOrigin
      ?"dans un rayon de "+communityState.radiusKm+
        " km depuis le centre de "+communityState.postalLocationLabel
      :"dans un rayon de "+communityState.radiusKm+" km (position approximative)"
    :zip?"code postal "+zip+" parmi les relevés nationaux":"échantillon national";
  const period=ageDays===1?"datés d’aujourd’hui"
    :ageDays===3?"datés des 3 derniers jours calendaires"
      :"datés des 7 derniers jours calendaires";
  els.observedStatus.textContent=picks.length+" relevé(s) correspondant aux filtres · "+
    period+" · consultation "+checked+" · "+scope+"."+
    warning+" Prix local et disponibilité actuelle à reconfirmer avant achat.";
  els.observedDeals.innerHTML=picks.length
    ?picks.map((item)=>`<article class="card daily-offer">
      <div class="card-head"><div>
        <h4>${escapeHtml(item.title)}</h4>
        <div class="source">${escapeHtml(item.storeName)} · ${escapeHtml(item.postcode)}
          ${item.city?" · "+escapeHtml(item.city):""}
          ${item.storeStreet?" · "+escapeHtml(item.storeStreet)
            :Number.isSafeInteger(item.locationId)
              ?" · Lieu Open Prices n° "+item.locationId
              :" · Adresse exacte non précisée"}
          ${Number.isFinite(item.distanceKm)
            ?" · "+item.distanceKm.toLocaleString("fr-FR")+" km":""}</div>
      </div><span class="badge">${formatPercent(item.savingPercent)} observés</span></div>
      <p><strong>${money.format(item.price)} constatés</strong>
        au lieu de ${money.format(item.regularPrice)} ·
        écart ${money.format(item.savingAmount)} sur une unité.</p>
      <p class="help">Relevé du ${formatDate(item.date)} · code EAN
        ${escapeHtml(item.code)} · remise observée dans ce magasin uniquement.
        Ne garantit ni promotion toujours active, ni stock, ni cumul en caisse.</p>
      <div class="daily-links">
        <a class="open" href="${escapeHtml(item.sourceUrl)}"
          target="_blank" rel="noopener noreferrer">Voir le relevé et sa preuve</a>
        ${item.storeMapUrl
          ?`<a class="open" href="${escapeHtml(item.storeMapUrl)}"
            target="_blank" rel="noopener noreferrer">Voir le magasin indiqué sur OpenStreetMap</a>`
          :""}
      </div>
    </article>`).join("")
    :'<p class="panel help">Aucun relevé de réduction correspondant à ces critères parmi les observations récupérées. Cela ne prouve pas qu’aucune offre ne soit disponible en magasin.</p>';
}
async function refreshCommunityObservations(force=false){
  if(!els.observedStatus || state.channel!=="store"){
    renderCommunityObservations();return;
  }
  const today=parisCivilDay(new Date());
  const nearby=communityState.coords;
  const searchKey=nearby
    ?state.store+"|nearby|"+nearby.latitude+"|"+nearby.longitude+
      "|"+communityState.radiusKm
    :state.store+"|national";
  if(!force && communityState.store===state.store &&
    communityState.checkedDay===today &&
    communityState.checkedSearchKey===searchKey &&
    (communityState.status==="done" || communityState.status==="loading")){
    renderCommunityObservations();return;
  }
  communityState.controller?.abort();
  const controller=new AbortController();
  const token=++communityState.token;
  communityState.controller=controller;
  communityState.store=state.store;
  communityState.checkedSearchKey=searchKey;
  communityState.status="loading";
  communityState.records=[];
  renderCommunityObservations();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const result=await fetchObservedDiscounts({
      store:state.store,signal:controller.signal,
      coords:nearby,radiusKm:communityState.radiusKm
    });
    if(token!==communityState.token || controller.signal.aborted) return;
    communityState.records=result.records;
    communityState.checkedAt=result.checkedAt;
    communityState.checkedDay=today;
    communityState.incomplete=result.incomplete;
    communityState.total=result.total;
    communityState.status="done";
  }catch(error){
    if(token!==communityState.token) return;
    communityState.status="error";
    console.warn("[open-prices] relevés indisponibles : "+error.message);
  }finally{
    clearTimeout(timeout);
    if(token===communityState.token){
      communityState.controller=null;
      renderCommunityObservations();
    }
  }
}

function renderDailyCatalogue(){
  if(!els.dailyStatus) return;
  // Recompute at every render/tab change; an installed PWA opened overnight
  // must never keep showing yesterday's expired catalogue as today's.
  const today=new Date();
  const digest=selectDailyCatalogue({
    offers:resolveOffersForLoyalty(activeOffers(),state.loyaltyProfile),
    campaigns:state.dailyCampaigns,store:state.store,
    channel:state.channel,now:today,limit:12,
    sort:state.dailySort,
    maxSpend:state.dailyMaxSpend==="all"?null:Number(state.dailyMaxSpend)
  });
  // Derived by the daily selection engine, so the main summary and the
  // verification shortlist always apply identical date/channel filters.
  const unconfirmedRetailerCount=digest.unconfirmedRetailerCount;
  const source=state.store==="carrefour"
    ? state.channel==="store" ? "https://www.carrefour.fr/catalogue/carrefour"
      : "https://www.carrefour.fr/offres-du-moment"
    : state.channel==="store" ? "https://www.e.leclerc/prospectus"
      : "https://www.leclercdrive.fr/";
  els.dailyOfficialLink.href=source;
  // Bonial's public dated flyers remain usable as a manual reference even
  // if automated Carrefour catalogue requests fail with HTTP 403.
  // Browsing them never refreshes evidence for an unverified product.
  if(els.dailyAlternativeLink){
    els.dailyAlternativeLink.href=state.store==="carrefour"
      ? "https://www.bonial.fr/Enseignes/Carrefour"
      : "https://www.bonial.fr/Enseignes/E-Leclerc";
  }
  if(els.dailyFreshnessStatus) els.dailyFreshnessStatus.textContent=
    dailyCampaignRefreshNotice({checkedAt:state.dailyFeedCheckedAt,
      lastAttemptAt:state.dailyFeedLastAttemptAt,
      sourceChecks:state.dailySourceChecks},state.store,today);
  const budgetDescription=digest.maxSpend===null?"sans plafond connu"
    :"budget initial de "+money.format(digest.maxSpend)+" maximum par lot";
  const sortDescription={
    percent:"réduction effective sur la quantité minimale",
    euros:"euros économisés sur la quantité minimale",
    budget:"coût initial du lot",
    net:"coût théorique après avantage sur le lot (prix à avancer inchangé)"
  }[digest.sort];
  els.dailyStatus.textContent="Sélection au "+formatDate(digest.today)+
    " · "+storeLabel(state.store)+" · "+
    (state.channel==="store"?"magasin":state.channel==="drive"?"Drive":"en ligne")+
    " · "+digest.retailer.length+" offre(s) enseigne, "+
    digest.extra.length+" remboursement(s)/coupon(s), "+
    digest.priceSpots.length+" prix alimentaires précis et "+
    digest.campaigns.length+" campagne(s) officielle(s). "+ 
    "Classement : "+sortDescription+" ; "+budgetDescription+". "+
    "Campagnes vérifiées depuis 7 jours au maximum ; sources et gains à reconfirmer avant achat. "+ 
    "Les sélections publicitaires sans prix exact ne sont pas garanties dans le budget ; les seuils d'achat connus sont filtrés. "+
    (digest.maxSpend!==null
      ? (digest.highlights.length
        ? digest.highlights.length+" promotion(s) chiffrée(s) à examiner sous ce plafond par lot. "
        : "Aucune promotion dont le prix initial du lot et l'économie potentielle sont calculables sous ce plafond. ")+
        "Attention : le plafond est appliqué à chaque lot, pas à la somme des recommandations. "
      : "")+
    (unconfirmedRetailerCount
      ? " "+unconfirmedRetailerCount+" offre(s) enseigne non reconfirmée(s) volontairement exclue(s) des meilleures promotions."
      : "");
  const renderPick=(item)=>{
    const hasPercent=Number.isFinite(item.savingPercent);
    const quantity=item.minQuantity>1
      ? "Pour "+item.minQuantity+" articles éligibles (minimum)" : "Sur l'article éligible";
    const upfront=Number.isFinite(item.upfrontCost)
      ? "Prix initial indicatif du lot : "+money.format(item.upfrontCost)+". "
      : "Prix initial du lot non documenté. ";
    const price=Number.isFinite(item.savingAmount)
      ? money.format(item.savingAmount)+" d'économie potentielle"+
        (item.minQuantity>1?" pour le lot":"") : "Économie en euros inconnue";
    const rate=hasPercent?formatPercent(item.savingPercent):"Taux inconnu";
    const afterBenefit=Number.isFinite(item.netAfterBenefit)
      ? "Coût théorique après avantage : "+money.format(item.netAfterBenefit)+
        " (sous réserve d'éligibilité, sans garantie de prix en caisse)." : null;
    const upperLimit=Number.isInteger(item.higherTierMaxQuantity)
      ? item.higherTierMaxQuantity : null;
    const upperQty=upperLimit===item.higherTierMinQuantity
      ? "pour exactement "+item.higherTierMinQuantity+" articles éligibles"
      : upperLimit!==null
        ? "pour "+item.higherTierMinQuantity+" à "+upperLimit+" articles éligibles"
        : "à partir de "+item.higherTierMinQuantity+" articles éligibles";
    const higherTier=Number.isFinite(item.higherTierPercent)
      && Number.isInteger(item.higherTierMinQuantity)
      ? "Jusqu'à "+formatPercent(item.higherTierPercent)+" "+upperQty+"."
      : null;
    const exact=item.hasExactEan
      ? "EAN documenté (disponibilité locale non confirmée)"
      : "Référence exacte à confirmer";
    const benefit=item.rewardType==="loyalty_credit"
      ? "Cagnotte fidélité après achat, pas remise de caisse"
      : item.mechanism==="manufacturer_refund"
        ? "Remboursement éventuel après achat : prévoir le prix initial complet" : null;
    return `<article class="card daily-offer">
      <div class="card-head"><div>
        <h4>${escapeHtml(item.title)}</h4>
        <div class="source">${escapeHtml(item.provider)}</div>
      </div><span class="badge">${rate}</span></div>
      <p><strong>${escapeHtml(price)}</strong></p>
      <p class="help">${escapeHtml(upfront)}</p>
      ${afterBenefit ? `<p class="help"><strong>${escapeHtml(afterBenefit)}</strong></p>` : ""}
      <p class="help">${escapeHtml(quantity)} · ${escapeHtml(exact)}</p>
      ${higherTier ? `<p class="help">${escapeHtml(higherTier)}</p>` : ""}
      ${benefit ? `<p class="help">${escapeHtml(benefit)}</p>` : ""}
      <p class="help">Source datée du ${formatDate(item.verifiedAt)}
        ${item.expiresAt?" · limite "+formatDate(item.expiresAt):""}.
        ${item.needsActivation?"Activation et remboursement à confirmer.":"Prix et magasin à reconfirmer."}
      </p>
      <a class="open" href="${escapeHtml(item.sourceUrl)}"
        target="_blank" rel="noopener noreferrer">Contrôler la source</a>
    </article>`;
  };
  const fallback=(title)=>`<p class="panel help">${escapeHtml(title)}</p>`;
  els.dailyHighlights.innerHTML=digest.highlights.length
    ?digest.highlights.map((item)=>`<div class="daily-actionable">
      <p class="help"><strong>À examiner :</strong>
        ${formatPercent(item.savingPercent)} sur ${item.minQuantity}
        article(s) · ${money.format(item.upfrontCost)} à avancer ·
        ${money.format(item.savingAmount)} d'avantage potentiel.
        ${item.hasExactEan
          ?"EAN documenté ; prix local à vérifier."
          :"Gamme éligible et magasin à confirmer."}
      </p>${renderPick(item)}
    </div>`).join("")
    :fallback(digest.maxSpend===null
      ?"Aucun produit n'a à la fois un prix initial du lot documenté et une économie calculable aujourd'hui pour ce canal. Les coupons sans prix fiable sont listés plus bas, sans être présentés comme de bonnes affaires chiffrées."
      :"Aucune promotion dont le prix initial ET l'économie sont calculables dans ce budget. Les annonces sans tarif complet restent des pistes, pas des achats validés.");
  els.dailyPriceSpots.innerHTML=digest.priceSpots.length
    ?digest.priceSpots.map((item)=>`<article class="card daily-offer daily-price-spot">
      <div class="card-head"><h4>${escapeHtml(item.title)}</h4>
        <span class="badge">Annonce magasin</span></div>
      <p><strong>Prix annoncé : ${money.format(item.advertisedPrice)} /
        ${escapeHtml(item.priceUnit)}</strong></p>
      <p class="help">Annonce relevée le ${formatDate(item.verifiedAt)} ·
        valable selon annonce jusqu'au ${formatDate(item.expiresAt)}.
        Produit, quantité, poids et prix dans le magasin choisi à vérifier.
        <strong>Pas de pourcentage d'économie calculé.</strong>
        ${digest.maxSpend!==null
          ?"Le prix unitaire ne prouve pas que l'achat complet respecte votre budget."
          :""}
      </p>
      <a class="open" href="${escapeHtml(item.sourceUrl)}"
        target="_blank" rel="noopener noreferrer">Vérifier le prix officiel</a>
    </article>`).join("")
    :fallback("Aucun prix alimentaire chiffré pour un produit nommé n'a été vérifié dans les campagnes datées de ce magasin et de ce canal.");
  els.dailyRetailer.innerHTML=digest.retailer.length
    ?digest.retailer.map(renderPick).join("")
    :fallback("Aucune promotion produit de cette enseigne n'a de preuve active exploitable pour ce canal. "+
      (unconfirmedRetailerCount
        ? unconfirmedRetailerCount+" ancienne(s) candidate(s) apparaissent dans la section « À vérifier aujourd'hui » (si budget illimité), ou dans l'onglet Offres avec le filtre « Toutes, y compris non reconfirmées ». Aucune économie correspondante n'est garantie. "
        : "")+
      "Consulte le catalogue officiel pour les offres locales.");
  els.dailyUnconfirmed.innerHTML=digest.unconfirmed.length
    ?digest.unconfirmed.map((item)=>{
      const priorRate=Number.isFinite(item.historicalRate)
        ? "Remise annoncée lors du dernier relevé : "+
          formatPercent(item.historicalRate)+" sur le lot requis." : null;
      const formerPrice=Number.isFinite(item.historicalUpfront)
        ? "Ancien coût initial indicatif du lot : "+
          money.format(item.historicalUpfront)+" (non actuel)." : null;
      const formerSaving=Number.isFinite(item.historicalSavingAmount)
        ? "Ancienne économie théorique du lot : "+
          money.format(item.historicalSavingAmount)+" (non confirmée)." : null;
      const minQty=item.minQuantity>1
        ? item.minQuantity+" produits nécessaires d'après l'ancienne annonce."
        : "Un produit éligible selon l'ancienne annonce.";
      return `<article class="card daily-offer daily-unconfirmed">
        <div class="card-head"><div>
          <h4>${escapeHtml(item.title)}</h4>
          <div class="source">${escapeHtml(item.provider)}</div>
        </div><span class="badge warn">Non reconfirmée</span></div>
        <p class="help">Ancienne preuve : ${formatDate(item.lastProofAt)}
          ${item.advertisedUntil?" · fin annoncée "+formatDate(item.advertisedUntil):""}.
          ${item.lastAttemptAt
            ? "Nouvelle lecture infructueuse le "+formatDateTime(item.lastAttemptAt)+"."
            : "Source non reconfirmée."}
        </p>
        <p><strong>À vérifier auprès du magasin avant achat.</strong></p>
        ${priorRate?`<p class="help">${escapeHtml(priorRate)}</p>`:""}
        ${formerPrice?`<p class="help">${escapeHtml(formerPrice)}</p>`:""}
        ${formerSaving?`<p class="help">${escapeHtml(formerSaving)}</p>`:""}
        <p class="help">${escapeHtml(minQty)} ·
          ${item.hasExactEan
            ?"Code EAN documenté historiquement, éligibilité locale non confirmée."
            :"Référence de gamme et magasin à confirmer."}
        </p>
        <a class="open" href="${escapeHtml(item.sourceUrl)}"
          target="_blank" rel="noopener noreferrer">Vérifier le catalogue</a>
      </article>`;
    }).join("")
    :fallback(digest.maxSpend!==null && unconfirmedRetailerCount
      ?"Aucun ancien prix ne suffit à garantir votre plafond de dépenses. Retirez le filtre budget pour consulter les "+
        unconfirmedRetailerCount+" piste(s) non reconfirmée(s), sans les confondre avec les offres valides."
      : "Aucune ancienne promotion encore dans sa période annoncée ne nécessite de revérification pour ce magasin et ce canal.");
  els.dailyExtras.innerHTML=digest.extra.length
    ?digest.extra.map(renderPick).join("")
    :fallback("Aucun remboursement public suffisamment récent à proposer pour ce canal.");
  // The same priced food stays in the dedicated evidence section, not
  // repeated among generic second-item marketing campaigns below.
  const generalCampaigns=digest.campaigns.filter((item)=>
    !digest.priceSpots.some((priced)=>priced.id===item.id));
  els.dailyCampaigns.innerHTML=generalCampaigns.length
    ?generalCampaigns.map((item)=>{
      const illustrative=Number.isFinite(item.illustrativeBasketPercent)
        ? `<p class="help"><strong>Plafond indicatif sur le lot : ${formatPercent(item.illustrativeBasketPercent)}</strong>
            pour ${item.illustrativeQuantity} articles de même prix, si la réduction maximale annoncée s'applique.
            Ce n'est ni une remise garantie, ni un taux sur votre panier réel.</p>`
        : "";
      const purchaseThreshold=Number.isFinite(item.minimumPurchase)
        ? `<p class="help"><strong>Minimum d'achat annoncé : ${money.format(item.minimumPurchase)}</strong>
            sur la sélection éligible, sans garantie d'avantage fidélité.</p>` : "";
      const noExactPrice=digest.maxSpend!==null
        ? '<p class="help">Prix exact du lot non établi : cette piste n’est pas validée comme compatible avec le plafond choisi.</p>'
        : "";
      const announcedPrice=Number.isFinite(item.advertisedPrice)
        ? `<p class="help"><strong>Prix publicitaire : ${money.format(item.advertisedPrice)} / ${escapeHtml(item.priceUnit)}</strong>
            · magasin, quantité et tarif final à confirmer.</p>` : "";
      const catalogueOnly=item.id.startsWith("carrefour-public-lead-brochure-");
      return `<article class="card daily-offer">
        ${catalogueOnly?'<span class="badge">Prospectus alimentaire du jour</span>':""}
        <h4>${escapeHtml(item.title)}</h4>
        <p>${escapeHtml(item.claim)}</p>
        ${illustrative}${announcedPrice}${purchaseThreshold}${noExactPrice}
        <p class="help">Annonce consultée le ${formatDate(item.verifiedAt)}
          · fin annoncée le ${formatDate(item.expiresAt)}.
          <strong>Aucun gain panier calculé.</strong></p>
        <a class="open" href="${escapeHtml(item.sourceUrl)}"
           target="_blank" rel="noopener noreferrer">Vérifier la campagne officielle</a>
        ${item.detailsUrl ? `<a class="open" href="${escapeHtml(item.detailsUrl)}"
           target="_blank" rel="noopener noreferrer">Voir les produits de cette sélection</a>` : ""}
      </article>`;
    }).join("")
    :fallback("Aucune campagne datée et contrôlée depuis 7 jours pour ce canal. Les annonces trop anciennes sont masquées : consulte le catalogue officiel pour les promotions du jour.");
  // Independent public index. A Bonial flyer cannot supply exact prices.
  const alternatives=selectAlternativeCatalogues({
    catalogues:state.dailyAlternatives,store:state.store,
    channel:state.channel,now:today
  });
  if(els.dailyAlternativeCatalogues){
    const cards=alternatives.map((item)=>
      '<article class="card daily-offer">'+
      '<span class="badge">Bonial · source tierce</span>'+
      '<h4>'+escapeHtml(item.title)+'</h4>'+
      '<p class="help">Période annoncée : '+formatDate(item.startsAt)+
      ' au '+formatDate(item.expiresAt)+'. Relevé Bonial du '+
      formatDate(item.verifiedAt)+'.</p>'+
      '<p class="help">Vérifier les produits alimentaires du prospectus et la participation du magasin. '+
      '<strong>Aucun prix exact ni gain en caisse confirmé.</strong></p>'+
      '<a class="open" href="'+escapeHtml(item.sourceUrl)+
      '" target="_blank" rel="noopener noreferrer">Voir sur Bonial</a></article>'
    ).join("");
    els.dailyAlternativeCatalogues.innerHTML=state.store!=="carrefour" || state.channel!=="store"
      ? '<p class="panel help">Ces catalogues concernent Carrefour en magasin. Les offres Drive peuvent différer.</p>'
      : cards || '<p class="panel help">Aucun prospectus Bonial actuel et contrôlé récemment. '+
        'La consultation manuelle reste possible via le lien Bonial ci-dessus.</p>';
  }
  if(els.brochureCompareForm){
    const accessible=state.store==="carrefour" && state.channel==="store"
      && alternatives.length>0;
    els.brochureCompareForm.classList.toggle("hidden",!accessible);
    els.brochureProductCode.disabled=!accessible;
    els.brochureScanButton.disabled=!accessible;
    if(!accessible) els.brochureCompareStatus.textContent="";
  }
  renderFoodRefundExplorer();
}

// Bookmarks never turn a source listing into an activated or payable rebate.
// Store only stable source IDs. All displayed text and links are resolved
// afresh from the currently reviewable, official provider inventory.
function saveFoodRefundIds(next){
  const safe=normalizeSavedFoodRefundIds(next);
  try{
    localStorage.setItem(FOOD_REFUND_SAVED_KEY,JSON.stringify(safe));
    savedFoodRefundIds=safe;
    renderFoodRefundExplorer();
  }catch{
    els.foodRefundSavedStatus.textContent=
      "Impossible d’enregistrer sur cet appareil : stockage local indisponible.";
  }
}
function handleFoodRefundSavedClick(event){
  const target=event.target;
  if(!(target instanceof Element)) return;
  const button=target.closest("button[data-food-refund-id]");
  if(!button || !event.currentTarget.contains(button)) return;
  const id=button.dataset.foodRefundId;
  const isSaved=savedFoodRefundIds.includes(id);
  if(!isSaved){
    const now=new Date();
    const current=selectFoodRefundOpportunities({
      offers:resolveOffersForLoyalty(activeOffers(),state.loyaltyProfile),
      store:state.store,channel:state.channel,now,limit:240
    });
    if(!current.items.some((item)=>item.id===id)) return;
    if(savedFoodRefundIds.length>=40){
      els.foodRefundSavedStatus.textContent=
        "La liste est limitée à 40 offres. Retire une ancienne sélection avant d’en ajouter.";
      return;
    }
  }
  saveFoodRefundIds(isSaved
    ?savedFoodRefundIds.filter((item)=>item!==id)
    :[...savedFoodRefundIds,id]);
}

// The public manufacturers' refund inventory is independent of daily
// affordability ranking: an unknown checkout price must remain UNKNOWN.
function renderFoodRefundExplorer(){
  if(!els.foodRefundDeals) return;
  const selected=selectFoodRefundOpportunities({
    offers:resolveOffersForLoyalty(activeOffers(),state.loyaltyProfile),
    store:state.store,channel:state.channel,
    now:new Date(),provider:els.foodRefundProvider.value,
    search:els.foodRefundSearch.value,sort:els.foodRefundSort.value,
    limit:foodRefundState.limit
  });
  const shown=selected.items.length;
  const saved=selectSavedFoodRefunds({
    savedIds:savedFoodRefundIds,
    offers:resolveOffersForLoyalty(activeOffers(),state.loyaltyProfile),
    store:state.store,channel:state.channel,now:new Date()
  });
  els.foodRefundSavedStatus.textContent=saved.total
    ?saved.available.length+" favori(s) encore proposé(s) pour ce magasin et ce canal, "+
      saved.unavailableCount+" non proposé(s) ici, expiré(s) ou à reconfirmer. "+
      "Aucun montant de remboursement n'est garanti."
    :"Aucun remboursement enregistré sur cet appareil.";
  els.foodRefundSaved.innerHTML=saved.available.length
    ?saved.available.map((item)=>`<article class="card daily-offer">
      <h4>${escapeHtml(item.title)}</h4>
      <p class="help">${escapeHtml(item.provider)} · Relevé du ${formatDate(item.verifiedAt)}.
        Offre à revérifier avant achat ; ni activation ni économie confirmée.</p>
      <div class="daily-links">
        <a class="open" href="${escapeHtml(item.sourceUrl)}"
          target="_blank" rel="noopener noreferrer">Consulter les conditions officielles</a>
        <button class="secondary" type="button"
          data-food-refund-id="${escapeHtml(item.id)}">Retirer de ma liste</button>
      </div>
    </article>`).join("")
    :'<p class="panel help">Sélectionne « Ajouter à ma liste » dans les offres ci-dessous. Les favoris qui ont expiré ou ne sont plus valables pour ce canal ne s’affichent pas comme actifs.</p>';
  els.foodRefundCopy.disabled=saved.available.length===0;
  els.foodRefundPrune.classList.toggle("hidden",saved.unavailableCount===0);
  els.foodRefundPrune.disabled=saved.unavailableCount===0;
  els.foodRefundStatus.textContent=shown+" sur "+selected.total+
    " remboursement(s) alimentaire(s) candidat(s) correspondant aux critères. "+
    "Données de source encore dans leur fenêtre de vérification, pas de disponibilité ni de remboursement garantis. "+
    "Le plafond de dépenses principal n'est pas appliqué : le prix d'achat doit être vérifié.";
  els.foodRefundDeals.innerHTML=shown
    ?selected.items.map((item)=>{
      const nominal=Number.isFinite(item.savingAmount)
        ?money.format(item.savingAmount)+" de remboursement annoncé"
        :Number.isFinite(item.savingPercent)
          ?formatPercent(item.savingPercent)+" de remboursement annoncé"
          :"Remboursement à confirmer";
      const price=Number.isFinite(item.upfrontCost)&&item.upfrontCost>0
        ?"Ancien prix de référence du lot : "+money.format(item.upfrontCost)+
          " (prix réel en caisse non garanti)."
        :"Prix du lot à avancer inconnu ; budget et gain net non calculables.";
      const quantity="Minimum "+item.minQuantity+" article(s) de la gamme éligible.";
      const deadline=item.merchantExpiry
        ?"Fin annoncée : "+formatDate(item.merchantExpiry)+". "
        :"";
      const review=item.reviewAfter
        ?"Prochaine limite de vérification des données : "+
          formatDate(item.reviewAfter)+". ":"";
      return `<article class="card daily-offer">
        <div class="card-head"><div>
          <h4>${escapeHtml(item.title)}</h4>
          <div class="source">${escapeHtml(item.provider)}</div>
        </div><span class="badge">À confirmer</span></div>
        <p><strong>${escapeHtml(nominal)}</strong></p>
        <p class="help">${escapeHtml(quantity)}
          ${item.hasExactEan?"EAN sourcé ; éligibilité à confirmer.":"EAN exact et variantes à contrôler."}
          ${escapeHtml(price)}</p>
        ${item.requiresUnlock
          ?`<p class="help"><strong>Offre à débloquer avant achat :</strong>
            ${escapeHtml(item.unlockConditions||"Vérifier les prérequis dans l'application du fournisseur.")}</p>`
          :""}
        ${item.conditions?`<p class="help">${escapeHtml(item.conditions)}</p>`:""}
        <p class="help">Source relevée le ${formatDate(item.verifiedAt)}.
          ${escapeHtml(deadline+review)}
          Activation, ticket, exclusions et cumul à vérifier auprès du service.
          Aucun remboursement n'est déduit du panier.</p>
        <div class="daily-links">
          <a class="open" href="${escapeHtml(item.sourceUrl)}"
            target="_blank" rel="noopener noreferrer">Vérifier les conditions officielles</a>
          <button type="button" class="secondary"
            data-food-refund-id="${escapeHtml(item.id)}"
            aria-pressed="${savedFoodRefundIds.includes(item.id)}">${savedFoodRefundIds.includes(item.id)
              ?"Enregistré · retirer":"Ajouter à ma liste"}</button>
        </div>
      </article>`;
    }).join("")
    :'<p class="panel help">Aucun remboursement alimentaire actuellement documenté pour ces filtres. Essayez une autre enseigne, un autre canal ou un mot-clé différent. Cette absence ne prouve pas qu’aucune offre existe.</p>';
  els.foodRefundMore.classList.toggle("hidden",shown>=selected.total);
  els.foodRefundMore.disabled=shown>=selected.total;
  if(shown<selected.total) els.foodRefundMore.textContent=
    "Afficher "+Math.min(24,selected.total-shown)+" autres offres";
}

async function hydrateDailyCampaigns(){
  try{
    const response=await fetch("./data/daily-campaigns.json",{
      cache:"no-store",signal:AbortSignal.timeout(8000)
    });
    if(!response.ok) throw new Error("HTTP "+response.status);
    const data=await response.json();
    state.dailyCampaigns=Array.isArray(data?.campaigns)?data.campaigns:[];
    state.dailyAlternatives=Array.isArray(data?.alternativeCatalogues)
      ?data.alternativeCatalogues:[];
    state.dailyFeedCheckedAt=data?.checkedAt || null;
    state.dailyFeedLastAttemptAt=data?.lastAttemptAt || null;
    state.dailySourceChecks=data?.sourceChecks && typeof data.sourceChecks==="object"
      && !Array.isArray(data.sourceChecks) ? data.sourceChecks:{};
  }catch{
    state.dailyCampaigns=[];
    state.dailyAlternatives=[];
    state.dailyFeedCheckedAt=null;
    state.dailyFeedLastAttemptAt=null;
    state.dailySourceChecks={};
  }
  renderDailyCatalogue();
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
    ? `<span class="badge ${offer.loyaltyEligibility==="eligible"?"good":"warn"}">${offer.loyaltyEligibility==="eligible"?"Carte renseignée":offer.loyaltyEligibility==="activation-unverified"?"Activation/éligibilité à vérifier":"Carte à confirmer"}</span>`
    : "";
  const sourceWarning=offer.sourceSyncWarning
    ? `<span class="badge warn">Source non reconfirmée le ${formatDate(offer.sourceSyncWarning.checkedAt)} · vérifier avant achat</span>`
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
        ${sourceWarning}
        ${deadlineBadge}
      </div>
      <div class="meta">
        <div><span>Économie en €</span>${amount===null?"Dépend du prix":money.format(amount)}</div>
        <div><span>Vérifié</span>${formatDate(offer.verifiedAt)}</div>
      </div>
      ${simulated}
      ${offer.sourceSyncWarning
        ? `<p class="conditions">La dernière synchronisation de cette source n'a pas pu confirmer l'offre : ${escapeHtml(offer.sourceSyncWarning.reason)}. Ne pas anticiper cette économie avant vérification.</p>`
        : ""}
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
        // A retailer may block automated reading yet still publish a useful
        // official catalogue for manual consultation on the shopper's phone.
        // This link is NOT a replacement for verified SKU and price data.
        const isPhysicalStore=state.channel==="store";
        const catalogLink=item.providerIds?.includes("carrefour")
          ? isPhysicalStore
            ? {url:"https://www.carrefour.fr/catalogue",label:"catalogues magasin Carrefour"}
            : {url:"https://www.carrefour.fr/promotions",label:"promotions Carrefour Drive/livraison"}
          : item.providerIds?.includes("leclerc")
            ? isPhysicalStore
              ? {url:"https://www.e.leclerc/prospectus",label:"catalogues magasin E.Leclerc"}
              : {url:"https://www.leclercdrive.fr/",label:"promotions E.Leclerc DRIVE/livraison"}
            : null;
        const sourceNotConfirmed=item.status==="stale"
          || item.status==="sync-warning"
          || ["unavailable","partial"].includes(item.syncState?.status);
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
              ${item.syncAffectedCount>0
                ? `<span class="sync-affected-count"><b>${item.syncAffectedCount}</b> sous alerte de synchronisation (gain non garanti)</span>`
                : ""}
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
            ${catalogLink && sourceNotConfirmed ? `
              <p class="conditions">
                L'import automatique de ces promotions n'a pas apporté de preuve suffisante.
                <a class="open" href="${catalogLink.url}" target="_blank" rel="noopener noreferrer">
                  Ouvrir les ${catalogLink.label} officiels
                </a>.
                ${item.providerIds?.includes("carrefour") ? `
                  <a class="open" href="https://www.carrefour.fr/offres-du-moment"
                     target="_blank" rel="noopener noreferrer">
                    Voir aussi les offres Carrefour du moment
                  </a> : ces annonces ne prouvent pas un prix final.` : ""}
                ${isPhysicalStore
                  ? "Choisissez votre magasin et vérifiez la période ainsi que les produits éligibles"
                  : "Sélectionnez votre Drive ou lieu de livraison puis vérifiez le tarif et les produits réellement éligibles"} :
                aucun gain n'est ajouté au panier sur la base de ce lien.
              </p>` : ""}
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

function abortProductLookup(){
  const controller=productLookupController;
  productLookupController=null;
  if(productLookupTimeout!==null) clearTimeout(productLookupTimeout);
  productLookupTimeout=null;
  els.cancelBarcodeLookup.classList.add("hidden");
  controller?.abort();
}

function clearProductLookupView(){
  state.product=null;
  state.priceObservations=[];
  els.productResult.innerHTML="";
  els.productResult.classList.add("hidden");
  els.productOffers.innerHTML="";
  els.priceResults.innerHTML="";
  els.productPriceHistory.innerHTML="";
}

async function lookupBarcode(rawValue){
  abortProductLookup();
  let code;
  try{
    code=normalizeBarcode(rawValue);
  }catch(error){
    ++state.lookupToken;
    state.productCode=null;
    invalidateExactSkuComparison();
    clearProductLookupView();
    els.compareExactSku.disabled=true;
    setProductStatus(error.message,true);
    return;
  }
  state.productCode=code;
  els.barcode.value=code;
  clearProductLookupView();
  const token=++state.lookupToken;
  ++state.skuCompareToken;
  els.exactSkuComparison.innerHTML="";
  els.compareExactSku.disabled=true;
  setProductStatus("Recherche du produit et des prix…");
  els.productResult.classList.add("hidden");
  els.productOffers.innerHTML="";
  els.priceResults.innerHTML="";
  state.priceObservations=[];

  const controller=new AbortController();
  productLookupController=controller;
  els.cancelBarcodeLookup.classList.remove("hidden");
  let timedOut=false;
  // Bound each provider independently: keep a successful product if its
  // price source stalls, while cancelling both requests at the deadline.
  const deadline=new Promise((_,reject)=>{
    productLookupTimeout=setTimeout(()=>{
      timedOut=true;
      controller.abort();
      reject(new DOMException("Délai de recherche dépassé.","TimeoutError"));
    },PRODUCT_LOOKUP_TIMEOUT_MS);
  });
  const [productResult,pricesResult]=await Promise.allSettled([
    Promise.race([fetchProductByBarcode(code,fetch,{signal:controller.signal}),deadline]),
    Promise.race([fetchPricesByBarcode(code,{...priceQueryOptions(),signal:controller.signal,
      alternateGtins:true}),deadline])
  ]);
  if(token!==state.lookupToken) return;
  clearTimeout(productLookupTimeout);
  productLookupTimeout=null;
  productLookupController=null;
  els.cancelBarcodeLookup.classList.add("hidden");
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

  if(timedOut){
    setProductStatus("Recherche limitée à 15 secondes. Certains résultats peuvent manquer : réessayez si nécessaire.",true);
  }else if(productResult.status==="rejected" && pricesResult.status==="rejected"){
    setProductStatus("Les deux sources ouvertes sont momentanément indisponibles.",true);
  }else{
    setProductStatus("");
  }
}

async function refreshPrices(code){
  const token=++state.lookupToken;
  setProductStatus("Actualisation des prix pour cette enseigne…");
  try{
    const result=await fetchPricesByBarcode(code,{...priceQueryOptions(),alternateGtins:true});
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

// A postal code may cover several towns. Never silently pick the most
// populous municipality: comparison geography must reflect explicit choice.
function clearComparisonArea(clearInput=true){
  ++comparisonArea.lookupToken;
  comparisonArea.controller?.abort();
  comparisonArea.controller=null;
  comparisonArea.commune=null;
  comparisonArea.postcode="";
  comparisonArea.candidates=[];
  comparisonArea.pendingZip="";
  els.exactSkuAreaSearch.disabled=false;
  els.exactSkuAreaCommuneField.classList.add("hidden");
  els.exactSkuAreaCommune.replaceChildren(new Option("Choisir une commune…",""));
  if(clearInput) els.exactSkuAreaPostcode.value="";
  invalidateExactSkuComparison();
  if(clearInput){
    els.exactSkuAreaStatus.textContent="Secteur effacé. "+
      (state.nearbyEnabled && state.coords
        ?"La comparaison utilisera la position GPS déjà activée, sauf désactivation de « Autour de moi »."
        :"La prochaine comparaison pourra examiner des magasins ailleurs en France.");
  }
}

function applyComparisonArea(place,postcode){
  // Only validated public municipality data can become an origin.
  if(!/^[0-9]{5}$/.test(postcode) || !/^[0-9A-Z]{5}$/.test(place?.code||"")
    || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)
    || Math.abs(place.latitude)>90 || Math.abs(place.longitude)>180
    || typeof place.nom!=="string" || place.nom.length>100) return;
  comparisonArea.commune={
    code:place.code,nom:place.nom,
    latitude:place.latitude,longitude:place.longitude
  };
  comparisonArea.postcode=postcode;
  comparisonArea.candidates=[];
  comparisonArea.pendingZip="";
  els.exactSkuAreaCommuneField.classList.add("hidden");
  invalidateExactSkuComparison();
  els.exactSkuAreaStatus.textContent=
    "Secteur choisi : "+place.nom+" ("+postcode+"), rayon "+
    comparisonArea.radiusKm+" km autour du centre communal approximatif. "+
    "Le GPS n'a pas été demandé. Appuyez sur « Comparer cet EAN ».";
}

async function searchComparisonAreaPostcode(){
  const postcode=els.exactSkuAreaPostcode.value.trim();
  clearComparisonArea(false);
  if(!/^[0-9]{5}$/.test(postcode)){
    els.exactSkuAreaStatus.textContent="Saisir un code postal valide de cinq chiffres.";
    return;
  }
  const token=++comparisonArea.lookupToken;
  const controller=new AbortController();
  comparisonArea.controller=controller;
  els.exactSkuAreaSearch.disabled=true;
  els.exactSkuAreaStatus.textContent="Recherche des communes du code postal "+postcode+"…";
  const timer=setTimeout(()=>controller.abort(),9000);
  try{
    const places=await lookupPostalCodeCommunes(postcode,{signal:controller.signal});
    if(token!==comparisonArea.lookupToken || controller.signal.aborted
      || els.exactSkuAreaPostcode.value.trim()!==postcode) return;
    if(!places.length){
      els.exactSkuAreaStatus.textContent=
        "Aucune commune identifiée pour ce code postal. La comparaison reste non localisée.";
    }else if(places.length===1){
      applyComparisonArea(places[0],postcode);
    }else{
      comparisonArea.candidates=places;
      comparisonArea.pendingZip=postcode;
      els.exactSkuAreaCommune.replaceChildren(new Option("Choisir une commune…",""));
      for(const place of places){
        els.exactSkuAreaCommune.add(new Option(place.nom,place.code));
      }
      els.exactSkuAreaCommuneField.classList.remove("hidden");
      els.exactSkuAreaStatus.textContent=places.length+
        " communes possibles pour "+postcode+
        ". Choisissez la bonne ; aucun secteur n'est appliqué avant votre choix.";
    }
  }catch(error){
    if(token!==comparisonArea.lookupToken) return;
    els.exactSkuAreaStatus.textContent=controller.signal.aborted
      ?"Recherche des communes interrompue. Réessayez."
      :"Référentiel des communes indisponible : aucun secteur n'a été appliqué.";
  }finally{
    clearTimeout(timer);
    if(token===comparisonArea.lookupToken){
      comparisonArea.controller=null;
      els.exactSkuAreaSearch.disabled=false;
    }
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
    `<div class="panel price-source" role="status">
      <p>${deep
        ? "Recherche approfondie des relevés Carrefour et E.Leclerc (jusqu’à 3 pages par requête)…"
        : "Comparaison des relevés Carrefour et E.Leclerc pour ce même EAN…"
      }</p>
      <button type="button" class="secondary" data-action="cancel-exact-sku">Annuler la recherche</button>
    </div>`;
  const locality=comparisonArea.commune;
  // The manual municipality search overrides GPS only for this two-retailer
  // comparison. Never use a postcode alone as geographic coordinates.
  const options=locality ? {
    coords:{latitude:locality.latitude,longitude:locality.longitude},
    radiusKm:comparisonArea.radiusKm
  } : priceQueryOptions();
  const areaNote=locality
    ? "Secteur demandé : "+locality.nom+" ("+comparisonArea.postcode+
      "), rayon "+comparisonArea.radiusKm+
      " km autour du centre communal approximatif ; chaque relevé est "+
      "contrôlé localement dans ce rayon."
    : state.nearbyEnabled && state.coords
      ? "Recherche dans un rayon de "+state.radiusKm+
        " km autour de la position GPS autorisée."
      : "Aucun secteur choisi : les deux magasins des relevés comparés "+
        "doivent être proches entre eux, mais peuvent se trouver n'importe où en France.";
  const stores=["carrefour","leclerc"];
  const controller=new AbortController();
  skuComparisonController=controller;
  // Network stalls are especially disruptive on mobile data connections.
  // A bounded request also ensures that the compare button is re-enabled.
  const timeout=setTimeout(()=>controller.abort(),EXACT_SKU_TIMEOUT_MS);
  // Carrefour/E.Leclerc share an Open Prices product-code endpoint; the
  // filtering remains retailer-specific but each identical page is fetched
  // and decoded only once during this comparison.
  const sharedFetch=createSharedPriceFetch();
  let fetched;
  try{
    fetched=await Promise.allSettled(stores.map((store)=>
      fetchPricesByBarcode(code,{...options,store,
        signal:controller.signal,fetchImpl:sharedFetch,alternateGtins:true,
        aliasFreshnessDays:7,
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
        pagesFetched:entry.value.pagesFetched,
        aliasQueries:entry.value.aliasQueries,
        aliasRecovered:entry.value.aliasRecovered
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
  els.exactSkuComparison.innerHTML=renderExactSkuComparison(comparison,errors,{deep,areaNote});
}

function openPricesReceiptLink(observation,label){
  const url=priceObservationPublicUrl(observation?.id);
  return url
    ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
    : "";
}

/**
 * Only source-supplied OUTLET coordinates become a map marker. Never embed
 * the user's GPS, postcode centre or current coordinates into external URLs.
 * The price and location are independently contributed, not verified stock.
 */
function renderComparedOutlet(observation,store){
  const mapUrl=priceOutletMapUrl(observation);
  const place=[observation.storeName,observation.postcode,observation.city]
    .filter((value)=>typeof value==="string" && value.trim())
    .map((value)=>escapeHtml(value)).join(" · ");
  const distance=observation.distanceKm;
  const distanceText=typeof distance==="number" && Number.isFinite(distance)
    && distance>=0
    ? '<span>À '+escapeHtml(distance.toLocaleString("fr-FR",{maximumFractionDigits:1}))+
      ' km du point de recherche, à vol d’oiseau.</span>'
    : '<span>Distance au secteur non renseignée.</span>';
  return '<div class="exact-sku-pair-outlet">'+
    '<strong>'+escapeHtml(storeLabel(store))+
    ' · '+money.format(Number(observation.price))+'</strong>'+
    '<span>'+place+'</span>'+
    '<span>Relevé du '+escapeHtml(formatDate(observation.date))+'</span>'+
    distanceText+
    (mapUrl ? '<a class="exact-sku-outlet-map" href="'+mapUrl+
      '" target="_blank" rel="noopener noreferrer">Voir le magasin indiqué sur OpenStreetMap</a>'
      : '<span>Position du magasin non vérifiable sur une carte.</span>')+
    '</div>';
}

function renderExactSkuComparison(result,errors=new Set(),{deep=false,areaNote=""}={}){
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
        ? `<strong>${money.format(row.price)}</strong><small>Relevé du ${escapeHtml(formatDate(observed.date))} · ${escapeHtml(observed.storeName)}${observed.city?" · "+escapeHtml(observed.city):""}${observed.isDiscounted===true?" · prix remisé ponctuel":""}</small>`
        : '<strong>Prix récent non disponible</strong>';
    const sourceLink=unresolved ? ""
      : openPricesReceiptLink(observed,"Consulter ce relevé sur Open Prices");
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
      ${coverage.aliasQueries ? `<span>Recherche élargie à ${coverage.aliasQueries} autre(s) forme(s) équivalente(s) du code UPC/EAN/GTIN.${coverage.aliasRecovered?" Des relevés ont été retrouvés.":" Aucun relevé complémentaire trouvé."}</span>` : ""}
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
      ${sourceLink ? `<p class="help exact-sku-source">${sourceLink}</p>` : ""}
      ${row.initialCost!==null
        ? `<p class="help exact-sku-initial-cost">Débours estimé avant remboursements pour ${escapeHtml(quantityLabel)} : <strong>${money.format(row.initialCost)}</strong> (prix communautaire indicatif).</p>`
        : ""}
      ${observed?.isDiscounted===true && result.quantity>1
        ? `<p class="help exact-sku-discount-warning">Prix remisé observé sur un ticket individuel : le coût pour ${escapeHtml(quantityLabel)} n'est pas projeté, car la remise et la disponibilité de plusieurs unités ne sont pas établies.</p>`
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
    "discounted-observation":"Comparaison de prix habituels impossible : au moins un relevé comprend une remise ponctuelle. Les prix observés restent visibles mais ne servent pas à désigner une enseigne moins chère.",
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
  const totalDifference=result.observedTotalPriceDifference;
  const quantityProjection=result.quantity>1 && result.observedQuantityTotals
    ? ` Pour ${quantityLabel}, écart indicatif hors promotions : ${money.format(totalDifference)}. Projection de prix unitaires, sans garantie de stock ni de quantité disponible.`
    : "";
  const best=result.channel!=="store"
    ? "Aucun tarif Drive ou livraison ne peut être déduit de relevés physiques. Les offres compatibles avec ce canal restent consultables."
    : confidence.comparable && result.lowerObservedStore
    ? `${incomplete ? "Parmi les relevés consultés, relevé inférieur" : "Relevé inférieur"} sur la paire comparable : ${storeLabel(result.lowerObservedStore)} (écart observé ${money.format(difference)} par unité).${quantityProjection} Il ne s'agit pas d'un prix actuel confirmé.`
    : confidence.comparable && difference===0
      ? `Les deux relevés comparables indiquent le même prix ; aucune enseigne n'est moins chère.${quantityProjection}`
      : comparabilityReasons[confidence.status]
        || "Aucune comparaison de prix fiable possible avec les relevés disponibles.";
  const comparedSourceLinks=paired ? [
    openPricesReceiptLink(paired.carrefour,"Carrefour (source)"),
    openPricesReceiptLink(paired.leclerc,"E.Leclerc (source)")
  ].filter(Boolean).join(" · ") : "";
  const pairedDetails=paired ? `<p>Relevés retenus pour la comparaison locale :
      Carrefour ${money.format(Number(paired.carrefour.price))} (${escapeHtml(formatDate(paired.carrefour.date))}, ${escapeHtml(paired.carrefour.storeName || "magasin non précisé")})
      · E.Leclerc ${money.format(Number(paired.leclerc.price))} (${escapeHtml(formatDate(paired.leclerc.date))}, ${escapeHtml(paired.leclerc.storeName || "magasin non précisé")}).
      ${result.quantity>1 && result.observedQuantityTotals
        ? `Projection pour ${escapeHtml(quantityLabel)} : Carrefour ${money.format(result.observedQuantityTotals.carrefour)} · E.Leclerc ${money.format(result.observedQuantityTotals.leclerc)} (hors remises, prix et stocks non garantis).`
        : ""}
      Les cartes ci-dessous montrent séparément le dernier prix observé de chaque enseigne : il peut être issu d'un autre magasin.
      ${comparedSourceLinks ? `Relevés comparés : ${comparedSourceLinks}.` : ""}</p>
    <div class="exact-sku-pair-outlets" role="group" aria-label="Points de vente des relevés comparés">
      ${renderComparedOutlet(paired.carrefour,"carrefour")}
      ${renderComparedOutlet(paired.leclerc,"leclerc")}
    </div>
    <p class="help">Positions renseignées par les contributeurs Open Prices, non confirmées par les commerçants.
      Les distances sont à vol d’oiseau, pas des itinéraires ; vérifiez l’adresse, les horaires et les prix avant de vous déplacer.
      Aucune position personnelle n’est transmise aux liens cartographiques.</p>` : "";
  return `<div class="exact-sku-header">
    <h3>Même produit, deux enseignes</h3>
    ${areaNote ? `<p class="help exact-sku-area-note">${escapeHtml(areaNote)}</p>` : ""}
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
  // The last product/store lookup may outlive a channel/radius change.
  // Never recycle a stale, cross-retailer or Drive-incompatible price.
  const bestObserved=selectProductOfferPriceObservation(observations,{
    productCode:product?.code,store:state.store,channel:state.channel,
    nearby:state.nearbyEnabled && Boolean(state.coords),
    radiusKm:state.radiusKm
  });
  const pricedForEstimate=bestObserved && bestObserved.isDiscounted!==true
    ? bestObserved.price : null;
  const eligibleEstimate=(entry)=>canEstimateProductOffer(entry,{
    channel:state.channel,observation:bestObserved,
    loyaltyProfile:state.loyaltyProfile
  });
  const matches=rankMatchedOffers(rawMatches,{
    price:pricedForEstimate,quantity:1,canEstimate:eligibleEstimate
  });
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
    const amountLine=potential!==null
      ? `Potentiel indicatif ≈ ${money.format(potential)} sur un relevé normal du ${formatDate(bestObserved.date)} (≤ 7 jours)`
      : !action.quantitySatisfied
        ? `Acheter au moins ${action.minQty} article(s) pour activer cette offre`
        : state.channel!=="store"
          ? "Aucun tarif de magasin physique utilisé pour ce canal Drive/livraison"
          : !bestObserved
            ? "Pas de prix normal exploitable datant de 7 jours maximum"
            : bestObserved.isDiscounted===true
              ? "Prix ponctuellement remisé : aucune seconde économie chiffrée"
              : !match.exact
                ? "Produit non confirmé par GTIN : économie non chiffrée"
                : offer.sourceSyncWarning
                  ? "Source non reconfirmée : économie non chiffrée"
                  : "Conditions de l'offre ou du magasin à confirmer : économie non chiffrée";
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
          ${offer.sourceSyncWarning
            ? '<span class="badge warn">Source non reconfirmée</span>' : ""}
          <span class="badge">${escapeHtml(storeLabel(state.store))}</span>
          <span class="badge ${action.quantitySatisfied?"good":"warn"}">${escapeHtml(quantityLine)}</span>
          ${offerDeadline(offer)?`<span class="badge ${offerDeadline(offer).urgent?"warn":""}">${escapeHtml(offerDeadline(offer).label)}</span>`:""}
        </div>
        <p class="match-note">${escapeHtml(safetyNote)}</p>
        ${offer.sourceSyncWarning
          ? `<p class="match-note">Cette source n'a pas reconfirmé l'offre lors de la dernière synchronisation (${formatDate(offer.sourceSyncWarning.checkedAt)}). Économie à vérifier manuellement.</p>`
          : ""}
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
      <p>Les correspondances non exactes sont des candidats à vérifier. Les économies ne sont chiffrées qu'avec un GTIN exact, un relevé normal des 7 derniers jours et des conditions d'offre suffisamment documentées, jamais à partir d'un prix Drive déduit d'un ticket de magasin. Une estimation reste non garantie.</p>
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
  const variantNote=metadata.aliasQueries
    ? `<div class="panel price-source">Code-barres recherché aussi sous ${metadata.aliasQueries} autre(s) format(s) équivalent(s) UPC/EAN/GTIN.${metadata.aliasRecovered?" Relevés additionnels trouvés.":" Aucun prix complémentaire trouvé."} Une autre représentation n’implique pas une promotion actuelle.</div>`
    : "";
  if(!observations.length){
    els.priceResults.innerHTML=`
      <div class="panel price-source">
        Aucun prix Open Prices trouvé pour ce code-barres chez ${storeLabel(state.store)}${state.nearbyEnabled?` dans un rayon de ${state.radiusKm} km`:""}.
        Cela ne signifie pas que le produit n'y est pas vendu : la base est communautaire et encore incomplète.
      </div>${coverageNote}${variantNote}`;
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
    ${variantNote}
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
  els.manualPriceDate.max=parisCivilDay(new Date());
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
    const today=parisCivilDay(new Date());
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
    const restored=[];
    const keys=new Map();
    // Local lists saved by older versions may contain UPC-A/EAN-13/GTIN-14
    // aliases of the same GS1 product. Merge only when the 99-unit ceiling
    // allows it; never silently discard quantities exceeding that ceiling.
    for(const item of parsed.filter((value)=>value?.product?.code).slice(0,30)){
      const code=String(item.product.code);
      const quantity=normalizeQuantity(item.quantity);
      const key=canonicalGtin(code)||code;
      const index=keys.get(key);
      if(index!==undefined && restored[index].quantity+quantity<=99){
        restored[index].quantity+=quantity;
      }else{
        if(index===undefined) keys.set(key,restored.length);
        restored.push({product:item.product,quantity});
      }
    }
    return restored;
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
  cancelBasketPriceRefresh();
  const code=state.product.code;
  const key=canonicalGtin(code)||String(code);
  const existing=state.shoppingList.find((item)=>
    (canonicalGtin(item.product.code)||String(item.product.code))===key
  );
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
  // Keep the original list barcode for remote product URLs, basket pricing
  // and manual-price keys. A later equivalent scan must not create an
  // orphan price entry under another representation.
  const listCode=existing?.product.code || code;
  state.basketPriceData[state.store][listCode]=state.priceObservations;
  saveShoppingList();
  renderShoppingList();
  setProductStatus(existing
    ? "Même GTIN déjà présent : quantité mise à jour dans la liste."
    : "Produit ajouté à la liste.");
}

function handleShoppingListAction(event){
  const button=event.target.closest("[data-list-action]");
  if(!button) return;
  const code=button.dataset.code;
  const index=state.shoppingList.findIndex((item)=>item.product.code===code);
  if(index<0) return;
  cancelBasketPriceRefresh();
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
  els.cancelRefreshList.classList.remove("hidden");
  const refreshToken=++basketRefreshToken;
  const controller=new AbortController();
  basketRefreshController=controller;
  const listSnapshot=[...state.shoppingList];
  const queryOptionsByStore={
    carrefour:basketQueryOptions("carrefour"),
    leclerc:basketQueryOptions("leclerc")
  };
  const next={carrefour:{},leclerc:{}};
  let failures=0;
  let interruptedRequests=0;
  let limitedRequests=0;
  // Cache duplicate product-code pages only for this explicit refresh.
  // Each retailer still gets its own filtered receipts and coverage state.
  const sharedFetch=createSharedPriceFetch();

  try{
    for(let index=0;index<listSnapshot.length;index+=1){
      if(controller.signal.aborted || refreshToken!==basketRefreshToken) return;
      const item=listSnapshot[index];
      setListStatus(`Actualisation ${index+1}/${listSnapshot.length} : ${item.product.name || item.product.code}…`);
      const [carrefour,leclerc]=await Promise.allSettled([
        fetchPricesByBarcode(item.product.code,{
          ...queryOptionsByStore.carrefour,fetchImpl:sharedFetch,
          signal:controller.signal
        }),
        fetchPricesByBarcode(item.product.code,{
          ...queryOptionsByStore.leclerc,fetchImpl:sharedFetch,
          signal:controller.signal
        })
      ]);
      if(controller.signal.aborted || refreshToken!==basketRefreshToken) return;
      if(carrefour.status==="fulfilled"){
        next.carrefour[item.product.code]=carrefour.value.observations;
        if(carrefour.value.partial) interruptedRequests+=1;
        else if(carrefour.value.searchIncomplete) limitedRequests+=1;
        recordProductObservation(item.product,"carrefour",carrefour.value.observations);
      }else { next.carrefour[item.product.code]=[]; failures+=1; }
      if(leclerc.status==="fulfilled"){
        next.leclerc[item.product.code]=leclerc.value.observations;
        if(leclerc.value.partial) interruptedRequests+=1;
        else if(leclerc.value.searchIncomplete) limitedRequests+=1;
        recordProductObservation(item.product,"leclerc",leclerc.value.observations);
      }else { next.leclerc[item.product.code]=[]; failures+=1; }
    }
    if(controller.signal.aborted || refreshToken!==basketRefreshToken) return;
    state.basketPriceData=next;
    // A successful HTTP response may still cover only the first few pages.
    // Missing pages and outright provider failures must lower budget confidence.
    state.basketPriceCoverageIncomplete=failures>0
      || interruptedRequests>0 || limitedRequests>0;
    const scenarios=evaluateCurrentBasketScenarios();
    recordComparisonHistory(scenarios);
    renderShoppingList();
    const locality=state.nearbyEnabled ? ` dans un rayon de ${state.radiusKm} km` : " sans filtre géographique";
    setListStatus(
      failures || interruptedRequests || limitedRequests
        ? `Actualisation indicative : ${failures} requête(s) indisponible(s), ${interruptedRequests} recherche(s) interrompue(s), ${limitedRequests} limitée(s) aux premières pages${locality}. Le total ne représente que les prix consultés.`
        : `Prix actualisés pour Carrefour et E.Leclerc${locality}.`,
      failures>0 || interruptedRequests>0 || limitedRequests>0
    );
  }finally{
    if(basketRefreshController===controller){
      basketRefreshController=null;
      state.basketRefreshing=false;
      els.refreshList.disabled=false;
      els.cancelRefreshList.classList.add("hidden");
    }
  }
}

function cancelBasketPriceRefresh(){
  basketRefreshToken+=1;
  const controller=basketRefreshController;
  if(!controller) return;
  basketRefreshController=null;
  controller.abort();
  state.basketRefreshing=false;
  els.refreshList.disabled=false;
  els.cancelRefreshList.classList.add("hidden");
  setListStatus("Actualisation annulée : la liste ou les paramètres ont changé. Relance la recherche de prix.",true);
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
  cancelBasketPriceRefresh();
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
    ? "PASS + Club renseignés : jusqu’à 15% possibles sur produits éligibles après activation et paiement PASS. Avantage crédité en cagnotte, non garanti sans vérification du produit et des exclusions."
    : c==="club"
      ? "Club Carrefour renseigné : jusqu’à 10% possibles en cagnotte après activation et confirmation du produit, du magasin et des exclusions. Non inclus automatiquement dans le gain garanti."
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
  const trendAge=trend ? priceFreshness(trend.latest) : null;
  const trendOutdated=trendAge && ["old","stale","unknown"].includes(trendAge.level);
  const trendDiscounted=trend?.latest?.isDiscounted===true;
  const trendTone=trendOutdated || trendDiscounted ? ""
    : trend?.direction==="down" ? "good" : trend?.direction==="up" ? "bad" : "";
  const trendHtml=trend
    ? `<div class="history-trend ${trendTone}">
        <strong>${trend.direction==="down"?"Baisse":trend.direction==="up"?"Hausse":"Stabilité"} observée</strong>
        de ${money.format(Math.abs(trend.delta))}
        (${Math.abs(trend.percent).toLocaleString("fr-FR",{maximumFractionDigits:1})} %)
        dans le même magasin : ${escapeHtml(trend.latest.storeName || "magasin identifié")}.
        <small>Relevés du ${escapeHtml(formatDate(trend.previous.date))} et du ${escapeHtml(formatDate(trend.latest.date))}.
          ${trendDiscounted
            ? "Dernier ticket remisé : cette évolution peut être ponctuelle."
            : trendOutdated
              ? "Ancien relevé : ne pas interpréter cette évolution comme une offre actuelle."
              : "Prix communautaires indicatifs, non garantis aujourd'hui."}
        </small>
      </div>`
    : '<div class="history-trend">Tendance indisponible : il faut deux dates de prix distinctes dans un même magasin physique identifié.</div>';

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
  const listCodes=new Set(state.shoppingList.map((item)=>historyProductKey(item.product.code)));
  // Do not present a months-old price movement as a current shopping alert.
  const alerts=detectPriceDrops(state.productPriceHistory,{
    thresholdPercent:state.dropThreshold,
    now:new Date(),maxAgeDays:14
  }).filter((alert)=>listCodes.has(historyProductKey(alert.code)));

  if(!alerts.length){
    els.priceAlerts.innerHTML="";
    return;
  }
  els.priceAlerts.innerHTML=`
    <div class="product-offers-head">
      <h3>Baisses de prix observées récemment</h3>
      <p>Relevés des 14 derniers jours uniquement, comparés dans le même magasin identifié à deux dates différentes. Il ne s'agit pas de prix garantis aujourd'hui : vérifier le magasin et les promotions. Détection à l'actualisation, sans surveillance en arrière-plan.</p>
    </div>
    ${alerts.slice(0,8).map((alert)=>`
      <article class="price-alert-card">
        <div>
          <strong>${escapeHtml(alert.name)}</strong>
          <div class="source">${storeLabel(alert.store)} · ${escapeHtml(alert.storeName || "Magasin identifié")} · ${money.format(alert.previousPrice)} → ${money.format(alert.latestPrice)}</div>
          <p class="help">Dernier relevé : ${escapeHtml(formatDate(alert.date))}${alert.latestIsDiscounted
            ? " · Prix remisé sur le ticket : baisse possiblement ponctuelle, non garantie."
            : " · Baisse entre deux observations, non garantie en caisse."}</p>
        </div>
        <span class="badge ${alert.latestIsDiscounted?"":"good"}">−${alert.dropPercent.toLocaleString("fr-FR",{maximumFractionDigits:1})} %${alert.latestIsDiscounted?" (remise)":""}</span>
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
    nearbyEnabled:state.nearbyEnabled,
    coverageIncomplete:state.basketPriceCoverageIncomplete
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
  }else if(strategySummary.status!=="ready"){
    recommendation=`<div class="basket-recommendation"><strong>Aucun magasin gagnant fiable.</strong> ${escapeHtml(strategySummary.reason || "Les relevés ne sont pas suffisamment comparables.")}</div>`;
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
    const receiptLink=line.manualPrice ? ""
      : openPricesReceiptLink(line.bestPrice,"Vérifier ce relevé Open Prices");
    const oldPrice=["old","stale"].includes(priceAge.level);
    const priceObservationNote=`<div class="price-age-note ${oldPrice?"outdated":""}">
      Relevé du ${formatDate(line.bestPrice?.date)} · ${priceAge.ageDays===null?"âge inconnu":priceAge.ageDays+" jour(s) révolu(s)"}
      ${oldPrice?" · Ancien prix : reconfirmer avant achat":""}
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
      ${receiptLink ? `<div class="source basket-price-source">${receiptLink}</div>` : ""}
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
    // Distinguish the dated static reference catalogue from individual active
    // imported offers. A manifest refresh or page load does not reverify them.
    const latestEvidence=result.offers
      .map((offer)=>offer.verifiedAt).filter(Boolean)
      .sort((a,b)=>new Date(a)-new Date(b)).at(-1);
    const suffix=result.errors.length
      ? ` · ${result.errors.length} lot(s) d'import en erreur`
      : "";
    els.datasetDate.textContent=`Catalogue de référence : ${formatDate(DATASET_DATE)} · ${result.offers.length} offre(s) importée(s) active(s)`+
      (latestEvidence ? ` · Dernière preuve d'offre active : ${formatDate(latestEvidence)}` : "")+
      suffix;
    render();
    renderSourceHealth();
    renderOptimizer();
    renderShoppingList();
    if(state.product) renderProductOffers(state.product,state.priceObservations);
  }catch(error){
    state.sourceHealth=[];
    renderSourceHealth();
    els.datasetDate.textContent=`Catalogue de référence : ${formatDate(DATASET_DATE)} · offres publiques indisponibles (aucune revalidation)`;
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
hydrateDailyCampaigns();
