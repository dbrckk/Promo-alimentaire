const GTIN_LENGTHS=new Set([8,12,13,14]);

export function normalizeGtin(value) {
  const digits=String(value ?? "").replace(/\D/g,"");
  if(!GTIN_LENGTHS.has(digits.length)) {
    throw new Error("GTIN invalide : 8, 12, 13 ou 14 chiffres requis.");
  }
  return digits;
}

export function isValidGtin(value) {
  let digits;
  try{ digits=normalizeGtin(value); }
  catch{ return false; }
  const check=Number(digits.at(-1));
  let sum=0;
  let weight=3;
  for(let i=digits.length-2;i>=0;i-=1){
    sum+=Number(digits[i])*weight;
    weight=weight===3 ? 1 : 3;
  }
  const expected=(10-(sum%10))%10;
  return expected===check;
}

export function assertValidGtin(value) {
  const gtin=normalizeGtin(value);
  if(!isValidGtin(gtin)) throw new Error(`Checksum GTIN invalide : ${gtin}`);
  return gtin;
}

/**
 * Normalize a checksum-valid GTIN to its GS1 14-digit comparison key.
 * Leading zeroes encode the same product identifier across UPC-A, EAN-13
 * and GTIN-14 representations; they do not create a new eligible SKU.
 * The original barcode must be retained for URLs and display.
 */
export function canonicalGtin(value) {
  if(!isValidGtin(value)) return null;
  return normalizeGtin(value).padStart(14,"0");
}

export function sameGtin(a,b) {
  const left=canonicalGtin(a);
  return left!==null && left===canonicalGtin(b);
}
