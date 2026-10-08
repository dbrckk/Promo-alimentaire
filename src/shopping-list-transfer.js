import {assertValidGtin} from "./gtin.js";
import {parseShoppingBudget} from "./budget.js";

const FORMAT="promo-alimentaire-shopping-list";
const VERSION=1;
export const MAX_BACKUP_BYTES=100000;
export const MAX_SHOPPING_ITEMS=30;

function safeText(value,maxLength){
  if(typeof value!=="string") return "";
  return value.trim().slice(0,maxLength);
}

function trustedImageUrl(value){
  if(typeof value!=="string" || value.length>1000) return "";
  try{
    const url=new URL(value);
    return url.protocol==="https:" && url.hostname==="images.openfoodfacts.org"
      ? url.href : "";
  }catch{
    return "";
  }
}

function normalizeItems(items){
  if(!Array.isArray(items) || items.length>MAX_SHOPPING_ITEMS){
    throw new Error("La sauvegarde doit contenir au maximum 30 produits.");
  }
  const seen=new Set();
  return items.map((entry,index)=>{
    if(!entry || typeof entry!=="object" || !entry.product || typeof entry.product!=="object"){
      throw new Error("Produit invalide à la ligne "+(index+1)+".");
    }
    let code;
    try{
      if(typeof entry.product.code!=="string") throw new Error("code absent");
      code=assertValidGtin(entry.product.code);
    }catch{
      throw new Error("Code-barres GTIN invalide à la ligne "+(index+1)+".");
    }
    if(seen.has(code)) throw new Error("Code-barres répété dans la sauvegarde : "+code+".");
    seen.add(code);
    if(!Number.isInteger(entry.quantity) || entry.quantity<1 || entry.quantity>99){
      throw new Error("Quantité invalide pour "+code+" (1 à 99 requis).");
    }
    const name=safeText(entry.product.name,160);
    if(!name) throw new Error("Nom de produit manquant pour "+code+".");
    const categories=Array.isArray(entry.product.categories)
      ? entry.product.categories.slice(0,20)
        .map((category)=>safeText(category,100)).filter(Boolean)
      : [];
    const score=safeText(entry.product.nutriScore,1).toLowerCase();
    return {
      product:{
        code,
        name,
        brands:safeText(entry.product.brands,160),
        quantity:safeText(entry.product.quantity,80),
        imageUrl:trustedImageUrl(entry.product.imageUrl),
        nutriScore:/^[abcde]$/.test(score) ? score : null,
        categories,
        sourceUrl:"https://world.openfoodfacts.org/product/"+encodeURIComponent(code)
      },
      quantity:entry.quantity
    };
  });
}

function normalizeBudget(value){
  if(value===null) return null;
  if(typeof value!=="number") throw new Error("Budget de sauvegarde invalide.");
  const amount=parseShoppingBudget(value);
  if(amount===null) throw new Error("Budget de sauvegarde invalide.");
  return amount;
}

export function serializeShoppingList(items,budget=null,{now=new Date()}={}){
  const normalized=normalizeItems(items);
  const amount=normalizeBudget(budget);
  const date=new Date(now);
  if(Number.isNaN(date.getTime())) throw new Error("Date d'export invalide.");
  return JSON.stringify({
    format:FORMAT,
    version:VERSION,
    exportedAt:date.toISOString(),
    budget:amount,
    items:normalized
  },null,2);
}

export function parseShoppingListBackup(content){
  if(typeof content!=="string" || new TextEncoder().encode(content).byteLength>MAX_BACKUP_BYTES){
    throw new Error("Fichier invalide ou supérieur à 100 Ko.");
  }
  let data;
  try{
    data=JSON.parse(content);
  }catch{
    throw new Error("Le fichier ne contient pas un JSON valide.");
  }
  if(!data || typeof data!=="object" || Array.isArray(data)
    || data.format!==FORMAT || data.version!==VERSION){
    throw new Error("Format de sauvegarde non reconnu (version 1 requise).");
  }
  if(!Object.prototype.hasOwnProperty.call(data,"budget")){
    throw new Error("Champ budget manquant dans la sauvegarde.");
  }
  return {
    items:normalizeItems(data.items),
    budget:normalizeBudget(data.budget)
  };
}
