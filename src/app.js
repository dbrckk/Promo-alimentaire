import { DATASET_DATE, offers, providers } from "./data.js";
import { computeSaving, effectivePercent, filterOffers, rankOffers } from "./domain.js";
import { fetchPricesByBarcode, fetchProductByBarcode, isFreshObservation, normalizeBarcode } from "./open-data.js";
import { optimizeStack } from "./stacking.js";

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
  productStatus:document.querySelector("#productStatus"),
  productResult:document.querySelector("#productResult"),
  priceResults:document.querySelector("#priceResults"),
  basketAmount:document.querySelector("#basketAmount"),
  optimizerResult:document.querySelector("#optimizerResult"),
  scanDialog:document.querySelector("#scanDialog"),
  closeScan:document.querySelector("#closeScan"),
  scanVideo:document.querySelector("#scanVideo")
};

const views = {
  offers:document.querySelector("#offersView"),
  product:document.querySelector("#productView"),
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
  lookupToken:0
};

els.store.value=state.store;
els.sort.value=state.sort;
els.datasetDate.textContent=`Offres vérifiées : ${new Date(DATASET_DATE+"T12:00:00").toLocaleDateString("fr-FR")}`;

els.store.addEventListener("change",async()=>{
  state.store=els.store.value;
  localStorage.setItem("promo-store",state.store);
  render();
  renderOptimizer();
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
els.closeScan.addEventListener("click",()=>els.scanDialog.close());
els.scanDialog.addEventListener("close",stopScanner);

els.tabs.forEach((button)=>button.addEventListener("click",()=>setTab(button.dataset.tab)));

function setTab(tab){
  state.tab=tab;
  els.tabs.forEach((button)=>button.classList.toggle("active",button.dataset.tab===tab));
  for(const [name,view] of Object.entries(views)) view.classList.toggle("hidden",name!==tab);
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
  els.priceResults.innerHTML="";

  const [productResult,pricesResult]=await Promise.allSettled([
    fetchProductByBarcode(code),
    fetchPricesByBarcode(code,{store:state.store})
  ]);
  if(token!==state.lookupToken) return;

  if(productResult.status==="fulfilled"){
    state.product=productResult.value;
    renderProduct(productResult.value);
  }else{
    state.product=null;
    els.productResult.innerHTML=`<div class="source">Code-barres ${escapeHtml(code)} · fiche produit indisponible</div>`;
    els.productResult.classList.remove("hidden");
  }

  if(pricesResult.status==="fulfilled"){
    renderPrices(pricesResult.value.observations,pricesResult.value.sourceUrl);
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
    const result=await fetchPricesByBarcode(code,{store:state.store});
    if(token!==state.lookupToken) return;
    renderPrices(result.observations,result.sourceUrl);
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
        <a class="open" href="${escapeHtml(product.sourceUrl)}" target="_blank" rel="noreferrer">Fiche Open Food Facts</a>
      </div>
    </div>`;
  els.productResult.classList.remove("hidden");
}

function renderPrices(observations,sourceUrl){
  if(!observations.length){
    els.priceResults.innerHTML=`
      <div class="panel price-source">
        Aucun prix Open Prices trouvé pour ce code-barres chez ${storeLabel(state.store)}.
        Cela ne signifie pas que le produit n'y est pas vendu : la base est communautaire et encore incomplète.
      </div>`;
    return;
  }
  const cards=observations.slice(0,12).map((item)=>{
    const fresh=isFreshObservation(item);
    const previous=item.priceWithoutDiscount && item.priceWithoutDiscount>item.price
      ? ` · avant ${money.format(item.priceWithoutDiscount)}`
      : "";
    const place=[item.storeName,item.postcode,item.city].filter(Boolean).join(" · ");
    return `
      <article class="price-card">
        <div class="price-main">
          <strong>${money.format(item.price)}</strong>
          <small>${item.isDiscounted?"Prix signalé remisé":"Prix observé"}${previous}</small>
        </div>
        <div class="price-place">
          <strong>${escapeHtml(place || storeLabel(state.store))}</strong>
          <span>${formatDate(item.date)} · ${fresh?"récent":"ancien"}</span>
        </div>
      </article>`;
  }).join("");
  els.priceResults.innerHTML=`
    ${cards}
    <div class="panel price-source">
      ${observations.length} observation(s) ${storeLabel(state.store)} trouvée(s). Source : Open Prices / Open Food Facts.
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

render();
renderOptimizer();
