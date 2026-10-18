// Bonial is a public third-party flyer index, not Carrefour price evidence.
// Read only the public HTML page. No private APIs, cookies, auth or bot evasion.
export const BONIAL_CARREFOUR_URL="https://www.bonial.fr/Enseignes/Carrefour";
export const BONIAL_LECLERC_URL="https://www.bonial.fr/Enseignes/E-Leclerc";

// Fixed public indexes only. A third-party flyer never proves a product
// price, barcode, in-store availability, loyalty credit or actual saving.
const RETAILERS={
  carrefour:{
    label:"Carrefour",format:"Carrefour",url:BONIAL_CARREFOUR_URL,
    caption:/^Catalogue Carrefour\b/i,
    excluded:/^Catalogue Carrefour\s+(?:Market|City|Contact|Express|Proximité)\b/i,
    serialized:/Catalogue Carrefour[^<>"'\n]{0,240}/gi
  },
  leclerc:{
    label:"E.Leclerc",format:"E.Leclerc",url:BONIAL_LECLERC_URL,
    caption:/^Catalogue (?:E\.Leclerc|Leclerc)\b/i,
    excluded:/^Catalogue (?:E\.Leclerc|Leclerc)\s+(?:Drive|Express)\b/i,
    serialized:/Catalogue (?:E\.Leclerc|Leclerc)[^<>"'\n]{0,240}/gi
  }
};

function decodeText(text){
  // The same caption can appear as HTML text ("&") and as serialized
  // hydration JSON ("\\u0026"). Normalize before identifying a brochure:
  // otherwise one dated E.Leclerc flyer is duplicated under two IDs.
  // Decode printable BMP characters only; no controls or lone surrogates.
  const unicode=String(text).replace(/\\+u([0-9a-f]{4})/gi,(_,hex)=>{
    const code=Number.parseInt(hex,16);
    return code>=32 && !(code>=0xd800 && code<=0xdfff)
      && ![0x7f,0x2028,0x2029].includes(code)
      ?String.fromCharCode(code):" ";
  });
  return unicode.replace(/&(?:amp|quot|apos|lt|gt|nbsp|#39|#x27|#(\d+)|#x([0-9a-f]+));/gi,
    (full,decimal,hex)=>{
      if(decimal || hex){
        const code=Number.parseInt(decimal || hex,hex?16:10);
        return code>=32 && code<=0x10ffff && ![0x7f,0x2028,0x2029].includes(code)
          ?String.fromCodePoint(code):" ";
      }
      return { "&amp;":"&","&quot;":'"',"&apos;":"'","&lt;":"<",
        "&gt;":">","&nbsp;":" ","&#39;":"'","&#x27;":"'" }[full.toLowerCase()] || " ";
    });
}
function frenchDay(day,month,year){
  const value=[year,month.padStart(2,"0"),day.padStart(2,"0")].join("-");
  const parsed=new Date(value+"T12:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10)===value
    ?value:null;
}
function safeDay(now){
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",
    year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now));
}
function slug(text){
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48);
}

/**
 * Extract only calendar evidence explicitly attached to a Carrefour flyer.
 * A third-party brochure is NOT an exact-SKU offer, a Carrefour confirmation
 * or a guarantee that the local store participates.
 */
export function discoverBonialCarrefourCatalogues(html,now=new Date()){
  return discoverBonialRetailerCatalogues(html,now,"carrefour");
}
export function discoverBonialLeclercCatalogues(html,now=new Date()){
  return discoverBonialRetailerCatalogues(html,now,"leclerc");
}
function discoverBonialRetailerCatalogues(html,now,store){
  const config=RETAILERS[store];
  if(!config || typeof html!=="string" || html.length<300 || html.length>4000000)
    return [];
  const today=safeDay(now),items=new Map();
  // Bonial's public server response can carry its catalog image captions
  // in serialized page data without emitting ANY <img> tags (observed on
  // GitHub Actions on 16 October). Read only explicit dated descriptions;
  // no JSON endpoint, browser spoofing or protected retailer request.
  const captions=[];
  for(const tag of html.matchAll(/<img\b[^>]{0,3000}>/gi)){
    const altMatch=/\balt\s*=\s*(["'])(.*?)\1/is.exec(tag[0]);
    if(altMatch) captions.push(altMatch[2]);
  }
  const serialized=html.replace(/\\u002[fF]|\\\//g,"/")
    .replace(/\\u002[dD]/g,"-");
  for(const match of serialized.matchAll(config.serialized)){
    captions.push(match[0]);
    if(captions.length>500) break;
  }
  for(const candidate of captions){
    const alt=decodeText(candidate).replace(/\s+/g," ").trim();
    if(!config.caption.test(alt) || config.excluded.test(alt))
      continue;
    const dates=/\b([0-3]?\d)\/([01]?\d)\/(20\d{2})\s*[-–]\s*([0-3]?\d)\/([01]?\d)\/(20\d{2})\b/.exec(alt);
    if(!dates) continue;
    const startsAt=frenchDay(dates[1],dates[2],dates[3]);
    const expiresAt=frenchDay(dates[4],dates[5],dates[6]);
    if(!startsAt || !expiresAt || startsAt>today || expiresAt<today) continue;
    // Month-long listings are useful, but generic year-long brand pages
    // are not evidence of a currently relevant weekly brochure.
    const days=(Date.parse(expiresAt+"T12:00:00Z")
      -Date.parse(startsAt+"T12:00:00Z"))/86400000;
    if(days<0 || days>45) continue;
    const suffix=alt.slice(alt.indexOf(dates[0])+dates[0].length)
      .replace(/^[\s,:"'«»]+|[\s,:"'«»]+$/g,"").slice(0,80);
    const fallback="Prospectus "+config.label;
    const label=suffix && !/^\d+\s+pages?$/i.test(suffix)
      ?suffix.replace(/,\s*\d+\s+pages?$/i,"").trim():fallback;
    const key=startsAt+"|"+expiresAt+"|"+slug(label);
    if(items.has(key)) continue;
    items.set(key,{
      id:"bonial-"+store+"-"+startsAt.replaceAll("-","")+"-"
        +expiresAt.replaceAll("-","")+"-"+slug(label),
      store,channels:["store"],format:config.format,
      title:label===fallback?label:"Catalogue "+config.label+" « "+label+" »",
      startsAt,expiresAt,verifiedAt:today,
      sourceUrl:config.url,source:"Bonial"
    });
    if(items.size>=12) break;
  }
  return [...items.values()].sort((a,b)=>a.expiresAt.localeCompare(b.expiresAt)
    || a.title.localeCompare(b.title,"fr")).slice(0,8);
}
