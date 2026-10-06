export function computeSaving(offer) {
  if (Number.isFinite(offer.savingAmount)) return roundMoney(offer.savingAmount);
  if (Number.isFinite(offer.basePrice) && Number.isFinite(offer.savingPercent)) {
    return roundMoney(offer.basePrice * offer.savingPercent / 100);
  }
  return null;
}

export function effectivePercent(offer) {
  if (Number.isFinite(offer.savingPercent)) return offer.savingPercent;
  if (Number.isFinite(offer.basePrice) && offer.basePrice > 0 && Number.isFinite(offer.savingAmount)) {
    return Math.round((offer.savingAmount / offer.basePrice) * 10000) / 100;
  }
  return null;
}

export function rankOffers(offers, sort = "percent") {
  return [...offers].sort((a, b) => {
    if (sort === "amount") return nullableNumber(computeSaving(b)) - nullableNumber(computeSaving(a));
    if (sort === "freshness") return new Date(b.verifiedAt) - new Date(a.verifiedAt);
    return nullableNumber(effectivePercent(b)) - nullableNumber(effectivePercent(a));
  });
}

export function filterOffers(offers, { store, search = "" }) {
  const needle = search.trim().toLocaleLowerCase("fr");
  return offers.filter((offer) => {
    const storeMatch = offer.stores.includes(store) || offer.stores.includes("all");
    if (!storeMatch) return false;
    if (!needle) return true;
    return [offer.title, offer.provider, offer.category, offer.type]
      .filter(Boolean).join(" ").toLocaleLowerCase("fr").includes(needle);
  });
}

export function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function nullableNumber(value) {
  return Number.isFinite(value) ? value : -Infinity;
}
