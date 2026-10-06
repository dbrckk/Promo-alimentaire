import { DATASET_DATE, offers, providers } from "./data.js";
import { computeSaving, effectivePercent, filterOffers, rankOffers } from "./domain.js";

const money = new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"});
const els = {
  store:document.querySelector("#store"),
  sort:document.querySelector("#sort"),
  search:document.querySelector("#search"),
  offers:document.querySelector("#offers"),
  providers:document.querySelector("#providers"),
  offersView:document.querySelector("#offersView"),
  providersView:document.querySelector("#providersView"),
  empty:document.querySelector("#empty"),
  stats:document.querySelector("#stats"),
  datasetDate:document.querySelector("#datasetDate"),
  tabs:[...document.querySelectorAll(".tab")],
  installButton:document.querySelector("#installButton")
};

const state = {
  store:localStorage.getItem("promo-store") || "carrefour",
  sort:localStorage.getItem("promo-sort") || "percent",
  search:"",
  tab:"offers"
};

els.store.value=state.store;
els.sort.value=state.sort;
els.datasetDate.textContent=`Données vérifiées : ${new Date(DATASET_DATE).toLocaleDateString("fr-FR")}`;

els.store.addEventListener("change",()=>{state.store=els.store.value;localStorage.setItem("promo-store",state.store);render();});
els.sort.addEventListener("change",()=>{state.sort=els.sort.value;localStorage.setItem("promo-sort",state.sort);render();});
els.search.addEventListener("input",()=>{state.search=els.search.value;render();});
els.tabs.forEach((button)=>button.addEventListener("click",()=>{
  state.tab=button.dataset.tab;
  els.tabs.forEach((b)=>b.classList.toggle("active",b===button));
  els.offersView.classList.toggle("hidden",state.tab!=="offers");
  els.providersView.classList.toggle("hidden",state.tab!=="providers");
}));

function render(){
  const filtered=filterOffers(offers,{store:state.store,search:state.search});
  const ranked=rankOffers(filtered,state.sort);
  els.offers.innerHTML=ranked.map(renderOffer).join("");
  els.empty.classList.toggle("hidden",ranked.length>0);

  const activeProviders=providers.filter((p)=>p.stores.includes(state.store));
  els.providers.innerHTML=activeProviders.map(renderProvider).join("");

  const numericPercents=ranked.map(effectivePercent).filter(Number.isFinite);
  const maxPercent=numericPercents.length?Math.max(...numericPercents):null;
  const knownEuro=ranked.map(computeSaving).filter(Number.isFinite);
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
        <span class="badge warn">Cumul à vérifier</span>
      </div>
      <div class="meta">
        <div><span>Économie en €</span>${amount===null?"Dépend du prix":money.format(amount)}</div>
        <div><span>Vérifié</span>${new Date(offer.verifiedAt).toLocaleDateString("fr-FR")}</div>
      </div>
      <p class="conditions">${escapeHtml(offer.conditions)}</p>
      <div class="actions">
        <span class="verified">${escapeHtml(offer.stacking)}</span>
        <a class="open" href="${offer.sourceUrl}" target="_blank" rel="noreferrer">Voir la source</a>
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
      <div class="actions"><span></span><a class="open" href="${provider.url}" target="_blank" rel="noreferrer">Ouvrir</a></div>
    </article>`;
}

function stat(value,label){return `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`;}
function formatPercent(value){return `${new Intl.NumberFormat("fr-FR",{maximumFractionDigits:2}).format(value)} %`;}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));}

let deferredPrompt;
window.addEventListener("beforeinstallprompt",(event)=>{
  event.preventDefault(); deferredPrompt=event; els.installButton.classList.remove("hidden");
});
els.installButton.addEventListener("click",async()=>{
  if(!deferredPrompt)return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt=undefined;
  els.installButton.classList.add("hidden");
});

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}
render();
