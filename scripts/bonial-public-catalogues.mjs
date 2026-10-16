// Bonial is a public third-party flyer index, not Carrefour price evidence.
// Read only the public HTML page. No private APIs, cookies, auth or bot evasion.
export const BONIAL_CARREFOUR_URL="https://www.bonial.fr/Enseignes/Carrefour";

function decodeText(text){
  return text.replace(/&(?:amp|quot|apos|lt|gt|nbsp|#39|#x27|#(\d+)|#x([0-9a-f]+));/gi,
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
  if(typeof html!=="string" || html.length<300 || html.length>4000000)
    return [];
  const today=safeDay(now),items=new Map();
  for(const tag of html.matchAll(/<img\b[^>]{0,3000}>/gi)){
    const altMatch=/\balt\s*=\s*(["'])(.*?)\1/is.exec(tag[0]);
    if(!altMatch) continue;
    const alt=decodeText(altMatch[2]).replace(/\s+/g," ").trim();
    if(!/^Catalogue Carrefour\b/i.test(alt)
      || /^Catalogue Carrefour\s+(?:Market|City|Contact|Express|Proximité)\b/i.test(alt))
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
    const label=suffix && !/^\d+\s+pages?$/i.test(suffix)
      ?suffix.replace(/,\s*\d+\s+pages?$/i,"").trim():"Prospectus Carrefour";
    const key=startsAt+"|"+expiresAt+"|"+slug(label);
    if(items.has(key)) continue;
    items.set(key,{
      id:"bonial-carrefour-"+startsAt.replaceAll("-","")+"-"
        +expiresAt.replaceAll("-","")+"-"+slug(label),
      store:"carrefour",channels:["store"],format:"Carrefour",
      title:label==="Prospectus Carrefour"?label:"Catalogue Carrefour « "+label+" »",
      startsAt,expiresAt,verifiedAt:today,
      sourceUrl:BONIAL_CARREFOUR_URL,source:"Bonial"
    });
    if(items.size>=12) break;
  }
  return [...items.values()].sort((a,b)=>a.expiresAt.localeCompare(b.expiresAt)
    || a.title.localeCompare(b.title,"fr")).slice(0,8);
}
