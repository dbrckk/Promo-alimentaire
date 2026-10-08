import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_BACKUP_BYTES,
  MAX_SHOPPING_ITEMS,
  serializeShoppingList,
  parseShoppingListBackup
} from "../src/shopping-list-transfer.js";

function item(code="3017624010701",quantity=2){
  return {
    product:{
      code,name:"Pâte à tartiner",
      brands:"Marque témoin",quantity:"400 g",
      categories:["en:spreads","en:chocolate-spreads"],
      imageUrl:"https://images.openfoodfacts.org/images/products/301/762/401/0701/front_fr.3.400.jpg",
      nutriScore:"e"
    },
    quantity
  };
}

test("la sauvegarde fait un aller-retour liste + budget sans données de localisation",()=>{
  const json=serializeShoppingList([item()],45.5,{now:"2026-10-08T12:00:00Z"});
  const parsed=parseShoppingListBackup(json);
  assert.equal(parsed.budget,45.5);
  assert.deepEqual(parsed.items.map((value)=>[value.product.code,value.quantity]),[
    ["3017624010701",2]
  ]);
  assert.equal(parsed.items[0].product.sourceUrl,
    "https://world.openfoodfacts.org/product/3017624010701");
  assert.ok(!json.includes("location"));
  assert.ok(!json.includes("priceObservations"));
  assert.ok(json.includes('"version": 1'));
});

test("une sauvegarde vide sans budget reste valide",()=>{
  assert.deepEqual(parseShoppingListBackup(serializeShoppingList([],null)),{
    items:[],budget:null
  });
});

test("une ancienne version ou un JSON cassé ne remplace jamais la liste",()=>{
  assert.throws(()=>parseShoppingListBackup("{"),/JSON valide/);
  assert.throws(()=>parseShoppingListBackup("{}"),/Format de sauvegarde/);
  const backup=JSON.parse(serializeShoppingList([item()]));
  backup.version=2;
  assert.throws(()=>parseShoppingListBackup(JSON.stringify(backup)),/version 1/);
});

test("checksum GTIN et doublons invalides sont rejetés",()=>{
  assert.throws(()=>serializeShoppingList([item("3017624010702")]),/GTIN invalide/);
  assert.throws(()=>serializeShoppingList([item(),item()]),/répété/);
});

test("quantités altérées et noms manquants sont rejetés",()=>{
  for(const quantity of [0,-1,1.5,100,"5",null]){
    assert.throws(()=>serializeShoppingList([item("3017624010701",quantity)]),/Quantité invalide/);
  }
  const bad=item();
  bad.product.name="";
  assert.throws(()=>serializeShoppingList([bad]),/Nom de produit manquant/);
});

test("un budget incohérent bloque l'import",()=>{
  const backup=JSON.parse(serializeShoppingList([item()]));
  for(const budget of ["inconnu",-5,10000.01]){
    backup.budget=budget;
    assert.throws(()=>parseShoppingListBackup(JSON.stringify(backup)),/Budget de sauvegarde invalide/);
  }
  delete backup.budget;
  assert.throws(()=>parseShoppingListBackup(JSON.stringify(backup)),/budget manquant/);
});

test("l'import neutralise les URL non approuvées et les champs inconnus",()=>{
  const backup=JSON.parse(serializeShoppingList([item()]));
  backup.items[0].product.imageUrl="https://example.com/collect?token=secret";
  backup.items[0].product.sourceUrl="javascript:alert(1)";
  backup.items[0].product.extraField="<script>alert(1)</script>";
  const restored=parseShoppingListBackup(JSON.stringify(backup));
  assert.equal(restored.items[0].product.imageUrl,"");
  assert.ok(restored.items[0].product.sourceUrl.startsWith("https://world.openfoodfacts.org/product/"));
  assert.equal("extraField" in restored.items[0].product,false);
});

test("fichiers volumineux et listes au-delà de 30 produits sont rejetés",()=>{
  assert.throws(()=>parseShoppingListBackup(" ".repeat(MAX_BACKUP_BYTES+1)),/100 Ko/);
  assert.throws(()=>serializeShoppingList(Array(MAX_SHOPPING_ITEMS+1).fill(item())),/maximum 30/);
});
