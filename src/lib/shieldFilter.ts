const SHIELD_ID = "builtin-ublock-lite";

const COSMETIC = [
  "[id*='google_ads']",
  "[id*='google_ad']",
  "[class*='google-ad']",
  "[class*='GoogleActiveView']",
  "ins.adsbygoogle",
  "iframe[id^='google_ads']",
  "iframe[src*='doubleclick']",
  "iframe[src*='googlesyndication']",
  "iframe[src*='amazon-adsystem']",
  "iframe[src*='adnxs.com']",
  "iframe[src*='adservice']",
  "div[id^='ad-']",
  "div[id*='-ad-']",
  "div[class^='ad-']",
  "div[class*=' ad-']",
  "div[class*='adsbox']",
  "div[class*='ad-container']",
  "div[class*='ad_container']",
  "div[class*='advertisement']",
  "aside[class*='ad']",
  "[aria-label='Ads']",
  "[aria-label='Advertisement']",
].join(",");

const HOST_RE =
  /(?:^|[./])(?:doubleclick\.net|googlesyndication\.com|googleadservices\.com|pagead2\.googlesyndication\.com|adservice\.google|amazon-adsystem\.com|adnxs\.com|adsrvr\.org|advertising\.com|taboola\.com|outbrain\.com|criteo\.com|moatads\.com|scorecardresearch\.com|quantserve\.com|pubmatic\.com|openx\.net|rubiconproject\.com|casalemedia\.com|media\.net)(?:\/|$)/i;

export function shieldExtensionId() {
  return SHIELD_ID;
}

export function isShieldEnabled() {
  try {
    if (localStorage.getItem("extensionsEnabled") === "false") return false;
    const raw = localStorage.getItem("petezah-extensions");
    if (!raw) return true;
    const list = JSON.parse(raw) as { id: string; enabled?: boolean }[];
    const hit = list.find((e) => e.id === SHIELD_ID);
    if (!hit) return true;
    return hit.enabled !== false;
  } catch {
    return true;
  }
}

export function shieldInjectScript(): string {
  return `(function(){try{
if(window.__pzShield)return;window.__pzShield=1;
var css=${JSON.stringify(COSMETIC+"{display:none!important;visibility:hidden!important;pointer-events:none!important;height:0!important;max-height:0!important;overflow:hidden!important;}")};
var st=document.createElement("style");st.setAttribute("data-pz-shield","1");st.textContent=css;
(document.documentElement||document.head).appendChild(st);
var re=${HOST_RE.toString()};
var n=0;
function bump(){try{n++;sessionStorage.setItem("pz-shield-hits",String((Number(sessionStorage.getItem("pz-shield-hits")||0)||0)+1));}catch(e){}}
function scrub(root){
try{
var nodes=(root||document).querySelectorAll("iframe[src],script[src],img[src],a[href]");
for(var i=0;i<nodes.length;i++){
var el=nodes[i];
var src=el.getAttribute("src")||el.getAttribute("href")||"";
if(src&&re.test(src)){el.remove();bump();}
}
}catch(e){}
}
scrub(document);
var mo=new MutationObserver(function(muts){
for(var i=0;i<muts.length;i++){
var m=muts[i];
for(var j=0;j<m.addedNodes.length;j++){
var node=m.addedNodes[j];
if(node&&node.nodeType===1)scrub(node);
}
}
});
try{mo.observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
}catch(e){}})();`;
}

export function runShieldOnFrame(iframe: HTMLIFrameElement | null | undefined, pageUrl: string) {
  if (!iframe || !pageUrl || pageUrl.startsWith("petezah://")) return;
  if (!isShieldEnabled()) return;
  try {
    const doc = iframe.contentDocument;
    if (!doc?.documentElement) return;
    const ran = (iframe as any).__pzShieldRan as Set<string> | undefined;
    const set: Set<string> = ran || new Set();
    (iframe as any).__pzShieldRan = set;
    const urlKey = pageUrl.split("#")[0];
    if (set.has(urlKey)) return;
    const script = doc.createElement("script");
    script.setAttribute("data-pz-ext", SHIELD_ID);
    script.textContent = shieldInjectScript();
    (doc.head || doc.documentElement).appendChild(script);
    set.add(urlKey);
  } catch {}
}

export function readShieldHits(): number {
  try {
    return Number(sessionStorage.getItem("pz-shield-hits") || 0) || 0;
  } catch {
    return 0;
  }
}
