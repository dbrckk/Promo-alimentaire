import { DATASET_DATE, offers, providers } from "./data.js";
import { computeSaving, effectivePercent, filterOffers, rankOffers } from "./domain.js";
import { fetchPricesByBarcode, fetchProductByBarcode, isFreshObservation, normalizeBarcode, selectBestRecentPrice } from "./open-data.js";
import { optimizeStack } from "./stacking.js";
import { estimateOfferSaving, findProductOffers } from "./matching.js";
import { compareBasketStores, evaluateBasketStore, normalizeQuantity } from "./basket.js";

const money = new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"});
const els = {
  store:document.querySelector("#store"),
  sort:document.querySelector("#sort"),
  search:document.querySelector("#search"),
  offers:document.querySelector("#offers"),
  providers:document.querySelector("#providers"),
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
  listCount:document.querySelector("#listCount"),
  refreshList:document.querySelector("#refreshList"),
  listNearbyButton:document.querySelector("#listNearbyButton"),
  listRadiusSelect:document.querySelector("#listRadiusSelect"),
  clearList:document.querySelector("#clearList"),
  listStatus:document.querySelector("#listStatus"),
  shoppingListItems:document.querySelector("#shoppingListItems"),
  basketComparison:document.querySelector("#basketComparison"),
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
  basketRefreshing:false,
  lookupToken:0
};

els.store.value=state.store;
els.sort.value=state.sort;
els.radiusSelect.value=String(state.radiusKm);
els.listRadiusSelect.value=String(state.radiusKm);
els.datasetDate.textContent=`Offres vérifiées : ${new Date(DATASET_DATE+"T12:00:00").toLocaleDateString("fr-FR")}`;

els.store.addEventListener("change",async()=>{
  state.store=els.store.value;
  localStorage.setItem("promo-store",state.store);
  render();
  renderOptimizer();
  if(state.product) renderProductOffers(state.product,state.priceObservations);
  if(state.productCode) await refreshPrices(state.productCode);
});
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
els.productResult.addEventListener("click",(event)=>{
  if(event.target.closest('[data-action="add-current-product"]')) addCurrentProduct();
});
els.shoppingListItems.addEventListener("click",handleShoppingListAction);
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
  const filtered=filterOffers(offers,{store:state.store,search:state.search});
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
  const savingMain=amount!==null?money.format(amount):(pct!==null?formatPercent(pct):"—");
  const savingSub=amount!==null && pct!==null?formatPercent(pct):offer.scope==="panier"?"sur le panier":"sur le produit";
  const stackBadge=offer.autoStack===true
    ? '<span class="badge good">Cumul automatisable</span>'
    : '<span class="badge warn">Cumul à vérifier</span>';
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
        <span class="badge">${offer.scope==="panier"?"Panier entier":"Produit ciblé"}</span>
        <span class="badge">${escapeHtml(offer.category)}</span>
        ${stackBadge}
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
    if(state.product) renderProductOffers(state.product,state.priceObservations);
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
    if(state.product) renderProductOffers(state.product,state.priceObservations);
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
}

