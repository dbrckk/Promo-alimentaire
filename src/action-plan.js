export function buildSavingsActionPlan({
  store,
  channel="store",
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
    const detail=channel==="online"
      ? "Si tu choisis Joko pour cette commande en ligne, active son offre avant l’achat et n’utilise pas simultanément une autre extension cashback concurrente."
      : channel==="drive"
        ? "Vérifie dans Joko si l’offre de l’enseigne couvre le Drive et active-la avant la transaction si nécessaire."
        : "Ouvre Joko et vérifie les offres CB / bons d’achat disponibles pour cette enseigne. Une offre CB doit être activée avant la transaction.";
    push("avant","Vérifier Joko avant de payer",detail,"check",joko.url);
  }

  const dynamicOnlineProviders=providers.filter((provider)=>
    ["joko","igraal"].includes(provider.id)
    && (provider.stores?.includes(store)||provider.stores?.includes("all"))
  );
  if(channel==="online" && dynamicOnlineProviders.length){
    push(
      "avant",
      "Comparer les cashbacks dynamiques",
      "Vérifie aussi "+dynamicOnlineProviders.map((provider)=>provider.name).join(" et ")+
        " juste avant la commande. Leurs taux peuvent varier et ne sont pas comptés sans donnée publique vérifiable.",
      "check",
      dynamicOnlineProviders[0].url || null
    );
  }

  const affiliateCashbacks=(uncertainBasketOffers || [])
    .filter((offer)=>offer.mechanism==="affiliate_cashback");
  if(channel==="online" && affiliateCashbacks.length){
    const labels=affiliateCashbacks.map((offer)=>{
      const value=Number.isFinite(offer.savingPercent)
        ? offer.savingPercent+" %"
        : Number.isFinite(offer.savingAmount)
          ? "jusqu’à "+offer.savingAmount+" €"
          : "";
      return offer.provider+(value?" "+value:"");
    });
    push(
      "avant",
      "Choisir un seul portail cashback web",
      "Compare "+labels.join(" / ")+". Active uniquement le meilleur chemin compatible avec ta commande ; plusieurs portails ou extensions concurrents ne doivent pas être comptés ensemble.",
      "check",
      affiliateCashbacks[0].sourceUrl || null
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

  const refundCandidates=(productCandidates || []).filter((entry)=>{
    const mechanism=entry.offer?.mechanism;
    const type=String(entry.offer?.type || "").toLocaleLowerCase("fr");
    return ["odr","cashback_ticket","coupon_refund"].includes(mechanism)
      || type.includes("odr")
      || type.includes("remboursement");
  });
  if(refundCandidates.length){
    const providersList=[...new Set(refundCandidates.map((entry)=>entry.offer?.provider).filter(Boolean))];
    push(
      "après",
      "Envoyer les ODR produit",
      "Traite les remboursements candidats après l’achat : "+providersList.join(", ")+
        ". Vérifie chaque condition avant de soumettre la même preuve à plusieurs services.",
      "refund",
      refundCandidates[0]?.offer?.sourceUrl || null
    );
  }

  const loyaltyCandidates=(productCandidates || []).filter((entry)=>
    entry.offer?.mechanism==="retailer_loyalty"
  );
  if(loyaltyCandidates.length){
    const known=loyaltyCandidates.some((entry)=>entry.offer?.loyaltyEligibility==="eligible");
    push(
      "achat",
      known ? "Présenter la carte fidélité" : "Vérifier la carte fidélité",
      known
        ? "L’avantage fidélité détecté dépend de la carte renseignée. Présente-la ou associe-la à la commande avant validation."
        : "Une remise fidélité est possible sur au moins un produit, mais ton profil carte n’est pas confirmé.",
      "check",
      loyaltyCandidates[0]?.offer?.sourceUrl || null
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
    channel,
    steps,
    phaseCounts:steps.reduce((acc,step)=>{
      acc[step.phase]=(acc[step.phase]||0)+1;
      return acc;
    },{})
  };
}
