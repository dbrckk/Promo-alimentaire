export function buildSavingsActionPlan({
  store,
  selectedPayment=null,
  uncertainBasketOffers=[],
  productCandidates=[],
  bundleCandidates=[],
  providers=[]
}={}) {
  const steps=[];
  let order=1;
  const push=(phase,title,detail,kind="info",sourceUrl=null)=>steps.push({
    order:order++,phase,title,detail,kind,sourceUrl
  });

  const joko=providers.find((provider)=>provider.id==="joko"
    && (provider.stores?.includes(store)||provider.stores?.includes("all")));
  if(joko){
    push(
      "avant",
      "Vérifier Joko avant de payer",
      "Ouvre Joko et vérifie les offres CB / bons d’achat disponibles pour cette enseigne. Une offre CB doit être activée avant la transaction.",
      "check",
      joko.url
    );
  }

  const uncertainCard=(uncertainBasketOffers || [])
    .filter((offer)=>offer.mechanism==="card_cashback");
  if(uncertainCard.length){
    push(
      "avant",
      "Activer les cashbacks carte éventuels",
      uncertainCard.map((offer)=>offer.provider+" · "+offer.title).join(" / ")+
        ". Ne les compte pas comme garantis tant que leurs conditions de cumul ne sont pas confirmées.",
      "check",
      uncertainCard[0].sourceUrl || null
    );
  }

  if(selectedPayment){
    push(
      "paiement",
      "Acheter le bon d’achat recommandé",
      selectedPayment.provider+" · "+selectedPayment.savingPercent+
        "% actuellement modélisés. Vérifie les exclusions puis achète seulement le montant utile au panier.",
      "money",
      selectedPayment.sourceUrl || null
    );
  }else{
    push(
      "paiement",
      "Payer avec un moyen éligible",
      "Aucun bon d’achat remisé validé n’est actuellement retenu automatiquement pour cette enseigne.",
      "info"
    );
  }

  if(productCandidates.length || bundleCandidates.length){
    push(
      "achat",
      "Respecter les références et quantités",
      "Avant passage en caisse, compare les références exactes, formats et quantités avec les offres candidates. Les correspondances par marque/nom restent à vérifier.",
      "check"
    );
  }

  push(
    "achat",
    "Conserver la preuve d’achat",
    "Garde le ticket de caisse ou la facture Drive complète et lisible ; les ODR peuvent demander la preuve d’achat et le code-barres.",
    "receipt"
  );

  if(productCandidates.length){
    const providersList=[...new Set(productCandidates.map((entry)=>entry.offer?.provider).filter(Boolean))];
    push(
      "après",
      "Envoyer les ODR produit",
      "Traite les remboursements candidats après l’achat : "+providersList.join(", ")+
        ". Vérifie chaque condition avant de soumettre la même preuve à plusieurs services.",
      "refund",
      productCandidates[0]?.offer?.sourceUrl || null
    );
  }

  if(bundleCandidates.length){
    push(
      "après",
      "Vérifier l’offre multi-produits",
      "Le panier contient au moins un bundle potentiel. Confirme l’achat simultané, les références, le plafond et les exclusions avant demande.",
      "refund",
      bundleCandidates[0]?.offer?.sourceUrl || null
    );
  }

  return {
    store,
    steps,
    phaseCounts:steps.reduce((acc,step)=>{
      acc[step.phase]=(acc[step.phase]||0)+1;
      return acc;
    },{})
  };
}