function renderProductOffers(product,observations=[]){
  const matches=findProductOffers(product,offers,{store:state.store});
  if(!matches.length){
    els.productOffers.innerHTML=`
      <div class="panel price-source">
        Aucune offre produit de notre registre ne correspond actuellement à cette référence chez ${storeLabel(state.store)}.
      </div>`;
    return;
  }

  const recentPrice=selectBestRecentPrice(observations)?.price ?? null;
  const cards=matches.map(({offer,match})=>{
    const potential=recentPrice===null ? null : estimateOfferSaving(recentPrice,offer);
    const confidenceLabel=match.exact
      ? "EAN exact"
      : match.confidence==="probable"
        ? "Correspondance forte"
        : "Référence à vérifier";
    const confidenceClass=match.exact ? "good" : "warn";
    const savingLabel=Number.isFinite(offer.savingPercent)
      ? formatPercent(offer.savingPercent)
      : Number.isFinite(offer.savingAmount)
        ? money.format(offer.savingAmount)
        : "—";
    const amountLine=potential===null
      ? "Montant potentiel indisponible sans prix récent"
      : `Potentiel ≈ ${money.format(potential)} sur le dernier prix récent`;
    const safetyNote=match.exact
      ? "Correspondance EAN/GTIN explicite. Les conditions de l’offre restent à vérifier."
      : "Détection par marque/nom uniquement : ne pas considérer l’offre comme garantie avant vérification de la référence éligible.";

    return `
      <article class="match-card">
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
          <span class="badge ${confidenceClass}">${confidenceLabel}</span>
          <span class="badge">${escapeHtml(storeLabel(state.store))}</span>
        </div>
        <p class="match-note">${escapeHtml(safetyNote)}</p>
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
    const fresh=isFreshObservation(item);
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
          <span>${formatDate(item.date)} · ${fresh?"récent":"ancien"}${distance}</span>
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
  const basketOffers=offers.filter((offer)=>offer.scope==="panier");
  const result=optimizeStack(amount,basketOffers,{store:state.store});
  const route=result.selected.length
    ? result.selected.map((offer)=>`
      <div class="route-step">
        <span>${escapeHtml(offer.provider)} · ${escapeHtml(offer.title)}</span>
        <strong>−${money.format(offer.calculatedSaving)}</strong>
      </div>`).join("")
    : '<div class="route-step"><span>Aucune remise panier suffisamment sûre n’est automatisée pour cette enseigne.</span><strong>—</strong></div>';
  const uncertain=result.considered.filter((offer)=>offer.autoStack!==true);
  els.optimizerResult.innerHTML=`
    <section class="optimizer-card">
      <div class="optimizer-total">
        <div><span>Panier initial</span><strong>${money.format(result.basePrice)}</strong></div>
        <div><span>Économie validée</span><strong>−${money.format(result.totalSaving)} · ${formatPercent(result.savingPercent)}</strong></div>
        <div><span>Coût effectif estimé</span><strong>${money.format(result.finalCost)}</strong></div>
      </div>
      <div class="route">${route}</div>
      <p class="help">
        ${uncertain.length} offre(s) panier supplémentaire(s) sont volontairement exclues du total car leur cumul n'est pas assez certain.
        Le moteur choisit une seule offre par groupe incompatible, donc plusieurs cartes cadeaux ne sont jamais additionnées artificiellement.
      </p>
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

  const scenarios=["carrefour","leclerc"].map((store)=>evaluateBasketStore(state.shoppingList,{
    store,
    priceByCode:state.basketPriceData[store],
    offers
  }));
  renderBasketComparison(scenarios);
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
      if(carrefour.status==="fulfilled") next.carrefour[item.product.code]=carrefour.value.observations;
      else { next.carrefour[item.product.code]=[]; failures+=1; }
      if(leclerc.status==="fulfilled") next.leclerc[item.product.code]=leclerc.value.observations;
      else { next.leclerc[item.product.code]=[]; failures+=1; }
    }
    state.basketPriceData=next;
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

function renderBasketComparison(scenarios){
  const ranked=compareBasketStores(scenarios);
  const allComplete=scenarios.length>0 && scenarios.every((scenario)=>scenario.isComplete);
  let recommendation="";
  if(!state.nearbyEnabled){
    recommendation='<div class="basket-recommendation"><strong>Comparaison locale non activée.</strong> Active « Autour de moi » puis actualise pour comparer des magasins dans le même secteur.</div>';
  }else if(!allComplete){
    recommendation='<div class="basket-recommendation"><strong>Comparaison incomplète.</strong> Au moins une enseigne manque d’un prix récent pour un produit ; aucun gagnant n’est déclaré.</div>';
  }else if(ranked.length>=2){
    const best=ranked[0];
    const second=ranked[1];
    const difference=Math.round((second.finalCost-best.finalCost+Number.EPSILON)*100)/100;
    recommendation=difference>0
      ? `<div class="basket-recommendation"><strong>${storeLabel(best.store)} est le meilleur scénario observé</strong> : environ ${money.format(difference)} de moins sur ce panier, après remises automatiquement validées.</div>`
      : '<div class="basket-recommendation"><strong>Égalité sur les données disponibles.</strong> Les deux scénarios ont le même coût effectif estimé.</div>';
  }

  els.basketComparison.innerHTML=`
    ${recommendation}
    <div class="scenario-grid">
      ${scenarios.map(renderBasketScenario).join("")}
    </div>`;
}

function renderBasketScenario(scenario){
  const coverageClass=scenario.isComplete ? "coverage-good" : "coverage-warn";
  const totalLabel=scenario.isComplete ? "Coût effectif" : "Total partiel";
  const lines=scenario.lines.map((line)=>{
    if(line.missingPrice){
      return `<div class="scenario-line"><span>${escapeHtml(line.product?.name || line.code)} × ${line.quantity}</span><strong class="missing">prix manquant</strong></div>`;
    }
    const place=line.bestPrice?.storeName ? ` · ${escapeHtml(line.bestPrice.storeName)}` : "";
    return `<div class="scenario-line"><span>${escapeHtml(line.product?.name || line.code)} × ${line.quantity}${place}</span><strong>${money.format(line.baseCost)}</strong></div>`;
  }).join("");
  const basketRoute=scenario.basketOptimization.selected.length
    ? scenario.basketOptimization.selected.map((offer)=>`${escapeHtml(offer.provider)} −${money.format(offer.calculatedSaving)}`).join(" · ")
    : "Aucune remise panier automatiquement retenue";
  const potential=scenario.potentialProductSaving>0
    ? `<p class="help">ODR/coupons produits candidats : jusqu’à ${money.format(scenario.potentialProductSaving)} potentiels, non inclus tant que l’éligibilité/cumul n’est pas confirmé.</p>`
    : "";

  return `
    <article class="scenario-card">
      <div>
        <h3>${storeLabel(scenario.store)}</h3>
        <div class="${coverageClass} source">${scenario.pricedCount}/${scenario.distinctCount} références avec prix récent</div>
      </div>
      <div class="scenario-summary">
        <div><span>Sous-total observé</span><strong>${money.format(scenario.observedSubtotal)}</strong></div>
        <div><span>Économie validée</span><strong>−${money.format(scenario.guaranteedSaving)}</strong></div>
        <div><span>${totalLabel}</span><strong>${money.format(scenario.finalCost)}</strong></div>
      </div>
      <div class="scenario-lines">${lines}</div>
      <p class="help">${basketRoute}</p>
      ${potential}
    </article>`;
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

function stat(value,label){return `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`;}
function formatPercent(value){return `${new Intl.NumberFormat("fr-FR",{maximumFractionDigits:2}).format(value)} %`;}
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
render();
renderOptimizer();
renderShoppingList();
