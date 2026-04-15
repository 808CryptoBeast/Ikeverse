/**
 * cosmic-weave.js — Full Three.js + Feature Rebuild
 *
 * Five features unified in one system:
 *  1. Three.js WebGL globe (real 3D sphere, atmosphere, geodesic arcs, pulse particles)
 *  2. Animated arc particles + depth shading  (built into Three.js naturally)
 *  3. Timeline scrubber — drag BCE→CE, cultures filter by era
 *  4. Force-directed graph mode — D3 force layout, node drag, smooth transition
 *  5. Guided tour mode — auto-fly to each Weave Path stop with narration
 */

(() => {
'use strict';

const d3       = window.d3;
const topojson = window.topojson;
const THREE    = window.THREE;
if (!d3 || !topojson) { console.error('[CW] D3 or Topojson missing'); return; }

// ══════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════
const CULTURES_URL = 'docs/cultures.json';
const WORLD_URL    = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const IS_COARSE    = window.matchMedia?.('(pointer: coarse)').matches ?? false;
const PRM          = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const GLOBE_R      = 1.0;  /* sphere radius in Three.js units */

/* ── Performance caches ── */
let _sunCache = null, _sunTime = 0, _lastDeclutter = 0;

// ══════════════════════════════════════════════════════════
// MATH / GEO HELPERS
// ══════════════════════════════════════════════════════════
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));

function latLon3D(lat, lon, r = GLOBE_R) {
  const phi   = (90 - lat)  * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

function hexStr(hex) { return '#' + hex.toString(16).padStart(6,'0'); }

function parseEra(eraStr) {
  if (!eraStr) return { start: -9999, end: 2100 };
  const num = s => {
    const bce = /bce/i.test(s), n = parseInt(s.replace(/\D/g,''));
    return isNaN(n) ? null : (bce ? -n : n);
  };
  const parts = eraStr.split(/\s*[–—\-]\s*/);
  if (parts.length >= 2) {
    const s = num(parts[0]), e = num(parts[parts.length-1]);
    if (s !== null && e !== null) return { start: s, end: e };
  }
  const n = num(eraStr);
  if (n !== null) return { start: n - 300, end: n + 300 };
  return { start: -9999, end: 2100 };
}

// ══════════════════════════════════════════════════════════
// DATA HELPERS  (same as original cosmic-weave.js)
// ══════════════════════════════════════════════════════════
function uniq(arr) {
  const out=[], seen=new Set();
  for(const x of arr||[]){const k=String(x);if(!seen.has(k)){seen.add(k);out.push(k);}}
  return out;
}
function escapeHtml(s){return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function escapeAttr(s){return escapeHtml(s).replaceAll('`','&#096;');}
function nowMs(){return performance?.now()??Date.now();}

function hasKeyword(c,kws){
  const t=[c.name,c.location,c.region,c.era,...(c.tags||[]),...(c.keyTerms||[]),...(c.highlights||[]),...(c.knowledgeSystems||[]),...(c.corePrinciples||[]),...(c.movement||[])].join(' ').toLowerCase();
  return kws.some(k=>t.includes(k));
}

const REGION_COLORS_HEX = {
  Africa:'#ffd166','Middle East':'#ff7b7b',Europe:'#8ecae6',
  Asia:'#b5e48c',Oceania:'#a78bfa',Americas:'#fca5a5',Other:'#9ca3af',
};
function regionColor(c){return REGION_COLORS_HEX[String(c.region||'Other')]||REGION_COLORS_HEX.Other;}
function regionColorInt(c){return parseInt(regionColor(c).slice(1),16);}

const LENS_ALIASES = {
  'Creation':new Set(['Creation','Cosmology','Consciousness','Origins','Genealogy']),
  'Navigation':new Set(['Navigation','Seafaring','Voyaging','Wayfinding','Maritime']),
  'Martial Arts':new Set(['Martial Arts','Warrior','Budo','Martial','Combat']),
  'Stewardship':new Set(['Stewardship','Sustainability','Land','Water','Ecology']),
  'Ecology':new Set(['Ecology','Environment','Climate','Water']),
  'Governance':new Set(['Governance','Law','State','Council','Administration']),
};
function lensMatch(link,lens){
  if(!lens||lens==='all') return false;
  const a=LENS_ALIASES[lens]; if(!a) return false;
  return (link.themes||[]).some(t=>a.has(String(t)));
}

/* Layer signals */
function hasFoodSig(c){return (c.tags||[]).includes('Agriculture')||hasKeyword(c,['agric','hortic','crop','taro','rice','maize','cassava','terrace','soil']);}
function hasWaterSig(c){return (c.tags||[]).includes('Ecology')||(c.tags||[]).includes('Stewardship')||hasKeyword(c,['water','river','hydrology','irrig','flood','watershed','reef','canal']);}
function hasNavSig(c){return (c.tags||[]).includes('Navigation')||(c.tags||[]).includes('Seafaring')||hasKeyword(c,['navigation','seafaring','voyag','wayfind','canoe','star','compass','maritime']);}
function hasTradeSig(c){return (c.tags||[]).includes('Trade')||(c.tags||[]).includes('Networks')||hasKeyword(c,['trade','exchange','market','caravan','port','strait','route','network']);}
function hasStewardSig(c){return (c.tags||[]).includes('Stewardship')||hasKeyword(c,['steward','sustain','reciprocity','conservation','mālama','caretaking']);}
function hasGovSig(c){return (c.tags||[]).includes('Governance')||hasKeyword(c,['law','state','administr','council','empire','kingdom','governance','protocol']);}

const LAYER_CFGS = [
  {key:'food',      label:'Food',       stroke:0x00ff80, strokeCss:'rgba(0,255,128,.8)',  dash:false, fn:hasFoodSig},
  {key:'water',     label:'Water',      stroke:0x00f7ff, strokeCss:'rgba(0,247,255,.8)',  dash:true,  fn:hasWaterSig},
  {key:'navigation',label:'Navigation', stroke:0x9d00ff, strokeCss:'rgba(157,0,255,.8)', dash:true,  fn:hasNavSig},
  {key:'trade',     label:'Trade',      stroke:0xffd700, strokeCss:'rgba(255,215,0,.8)', dash:true,  fn:hasTradeSig},
  {key:'stewardship',label:'Stewardship',stroke:0x00f7cc,strokeCss:'rgba(0,247,204,.7)',dash:false, fn:hasStewardSig},
  {key:'governance',label:'Governance', stroke:0xffffff, strokeCss:'rgba(255,255,255,.5)',dash:true, fn:hasGovSig},
];

function normalizeCulture(c) {
  const id=String(c.id||'').trim()||`c_${Math.random().toString(16).slice(2)}`;
  const coords=Array.isArray(c.coords)?c.coords:[0,0];
  const lon=Number(coords[0]),lat=Number(coords[1]);
  const coordsOk=Number.isFinite(lon)&&Number.isFinite(lat)&&Math.abs(lon)<=180&&Math.abs(lat)<=90;
  const arr=v=>Array.isArray(v)?v.map(String):[];
  const tags=Array.isArray(c.tags)?uniq(c.tags.map(String)):[];
  const eraInfo=parseEra(String(c.era||''));
  return {
    id,name:String(c.name||'').trim()||'Unknown',symbol:String(c.symbol||'🌐'),
    lon,lat,coordsOk,region:String(c.region||'Other'),location:String(c.location||''),
    era:String(c.era||''),eraStart:eraInfo.start,eraEnd:eraInfo.end,tags,
    desc:String(c.desc||''),creationStories:arr(c.creationStories),corePrinciples:arr(c.corePrinciples),
    martialArts:arr(c.martialArts),highlights:arr(c.highlights),knowledgeSystems:arr(c.knowledgeSystems),
    notableSitesOrTexts:arr(c.notableSitesOrTexts),movement:arr(c.movement),
    modernLegacy:arr(c.modernLegacy),agricultureSystems:arr(c.agricultureSystems),
    story:Array.isArray(c.story)?c.story.map(String):[],
    readingLinks:Array.isArray(c.readingLinks)?c.readingLinks:[],
    keyTerms:[...tags].slice(0,10),
  };
}

function normalizeWorld(raw) {
  const obj=raw?.objects||{};
  const cObj=obj.countries||obj.country||Object.values(obj)[0]||null;
  let countries={type:'FeatureCollection',features:[]};
  if(cObj){try{countries=topojson.feature(raw,cObj);}catch{}}
  let land=null;
  if(obj.land){try{land=topojson.feature(raw,obj.land);}catch{}}
  if(!land) land={type:'Feature',geometry:{type:'Sphere'},properties:{}};
  return {land,countries,raw};
}

function normalizeLink(l,byId) {
  if(!l||typeof l!=='object') return null;
  const a=byId.get(String(l.source||'')),b=byId.get(String(l.target||''));
  if(!a||!b) return null;
  return {source:a,target:b,label:String(l.label||''),themes:Array.isArray(l.themes)?l.themes.map(String):[],description:String(l.description||''),_kind:'official'};
}

async function loadAll() {
  const [worldRaw,culturesRaw] = await Promise.all([
    d3.json(WORLD_URL),
    fetch(CULTURES_URL,{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(r.status)),
  ]);
  const world = normalizeWorld(worldRaw);
  const cultures = (culturesRaw?.cultures||[]).map(normalizeCulture).filter(c=>c.coordsOk);
  const byId = new Map(cultures.map(c=>[c.id,c]));
  const linksOfficial = (culturesRaw?.links||[]).map(l=>normalizeLink(l,byId)).filter(Boolean);
  const lensCache = new Map();
  for(const lens of Object.keys(LENS_ALIASES))
    lensCache.set(lens, linksOfficial.filter(l=>lensMatch(l,lens)));
  return {world,cultures,byId,linksOfficial,lensCache};
}

// ══════════════════════════════════════════════════════════
// EARTH CANVAS TEXTURE
// Renders D3 equirectangular map onto a canvas used as
// THREE.CanvasTexture — wraps perfectly onto SphereGeometry
// ══════════════════════════════════════════════════════════
function buildEarthTexture(world) {
  const W=2048,H=1024;
  const canvas=document.createElement('canvas');
  canvas.width=W; canvas.height=H;
  const ctx=canvas.getContext('2d');

  /* Ocean */
  ctx.fillStyle='#091522';
  ctx.fillRect(0,0,W,H);

  /* Grid lines (subtle) */
  ctx.strokeStyle='rgba(0,100,150,.08)';
  ctx.lineWidth=0.5;
  for(let lon=-180;lon<=180;lon+=30){
    const x=(lon+180)/360*W;
    ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();
  }
  for(let lat=-90;lat<=90;lat+=30){
    const y=(90-lat)/180*H;
    ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();
  }

  /* Land */
  const proj=d3.geoEquirectangular().scale(W/(2*Math.PI)).translate([W/2,H/2]);
  const path=d3.geoPath(proj,ctx);
  ctx.beginPath(); path(world.land);
  ctx.fillStyle='#132235';
  ctx.strokeStyle='#1a3040';
  ctx.lineWidth=0.8;
  ctx.fill(); ctx.stroke();

  /* Country borders */
  ctx.beginPath(); path({type:'FeatureCollection',features:world.countries.features||[]});
  ctx.strokeStyle='rgba(0,200,255,.12)';
  ctx.lineWidth=0.4;
  ctx.stroke();

  return new THREE.CanvasTexture(canvas);
}

// ══════════════════════════════════════════════════════════
// GEODESIC ARC POINTS
// Returns CatmullRomCurve3 that arcs over the sphere surface
// ══════════════════════════════════════════════════════════
function geodesicCurve(c1, c2, segs=80) {
  const v1=latLon3D(c1.lat,c1.lon);
  const v2=latLon3D(c2.lat,c2.lon);
  const angle=v1.angleTo(v2);
  const lift=Math.max(0.12, Math.min(0.55, angle*0.6));
  const pts=[];
  for(let i=0;i<=segs;i++){
    const t=i/segs;
    /* Slerp (great circle) */
    const p=new THREE.Vector3().copy(v1).lerp(
      new THREE.Vector3().copy(v2),t
    ).normalize();
    /* Parabolic lift above surface */
    const h=GLOBE_R + lift * Math.sin(Math.PI*t);
    pts.push(p.multiplyScalar(h));
  }
  return new THREE.CatmullRomCurve3(pts);
}

// ══════════════════════════════════════════════════════════
// THREE.JS GLOBE CLASS
//
// ══════════════════════════════════════════════════════════
// CULTURE ART — SVG LANDMARK ILLUSTRATIONS
// Culturally accurate, mobile-friendly SVG art for each tradition.
// ══════════════════════════════════════════════════════════

// ── SVG Cultural Art Library ──────────────────────────────
const CULTURE_SVG_ART = {

// ── Hawaiian Islands & Hōkūleʻa ──────────────────────────
kanaka_kumulipo:`<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
<defs>
  <linearGradient id="hk-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#010818"/><stop offset="55%" stop-color="#061a3a"/><stop offset="100%" stop-color="#0e2f1a"/></linearGradient>
  <linearGradient id="hk-mtn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2a1a08"/><stop offset="100%" stop-color="#1a0f05"/></linearGradient>
  <linearGradient id="hk-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#082845"/><stop offset="100%" stop-color="#020d1e"/></linearGradient>
  <radialGradient id="hk-star" cx="50%" cy="50%"><stop offset="0%" stop-color="#ffd700"/><stop offset="100%" stop-color="#ffd70000"/></radialGradient>
  <filter id="hk-glow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<!-- Sky -->
<rect width="560" height="220" fill="url(#hk-sky)"/>
<!-- Stars scattered -->
<g opacity=".9">
  <circle cx="42" cy="18" r="1.2" fill="#e8d8ff"/><circle cx="105" cy="28" r="1.8" fill="#ffd700"/><circle cx="185" cy="12" r="1.1" fill="#c8e0ff"/>
  <circle cx="248" cy="35" r="1.4" fill="#fff"/><circle cx="305" cy="14" r="1.0" fill="#e0f0ff"/><circle cx="370" cy="28" r="1.6" fill="#ffd700"/>
  <circle cx="415" cy="10" r="1.2" fill="#ffe0a0"/><circle cx="460" cy="22" r="1.0" fill="#c0d8ff"/><circle cx="518" cy="8" r="1.4" fill="#fff"/>
  <circle cx="78" cy="55" r="0.9" fill="#d0e8ff"/><circle cx="148" cy="48" r="0.8" fill="#fff"/><circle cx="210" cy="65" r="0.9" fill="#ffe8a0"/>
  <circle cx="340" cy="52" r="0.8" fill="#e0f0ff"/><circle cx="495" cy="45" r="1.0" fill="#ffd700" opacity=".7"/>
</g>
<!-- Hōkūleʻa (Arcturus) — gold zenith star with glow -->
<g filter="url(#hk-glow)">
  <circle cx="280" cy="30" r="5" fill="#ffd700" opacity=".95"/>
  <line x1="280" y1="16" x2="280" y2="44" stroke="#ffd700" stroke-width="1.2" opacity=".5"/>
  <line x1="266" y1="30" x2="294" y2="30" stroke="#ffd700" stroke-width="1.2" opacity=".5"/>
  <line x1="270" y1="20" x2="290" y2="40" stroke="#ffd700" stroke-width=".8" opacity=".35"/>
  <line x1="290" y1="20" x2="270" y2="40" stroke="#ffd700" stroke-width=".8" opacity=".35"/>
</g>
<!-- Constellation lines -->
<g stroke="#ffd700" stroke-width=".7" opacity=".3" stroke-dasharray="3 4">
  <line x1="280" y1="30" x2="215" y2="55"/><line x1="215" y1="55" x2="168" y2="70"/>
  <line x1="280" y1="30" x2="370" y2="28"/><line x1="105" y1="28" x2="215" y2="55"/>
</g>
<!-- Mauna Kea + Big Island silhouette -->
<path d="M 60,155 L 140,82 L 195,118 L 240,155" fill="url(#hk-mtn)"/>
<!-- Snow cap -->
<path d="M 130,86 L 140,82 L 150,86 L 147,98 L 133,98 Z" fill="#ddeeff" opacity=".85"/>
<!-- Green island base -->
<ellipse cx="155" cy="158" rx="100" ry="12" fill="#1a3a10"/>
<!-- Smaller islands -->
<ellipse cx="295" cy="160" rx="38" ry="9" fill="#1a3a10"/><ellipse cx="310" cy="158" rx="22" ry="6" fill="#152d0d"/>
<ellipse cx="380" cy="162" rx="28" ry="7" fill="#1a3a10"/>
<ellipse cx="435" cy="165" rx="18" ry="5" fill="#1a3a10"/>
<!-- Ocean -->
<rect x="0" y="170" width="560" height="50" fill="url(#hk-sea)"/>
<!-- Wave lines -->
<g stroke="#0af" stroke-width=".7" opacity=".18" fill="none">
  <path d="M 0,178 Q 70,172 140,178 Q 210,184 280,178 Q 350,172 420,178 Q 490,184 560,178"/>
  <path d="M 0,188 Q 70,182 140,188 Q 210,194 280,188 Q 350,182 420,188 Q 490,194 560,188"/>
</g>
<!-- Hōkūleʻa canoe silhouette -->
<g transform="translate(200,175)">
  <path d="M 0,0 Q 60,-10 120,0 Q 100,6 60,7 Q 20,6 0,0 Z" fill="#3d1e08"/>
  <!-- Twin hulls -->
  <rect x="0" y="2" width="120" height="5" rx="2.5" fill="#2a1505"/>
  <!-- Mast + crab-claw sail -->
  <line x1="60" y1="-10" x2="60" y2="-55" stroke="#5a3010" stroke-width="2"/>
  <path d="M 60,-55 L 20,-22 L 60,-8 Z" fill="#d4aa70" opacity=".75"/>
  <path d="M 60,-55 L 100,-22 L 60,-8 Z" fill="#c49a60" opacity=".7"/>
  <!-- Connecting beam -->
  <rect x="25" y="-5" width="70" height="2" rx="1" fill="#4a2808"/>
</g>
<!-- Hibiscus accent (bottom right) -->
<g transform="translate(488,182)" opacity=".7">
  <circle cx="0" cy="0" r="10" fill="none" stroke="#ff3355" stroke-width="2"/>
  <path d="M 0,-10 Q 6,-4 0,0 Q -6,-4 0,-10" fill="#ff3355" opacity=".8"/>
  <path d="M 10,0 Q 4,6 0,0 Q 4,-6 10,0" fill="#ff4466" opacity=".8"/>
  <path d="M 0,10 Q -6,4 0,0 Q 6,4 0,10" fill="#ff3355" opacity=".8"/>
  <path d="M -10,0 Q -4,-6 0,0 Q -4,6 -10,0" fill="#ff4466" opacity=".8"/>
  <circle cx="0" cy="0" r="3.5" fill="#ffd700"/>
</g>
<!-- Title -->
<text x="18" y="210" font-family="'Orbitron',monospace" font-size="8" fill="#ffd700" opacity=".6" letter-spacing=".1em">HAWAI'I · KUMULIPO · HŌKŪLE'A</text>
</svg>`,

// ── Kemet — Giza & the Nile ────────────────────────────────
kemet:`<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
<defs>
  <linearGradient id="eg-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#050815"/><stop offset="45%" stop-color="#1a0e28"/><stop offset="100%" stop-color="#4a1e06"/></linearGradient>
  <linearGradient id="eg-sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#c4892a"/><stop offset="100%" stop-color="#8a5e1a"/></linearGradient>
  <radialGradient id="eg-sun" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ffd700"/><stop offset="40%" stop-color="#ff8800"/><stop offset="100%" stop-color="#ff880000"/></radialGradient>
  <filter id="eg-glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<!-- Sky -->
<rect width="560" height="220" fill="url(#eg-sky)"/>
<!-- Sun disk / Ra -->
<g filter="url(#eg-glow)">
  <circle cx="480" cy="55" r="28" fill="url(#eg-sun)" opacity=".9"/>
  <circle cx="480" cy="55" r="18" fill="#ffd700" opacity=".95"/>
  <!-- Sun rays -->
  <g stroke="#ffd700" stroke-width="1.5" opacity=".4">
    <line x1="480" y1="19" x2="480" y2="7"/><line x1="480" y1="91" x2="480" y2="103"/>
    <line x1="444" y1="55" x2="432" y2="55"/><line x1="516" y1="55" x2="528" y2="55"/>
    <line x1="455" y1="30" x2="446" y2="21"/><line x1="505" y1="80" x2="514" y2="89"/>
    <line x1="505" y1="30" x2="514" y2="21"/><line x1="455" y1="80" x2="446" y2="89"/>
  </g>
</g>
<!-- Stars (night side) -->
<g opacity=".7"><circle cx="30" cy="20" r="1.2" fill="#e0e8ff"/><circle cx="80" cy="12" r="1.0" fill="#fff"/><circle cx="135" cy="30" r="1.4" fill="#ffe8b0"/><circle cx="195" cy="18" r="0.9" fill="#e0e8ff"/></g>
<!-- Nile river -->
<rect x="8" y="145" width="30" height="75" fill="#1a4a6a" opacity=".85"/>
<!-- Delta vegetation -->
<rect x="6" y="142" width="35" height="8" rx="2" fill="#1a4a14" opacity=".7"/>
<!-- Desert ground -->
<rect x="38" y="155" width="522" height="65" fill="url(#eg-sand)"/>
<!-- Great Pyramid (Khufu) — largest, leftmost -->
<path d="M 85,155 L 195,68 L 305,155 Z" fill="#c4892a"/>
<path d="M 95,155 L 195,68 L 295,155 Z" fill="#b07820"/><path d="M 195,68 L 305,155 L 285,155 L 195,78 Z" fill="#9a6615"/>
<!-- Casing stones lines -->
<g stroke="#d4a030" stroke-width=".5" opacity=".3">
  <line x1="130" y1="135" x2="260" y2="135"/><line x1="115" y1="148" x2="275" y2="148"/>
  <line x1="145" y1="122" x2="245" y2="122"/><line x1="165" y1="108" x2="225" y2="108"/>
</g>
<!-- Capstone glint -->
<path d="M 190,68 L 195,62 L 200,68 Z" fill="#ffd700" opacity=".9"/>
<!-- Khafre (middle) -->
<path d="M 310,155 L 388,90 L 466,155 Z" fill="#b8801e"/>
<path d="M 318,155 L 388,90 L 458,155 Z" fill="#a87018"/>
<!-- Menkaure (small) -->
<path d="M 470,155 L 510,118 L 550,155 Z" fill="#a87018"/>
<!-- Sphinx silhouette -->
<g transform="translate(55,145)">
  <ellipse cx="28" cy="10" rx="28" ry="10" fill="#b07820"/>
  <path d="M 8,10 Q 8,-2 20,-5 Q 30,-8 38,0 Q 46,-4 48,6" fill="#c4892a"/>
  <ellipse cx="38" cy="4" rx="12" ry="10" fill="#b07820"/>
  <!-- Head shape -->
  <path d="M 26,-5 Q 38,-14 48,0 Q 50,8 38,10 Q 26,10 26,-5 Z" fill="#c4892a"/>
  <!-- Headdress -->
  <path d="M 28,-14 Q 38,-20 48,-12 L 52,5 L 38,-4 Z" fill="#d4a030" opacity=".8"/>
</g>
<!-- Hieroglyph border strip -->
<g opacity=".5">
  <rect x="0" y="205" width="560" height="15" fill="rgba(0,0,0,.3)"/>
  <text x="15" y="216" font-family="serif" font-size="10" fill="#ffd700" letter-spacing="6">𓃭 𓇋 𓂋 𓀁 𓆣 𓏏 𓂤</text>
</g>
<!-- Title -->
<text x="18" y="200" font-family="'Orbitron',monospace" font-size="8" fill="#ffd700" opacity=".6" letter-spacing=".1em">KEMET · GIZA · MA'AT</text>
</svg>`,

// ── Angkor Wat / Khmer ─────────────────────────────────────
khmer:`<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
<defs>
  <linearGradient id="aw-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#020810"/><stop offset="50%" stop-color="#0a1828"/><stop offset="100%" stop-color="#c4611a"/></linearGradient>
  <linearGradient id="aw-stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8a7060"/><stop offset="100%" stop-color="#6a5040"/></linearGradient>
  <linearGradient id="aw-moat" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#102838"/><stop offset="100%" stop-color="#08181e"/></linearGradient>
  <filter id="aw-glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="560" height="220" fill="url(#aw-sky)"/>
<!-- Sunrise glow -->
<ellipse cx="280" cy="145" rx="120" ry="40" fill="#ff8800" opacity=".12"/>
<ellipse cx="280" cy="148" rx="60" ry="20" fill="#ffbb33" opacity=".18"/>
<!-- Stars fading -->
<g opacity=".4"><circle cx="60" cy="20" r="1.2" fill="#c0d8ff"/><circle cx="120" cy="12" r="1" fill="#fff"/><circle cx="480" cy="18" r="1" fill="#c0d8ff"/><circle cx="530" cy="28" r="1.2" fill="#ffe8b0"/></g>
<!-- Jungle silhouette -->
<path d="M 0,148 Q 30,130 60,148 Q 80,135 110,148 Q 130,132 155,148 L 0,148 Z" fill="#0a2008"/>
<path d="M 405,148 Q 435,130 465,148 Q 485,132 520,148 Q 540,135 560,145 L 560,148 Z" fill="#0a2008"/>
<!-- Moat/reflection water -->
<rect x="80" y="148" width="400" height="22" fill="url(#aw-moat)"/>
<!-- Temple reflection (mirrored, inverted, blurred) -->
<g opacity=".35" transform="translate(0,296) scale(1,-1)">
  <rect x="220" y="148" width="120" height="30" fill="#6a5040"/>
  <polygon points="280,118 220,148 340,148" fill="#7a6050"/>
</g>
<!-- Base terrace levels -->
<rect x="120" y="130" width="320" height="18" fill="url(#aw-stone)" rx="2"/>
<rect x="150" y="115" width="260" height="15" fill="#8a7060" rx="1"/>
<rect x="185" y="102" width="190" height="13" fill="#7a6050" rx="1"/>
<!-- Galleries -->
<rect x="125" y="125" width="310" height="5" fill="#6a5040"/>
<!-- Five towers (lotus-bud tops) — central tallest -->
<!-- Outer left -->
<rect x="135" y="95" width="28" height="35" fill="#7a6050"/>
<path d="M 135,95 Q 149,78 163,95 Z" fill="#8a7060"/>
<path d="M 139,79 Q 149,68 159,79 L 156,86 L 142,86 Z" fill="#9a8070"/>
<circle cx="149" cy="67" r="5" fill="#8a7060"/>
<!-- Left center -->
<rect x="190" y="85" width="28" height="45" fill="#7a6050"/>
<path d="M 190,85 Q 204,64 218,85 Z" fill="#8a7060"/>
<path d="M 194,66 Q 204,52 214,66 L 211,74 L 197,74 Z" fill="#9a8070"/>
<circle cx="204" cy="51" r="5.5" fill="#8a7060"/>
<!-- Central/tallest -->
<rect x="242" y="70" width="36" height="60" fill="#8a7060"/>
<path d="M 242,70 Q 260,42 278,70 Z" fill="#9a8070"/>
<path d="M 246,44 Q 260,26 274,44 L 270,56 L 250,56 Z" fill="#aa9080"/>
<circle cx="260" cy="24" r="7" fill="#9a8070"/>
<!-- Right center -->
<rect x="342" y="85" width="28" height="45" fill="#7a6050"/>
<path d="M 342,85 Q 356,64 370,85 Z" fill="#8a7060"/>
<path d="M 346,66 Q 356,52 366,66 L 363,74 L 349,74 Z" fill="#9a8070"/>
<circle cx="356" cy="51" r="5.5" fill="#8a7060"/>
<!-- Outer right -->
<rect x="397" y="95" width="28" height="35" fill="#7a6050"/>
<path d="M 397,95 Q 411,78 425,95 Z" fill="#8a7060"/>
<path d="M 401,79 Q 411,68 421,79 L 418,86 L 404,86 Z" fill="#9a8070"/>
<circle cx="411" cy="67" r="5" fill="#8a7060"/>
<!-- Title -->
<text x="18" y="212" font-family="'Orbitron',monospace" font-size="8" fill="#ffd700" opacity=".6" letter-spacing=".1em">ANGKOR WAT · KHMER · WATER AS STATECRAFT</text>
</svg>`,

// ── Norse Longship & Aurora ────────────────────────────────
norse:`<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
<defs>
  <linearGradient id="no-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#020510"/><stop offset="100%" stop-color="#040e20"/></linearGradient>
  <linearGradient id="no-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#061428"/><stop offset="100%" stop-color="#020810"/></linearGradient>
  <filter id="no-aur"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="no-glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="560" height="220" fill="url(#no-sky)"/>
<!-- Aurora borealis -->
<g filter="url(#no-aur)" opacity=".6">
  <path d="M 0,40 Q 140,20 280,60 Q 420,100 560,30" fill="none" stroke="#00ff88" stroke-width="25" opacity=".3"/>
  <path d="M 0,70 Q 140,50 280,80 Q 420,110 560,55" fill="none" stroke="#00ddaa" stroke-width="18" opacity=".25"/>
  <path d="M 0,30 Q 140,60 280,40 Q 420,20 560,50" fill="none" stroke="#8800ff" stroke-width="15" opacity=".2"/>
  <path d="M 0,90 Q 150,60 300,90 Q 430,115 560,75" fill="none" stroke="#00ff88" stroke-width="10" opacity=".2"/>
</g>
<!-- Stars -->
<g opacity=".85"><circle cx="25" cy="15" r="1.5" fill="#e8f0ff"/><circle cx="75" cy="8" r="1.2" fill="#fff"/><circle cx="140" cy="22" r="1.8" fill="#ffe8b0"/><circle cx="220" cy="10" r="1" fill="#e8f0ff"/><circle cx="320" cy="18" r="1.4" fill="#fff"/><circle cx="410" cy="8" r="1" fill="#c8e0ff"/><circle cx="490" cy="20" r="1.5" fill="#ffe8b0"/><circle cx="540" cy="10" r="1.2" fill="#fff"/></g>
<!-- Polaris -->
<g filter="url(#no-glow)"><circle cx="280" cy="22" r="3" fill="#e8f0ff"/></g>
<!-- Sea -->
<rect x="0" y="158" width="560" height="62" fill="url(#no-sea)"/>
<!-- Ice horizon -->
<path d="M 0,158 Q 70,150 140,158 Q 210,166 280,155 Q 350,144 420,158 Q 490,166 560,155" fill="#061428" opacity=".8"/>
<!-- Wave texture -->
<g stroke="#0af" stroke-width=".6" opacity=".12" fill="none">
  <path d="M 0,168 Q 70,162 140,168 Q 210,174 280,168 Q 350,162 420,168 Q 490,174 560,168"/>
  <path d="M 0,180 Q 70,174 140,180 Q 210,186 280,180 Q 350,174 420,180 Q 490,186 560,180"/>
</g>
<!-- Viking longship -->
<g transform="translate(80,130)">
  <!-- Hull — clinker-built shape -->
  <path d="M 10,30 Q 0,22 2,18 Q 5,14 20,12 L 360,12 Q 385,12 398,20 Q 408,26 400,30 Q 370,38 200,40 Q 60,40 10,30 Z" fill="#3d1e08"/>
  <path d="M 15,28 Q 5,22 8,18 L 380,18 Q 395,20 395,26 Q 370,34 200,36 Q 70,36 15,28 Z" fill="#4a2808"/>
  <!-- Strakes (clinker lines) -->
  <g stroke="#5a3010" stroke-width=".8" opacity=".5">
    <path d="M 20,22 Q 200,20 380,22"/><path d="M 18,26 Q 200,24 382,26"/>
  </g>
  <!-- Dragon prow -->
  <path d="M 2,18 Q -12,10 -25,5 Q -18,8 -10,14 Q -20,5 -30,-2 Q -20,4 -8,12 Q -20,0 -28,-8 Q -15,2 -4,10 Z" fill="#5a3010"/>
  <path d="M -28,-8 Q -35,-15 -28,-10 Q -22,-5 -15,2" fill="#4a2808"/>
  <!-- Stern sweep -->
  <path d="M 400,26 Q 415,20 420,12 Q 416,18 410,24" fill="#3d1e08"/>
  <!-- Mast -->
  <line x1="200" y1="12" x2="200" y2="-75" stroke="#5a3010" stroke-width="4"/>
  <!-- Square sail — striped red/tan -->
  <rect x="130" y="-70" width="140" height="75" fill="#c42a14" opacity=".8" rx="2"/>
  <g stroke="#a02010" stroke-width="4" opacity=".6"><line x1="162" y1="-70" x2="162" y2="5"/><line x1="200" y1="-70" x2="200" y2="5"/><line x1="238" y1="-70" x2="238" y2="5"/></g>
  <rect x="130" y="-70" width="140" height="75" fill="none" stroke="#3d1e08" stroke-width="2" rx="2"/>
  <!-- Yard arm -->
  <line x1="128" y1="-68" x2="272" y2="-68" stroke="#5a3010" stroke-width="3"/>
  <!-- Oar ports -->
  <g fill="#2a1005">
    <circle cx="60" cy="25" r="4"/><circle cx="100" cy="24" r="4"/><circle cx="140" cy="24" r="4"/>
    <circle cx="260" cy="24" r="4"/><circle cx="300" cy="24" r="4"/><circle cx="340" cy="25" r="4"/>
  </g>
  <!-- Shield row -->
  <g fill="none" stroke="#8a4410" stroke-width="1.5">
    <circle cx="55" cy="18" r="6"/><circle cx="90" cy="17" r="6"/><circle cx="125" cy="17" r="6"/>
    <circle cx="270" cy="17" r="6"/><circle cx="305" cy="17" r="6"/><circle cx="340" cy="18" r="6"/>
  </g>
</g>
<!-- Runic border -->
<g opacity=".35">
  <rect x="0" y="208" width="560" height="12" fill="rgba(0,30,10,.6)"/>
  <text x="15" y="218" font-family="serif" font-size="10" fill="#00ff88" letter-spacing="5">ᛟ ᚦ ᚢ ᚱ ᛋ ᚲ ᛁ ᚷ ᛚ ᚠ ᚾ ᛏ ᛒ ᛖ ᛗ</text>
</g>
<text x="18" y="204" font-family="'Orbitron',monospace" font-size="8" fill="#00ff88" opacity=".6" letter-spacing=".1em">NORSE LONGSHIP · NORTH ATLANTIC · YGGDRASIL</text>
</svg>`,

// ── El Castillo, Chichén Itzá — Maya ──────────────────────
maya:`<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
<defs>
  <linearGradient id="my-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#030a05"/><stop offset="45%" stop-color="#0a1a10"/><stop offset="100%" stop-color="#3a2800"/></linearGradient>
  <linearGradient id="my-stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8a8870"/><stop offset="100%" stop-color="#6a6852"/></linearGradient>
  <radialGradient id="my-venus" cx="50%" cy="50%"><stop offset="0%" stop-color="#e8f0ff"/><stop offset="100%" stop-color="#e8f0ff00"/></radialGradient>
  <filter id="my-glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="560" height="220" fill="url(#my-sky)"/>
<!-- Stars/Venus -->
<g opacity=".8"><circle cx="45" cy="18" r="1.2" fill="#e0f0ff"/><circle cx="110" cy="10" r="1" fill="#fff"/><circle cx="200" cy="22" r="1.4" fill="#ffe8b0"/><circle cx="380" cy="14" r="1.2" fill="#e0f0ff"/><circle cx="470" cy="8" r="1.6" fill="#c8e0ff"/><circle cx="525" cy="22" r="1" fill="#fff"/></g>
<!-- Venus (heliacal) — bright -->
<g filter="url(#my-glow)"><circle cx="440" cy="35" r="5" fill="#e8f8ff" opacity=".9"/></g>
<!-- Jungle silhouette -->
<path d="M 0,175 Q 30,155 60,175 Q 85,158 115,175 Q 135,160 160,175 L 0,175 Z" fill="#061208"/>
<path d="M 400,175 Q 430,158 460,175 Q 480,160 510,175 Q 530,162 560,172 L 560,175 Z" fill="#061208"/>
<!-- Ground -->
<rect x="0" y="178" width="560" height="42" fill="#2a2010"/>
<!-- Platform base -->
<rect x="120" y="165" width="320" height="13" fill="#6a6852" rx="1"/>
<!-- El Castillo — 9-tiered pyramid -->
<!-- Each tier step -->
<rect x="135" y="152" width="290" height="13" fill="url(#my-stone)" rx="1"/>
<rect x="155" y="140" width="250" height="12" fill="#8a8870" rx="1"/>
<rect x="175" y="129" width="210" height="11" fill="#7a7860" rx="1"/>
<rect x="195" y="119" width="170" height="10" fill="#8a8870" rx="1"/>
<rect x="212" y="110" width="136" height="9" fill="#7a7860" rx="1"/>
<rect x="228" y="102" width="104" height="8" fill="#8a8870" rx="1"/>
<rect x="242" y="95" width="76" height="7" fill="#7a7860" rx="1"/>
<rect x="254" y="89" width="52" height="6" fill="#8a8870" rx="1"/>
<rect x="264" y="84" width="32" height="5" fill="#7a7860" rx="1"/>
<!-- Temple on top -->
<rect x="256" y="65" width="48" height="19" fill="#8a8870"/>
<rect x="253" y="62" width="54" height="3" fill="#9a9880"/>
<!-- Temple roof comb -->
<path d="M 254,62 Q 280,50 306,62 Z" fill="#7a7860"/>
<!-- Serpent shadow at base (equinox effect) -->
<g opacity=".7">
  <path d="M 135,165 Q 155,158 140,152 Q 155,148 138,143" fill="none" stroke="#4a3810" stroke-width="6"/>
  <ellipse cx="132" cy="168" rx="8" ry="5" fill="#3a2808"/><!-- Serpent head -->
  <path d="M 128,167 Q 125,172 130,174 Q 135,173 138,168 Z" fill="#4a3810"/>
</g>
<!-- Central stairway -->
<rect x="277" y="65" width="6" height="100" fill="#5a5840" opacity=".6"/>
<!-- Glyph panels (decorative) -->
<g opacity=".4" fill="#9a9880">
  <rect x="148" y="144" width="12" height="8" rx="1"/><rect x="400" y="144" width="12" height="8" rx="1"/>
  <rect x="170" y="133" width="10" height="7" rx="1"/><rect x="380" y="133" width="10" height="7" rx="1"/>
</g>
<!-- Venus glyph -->
<g transform="translate(500,40)" opacity=".5" fill="#e8f8ff">
  <circle cx="0" cy="0" r="8" fill="none" stroke="#e8f8ff" stroke-width="1.5"/>
  <line x1="0" y1="-8" x2="0" y2="-14"/><line x1="0" y1="8" x2="0" y2="14"/>
  <line x1="-8" y1="0" x2="-14" y2="0"/><line x1="8" y1="0" x2="14" y2="0"/>
</g>
<!-- Long Count glyph band -->
<g opacity=".3" transform="translate(15,202)">
  <text font-family="serif" font-size="9" fill="#88cc44" letter-spacing="4">𓆣 ⚫ ─── BAKTUN · KATUN · TUN · UINAL · KIN ─── ⚫ 𓆣</text>
</g>
<text x="18" y="198" font-family="'Orbitron',monospace" font-size="8" fill="#88cc44" opacity=".6" letter-spacing=".1em">EL CASTILLO · CHICHÉN ITZÁ · LONG COUNT</text>
</svg>`,

// ── Machu Picchu / Inca ────────────────────────────────────
inca:`<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
<defs>
  <linearGradient id="ic-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#060814"/><stop offset="40%" stop-color="#10203a"/><stop offset="100%" stop-color="#283848"/></linearGradient>
  <linearGradient id="ic-mtn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#384855"/><stop offset="100%" stop-color="#1e2830"/></linearGradient>
  <linearGradient id="ic-sun" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffd700"/><stop offset="100%" stop-color="#ff8800"/></linearGradient>
  <filter id="ic-mist"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="ic-glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="560" height="220" fill="url(#ic-sky)"/>
<!-- Stars -->
<g opacity=".7"><circle cx="30" cy="15" r="1.2" fill="#c8e0ff"/><circle cx="90" cy="8" r="1" fill="#fff"/><circle cx="160" cy="20" r="1.4" fill="#ffe8b0"/><circle cx="470" cy="12" r="1.2" fill="#e8f0ff"/><circle cx="520" cy="25" r="1" fill="#fff"/></g>
<!-- Inti sun disc -->
<g filter="url(#ic-glow)" transform="translate(420,45)">
  <circle cx="0" cy="0" r="22" fill="url(#ic-sun)" opacity=".85"/>
  <circle cx="0" cy="0" r="14" fill="#ffd700"/>
  <!-- Rays -->
  <g stroke="#ffd700" stroke-width="2" opacity=".5">
    <line x1="0" y1="-22" x2="0" y2="-32"/><line x1="0" y1="22" x2="0" y2="32"/>
    <line x1="-22" y1="0" x2="-32" y2="0"/><line x1="22" y1="0" x2="32" y2="0"/>
    <line x1="-16" y1="-16" x2="-22" y2="-22"/><line x1="16" y1="16" x2="22" y2="22"/>
    <line x1="16" y1="-16" x2="22" y2="-22"/><line x1="-16" y1="16" x2="-22" y2="22"/>
    <line x1="-8" y1="-21" x2="-10" y2="-30"/><line x1="8" y1="-21" x2="10" y2="-30"/>
    <line x1="-8" y1="21" x2="-10" y2="30"/><line x1="8" y1="21" x2="10" y2="30"/>
  </g>
  <!-- Face -->
  <circle cx="-5" cy="-4" r="2.5" fill="#c48000"/><circle cx="5" cy="-4" r="2.5" fill="#c48000"/>
  <path d="M -5,4 Q 0,9 5,4" fill="none" stroke="#c48000" stroke-width="1.5"/>
</g>
<!-- Huayna Picchu (steep peak behind) -->
<path d="M 350,95 L 395,30 L 440,95" fill="url(#ic-mtn)"/>
<path d="M 360,95 L 395,32 L 430,95" fill="#303a45"/>
<!-- Mountain ridgeline -->
<path d="M 0,140 Q 80,110 160,128 Q 240,145 320,128 Q 400,112 480,130 Q 520,140 560,125 L 560,220 L 0,220 Z" fill="#1e2830"/>
<!-- Mist layers -->
<ellipse cx="280" cy="135" rx="200" ry="25" fill="#283848" opacity=".4" filter="url(#ic-mist)"/>
<ellipse cx="200" cy="145" rx="120" ry="15" fill="#30404e" opacity=".3" filter="url(#ic-mist)"/>
<!-- Machu Picchu ridge -->
<rect x="80" y="128" width="360" height="8" rx="3" fill="#384850"/>
<!-- Terrace layers (andenes) — stacked horizontal -->
<g fill="none">
  <g fill="#2a3830"><rect x="85" y="136" width="350" height="6" rx="1"/></g>
  <g fill="#243228"><rect x="90" y="142" width="340" height="6" rx="1"/></g>
  <g fill="#1e2c24"><rect x="95" y="148" width="330" height="6" rx="1"/></g>
  <g fill="#182618"><rect x="100" y="154" width="320" height="6" rx="1"/></g>
  <g fill="#122014"><rect x="105" y="160" width="310" height="6" rx="1"/></g>
  <g fill="#0c1a0e"><rect x="110" y="166" width="300" height="6" rx="1"/></g>
</g>
<!-- Inca stone buildings on ridge -->
<g fill="#384850">
  <rect x="105" y="120" width="22" height="8" rx="1"/><rect x="132" y="118" width="18" height="10" rx="1"/>
  <rect x="155" y="120" width="25" height="8" rx="1"/><rect x="185" y="117" width="20" height="11" rx="1"/>
  <rect x="210" y="119" width="30" height="9" rx="1"/><rect x="245" y="116" width="18" height="12" rx="1"/>
  <rect x="268" y="119" width="22" height="9" rx="1"/><rect x="295" y="118" width="25" height="10" rx="1"/>
  <rect x="325" y="120" width="18" height="8" rx="1"/><rect x="348" y="119" width="22" height="9" rx="1"/>
  <rect x="375" y="121" width="18" height="7" rx="1"/>
</g>
<!-- Intihuatana stone (hitching post of the sun) -->
<g transform="translate(260,112)" fill="#4a5860">
  <rect x="-8" y="-6" width="16" height="6" rx="1"/>
  <rect x="-4" y="-14" width="8" height="8" rx="1"/>
  <rect x="-2" y="-18" width="4" height="4" rx="1"/>
</g>
<!-- Condor silhouette -->
<g transform="translate(70,90)" fill="#1a2830" opacity=".6">
  <path d="M 0,0 Q -20,-8 -35,-2 Q -20,-4 0,0 Q 20,-4 35,-2 Q 20,-8 0,0 Z"/>
  <path d="M 0,0 Q -5,5 -8,10 Q -3,6 0,4 Q 3,6 8,10 Q 5,5 0,0 Z"/>
</g>
<!-- Quipu knots accent -->
<g transform="translate(500,130)" opacity=".5" stroke="#c49a50" stroke-width="1.5" fill="none">
  <line x1="0" y1="0" x2="0" y2="40"/>
  <line x1="-8" y1="5" x2="-8" y2="30"/><line x1="8" y1="8" x2="8" y2="28"/>
  <line x1="-15" y1="10" x2="-15" y2="25"/>
  <circle cx="-8" cy="18" r="3" fill="#c49a50"/><circle cx="8" cy="20" r="2" fill="#c49a50"/>
  <circle cx="-8" cy="12" r="2" fill="#c49a50"/><circle cx="-15" cy="17" r="2" fill="#c49a50"/>
</g>
<text x="18" y="212" font-family="'Orbitron',monospace" font-size="8" fill="#ffd700" opacity=".6" letter-spacing=".1em">MACHU PICCHU · TAWANTINSUYU · QHAPAQ ÑAN</text>
</svg>`,

// ── Ziggurat of Ur / Mesopotamia ──────────────────────────
mesopotamia:`<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
<defs>
  <linearGradient id="ur-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#030510"/><stop offset="50%" stop-color="#0c0820"/><stop offset="100%" stop-color="#381808"/></linearGradient>
  <linearGradient id="ur-brick" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#b06030"/><stop offset="100%" stop-color="#803818"/></linearGradient>
  <filter id="ur-glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="560" height="220" fill="url(#ur-sky)"/>
<!-- Stars -->
<g opacity=".8"><circle cx="35" cy="12" r="1.5" fill="#e8d8ff"/><circle cx="90" cy="22" r="1.2" fill="#fff"/><circle cx="155" cy="10" r="1.0" fill="#ffe8b0"/><circle cx="355" cy="16" r="1.4" fill="#e8d8ff"/><circle cx="430" cy="8" r="1.0" fill="#fff"/><circle cx="510" cy="20" r="1.6" fill="#ffe8b0"/></g>
<!-- Crescent moon -->
<g filter="url(ur-glow)">
  <path d="M 470,30 Q 490,20 500,35 Q 490,25 475,38 Q 462,42 468,30 Z" fill="#ffeebb" opacity=".9"/>
</g>
<!-- Stars — Orion and Pleiades visible -->
<g opacity=".6" fill="#e0e8ff">
  <circle cx="320" cy="25" r="1.2"/><circle cx="335" cy="20" r="1.4"/><circle cx="350" cy="22" r="1.2"/><!-- Belt -->
  <circle cx="340" cy="10" r="1"/><circle cx="328" cy="35" r="0.8"/><!-- Orion body -->
</g>
<!-- Desert ground -->
<rect x="0" y="168" width="560" height="52" fill="#5a3010"/>
<!-- Tigris River glimpse -->
<rect x="470" y="168" width="90" height="52" fill="#1a3a5a" opacity=".7"/>
<!-- River ripples -->
<g stroke="#2a5a8a" stroke-width=".6" opacity=".3" fill="none">
  <path d="M 470,178 Q 510,172 560,178"/><path d="M 470,190 Q 510,184 560,190"/>
</g>
<!-- Palm trees (right) -->
<g transform="translate(440,148)" fill="#2a4810" opacity=".8">
  <rect x="-2" y="0" width="4" height="22" fill="#5a3010"/>
  <path d="M 0,0 Q -18,-8 -20,-4 Q -12,-6 0,0 Z"/>
  <path d="M 0,0 Q 18,-8 20,-4 Q 12,-6 0,0 Z"/>
  <path d="M 0,0 Q -10,-12 -8,-10 Q -6,-8 0,0 Z"/>
  <path d="M 0,0 Q 10,-12 8,-10 Q 6,-8 0,0 Z"/>
  <path d="M 0,0 Q 0,-14 2,-12 Q 1,-8 0,0 Z"/>
</g>
<g transform="translate(400,155)" fill="#2a4810" opacity=".7">
  <rect x="-1.5" y="0" width="3" height="15" fill="#4a2808"/>
  <path d="M 0,0 Q -12,-6 -14,-3 Q -8,-4 0,0 Z"/><path d="M 0,0 Q 12,-6 14,-3 Q 8,-4 0,0 Z"/>
  <path d="M 0,0 Q 0,-10 2,-8 Q 1,-5 0,0 Z"/>
</g>
<!-- Ziggurat of Ur — rectangular tiered temple -->
<!-- Base (Level 1) -->
<rect x="80" y="145" width="340" height="23" fill="url(#ur-brick)" rx="2"/>
<!-- Brick pattern on base -->
<g stroke="#903818" stroke-width=".5" opacity=".4">
  <line x1="80" y1="153" x2="420" y2="153"/><line x1="80" y1="159" x2="420" y2="159"/>
  <line x1="100" y1="145" x2="100" y2="168"/><line x1="130" y1="145" x2="130" y2="168"/>
  <line x1="160" y1="145" x2="160" y2="168"/><line x1="190" y1="145" x2="190" y2="168"/>
  <line x1="220" y1="145" x2="220" y2="168"/><line x1="250" y1="145" x2="250" y2="168"/>
  <line x1="280" y1="145" x2="280" y2="168"/><line x1="310" y1="145" x2="310" y2="168"/>
  <line x1="340" y1="145" x2="340" y2="168"/><line x1="370" y1="145" x2="370" y2="168"/>
  <line x1="400" y1="145" x2="400" y2="168"/>
</g>
<!-- Level 2 -->
<rect x="115" y="118" width="270" height="27" fill="#a05028" rx="1"/>
<g stroke="#904020" stroke-width=".5" opacity=".35">
  <line x1="115" y1="126" x2="385" y2="126"/><line x1="115" y1="135" x2="385" y2="135"/>
  <line x1="145" y1="118" x2="145" y2="145"/><line x1="180" y1="118" x2="180" y2="145"/>
  <line x1="215" y1="118" x2="215" y2="145"/><line x1="250" y1="118" x2="250" y2="145"/>
  <line x1="285" y1="118" x2="285" y2="145"/><line x1="320" y1="118" x2="320" y2="145"/>
  <line x1="355" y1="118" x2="355" y2="145"/>
</g>
<!-- Level 3 -->
<rect x="155" y="95" width="190" height="23" fill="#903818" rx="1"/>
<g stroke="#803010" stroke-width=".5" opacity=".3">
  <line x1="155" y1="104" x2="345" y2="104"/><line x1="155" y1="112" x2="345" y2="112"/>
  <line x1="185" y1="95" x2="185" y2="118"/><line x1="220" y1="95" x2="220" y2="118"/>
  <line x1="255" y1="95" x2="255" y2="118"/><line x1="290" y1="95" x2="290" y2="118"/>
  <line x1="325" y1="95" x2="325" y2="118"/>
</g>
<!-- Temple shrine on top -->
<rect x="210" y="72" width="80" height="23" fill="#c04820"/>
<rect x="205" y="68" width="90" height="4" rx="1" fill="#d05828"/>
<!-- Roof temple -->
<rect x="220" y="58" width="60" height="14" fill="#b04018"/>
<!-- Sacred fire -->
<g filter="url(#ur-glow)" transform="translate(250,56)">
  <path d="M 0,0 Q -5,-8 0,-16 Q 5,-8 0,0 Z" fill="#ff8800" opacity=".9"/>
  <path d="M 0,0 Q -3,-5 0,-10 Q 3,-5 0,0 Z" fill="#ffd700"/>
</g>
<!-- Grand stairway -->
<polygon points="195,145 200,118 260,118 265,145" fill="#7a2808"/>
<polygon points="295,145 300,118 360,118 365,145" fill="#7a2808"/>
<!-- Cuneiform inscription border -->
<g opacity=".4">
  <rect x="0" y="208" width="560" height="12" fill="rgba(0,0,0,.4)"/>
  <text x="12" y="218" font-family="serif" font-size="10" fill="#c06030" letter-spacing="4">𒀭 𒂍 𒀀 𒆳 𒌓 𒈗 𒀭 𒂗 𒍪 𒈗 𒀭</text>
</g>
<text x="18" y="203" font-family="'Orbitron',monospace" font-size="8" fill="#c06030" opacity=".6" letter-spacing=".1em">ZIGGURAT OF UR · SUMER · CUNEIFORM</text>
</svg>`,

// ── Polynesian Voyaging Canoe ──────────────────────────────
polynesia:`<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
<defs>
  <linearGradient id="pv-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#010a20"/><stop offset="100%" stop-color="#061828"/></linearGradient>
  <linearGradient id="pv-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#082040"/><stop offset="100%" stop-color="#030e20"/></linearGradient>
  <radialGradient id="pv-star-hk" cx="50%" cy="50%"><stop offset="0%" stop-color="#ffd700"/><stop offset="100%" stop-color="#ffd70000"/></radialGradient>
  <filter id="pv-glow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="560" height="220" fill="url(#pv-sky)"/>
<!-- Stars -->
<g opacity=".85">
  <circle cx="40" cy="18" r="1.2" fill="#e8d8ff"/><circle cx="88" cy="8" r="1.5" fill="#fff"/><circle cx="142" cy="28" r="1.1" fill="#c8e0ff"/>
  <circle cx="210" cy="14" r="1.0" fill="#ffe8b0"/><circle cx="310" cy="20" r="1.3" fill="#fff"/><circle cx="390" cy="10" r="1.0" fill="#e0f0ff"/>
  <circle cx="455" cy="25" r="1.4" fill="#ffe8b0"/><circle cx="510" cy="12" r="1.2" fill="#c8e0ff"/><circle cx="545" cy="28" r="0.9" fill="#fff"/>
  <circle cx="65" cy="45" r="0.8" fill="#e0f0ff"/><circle cx="155" cy="52" r="0.9" fill="#fff"/><circle cx="345" cy="38" r="0.8" fill="#ffe8b0"/>
</g>
<!-- Star compass rose (centre-top) -->
<g transform="translate(280,40)" filter="url(#pv-glow)">
  <!-- Hōkūleʻa / Arcturus — zenith star -->
  <circle cx="0" cy="0" r="7" fill="url(#pv-star-hk)" opacity=".9"/>
  <circle cx="0" cy="0" r="4" fill="#ffd700"/>
  <g stroke="#ffd700" stroke-width=".8" opacity=".5">
    <line x1="0" y1="-7" x2="0" y2="-12"/><line x1="0" y1="7" x2="0" y2="12"/>
    <line x1="-7" y1="0" x2="-12" y2="0"/><line x1="7" y1="0" x2="12" y2="0"/>
    <line x1="-5" y1="-5" x2="-8" y2="-8"/><line x1="5" y1="5" x2="8" y2="8"/>
    <line x1="5" y1="-5" x2="8" y2="-8"/><line x1="-5" y1="5" x2="-8" y2="8"/>
  </g>
  <!-- Compass ring -->
  <circle cx="0" cy="0" r="38" fill="none" stroke="#ffd700" stroke-width=".5" opacity=".2" stroke-dasharray="2 4"/>
  <!-- N, S, E, W stars on ring -->
  <circle cx="0" cy="-38" r="2.5" fill="#e8f0ff" opacity=".8"/><!-- Polaris -->
  <circle cx="38" cy="0" r="2" fill="#c8e0ff" opacity=".7"/>
  <circle cx="0" cy="38" r="2" fill="#c8e0ff" opacity=".7"/>
  <circle cx="-38" cy="0" r="2" fill="#c8e0ff" opacity=".7"/>
  <!-- Diagonal stars -->
  <circle cx="27" cy="-27" r="1.5" fill="#ffe8a0" opacity=".6"/>
  <circle cx="-27" cy="-27" r="1.5" fill="#ffe8a0" opacity=".6"/>
  <circle cx="27" cy="27" r="1.5" fill="#ffe8a0" opacity=".6"/>
  <circle cx="-27" cy="27" r="1.5" fill="#ffe8a0" opacity=".6"/>
</g>
<!-- Constellation lines from Hōkūleʻa -->
<g stroke="#ffd700" stroke-width=".6" opacity=".2" stroke-dasharray="3 5">
  <line x1="280" y1="40" x2="510" y2="12"/><line x1="280" y1="40" x2="88" y2="8"/>
  <line x1="280" y1="40" x2="280" y2="2"/>
</g>
<!-- Ocean swells -->
<path d="M 0,165 Q 140,150 280,165 Q 420,180 560,165 L 560,220 L 0,220 Z" fill="url(#pv-sea)"/>
<!-- Swell lines -->
<g stroke="#0af" stroke-width=".8" opacity=".15" fill="none">
  <path d="M 0,168 Q 140,155 280,168 Q 420,181 560,168"/>
  <path d="M 0,180 Q 140,167 280,180 Q 420,193 560,180"/>
  <path d="M 0,192 Q 140,179 280,192 Q 420,205 560,192"/>
</g>
<!-- Double-hulled voyaging canoe (Hōkūleʻa) -->
<g transform="translate(60,148)">
  <!-- Hull 1 (main) -->
  <path d="M 8,18 Q 0,14 2,10 Q 5,6 22,4 L 378,4 Q 400,4 418,10 Q 428,16 420,18 Q 390,26 220,28 Q 80,28 8,18 Z" fill="#3d1e08"/>
  <path d="M 12,16 Q 4,13 6,10 L 400,10 Q 415,12 415,16 Q 385,22 220,24 Q 90,24 12,16 Z" fill="#4a2808"/>
  <!-- Hull 2 (outrigger) -->
  <path d="M 20,40 Q 12,36 14,32 Q 17,28 34,26 L 386,26 Q 408,26 420,32 Q 426,36 418,40 Q 388,46 220,48 Q 90,48 20,40 Z" fill="#3d1e08"/>
  <!-- Connecting spars -->
  <rect x="80" y="4" width="8" height="28" rx="2" fill="#5a3010"/>
  <rect x="160" y="4" width="8" height="28" rx="2" fill="#5a3010"/>
  <rect x="250" y="4" width="8" height="28" rx="2" fill="#5a3010"/>
  <rect x="340" y="4" width="8" height="28" rx="2" fill="#5a3010"/>
  <!-- Platform deck -->
  <rect x="78" y="8" width="276" height="6" fill="#6a3818" opacity=".6" rx="1"/>
  <!-- Mast -->
  <line x1="214" y1="4" x2="214" y2="-90" stroke="#5a3010" stroke-width="4"/>
  <!-- Crab-claw sail (lateen) — distinctive Polynesian form -->
  <path d="M 214,-90 L 80,-30 L 214,4 Z" fill="#d4aa70" opacity=".78"/>
  <path d="M 214,-90 L 348,-30 L 214,4 Z" fill="#c4a060" opacity=".73"/>
  <!-- Boom -->
  <line x1="214" y1="4" x2="80" y2="-28" stroke="#5a3010" stroke-width="2.5" opacity=".7"/>
  <line x1="214" y1="4" x2="348" y2="-28" stroke="#4a2808" stroke-width="2.5" opacity=".7"/>
  <!-- Yard arm -->
  <line x1="80" y1="-30" x2="348" y2="-30" stroke="#3d1e08" stroke-width="2"/>
</g>
<text x="18" y="212" font-family="'Orbitron',monospace" font-size="8" fill="#ffd700" opacity=".6" letter-spacing=".1em">HŌKŪLE'A · POLYNESIAN WAYFINDING · STAR COMPASS</text>
</svg>`,

// ── Yoruba — Sacred Ife & Orishas ─────────────────────────
yoruba:`<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
<defs>
  <linearGradient id="yr-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0c0a05"/><stop offset="50%" stop-color="#1a1205"/><stop offset="100%" stop-color="#2e1a08"/></linearGradient>
  <linearGradient id="yr-bronze" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#b88030"/><stop offset="100%" stop-color="#7a5010"/></linearGradient>
  <radialGradient id="yr-orun" cx="50%" cy="50%"><stop offset="0%" stop-color="#ffd700"/><stop offset="100%" stop-color="#ffd70000"/></radialGradient>
  <filter id="yr-glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="560" height="220" fill="url(#yr-sky)"/>
<!-- Sacred forest / grove background -->
<g opacity=".4">
  <rect x="0" y="80" width="25" height="140" fill="#0a1a05"/><rect x="20" y="70" width="20" height="150" fill="#0e2008"/>
  <rect x="38" y="90" width="18" height="130" fill="#0a1a05"/>
  <rect x="480" y="75" width="22" height="145" fill="#0a1a05"/><rect x="500" y="65" width="20" height="155" fill="#0e2008"/>
  <rect x="518" y="85" width="22" height="135" fill="#0a1a05"/>
  <!-- Canopy -->
  <ellipse cx="28" cy="75" rx="40" ry="18" fill="#0e2808"/><ellipse cx="490" cy="68" rx="40" ry="18" fill="#0e2808"/>
</g>
<!-- Ground -->
<rect x="0" y="175" width="560" height="45" fill="#1e0e05"/>
<!-- Odu Ifa — geometric 16-point binary pattern (centre) -->
<g transform="translate(420,80)" opacity=".6">
  <circle cx="0" cy="0" r="50" fill="none" stroke="#ffd700" stroke-width=".8" opacity=".3"/>
  <!-- 16 Odu positions on ring -->
  <g fill="#ffd700" opacity=".7">
    <g transform="rotate(0)"><circle cx="0" cy="-50" r="3"/><text x="-2" y="-55" font-size="6" fill="#ffd700">I</text></g>
    <g transform="rotate(22.5)"><circle cx="0" cy="-50" r="2.5"/></g>
    <g transform="rotate(45)"><circle cx="0" cy="-50" r="2.5"/></g>
    <g transform="rotate(67.5)"><circle cx="0" cy="-50" r="2.5"/></g>
    <g transform="rotate(90)"><circle cx="0" cy="-50" r="3"/></g>
    <g transform="rotate(112.5)"><circle cx="0" cy="-50" r="2.5"/></g>
    <g transform="rotate(135)"><circle cx="0" cy="-50" r="2.5"/></g>
    <g transform="rotate(157.5)"><circle cx="0" cy="-50" r="2.5"/></g>
    <g transform="rotate(180)"><circle cx="0" cy="-50" r="3"/></g>
    <g transform="rotate(202.5)"><circle cx="0" cy="-50" r="2.5"/></g>
    <g transform="rotate(225)"><circle cx="0" cy="-50" r="2.5"/></g>
    <g transform="rotate(247.5)"><circle cx="0" cy="-50" r="2.5"/></g>
    <g transform="rotate(270)"><circle cx="0" cy="-50" r="3"/></g>
    <g transform="rotate(292.5)"><circle cx="0" cy="-50" r="2.5"/></g>
    <g transform="rotate(315)"><circle cx="0" cy="-50" r="2.5"/></g>
    <g transform="rotate(337.5)"><circle cx="0" cy="-50" r="2.5"/></g>
  </g>
  <!-- Opele divination chain -->
  <path d="M -50,0 Q -25,-10 0,0 Q 25,-10 50,0" fill="none" stroke="#ffd700" stroke-width="1.2" opacity=".5"/>
  <circle cx="-50" cy="0" r="5" fill="#8a5010" opacity=".8"/><circle cx="50" cy="0" r="5" fill="#8a5010" opacity=".8"/>
</g>
<!-- Ashe symbol / Ori glow (top left) -->
<g filter="url(#yr-glow)" transform="translate(80,40)">
  <circle cx="0" cy="0" r="20" fill="url(#yr-orun)" opacity=".6"/>
  <circle cx="0" cy="0" r="10" fill="#ffd700" opacity=".8"/>
</g>
<!-- Ife Bronze head — main centerpiece -->
<g transform="translate(200,60)">
  <!-- Neck/torso base -->
  <rect x="-18" y="95" width="36" height="25" fill="url(#yr-bronze)" rx="2"/>
  <rect x="-25" y="115" width="50" height="8" fill="#8a6020" rx="2"/>
  <!-- Head -->
  <ellipse cx="0" cy="70" rx="38" ry="45" fill="url(#yr-bronze)"/>
  <!-- Crown/beaded cap -->
  <ellipse cx="0" cy="28" rx="32" ry="12" fill="#9a7030"/>
  <rect x="-32" y="25" width="64" height="8" rx="2" fill="#aa8040"/>
  <!-- Vertical line scarifications (face) -->
  <g stroke="#8a5010" stroke-width="1.2" opacity=".6">
    <line x1="-15" y1="55" x2="-15" y2="95"/><line x1="-8" y1="50" x2="-8" y2="96"/>
    <line x1="0" y1="48" x2="0" y2="96"/><line x1="8" y1="50" x2="8" y2="96"/>
    <line x1="15" y1="55" x2="15" y2="95"/>
  </g>
  <!-- Eyes (almonds) -->
  <ellipse cx="-14" cy="68" rx="9" ry="4.5" fill="#6a3808"/><circle cx="-14" cy="68" r="3" fill="#1a0a00"/>
  <ellipse cx="14" cy="68" rx="9" ry="4.5" fill="#6a3808"/><circle cx="14" cy="68" r="3" fill="#1a0a00"/>
  <!-- Nose -->
  <path d="M -5,78 Q 0,85 5,78" fill="none" stroke="#8a5010" stroke-width="1.5"/>
  <!-- Lips -->
  <path d="M -12,90 Q 0,97 12,90" fill="none" stroke="#7a4010" stroke-width="2"/>
  <path d="M -10,90 Q 0,88 10,90" fill="#7a4010" opacity=".5"/>
  <!-- Beaded collar -->
  <g transform="translate(0,115)">
    <path d="M -25,0 Q 0,-8 25,0" fill="none" stroke="#ffd700" stroke-width="3" opacity=".7"/>
    <g fill="#ffd700" opacity=".7">
      <circle cx="-20" cy="-1" r="2"/><circle cx="-13" cy="-4" r="2"/><circle cx="-6" cy="-6" r="2"/>
      <circle cx="0" cy="-7" r="2.5"/><circle cx="6" cy="-6" r="2"/><circle cx="13" cy="-4" r="2"/><circle cx="20" cy="-1" r="2"/>
    </g>
  </g>
  <!-- Crown vertical striations -->
  <g stroke="#7a5020" stroke-width=".8" opacity=".5">
    <line x1="-28" y1="25" x2="-28" y2="35"/><line x1="-20" y1="22" x2="-20" y2="33"/>
    <line x1="-12" y1="20" x2="-12" y2="33"/><line x1="0" y1="18" x2="0" y2="32"/>
    <line x1="12" y1="20" x2="12" y2="33"/><line x1="20" y1="22" x2="20" y2="33"/>
    <line x1="28" y1="25" x2="28" y2="35"/>
  </g>
</g>
<!-- Adinkra/Ifa symbols border -->
<g opacity=".35">
  <rect x="0" y="205" width="560" height="15" fill="rgba(0,0,0,.4)"/>
  <text x="15" y="216" font-family="serif" font-size="10" fill="#ffd700" letter-spacing="6">⚡ ◈ ◉ ⊕ ◈ ⚡ ◈ ◉ ⊕ ◈ ⚡</text>
</g>
<!-- Indigo dye pattern border (top) -->
<rect x="0" y="0" width="560" height="4" fill="#1a0a5a" opacity=".6"/>
<rect x="0" y="4" width="560" height="2" fill="#ffd700" opacity=".2"/>
<text x="18" y="200" font-family="'Orbitron',monospace" font-size="8" fill="#ffd700" opacity=".6" letter-spacing=".1em">IFÁ DIVINATION · ILÉ-IFÈ · YORUBA · ORISHA</text>
</svg>`,

// ── Sangam Tamil — Gopuram Temple ────────────────────────
dravidian_sangam:`<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
<defs>
  <linearGradient id="tm-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#08050f"/><stop offset="45%" stop-color="#150828"/><stop offset="100%" stop-color="#3a1808"/></linearGradient>
  <linearGradient id="tm-stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#c86020"/><stop offset="100%" stop-color="#8a3810"/></linearGradient>
  <radialGradient id="tm-sun" cx="50%" cy="50%"><stop offset="0%" stop-color="#ffee22"/><stop offset="100%" stop-color="#ff880000"/></radialGradient>
  <filter id="tm-glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="560" height="220" fill="url(#tm-sky)"/>
<!-- Stars -->
<g opacity=".7"><circle cx="30" cy="15" r="1.2" fill="#e0d8ff"/><circle cx="90" cy="8" r="1" fill="#fff"/><circle cx="170" cy="22" r="1.4" fill="#ffe0a0"/><circle cx="440" cy="12" r="1" fill="#e0d8ff"/><circle cx="510" cy="20" r="1.3" fill="#fff"/></g>
<!-- Venus / Murukan star -->
<g filter="url(#tm-glow)"><circle cx="450" cy="32" r="5" fill="url(#tm-sun)" opacity=".8"/><circle cx="450" cy="32" r="3" fill="#ffee22"/></g>
<!-- Lotus pond (base) -->
<ellipse cx="280" cy="195" rx="200" ry="20" fill="#0a2230" opacity=".7"/>
<g fill="#1a4a20" opacity=".5">
  <ellipse cx="200" cy="193" rx="18" ry="6"/><ellipse cx="260" cy="196" rx="15" ry="5"/>
  <ellipse cx="310" cy="194" rx="20" ry="6"/><ellipse cx="355" cy="197" rx="14" ry="5"/>
</g>
<!-- Lotus flowers -->
<g fill="#ff6688" opacity=".7">
  <circle cx="215" cy="190" r="5"/><circle cx="210" cy="190" r="3"/><circle cx="220" cy="190" r="3"/>
  <circle cx="305" cy="188" r="6"/><circle cx="299" cy="189" r="3.5"/><circle cx="311" cy="189" r="3.5"/>
</g>
<!-- Temple base platform -->
<rect x="80" y="168" width="400" height="18" fill="#7a3810" rx="2"/>
<rect x="85" y="162" width="390" height="6" rx="1" fill="#8a4820"/>
<!-- Gopuram tower — characteristic South Indian form with many tiers -->
<!-- Base entrance gateway arch -->
<rect x="220" y="148" width="120" height="20" fill="#9a4820"/>
<path d="M 220,148 Q 280,135 340,148 Z" fill="#8a3810"/>
<!-- Tier 1 -->
<rect x="195" y="128" width="170" height="20" fill="url(#tm-stone)" rx="1"/>
<!-- Tier 2 -->
<rect x="210" y="110" width="140" height="18" fill="#b85820" rx="1"/>
<!-- Tier 3 -->
<rect x="225" y="94" width="110" height="16" fill="#a84818" rx="1"/>
<!-- Tier 4 -->
<rect x="238" y="80" width="84" height="14" fill="#b85820" rx="1"/>
<!-- Tier 5 -->
<rect x="250" y="68" width="60" height="12" fill="#a84818" rx="1"/>
<!-- Tier 6 -->
<rect x="260" y="57" width="40" height="11" fill="#b85820" rx="1"/>
<!-- Tier 7 -->
<rect x="268" y="48" width="24" height="9" fill="#a84818" rx="1"/>
<!-- Kalasha (finial pot) -->
<ellipse cx="280" cy="44" rx="10" ry="6" fill="#c86020"/>
<ellipse cx="280" cy="38" rx="6" ry="4" fill="#d87030"/>
<circle cx="280" cy="33" r="5" fill="#e88040"/>
<!-- Kalasha flame/tip -->
<path d="M 280,28 Q 283,22 280,16 Q 277,22 280,28 Z" fill="#ffee22" opacity=".8"/>
<!-- Carved figure rows (decorative horizontal bands) -->
<g opacity=".4" fill="#d07030">
  <!-- Tier 1 figures -->
  <g transform="translate(200,132)">
    <g><path d="M 8,0 Q 8,-10 12,-12 Q 16,-10 16,0 Z" fill="#e08040"/><rect x="9" y="-12" width="6" height="3" fill="#c07030"/></g>
    <g transform="translate(25,0)"><path d="M 8,0 Q 8,-10 12,-12 Q 16,-10 16,0 Z" fill="#e08040"/></g>
    <g transform="translate(50,0)"><path d="M 8,0 Q 8,-10 12,-12 Q 16,-10 16,0 Z" fill="#e08040"/></g>
    <g transform="translate(75,0)"><path d="M 8,0 Q 8,-10 12,-12 Q 16,-10 16,0 Z" fill="#e08040"/></g>
    <g transform="translate(100,0)"><path d="M 8,0 Q 8,-10 12,-12 Q 16,-10 16,0 Z" fill="#e08040"/></g>
    <g transform="translate(125,0)"><path d="M 8,0 Q 8,-10 12,-12 Q 16,-10 16,0 Z" fill="#e08040"/></g>
  </g>
</g>
<!-- Peacock silhouette -->
<g transform="translate(80,155)" opacity=".7">
  <path d="M 0,20 Q 5,10 0,0 Q -5,10 0,20 Z" fill="#1a3a2a"/>
  <circle cx="0" cy="-2" r="6" fill="#2a5a3a"/>
  <!-- Fan tail -->
  <g fill="none" stroke="#1a4a3a" stroke-width="1.2" opacity=".7">
    <path d="M 0,5 Q -20,-15 -15,-25"/><path d="M 0,5 Q -12,-20 -5,-28"/>
    <path d="M 0,5 Q 0,-22 0,-30"/><path d="M 0,5 Q 12,-20 5,-28"/>
    <path d="M 0,5 Q 20,-15 15,-25"/>
  </g>
  <g fill="#2a7a4a" opacity=".5"><circle cx="-15" cy="-25" r="3"/><circle cx="-5" cy="-28" r="3"/><circle cx="0" cy="-30" r="3"/><circle cx="5" cy="-28" r="3"/><circle cx="15" cy="-25" r="3"/></g>
</g>
<!-- Tamil script accent -->
<text x="420" y="175" font-family="serif" font-size="18" fill="#ffd700" opacity=".4">தமிழ்</text>
<!-- Tinai ecological zones strip -->
<g opacity=".3" transform="translate(15,205)">
  <text font-family="serif" font-size="9" fill="#e08040" letter-spacing="3">KURINJI · MULLAI · MARUDAM · NEYTAL · PALAI</text>
</g>
<text x="18" y="200" font-family="'Orbitron',monospace" font-size="8" fill="#e08040" opacity=".6" letter-spacing=".1em">SANGAM TAMIL · GOPURAM · TOLKĀPPIYAM</text>
</svg>`,

// ── Machu Picchu for andean_tawantinsuyu (reuse inca) ─────
andean_tawantinsuyu:`<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
<defs>
  <linearGradient id="at-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#060814"/><stop offset="40%" stop-color="#10203a"/><stop offset="100%" stop-color="#283848"/></linearGradient>
  <linearGradient id="at-mtn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#384855"/><stop offset="100%" stop-color="#1e2830"/></linearGradient>
  <linearGradient id="at-sun" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffd700"/><stop offset="100%" stop-color="#ff8800"/></linearGradient>
  <filter id="at-mist"><feGaussianBlur stdDeviation="5"/></filter>
  <filter id="at-glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="560" height="220" fill="url(#at-sky)"/>
<g opacity=".6"><circle cx="40" cy="12" r="1.2" fill="#c8e0ff"/><circle cx="100" cy="6" r="1" fill="#fff"/><circle cx="175" cy="18" r="1.4" fill="#ffe8b0"/><circle cx="460" cy="10" r="1.2" fill="#e8f0ff"/><circle cx="525" cy="22" r="1" fill="#fff"/></g>
<!-- Inti sun disc -->
<g filter="url(#at-glow)" transform="translate(420,45)">
  <circle cx="0" cy="0" r="22" fill="url(#at-sun)" opacity=".85"/>
  <circle cx="0" cy="0" r="14" fill="#ffd700"/>
  <g stroke="#ffd700" stroke-width="2" opacity=".5">
    <line x1="0" y1="-22" x2="0" y2="-32"/><line x1="0" y1="22" x2="0" y2="32"/>
    <line x1="-22" y1="0" x2="-32" y2="0"/><line x1="22" y1="0" x2="32" y2="0"/>
    <line x1="-16" y1="-16" x2="-22" y2="-22"/><line x1="16" y1="16" x2="22" y2="22"/>
    <line x1="16" y1="-16" x2="22" y2="-22"/><line x1="-16" y1="16" x2="-22" y2="22"/>
  </g>
  <circle cx="-5" cy="-4" r="2.5" fill="#c48000"/><circle cx="5" cy="-4" r="2.5" fill="#c48000"/>
  <path d="M -5,4 Q 0,9 5,4" fill="none" stroke="#c48000" stroke-width="1.5"/>
</g>
<!-- Mountains -->
<path d="M 320,95 L 378,28 L 436,95" fill="url(#at-mtn)"/>
<path d="M 330,95 L 378,30 L 426,95" fill="#303a45"/>
<!-- Mountain ridge -->
<path d="M 0,138 Q 80,108 160,126 Q 240,143 320,126 Q 400,110 480,128 Q 520,138 560,123 L 560,220 L 0,220 Z" fill="#1e2830"/>
<!-- Mist -->
<ellipse cx="280" cy="133" rx="200" ry="22" fill="#283848" opacity=".35" filter="url(#at-mist)"/>
<!-- Machu Picchu ridge + terraces -->
<rect x="82" y="126" width="358" height="8" rx="3" fill="#384850"/>
<g>
  <rect x="87" y="134" width="348" height="6" rx="1" fill="#2a3830"/>
  <rect x="92" y="140" width="338" height="6" rx="1" fill="#243228"/>
  <rect x="97" y="146" width="328" height="6" rx="1" fill="#1e2c24"/>
  <rect x="102" y="152" width="318" height="6" rx="1" fill="#182618"/>
  <rect x="107" y="158" width="308" height="6" rx="1" fill="#122014"/>
</g>
<!-- Buildings -->
<g fill="#384850">
  <rect x="107" y="118" width="22" height="8" rx="1"/><rect x="134" y="116" width="18" height="10" rx="1"/>
  <rect x="157" y="118" width="25" height="8" rx="1"/><rect x="187" y="115" width="20" height="11" rx="1"/>
  <rect x="212" y="117" width="30" height="9" rx="1"/><rect x="247" y="114" width="18" height="12" rx="1"/>
  <rect x="270" y="117" width="22" height="9" rx="1"/><rect x="297" y="116" width="25" height="10" rx="1"/>
  <rect x="327" y="118" width="18" height="8" rx="1"/><rect x="350" y="117" width="22" height="9" rx="1"/>
</g>
<!-- Llama silhouette -->
<g transform="translate(90,118)" fill="#384850" opacity=".8">
  <path d="M 0,20 Q 5,0 15,-5 Q 20,0 18,5 Q 22,-5 28,0 Q 28,20 20,20 L 0,20 Z"/>
  <circle cx="15" cy="-7" r="5"/><!-- Head -->
  <path d="M 15,-12 Q 17,-18 16,-22" stroke="#384850" stroke-width="2" fill="none"/><!-- Neck/ears -->
</g>
<!-- Quipu knots -->
<g transform="translate(498,128)" opacity=".5" stroke="#c49a50" stroke-width="1.5" fill="none">
  <line x1="0" y1="0" x2="0" y2="40"/>
  <line x1="-8" y1="5" x2="-8" y2="30"/><line x1="8" y1="8" x2="8" y2="28"/>
  <circle cx="-8" cy="18" r="3" fill="#c49a50"/><circle cx="8" cy="20" r="2" fill="#c49a50"/>
  <circle cx="-8" cy="12" r="2" fill="#c49a50"/>
</g>
<text x="18" y="212" font-family="'Orbitron',monospace" font-size="8" fill="#ffd700" opacity=".6" letter-spacing=".1em">MACHU PICCHU · TAWANTINSUYU · KHIPU · INTI</text>
</svg>`,

// ── Classic Maya (El Castillo) ─────────────────────────────
maya_classic:`<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
<defs>
  <linearGradient id="mc-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#030a05"/><stop offset="45%" stop-color="#0a1a10"/><stop offset="100%" stop-color="#3a2800"/></linearGradient>
  <filter id="mc-glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="560" height="220" fill="url(#mc-sky)"/>
<g opacity=".8"><circle cx="45" cy="18" r="1.2" fill="#e0f0ff"/><circle cx="110" cy="10" r="1" fill="#fff"/><circle cx="200" cy="22" r="1.4" fill="#ffe8b0"/><circle cx="380" cy="14" r="1.2" fill="#e0f0ff"/><circle cx="510" cy="8" r="1.6" fill="#c8e0ff"/></g>
<g filter="url(#mc-glow)"><circle cx="440" cy="35" r="5" fill="#e8f8ff" opacity=".9"/></g>
<path d="M 0,175 Q 30,155 60,175 Q 85,158 115,175 Q 135,160 160,175 L 0,175 Z" fill="#061208"/>
<path d="M 400,175 Q 430,158 460,175 Q 480,160 510,175 Q 530,162 560,172 L 560,175 Z" fill="#061208"/>
<rect x="0" y="178" width="560" height="42" fill="#2a2010"/>
<rect x="120" y="165" width="320" height="13" fill="#6a6852" rx="1"/>
<rect x="135" y="152" width="290" height="13" fill="#8a8870" rx="1"/>
<rect x="155" y="140" width="250" height="12" fill="#7a7860" rx="1"/>
<rect x="175" y="129" width="210" height="11" fill="#8a8870" rx="1"/>
<rect x="195" y="119" width="170" height="10" fill="#7a7860" rx="1"/>
<rect x="212" y="110" width="136" height="9" fill="#8a8870" rx="1"/>
<rect x="228" y="102" width="104" height="8" fill="#7a7860" rx="1"/>
<rect x="242" y="95" width="76" height="7" fill="#8a8870" rx="1"/>
<rect x="254" y="89" width="52" height="6" fill="#7a7860" rx="1"/>
<rect x="264" y="84" width="32" height="5" fill="#8a8870" rx="1"/>
<rect x="256" y="65" width="48" height="19" fill="#8a8870"/>
<rect x="253" y="62" width="54" height="3" fill="#9a9880"/>
<path d="M 254,62 Q 280,50 306,62 Z" fill="#7a7860"/>
<!-- Serpent shadow -->
<path d="M 135,165 Q 155,158 140,152 Q 155,148 138,143" fill="none" stroke="#4a3810" stroke-width="6" opacity=".7"/>
<ellipse cx="132" cy="168" rx="8" ry="5" fill="#3a2808" opacity=".7"/>
<rect x="277" y="65" width="6" height="100" fill="#5a5840" opacity=".6"/>
<!-- Dresden Codex panel (top right) -->
<g transform="translate(440,55)" opacity=".55">
  <rect x="0" y="0" width="80" height="100" fill="#e8d8b0" rx="3"/>
  <rect x="2" y="2" width="76" height="96" fill="#d8c8a0" rx="2"/>
  <!-- Glyph rows -->
  <g fill="#5a1808">
    <rect x="8" y="8" width="14" height="14" rx="2"/><rect x="30" y="8" width="14" height="14" rx="2"/><rect x="52" y="8" width="14" height="14" rx="2"/>
    <rect x="8" y="28" width="14" height="14" rx="2"/><rect x="30" y="28" width="14" height="14" rx="2"/><rect x="52" y="28" width="14" height="14" rx="2"/>
    <rect x="8" y="48" width="14" height="14" rx="2"/><rect x="30" y="48" width="14" height="14" rx="2"/><rect x="52" y="48" width="14" height="14" rx="2"/>
  </g>
  <!-- Dot-bar numbers -->
  <g fill="#5a1808">
    <circle cx="14" cy="72" r="2"/><circle cx="20" cy="72" r="2"/><rect x="8" y="77" width="18" height="3" rx="1"/>
    <circle cx="40" cy="72" r="2"/><rect x="35" y="77" width="10" height="3" rx="1"/>
    <circle cx="60" cy="72" r="2"/><circle cx="66" cy="72" r="2"/><circle cx="60" cy="67" r="2"/>
  </g>
  <!-- Venus symbol -->
  <path d="M 30,88 Q 40,82 50,88" fill="none" stroke="#5a1808" stroke-width="1.5"/>
  <circle cx="40" cy="82" r="4" fill="none" stroke="#5a1808" stroke-width="1.2"/>
</g>
<text x="18" y="198" font-family="'Orbitron',monospace" font-size="8" fill="#88cc44" opacity=".6" letter-spacing=".1em">CLASSIC MAYA · EL CASTILLO · DRESDEN CODEX</text>
</svg>`,

// ── Antarctic / Yaghan — Beagle Channel ───────────────────
antarctic:`<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
<defs>
  <linearGradient id="ac-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#020810"/><stop offset="100%" stop-color="#060e1a"/></linearGradient>
  <linearGradient id="ac-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#04101e"/><stop offset="100%" stop-color="#020810"/></linearGradient>
  <linearGradient id="ac-mtn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#aabbcc"/><stop offset="100%" stop-color="#5a6a78"/></linearGradient>
  <filter id="ac-aur"><feGaussianBlur stdDeviation="8"/></filter>
  <filter id="ac-fire"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="560" height="220" fill="url(#ac-sky)"/>
<!-- Aurora australis -->
<g filter="url(#ac-aur)" opacity=".55">
  <path d="M 0,60 Q 140,30 280,60 Q 420,90 560,40" fill="none" stroke="#00ff88" stroke-width="22" opacity=".3"/>
  <path d="M 0,90 Q 140,55 280,80 Q 420,105 560,65" fill="none" stroke="#00ddaa" stroke-width="14" opacity=".25"/>
  <path d="M 0,45 Q 140,70 280,45 Q 420,20 560,55" fill="none" stroke="#44ff88" stroke-width="10" opacity=".2"/>
</g>
<!-- Stars (Southern Cross prominent) -->
<g opacity=".9">
  <circle cx="350" cy="25" r="2.2" fill="#e8f8ff"/><circle cx="362" cy="42" r="2.2" fill="#e8f8ff"/>
  <circle cx="340" cy="38" r="1.8" fill="#e8f8ff"/><circle cx="360" cy="32" r="1.4" fill="#e8f8ff"/>
  <!-- Crux lines -->
  <line x1="350" y1="25" x2="362" y2="42" stroke="#e8f8ff" stroke-width=".6" opacity=".4"/>
  <line x1="340" y1="38" x2="360" y2="32" stroke="#e8f8ff" stroke-width=".6" opacity=".4"/>
</g>
<g opacity=".7"><circle cx="30" cy="18" r="1.2" fill="#c8e0ff"/><circle cx="88" cy="8" r="1" fill="#fff"/><circle cx="155" cy="25" r="1.4" fill="#e8f8ff"/><circle cx="480" cy="14" r="1" fill="#c8e0ff"/><circle cx="530" cy="28" r="1.2" fill="#fff"/></g>
<!-- Snow mountains — Beagle Channel scenery -->
<!-- Left mountains -->
<path d="M 0,140 L 80,60 L 160,140" fill="url(#ac-mtn)"/>
<path d="M 10,140 L 80,62 L 150,140" fill="#7a8a98"/>
<!-- Snow cap left -->
<path d="M 65,64 L 80,58 L 95,64 L 90,80 L 70,80 Z" fill="#eef6ff" opacity=".9"/>
<!-- Right mountains -->
<path d="M 400,140 L 480,55 L 560,140" fill="url(#ac-mtn)"/>
<path d="M 410,140 L 480,57 L 550,140" fill="#7a8a98"/>
<!-- Snow cap right -->
<path d="M 465,59 L 480,53 L 495,59 L 490,75 L 470,75 Z" fill="#eef6ff" opacity=".9"/>
<!-- Middle distant mountains -->
<path d="M 150,145 L 210,100 L 270,145" fill="#6a7a88" opacity=".7"/>
<path d="M 290,145 L 350,95 L 410,145" fill="#6a7a88" opacity=".7"/>
<!-- Snow on middle mountains -->
<path d="M 198,103 L 210,98 L 222,103 L 218,114 L 202,114 Z" fill="#d8e8f0" opacity=".7"/>
<path d="M 338,98 L 350,93 L 362,98 L 358,108 L 342,108 Z" fill="#d8e8f0" opacity=".7"/>
<!-- Beagle Channel water -->
<rect x="0" y="148" width="560" height="72" fill="url(#ac-sea)"/>
<!-- Ice reflections -->
<g opacity=".2">
  <path d="M 400,148 L 480,165 L 560,155 L 560,148 Z" fill="#aabbcc"/>
  <path d="M 0,148 L 80,162 L 160,152 L 0,148 Z" fill="#aabbcc"/>
</g>
<!-- Water ripples -->
<g stroke="#0af" stroke-width=".5" opacity=".1" fill="none">
  <path d="M 0,160 Q 140,153 280,160 Q 420,167 560,160"/>
  <path d="M 0,172 Q 140,165 280,172 Q 420,179 560,172"/>
</g>
<!-- Yaghan bark canoe with fire -->
<g transform="translate(195,145)">
  <!-- Hull -->
  <path d="M 0,15 Q 4,8 12,6 L 148,6 Q 158,8 168,15 Q 155,20 84,22 Q 20,22 0,15 Z" fill="#4a2808"/>
  <path d="M 5,13 Q 10,8 16,7 L 144,7 Q 152,9 158,13 Q 145,18 84,19 Q 28,19 5,13 Z" fill="#5a3210"/>
  <!-- Fire in canoe -->
  <g filter="url(#ac-fire)" transform="translate(80,3)">
    <path d="M 0,0 Q -5,-8 0,-18 Q 5,-8 0,0 Z" fill="#ff8800" opacity=".95"/>
    <path d="M -3,-4 Q -2,-10 0,-14 Q 2,-10 3,-4 Q 0,0 -3,-4 Z" fill="#ffcc00"/>
    <path d="M 0,0 Q 3,-6 0,-12 Q -3,-6 0,0 Z" fill="#ffd700" opacity=".8"/>
  </g>
</g>
<!-- Penguin silhouettes -->
<g transform="translate(50,148)" fill="#1a2830">
  <g transform="translate(0,0)"><ellipse cx="0" cy="0" rx="5" ry="9"/><ellipse cx="0" cy="-11" rx="4" ry="5"/><ellipse cx="1" cy="-9" rx="2" ry="3" fill="#ddd"/></g>
  <g transform="translate(18,3)"><ellipse cx="0" cy="0" rx="4" ry="7"/><ellipse cx="0" cy="-9" rx="3.5" ry="4"/><ellipse cx="1" cy="-8" rx="1.8" ry="2.5" fill="#ddd"/></g>
  <g transform="translate(35,1)"><ellipse cx="0" cy="0" rx="5" ry="9"/><ellipse cx="0" cy="-11" rx="4" ry="5"/><ellipse cx="1" cy="-9" rx="2" ry="3" fill="#ddd"/></g>
</g>
<!-- Southern Cross label -->
<text x="330" y="18" font-family="'Orbitron',monospace" font-size="7" fill="#e8f8ff" opacity=".4">✛ CRUX</text>
<text x="18" y="212" font-family="'Orbitron',monospace" font-size="8" fill="#00ff88" opacity=".6" letter-spacing=".1em">BEAGLE CHANNEL · YAGHAN · AURORA AUSTRALIS</text>
</svg>`,

// ── Generic fallback ───────────────────────────────────────
_generic:`<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
<defs>
  <radialGradient id="gn-bg" cx="50%" cy="50%"><stop offset="0%" stop-color="#061828"/><stop offset="100%" stop-color="#010810"/></radialGradient>
  <radialGradient id="gn-orb" cx="50%" cy="50%"><stop offset="0%" stop-color="#00aaff"/><stop offset="60%" stop-color="#004488"/><stop offset="100%" stop-color="#00000000"/></radialGradient>
  <filter id="gn-glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="560" height="220" fill="url(#gn-bg)"/>
<!-- Stars scattered -->
<g opacity=".7">
  <circle cx="50" cy="20" r="1.5" fill="#e8e0ff"/><circle cx="120" cy="12" r="1.2" fill="#fff"/><circle cx="200" cy="28" r="1" fill="#c8e0ff"/>
  <circle cx="280" cy="15" r="1.8" fill="#ffe8b0"/><circle cx="360" cy="22" r="1.2" fill="#e0f0ff"/><circle cx="440" cy="10" r="1" fill="#fff"/>
  <circle cx="510" cy="25" r="1.4" fill="#c8e0ff"/>
</g>
<!-- Constellation web -->
<g stroke="#0af" stroke-width=".5" opacity=".15">
  <line x1="50" y1="20" x2="120" y2="12"/><line x1="120" y1="12" x2="200" y2="28"/>
  <line x1="200" y1="28" x2="280" y2="15"/><line x1="280" y1="15" x2="360" y2="22"/>
  <line x1="360" y1="22" x2="440" y2="10"/><line x1="440" y1="10" x2="510" y2="25"/>
</g>
<!-- Central orb -->
<g filter="url(#gn-glow)">
  <circle cx="280" cy="110" r="55" fill="url(#gn-orb)" opacity=".8"/>
  <circle cx="280" cy="110" r="35" fill="#004488" opacity=".6"/>
  <circle cx="280" cy="110" r="18" fill="#0066aa" opacity=".7"/>
</g>
<!-- Latitude/longitude lines on orb -->
<g transform="translate(280,110)" fill="none" stroke="#0af" stroke-width=".7" opacity=".25">
  <circle cx="0" cy="0" r="55"/><circle cx="0" cy="0" r="38"/>
  <ellipse rx="55" ry="20" transform="rotate(30)"/>
  <ellipse rx="55" ry="20" transform="rotate(-30)"/>
  <line x1="-55" y1="0" x2="55" y2="0"/><line x1="0" y1="-55" x2="0" y2="55"/>
</g>
</svg>`
}; // end CULTURE_SVG_ART

// ── Alias shared scenes ───────────────────────────────────
CULTURE_SVG_ART.kush        = CULTURE_SVG_ART.kemet;
CULTURE_SVG_ART.maori       = CULTURE_SVG_ART.polynesia;
CULTURE_SVG_ART.samoa       = CULTURE_SVG_ART.polynesia;
CULTURE_SVG_ART.tonga       = CULTURE_SVG_ART.polynesia;
CULTURE_SVG_ART.marquesas   = CULTURE_SVG_ART.polynesia;
CULTURE_SVG_ART.palau       = CULTURE_SVG_ART.polynesia;
CULTURE_SVG_ART.thailand    = CULTURE_SVG_ART.khmer;
CULTURE_SVG_ART.maya        = CULTURE_SVG_ART.maya_classic;
CULTURE_SVG_ART.aztec       = CULTURE_SVG_ART.maya_classic;
CULTURE_SVG_ART.inca        = CULTURE_SVG_ART.andean_tawantinsuyu;
CULTURE_SVG_ART.tiwanaku    = CULTURE_SVG_ART.andean_tawantinsuyu;
CULTURE_SVG_ART.moche       = CULTURE_SVG_ART.andean_tawantinsuyu;
CULTURE_SVG_ART.sumer       = CULTURE_SVG_ART.mesopotamia;
CULTURE_SVG_ART.akkad       = CULTURE_SVG_ART.mesopotamia;
CULTURE_SVG_ART.babylonia   = CULTURE_SVG_ART.mesopotamia;
CULTURE_SVG_ART.assyria     = CULTURE_SVG_ART.mesopotamia;
CULTURE_SVG_ART.inuit       = CULTURE_SVG_ART.antarctic;
CULTURE_SVG_ART.nenets      = CULTURE_SVG_ART.antarctic;
CULTURE_SVG_ART.chukchi     = CULTURE_SVG_ART.antarctic;

// ── Landmark display names ───────────────────────────────
const LANDMARK_CONFIGS = {
  kanaka_kumulipo:     {name:"Hawaiian Islands & Hōkūleʻa"},
  polynesia:           {name:"Polynesian Voyaging Canoe"},
  maori:               {name:"Te Waka / Polynesian Navigator"},
  samoa:               {name:"Polynesian Voyaging Tradition"},
  tonga:               {name:"Tu'i Tonga Maritime Heritage"},
  marquesas:           {name:"Te Henua Enana"},
  palau:               {name:"Micronesian Reef & Lagoon"},
  kemet:               {name:"Giza Complex & the Nile"},
  kush:                {name:"Nubian Pyramids & Nile Corridor"},
  khmer:               {name:"Angkor Wat, Cambodia"},
  thailand:            {name:"Wat Phra Kaew, Chao Phraya"},
  norse:               {name:"Norse Longship & Aurora Borealis"},
  maya:                {name:"El Castillo, Chichén Itzá"},
  maya_classic:        {name:"Classic Maya · Dresden Codex"},
  aztec:               {name:"Templo Mayor, Tenochtitlan"},
  inca:                {name:"Machu Picchu, Tawantinsuyu"},
  andean_tawantinsuyu: {name:"Machu Picchu · Inti · Khipu"},
  tiwanaku:            {name:"Tiwanaku — Gateway of the Sun"},
  moche:               {name:"Huaca de la Luna, North Coast Peru"},
  mesopotamia:         {name:"Ziggurat of Ur, Sumer"},
  sumer:               {name:"Ziggurat of Ur — Cuneiform"},
  akkad:               {name:"Akkadian Empire"},
  babylonia:           {name:"Babylon — Hammurabi's Code"},
  assyria:             {name:"Nineveh — Library of Ashurbanipal"},
  antarctic:           {name:"Beagle Channel — Yaghan & Fire"},
  inuit:               {name:"Arctic Ocean — Sea Ice Intelligence"},
  nenets:              {name:"Yamal Peninsula — Reindeer Migration"},
  chukchi:             {name:"Chukotka — Sea Ice & Whale"},
  yoruba:              {name:"Ilé-Ifè — Ifa Divination & Bronze"},
  dravidian_sangam:    {name:"Sangam Tamil — Gopuram Temple"},
};

// ── CSS animation keyframes (injected once) ───────────────
(function(){
  if(document.getElementById('cw-art-styles')) return;
  const s=document.createElement('style');
  s.id='cw-art-styles';
  s.textContent=`
    .landmark-art-wrap { position:relative; overflow:hidden; border-radius:0 0 8px 8px; }
    .landmark-art-wrap svg { display:block; width:100%; height:auto; }
    @keyframes cw-star-twinkle { 0%,100%{opacity:.7} 50%{opacity:1} }
    @keyframes cw-aurora-pulse { 0%,100%{opacity:.55} 50%{opacity:.75} }
    @keyframes cw-canoe-rock { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-2px)} }
    @keyframes cw-flame-flicker { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08) translateY(-1px)} }
    @keyframes cw-sun-pulse { 0%,100%{opacity:.85} 50%{opacity:1} }
  `;
  document.head.appendChild(s);
})();


// ══════════════════════════════════════════════════════════
// LANDMARK SCENE CLASS — SVG-based cultural art renderer
// ══════════════════════════════════════════════════════════
class LandmarkScene {
  constructor(){ this._el = null; }

  mount(cultureId, containerId){
    const container = document.getElementById(containerId);
    if(!container) return;
    this.unmount();
    const cfg  = LANDMARK_CONFIGS[cultureId] || {};
    const svg  = CULTURE_SVG_ART[cultureId]  || CULTURE_SVG_ART._generic;
    const name = cfg.name || cultureId.replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase());
    container.innerHTML = `
      <div class="landmark-hdr">⬡ ${name}</div>
      <div class="landmark-art-wrap">${svg}</div>
    `;
    container.style.display = 'block';
    this._el = container;
  }

  unmount(){
    if(this._el){ this._el.style.display = 'none'; this._el.innerHTML = ''; }
    this._el = null;
  }

  // keep destroy() as an alias so existing callers don't break
  destroy(){ this.unmount(); }
}

// ══════════════════════════════════════════════════════════
// REAL CELESTIAL STAR MAP OVERLAY
// Accurate RA/Dec catalog · Real constellation lines
// 68 named stars · 10 constellations · 350 background stars
// ══════════════════════════════════════════════════════════

// ── Star catalog: {id, ra (degrees), dec (degrees), mag, con (constellation), h (Hawaiian name if any)} ──
const STAR_CATALOG = [
  // ── ORION ──────────────────────────────────────────────
  {id:"Betelgeuse", ra:88.79,  dec:+7.41,  mag:0.42,  con:"Orion",    h:"Ke Aliʻi",    note:"Zenith region of Hawaiʻi"},
  {id:"Rigel",      ra:78.63,  dec:-8.20,  mag:0.18,  con:"Orion",    h:"Puana",       note:"Blue-white foot of Orion"},
  {id:"Bellatrix",  ra:81.28,  dec:+6.35,  mag:1.64,  con:"Orion",    h:"",            note:""},
  {id:"Saiph",      ra:86.94,  dec:-9.67,  mag:2.06,  con:"Orion",    h:"",            note:""},
  {id:"Mintaka",    ra:83.00,  dec:-0.30,  mag:2.23,  con:"Orion",    h:"Hoʻopuka-3",  note:"West belt star"},
  {id:"Alnilam",    ra:84.05,  dec:-1.20,  mag:1.69,  con:"Orion",    h:"Hoʻopuka-2",  note:"Center belt star"},
  {id:"Alnitak",    ra:85.19,  dec:-1.94,  mag:1.74,  con:"Orion",    h:"Hoʻopuka-1",  note:"East belt star"},
  // ── URSA MAJOR (Big Dipper / Nā Hiku) ─────────────────
  {id:"Dubhe",      ra:165.93, dec:+61.75, mag:1.79,  con:"UMa",      h:"Nā Hiku-1",   note:""},
  {id:"Merak",      ra:165.46, dec:+56.38, mag:2.37,  con:"UMa",      h:"Nā Hiku-2",   note:""},
  {id:"Phecda",     ra:178.46, dec:+53.69, mag:2.44,  con:"UMa",      h:"Nā Hiku-3",   note:""},
  {id:"Megrez",     ra:183.86, dec:+57.03, mag:3.32,  con:"UMa",      h:"Nā Hiku-4",   note:""},
  {id:"Alioth",     ra:193.51, dec:+55.96, mag:1.76,  con:"UMa",      h:"Nā Hiku-5",   note:""},
  {id:"Mizar",      ra:200.98, dec:+54.93, mag:2.27,  con:"UMa",      h:"Nā Hiku-6",   note:""},
  {id:"Alkaid",     ra:206.89, dec:+49.31, mag:1.86,  con:"UMa",      h:"Nā Hiku-7",   note:""},
  // ── URSA MINOR ─────────────────────────────────────────
  {id:"Polaris",    ra:37.95,  dec:+89.26, mag:2.02,  con:"UMi",      h:"Hōkūpaʻa",   note:"Fixed north star"},
  {id:"Kochab",     ra:222.68, dec:+74.16, mag:2.08,  con:"UMi",      h:"",            note:""},
  // ── CASSIOPEIA (W shape) ───────────────────────────────
  {id:"Schedar",    ra:10.13,  dec:+56.54, mag:2.24,  con:"Cas",      h:"",            note:""},
  {id:"Caph",       ra:2.29,   dec:+59.15, mag:2.27,  con:"Cas",      h:"",            note:""},
  {id:"GammaCas",   ra:14.18,  dec:+60.72, mag:2.47,  con:"Cas",      h:"",            note:""},
  {id:"Ruchbah",    ra:21.45,  dec:+60.24, mag:2.68,  con:"Cas",      h:"",            note:""},
  {id:"Segin",      ra:28.60,  dec:+63.67, mag:3.35,  con:"Cas",      h:"",            note:""},
  // ── SCORPIUS ───────────────────────────────────────────
  {id:"Antares",    ra:247.35, dec:-26.43, mag:1.09,  con:"Sco",      h:"Kaʻaʻahai",  note:"Heart of the scorpion"},
  {id:"Graffias",   ra:241.36, dec:-19.81, mag:2.62,  con:"Sco",      h:"",            note:""},
  {id:"Dschubba",   ra:240.08, dec:-22.62, mag:2.32,  con:"Sco",      h:"",            note:""},
  {id:"Shaula",     ra:263.40, dec:-37.10, mag:1.62,  con:"Sco",      h:"Nā Kā-1",    note:"Scorpion stinger"},
  {id:"Lesath",     ra:264.33, dec:-37.30, mag:2.69,  con:"Sco",      h:"Nā Kā-2",    note:""},
  {id:"Sargas",     ra:264.33, dec:-43.00, mag:1.87,  con:"Sco",      h:"",            note:""},
  // ── SUMMER TRIANGLE ────────────────────────────────────
  {id:"Vega",       ra:279.24, dec:+38.78, mag:0.03,  con:"Lyr",      h:"Humu",        note:""},
  {id:"Deneb",      ra:310.36, dec:+45.28, mag:1.25,  con:"Cyg",      h:"Hōkū-maʻa",  note:""},
  {id:"Altair",     ra:297.70, dec:+8.87,  mag:0.76,  con:"Aql",      h:"Hōkū-maʻa-2",note:""},
  // ── CYGNUS (Northern Cross) ────────────────────────────
  {id:"Sadr",       ra:305.56, dec:+40.26, mag:2.23,  con:"Cyg",      h:"",            note:""},
  {id:"Gienah",     ra:311.55, dec:+33.97, mag:2.46,  con:"Cyg",      h:"",            note:""},
  {id:"AlbireoA",   ra:292.68, dec:+27.96, mag:3.18,  con:"Cyg",      h:"",            note:""},
  // ── TAURUS ─────────────────────────────────────────────
  {id:"Aldebaran",  ra:68.98,  dec:+16.51, mag:0.87,  con:"Tau",      h:"Hōkūʻula",   note:"Red eye of the bull"},
  {id:"Alcyone",    ra:56.87,  dec:+24.11, mag:2.87,  con:"Tau",      h:"Ka Makaliʻi", note:"Pleiades center — rise marks new year"},
  {id:"Elnath",     ra:81.57,  dec:+28.61, mag:1.65,  con:"Tau",      h:"",            note:""},
  // ── GEMINI ─────────────────────────────────────────────
  {id:"Pollux",     ra:116.33, dec:+28.03, mag:1.16,  con:"Gem",      h:"Nā Pōkea-2", note:""},
  {id:"Castor",     ra:113.65, dec:+31.89, mag:1.58,  con:"Gem",      h:"Nā Pōkea-1", note:""},
  // ── CANIS MAJOR ────────────────────────────────────────
  {id:"Sirius",     ra:101.29, dec:-16.72, mag:-1.46, con:"CMa",      h:"Kohu",        note:"Brightest star in the sky"},
  {id:"Adhara",     ra:104.66, dec:-28.97, mag:1.50,  con:"CMa",      h:"",            note:""},
  {id:"Wezen",      ra:107.10, dec:-26.39, mag:1.83,  con:"CMa",      h:"",            note:""},
  // ── CANIS MINOR ────────────────────────────────────────
  {id:"Procyon",    ra:114.83, dec:+5.23,  mag:0.38,  con:"CMi",      h:"Kaelo",       note:""},
  // ── AURIGA ─────────────────────────────────────────────
  {id:"Capella",    ra:79.17,  dec:+45.99, mag:0.08,  con:"Aur",      h:"Hōkū-lei",   note:"Crown star"},
  // ── BOÖTES ─────────────────────────────────────────────
  {id:"Arcturus",   ra:213.92, dec:+19.18, mag:-0.04, con:"Boo",      h:"Hōkūleʻa",  note:"Zenith star of Hawaiʻi · canoe star"},
  // ── VIRGO ──────────────────────────────────────────────
  {id:"Spica",      ra:201.30, dec:-11.16, mag:0.97,  con:"Vir",      h:"Hōkū-keokeo",note:"White star"},
  // ── LEO ────────────────────────────────────────────────
  {id:"Regulus",    ra:152.09, dec:+11.97, mag:1.35,  con:"Leo",      h:"Hōkū-kīhia", note:""},
  {id:"Denebola",   ra:177.26, dec:+14.57, mag:2.14,  con:"Leo",      h:"",            note:""},
  {id:"Algieba",    ra:154.99, dec:+19.84, mag:2.28,  con:"Leo",      h:"",            note:""},
  {id:"EtaLeo",     ra:149.47, dec:+16.76, mag:3.48,  con:"Leo",      h:"",            note:""},
  // ── CENTAURUS / SOUTHERN CROSS ─────────────────────────
  {id:"RigilKent",  ra:219.92, dec:-60.83, mag:-0.01, con:"Cen",      h:"Māhoe-hope",  note:""},
  {id:"Hadar",      ra:210.96, dec:-60.37, mag:0.61,  con:"Cen",      h:"",            note:""},
  {id:"Acrux",      ra:186.65, dec:-63.10, mag:0.77,  con:"Cru",      h:"Newe-1",      note:"Southern Cross top"},
  {id:"Mimosa",     ra:191.93, dec:-59.69, mag:1.25,  con:"Cru",      h:"Newe-2",      note:""},
  {id:"Gacrux",     ra:187.79, dec:-57.11, mag:1.63,  con:"Cru",      h:"Newe-3",      note:"Southern Cross bottom"},
  {id:"Imai",       ra:183.79, dec:-58.75, mag:2.79,  con:"Cru",      h:"Newe-4",      note:""},
  // ── CARINA ─────────────────────────────────────────────
  {id:"Canopus",    ra:96.00,  dec:-52.70, mag:-0.72, con:"Car",      h:"Hōkū-hoʻokele-waʻa", note:"Canoe-steering star"},
  // ── PISCIS AUSTRINUS ───────────────────────────────────
  {id:"Fomalhaut",  ra:344.41, dec:-29.62, mag:1.17,  con:"PsA",      h:"Hōkū-ā",     note:"Autumn south star"},
  // ── PERSEUS ────────────────────────────────────────────
  {id:"Mirfak",     ra:51.08,  dec:+49.86, mag:1.79,  con:"Per",      h:"",            note:""},
  {id:"Algol",      ra:47.04,  dec:+40.96, mag:2.12,  con:"Per",      h:"",            note:""},
  // ── ANDROMEDA ──────────────────────────────────────────
  {id:"Alpheratz",  ra:2.10,   dec:+29.09, mag:2.07,  con:"And",      h:"",            note:""},
  {id:"Mirach",     ra:17.43,  dec:+35.62, mag:2.07,  con:"And",      h:"",            note:""},
  // ── PEGASUS ────────────────────────────────────────────
  {id:"Markab",     ra:346.19, dec:+15.21, mag:2.49,  con:"Peg",      h:"",            note:""},
  {id:"Scheat",     ra:345.94, dec:+28.08, mag:2.44,  con:"Peg",      h:"",            note:""},
  {id:"Algenib",    ra:3.31,   dec:+15.18, mag:2.83,  con:"Peg",      h:"",            note:""},
  // ── ARIES ──────────────────────────────────────────────
  {id:"Hamal",      ra:31.79,  dec:+23.46, mag:2.00,  con:"Ari",      h:"",            note:""},
];

// ── Constellation line pairs [from_id, to_id, optional_group] ──
const CONST_LINES = [
  // ORION — body
  ["Betelgeuse","Bellatrix"],
  ["Bellatrix","Mintaka"],
  ["Mintaka","Alnilam"],
  ["Alnilam","Alnitak"],       // belt L→R
  ["Betelgeuse","Alnitak"],    // left shoulder → left belt
  ["Rigel","Saiph"],
  ["Rigel","Mintaka"],         // right foot → belt
  ["Saiph","Alnitak"],         // left foot → belt
  // ORION → CANIS MAJOR (pointer)
  ["Alnitak","Sirius"],
  // ORION → CANIS MINOR
  ["Betelgeuse","Procyon"],
  // URSA MAJOR — bowl (square)
  ["Dubhe","Merak"],
  ["Merak","Phecda"],
  ["Phecda","Megrez"],
  ["Megrez","Dubhe"],
  // URSA MAJOR — handle
  ["Megrez","Alioth"],
  ["Alioth","Mizar"],
  ["Mizar","Alkaid"],
  // POINTER to POLARIS
  ["Dubhe","Polaris"],
  ["Merak","Polaris"],
  // CASSIOPEIA — W
  ["Caph","Schedar"],
  ["Schedar","GammaCas"],
  ["GammaCas","Ruchbah"],
  ["Ruchbah","Segin"],
  // SCORPIUS — body + tail
  ["Graffias","Dschubba"],
  ["Dschubba","Antares"],
  ["Antares","Sargas"],
  ["Sargas","Shaula"],
  ["Shaula","Lesath"],
  // SUMMER TRIANGLE
  ["Vega","Deneb"],
  ["Deneb","Altair"],
  ["Altair","Vega"],
  // CYGNUS — Northern Cross
  ["Deneb","Sadr"],
  ["Sadr","AlbireoA"],         // long arm
  ["Sadr","Gienah"],           // cross arm R
  // TAURUS
  ["Aldebaran","Elnath"],
  ["Alcyone","Aldebaran"],
  // GEMINI
  ["Castor","Pollux"],
  // CANIS MAJOR — body
  ["Sirius","Adhara"],
  ["Adhara","Wezen"],
  // LEO — sickle (head) + triangle (body)
  ["Regulus","EtaLeo"],
  ["EtaLeo","Algieba"],
  ["Algieba","Denebola"],
  ["Algieba","Regulus"],
  // BOÖTES → VIRGO
  ["Arcturus","Spica"],
  // SOUTHERN CROSS — cross arms
  ["Acrux","Gacrux"],          // vertical
  ["Mimosa","Imai"],           // horizontal
  // CENTAURUS pointers to Crux
  ["Hadar","RigilKent"],
  ["RigilKent","Acrux"],
  // ANDROMEDA
  ["Alpheratz","Mirach"],
  // GREAT SQUARE OF PEGASUS
  ["Markab","Scheat"],
  ["Scheat","Alpheratz"],
  ["Alpheratz","Algenib"],
  ["Algenib","Markab"],
];

// Constellation color palette
const CON_COLORS = {
  Orion: "#5bf",
  UMa:   "#fd0",
  UMi:   "#fd0",
  Cas:   "#f8c",
  Sco:   "#f55",
  Lyr:   "#8ff",
  Cyg:   "#8ff",
  Aql:   "#8ff",
  Tau:   "#fa5",
  Gem:   "#aff",
  CMa:   "#fff",
  CMi:   "#9df",
  Aur:   "#cf7",
  Boo:   "#fd0",
  Vir:   "#cf7",
  Leo:   "#fa8",
  Cen:   "#9f9",
  Cru:   "#9f9",
  Car:   "#aef",
  PsA:   "#bcf",
  Per:   "#ddf",
  And:   "#ddf",
  Peg:   "#ddf",
  Ari:   "#fdb",
};

class CelestialStarOverlay {
  constructor(container){
    this.container=container;
    this.svg=null;
    this.visible=false;
    this._rafId=null;
    this._bg=null;
    this._t0=Date.now();
  }

  _build(){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('aria-label','Ka Pānalāʻā ao — Real Celestial Star Map');
    svg.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:12;display:none;';
    this.container.appendChild(svg);
    this.svg=svg;
    // Pre-generate 350 background stars
    this._bg=Array.from({length:350},()=>({
      x:Math.random(), y:Math.random(),
      r:Math.random()*1.2+0.25,
      op:Math.random()*0.32+0.08,
      tw:Math.random()*Math.PI*2,
      sp:Math.random()*0.6+0.7
    }));
  }

  toggle(globe){
    if(!this.svg) this._build();
    this.visible=!this.visible;
    this.svg.style.display=this.visible?'block':'none';
    if(this.visible) this._loop(globe);
    else if(this._rafId){ cancelAnimationFrame(this._rafId); this._rafId=null; }
    return this.visible;
  }

  _loop(globe){
    const go=()=>{
      if(!this.visible) return;
      this._draw(globe);
      this._rafId=requestAnimationFrame(go);
    };
    if(this._rafId) cancelAnimationFrame(this._rafId);
    go();
  }

  _e(tag,attrs,text){
    const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const[k,v]of Object.entries(attrs)) el.setAttribute(k,v);
    if(text!=null) el.textContent=text;
    return el;
  }

  _project(ra,dec,camera,W,H){
    const phi=dec*Math.PI/180, lam=ra*Math.PI/180;
    const v=new THREE.Vector3(
      50*Math.cos(phi)*Math.cos(lam),
      50*Math.sin(phi),
      50*Math.cos(phi)*Math.sin(lam)
    );
    v.project(camera);
    return {x:(v.x*.5+.5)*W, y:(-v.y*.5+.5)*H, inFront:v.z<1.0};
  }

  _draw(globe){
    if(!this.svg||!globe) return;
    const W=this.container.clientWidth||800, H=this.container.clientHeight||560;
    this.svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
    this.svg.innerHTML='';
    const t=(Date.now()-this._t0)/1000;
    const E=this._e.bind(this);

    // ── Sky overlay ──
    this.svg.appendChild(E('rect',{width:W,height:H,fill:'rgba(0,2,14,.78)'}));

    // ── Milky Way band ──
    const mwa=E('ellipse',{cx:W*.46,cy:H*.54,rx:W*.46,ry:H*.20,
      fill:'rgba(140,165,230,.04)',transform:`rotate(-32,${W*.46},${H*.54})`});
    const mwb=E('ellipse',{cx:W*.46,cy:H*.54,rx:W*.30,ry:H*.09,
      fill:'rgba(170,195,255,.055)',transform:`rotate(-32,${W*.46},${H*.54})`});
    this.svg.appendChild(mwa); this.svg.appendChild(mwb);

    // ── Background star field ──
    const bgG=document.createElementNS('http://www.w3.org/2000/svg','g');
    this._bg.forEach(s=>{
      const op=Math.min(.7,s.op+Math.sin(t*s.sp+s.tw)*.05);
      const r=s.r*(1+Math.sin(t*.7+s.tw)*.04);
      bgG.appendChild(E('circle',{cx:(s.x*W).toFixed(1),cy:(s.y*H).toFixed(1),
        r:r.toFixed(2),fill:'#a8c0f0',opacity:op.toFixed(2)}));
    });
    this.svg.appendChild(bgG);

    // ── Project all catalog stars ──
    const proj={};
    STAR_CATALOG.forEach(s=>{
      proj[s.id]={...s,...this._project(s.ra,s.dec,globe.camera,W,H)};
    });

    // ── Constellation lines ──
    const lineG=document.createElementNS('http://www.w3.org/2000/svg','g');
    CONST_LINES.forEach(([a,b])=>{
      const sa=proj[a], sb=proj[b];
      if(!sa?.inFront||!sb?.inFront) return;
      const con=sa.con;
      const hex=CON_COLORS[con]||'#6af';
      const isPointer=(a==='Dubhe'&&b==='Polaris')||(a==='Merak'&&b==='Polaris');
      lineG.appendChild(E('line',{
        x1:sa.x.toFixed(1),y1:sa.y.toFixed(1),
        x2:sb.x.toFixed(1),y2:sb.y.toFixed(1),
        stroke:isPointer?'rgba(255,215,0,.6)':this._hexAlpha(hex,.28),
        'stroke-width':isPointer?'1.3':'0.85',
        'stroke-dasharray':isPointer?'5 5':'4 6',
        'stroke-linecap':'round'
      }));
    });
    this.svg.appendChild(lineG);

    // ── Compass rose (top-right) ──
    const cx=W-62, cy2=62, cr=32;
    this.svg.appendChild(E('circle',{cx,cy:cy2,r:cr,fill:'none',stroke:'rgba(0,247,255,.16)','stroke-width':'.8'}));
    this.svg.appendChild(E('circle',{cx,cy:cy2,r:cr*.55,fill:'none',stroke:'rgba(0,247,255,.08)','stroke-width':'.6','stroke-dasharray':'2 5'}));
    [{d:'N',a:0,c:'rgba(255,215,0,.82)'},{d:'S',a:Math.PI,c:'rgba(0,247,255,.42)'},{d:'E',a:Math.PI/2,c:'rgba(0,247,255,.42)'},{d:'W',a:-Math.PI/2,c:'rgba(0,247,255,.42)'}].forEach(({d,a,c})=>{
      this.svg.appendChild(E('line',{
        x1:(cx+Math.sin(a)*(cr-4)).toFixed(1),y1:(cy2-Math.cos(a)*(cr-4)).toFixed(1),
        x2:(cx+Math.sin(a)*(cr+4)).toFixed(1),y2:(cy2-Math.cos(a)*(cr+4)).toFixed(1),
        stroke:c,'stroke-width':'1.8','stroke-linecap':'round'
      }));
      this.svg.appendChild(E('text',{
        x:(cx+Math.sin(a)*(cr+14)).toFixed(1),
        y:(cy2-Math.cos(a)*(cr+14)+3.5).toFixed(1),
        'text-anchor':'middle',fill:c,
        'font-size':d==='N'?'10':'8.5','font-family':'Orbitron,monospace','font-weight':d==='N'?'700':'400'
      },d));
    });

    // ── Draw named stars ──
    Object.values(proj).filter(s=>s.inFront).forEach(star=>{
      const isHok=star.id==='Arcturus';
      const isBright=star.mag<0.5;
      const isMed=star.mag<1.5&&!isBright;
      const baseR=Math.max(2.2,8-Math.max(-1.5,star.mag)*1.7);
      const r=baseR*(isHok?1.55:1);
      const tR=r*(1+Math.sin(t*1.8+star.ra*.04)*.045);
      const conCol=CON_COLORS[star.con]||'#8af';

      // Glow layers
      if(isHok||isBright){
        this.svg.appendChild(E('circle',{cx:star.x.toFixed(1),cy:star.y.toFixed(1),
          r:(r*5.5).toFixed(1),fill:isHok?'rgba(255,215,0,.04)':this._hexAlpha(conCol,.04)}));
        this.svg.appendChild(E('circle',{cx:star.x.toFixed(1),cy:star.y.toFixed(1),
          r:(r*2.5).toFixed(1),fill:isHok?'rgba(255,215,0,.15)':this._hexAlpha(conCol,.10)}));
      } else if(isMed){
        this.svg.appendChild(E('circle',{cx:star.x.toFixed(1),cy:star.y.toFixed(1),
          r:(r*2).toFixed(1),fill:this._hexAlpha(conCol,.06)}));
      }

      // Star body — color based on magnitude/type
      const col=isHok?'#ffd700'
               :star.id==='Betelgeuse'||star.id==='Antares'||star.id==='Aldebaran'?'#ffaa66'
               :star.id==='Rigel'||star.id==='Spica'?'#aac8ff'
               :star.mag<0?'#fff8f0'
               :star.mag<0.5?'rgba(220,235,255,.97)'
               :star.mag<1.5?'rgba(190,215,255,.90)'
               :'rgba(160,195,245,.78)';
      this.svg.appendChild(E('circle',{cx:star.x.toFixed(1),cy:star.y.toFixed(1),
        r:tR.toFixed(2),fill:col}));

      // 4-point sparkle for brightest stars
      if(isHok||star.mag<0.5){
        const len=r*(isHok?3.2:2.5);
        [[1,0],[0,1],[.707,.707],[-.707,.707]].forEach(([dx,dy])=>{
          this.svg.appendChild(E('line',{
            x1:(star.x-dx*len).toFixed(1),y1:(star.y-dy*len).toFixed(1),
            x2:(star.x+dx*len).toFixed(1),y2:(star.y+dy*len).toFixed(1),
            stroke:isHok?'rgba(255,215,0,.5)':'rgba(200,225,255,.35)',
            'stroke-width':'.85','stroke-linecap':'round'
          }));
        });
      }

      // Polaris special rings
      if(star.id==='Polaris'){
        this.svg.appendChild(E('circle',{cx:star.x.toFixed(1),cy:star.y.toFixed(1),r:(r*4.2).toFixed(1),fill:'none',stroke:'rgba(200,220,255,.22)','stroke-width':'.7','stroke-dasharray':'3 4'}));
        this.svg.appendChild(E('circle',{cx:star.x.toFixed(1),cy:star.y.toFixed(1),r:(r*7).toFixed(1),fill:'none',stroke:'rgba(200,220,255,.10)','stroke-width':'.5','stroke-dasharray':'2 7'}));
      }

      // Constellation label (only show for prominent stars)
      const showLabel=isHok||star.mag<0.5||(star.h&&star.h.length>0&&star.mag<1.8);
      if(showLabel){
        const labelName=star.h||star.id;
        const ox=star.x>W*.78?-(r+5):r+6;
        const anch=star.x>W*.78?'end':'start';
        const mainCol=isHok?'rgba(255,215,0,.95)':star.h?'rgba(0,247,255,.82)':'rgba(180,210,255,.55)';
        this.svg.appendChild(E('text',{x:(star.x+ox).toFixed(1),y:(star.y+3.5).toFixed(1),
          'text-anchor':anch,fill:mainCol,'font-size':isHok?'11':star.h?'9':'8',
          'font-family':'Orbitron,monospace','font-weight':isHok?'600':'400'},labelName));
        if(star.h&&star.id!==star.h){
          this.svg.appendChild(E('text',{x:(star.x+ox).toFixed(1),y:(star.y+14).toFixed(1),
            'text-anchor':anch,fill:'rgba(120,170,215,.35)','font-size':'7','font-family':'sans-serif'},star.id));
        }
        if(isHok&&star.note){
          this.svg.appendChild(E('text',{x:(star.x+ox).toFixed(1),y:(star.y+26).toFixed(1),
            'text-anchor':anch,fill:'rgba(255,215,0,.42)','font-size':'6.5','font-family':'sans-serif','font-style':'italic'},star.note));
        }
      }

      // Constellation name at centroid — draw once per visible con
    });

    // ── Constellation name labels ──
    const conCentroids={};
    Object.values(proj).filter(s=>s.inFront).forEach(s=>{
      if(!conCentroids[s.con]) conCentroids[s.con]={sx:0,sy:0,n:0};
      conCentroids[s.con].sx+=s.x;
      conCentroids[s.con].sy+=s.y;
      conCentroids[s.con].n++;
    });
    Object.entries(conCentroids).forEach(([con,{sx,sy,n}])=>{
      const label={UMa:'Nā Hiku · Big Dipper',UMi:'Ursa Minor',Orion:'Orion',Cas:'Cassiopeia',
        Sco:'Scorpius',Lyr:'Lyra',Cyg:'Cygnus',Aql:'Aquila',Tau:'Taurus',Gem:'Gemini',
        CMa:'Canis Major',CMi:'Canis Minor',Aur:'Auriga',Boo:'Boötes',Vir:'Virgo',
        Leo:'Leo',Cen:'Centaurus',Cru:'Southern Cross',Car:'Carina',PsA:'Piscis Austrinus',
        Per:'Perseus',And:'Andromeda',Peg:'Pegasus',Ari:'Aries'}[con]||con;
      const col=this._hexAlpha(CON_COLORS[con]||'#8af',.4);
      this.svg.appendChild(E('text',{
        x:(sx/n).toFixed(0),y:((sy/n)-12).toFixed(0),
        'text-anchor':'middle',fill:col,'font-size':'7.5',
        'font-family':'Orbitron,monospace','letter-spacing':'.08em',
        'pointer-events':'none','user-select':'none'
      },label));
    });

    // ── Header ──
    const vis=Object.values(proj).filter(s=>s.inFront).length;
    this.svg.appendChild(E('text',{x:14,y:22,fill:'rgba(255,215,0,.82)','font-size':'10',
      'font-family':'Orbitron,monospace','letter-spacing':'.12em'},
      'KA PĀNALĀʻĀ AO · REAL CELESTIAL STAR MAP'));
    this.svg.appendChild(E('text',{x:14,y:36,fill:'rgba(0,247,255,.4)','font-size':'8',
      'font-family':'sans-serif','font-style':'italic'},
      `${vis} named stars · ${CONST_LINES.length} constellation lines · 350 background stars`));

    // ── Legend (bottom-left) ──
    [{c:'#ffd700',l:'Hōkūleʻa (Arcturus) · Hawaiʻi zenith star'},
     {c:'rgba(0,247,255,.78)',l:'Stars with Hawaiian names'},
     {c:'rgba(190,215,255,.7)',l:'Bright catalog stars'},
     {c:'rgba(255,215,0,.5)',l:'─ ─  North pointer / key lines'},
    ].forEach((k,i)=>{
      const y=H-12-i*16;
      this.svg.appendChild(E('circle',{cx:16,cy:y,r:4,fill:k.c}));
      this.svg.appendChild(E('text',{x:26,y:y+3.5,fill:'rgba(180,215,240,.45)','font-size':'8','font-family':'sans-serif'},k.l));
    });
  }

  _hexAlpha(hex,a){
    // Convert shorthand hex color to rgba
    let h=hex.replace('#','');
    if(h.length===3) h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    const r=parseInt(h.substring(0,2),16);
    const g=parseInt(h.substring(2,4),16);
    const b=parseInt(h.substring(4,6),16);
    return `rgba(${r},${g},${b},${a})`;
  }
}


// ══════════════════════════════════════════════════════════
// TOOLTIP MANAGER
// Hover tooltip with culture preview
// ══════════════════════════════════════════════════════════
class TooltipManager{
  constructor(container){
    this.container=container;this.el=null;this._visible=false;
    this._build();
  }
  _build(){
    this.el=document.createElement('div');
    this.el.id='cw-tooltip';
    this.el.setAttribute('role','tooltip');
    this.el.setAttribute('aria-live','polite');
    this.el.style.cssText=
      'position:absolute;pointer-events:none;z-index:30;'+
      'background:rgba(4,9,20,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);'+
      'border:1px solid rgba(0,247,255,.32);border-radius:12px;'+
      'padding:10px 14px;max-width:235px;min-width:160px;'+
      'display:none;opacity:0;transition:opacity .15s ease;';
    this.container.appendChild(this.el);
  }
  show(culture,cx,cy){
    if(!this.el||!culture) return;
    const rect=this.container.getBoundingClientRect();
    const lx=cx-rect.left, ly=cy-rect.top;
    const TW=240, TH=140;
    const px=lx+18+TW>rect.width ? lx-TW-12 : lx+18;
    const py=ly+18+TH>rect.height? ly-TH-12 : ly+18;
    this.el.style.left=px+'px';this.el.style.top=py+'px';
    const tagsHtml=(culture.tags||[]).slice(0,4).map(t=>`<span style="font-size:.62rem;padding:2px 7px;border-radius:999px;background:rgba(0,247,255,.1);color:rgba(0,247,255,.8);border:1px solid rgba(0,247,255,.18);margin-right:3px;display:inline-block;margin-bottom:2px;">${escapeHtml(t)}</span>`).join('');
    const desc=(culture.desc||'').slice(0,90)+(culture.desc?.length>90?'…':'');
    this.el.innerHTML=`
<div style="display:flex;align-items:center;gap:9px;margin-bottom:7px;">
  <span style="font-size:1.5rem;line-height:1;">${escapeHtml(culture.symbol||'🌐')}</span>
  <div style="min-width:0;">
    <div style="font-size:.82rem;font-weight:600;color:rgba(255,255,255,.96);line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(culture.name)}</div>
    <div style="font-size:.68rem;color:rgba(0,247,255,.7);margin-top:1px;">${escapeHtml(culture.region||'')}${culture.era?' · '+escapeHtml(culture.era):''}</div>
  </div>
</div>
${desc?`<div style="font-size:.73rem;color:rgba(170,200,220,.7);line-height:1.5;margin-bottom:7px;">${escapeHtml(desc)}</div>`:''}
<div style="margin-bottom:7px;">${tagsHtml}</div>
<div style="font-size:.65rem;color:rgba(255,215,0,.6);letter-spacing:.1em;font-family:Orbitron,monospace;">TAP TO EXPLORE ↗</div>`;
    this.el.style.display='block';
    requestAnimationFrame(()=>{this.el&&(this.el.style.opacity='1');});
    this._visible=true;
  }
  hide(){
    if(!this.el||!this._visible) return;
    this.el.style.opacity='0';
    setTimeout(()=>{if(this.el&&!this._visible) this.el.style.display='none';},160);
    this._visible=false;
  }
}
// ══════════════════════════════════════════════════════════
class ThreeGlobe {
  constructor(container) {
    this.container  = container;
    this.clock      = new THREE.Clock();
    this.scene      = null;
    this.camera     = null;
    this.renderer   = null;
    this.labelRenderer = null;
    this.controls   = null;
    this.sphere     = null;      /* Earth mesh */
    this.atmo       = null;      /* Atmosphere mesh */
    this.nodeObjs   = [];        /* [{mesh,glow,label,data,pulsePhase,baseR}] */
    this.arcObjs    = [];        /* [{tube,pulse,curve,progress,srcN,tgtN,data}] */
    this.raycaster  = new THREE.Raycaster();
    this.mouse      = new THREE.Vector2(-9,-9);
    this.hovered    = null;
    this.selected   = null;
    this.stars      = null;
    this.animId     = null;
    this.spawned    = false;
    /* Callbacks set by app */
    this.onSelect   = null;
    this.onDeselect = null;
    this.onHover    = null;
    this.onHoverEnd = null;
  }

  async init(world) {
    this._setupScene();
    this._setupCamera();
    this._setupRenderer();
    await this._buildEarth(world);
    this._buildAtmosphere();
    this._buildStars();
    this._setupControls();
    this._setupLights();
    this._bindEvents();
    this._animate();
  }

  /* ── Scene / Camera / Renderer ── */
  _setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040912);
    this.scene.fog = new THREE.FogExp2(0x040912, 0.4);
  }

  _size(){return{w:this.container.clientWidth||800,h:this.container.clientHeight||560};}

  _setupCamera(){
    const{w,h}=this._size();
    this.camera=new THREE.PerspectiveCamera(50,w/h,0.01,100);
    this.camera.position.set(0,0,2.8);
  }

  _setupRenderer(){
    const{w,h}=this._size();
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    this.renderer.setSize(w,h);
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.1;
    this.container.appendChild(this.renderer.domElement);

    if(THREE.CSS2DRenderer){
      this.labelRenderer=new THREE.CSS2DRenderer();
      this.labelRenderer.setSize(w,h);
      this.labelRenderer.domElement.style.cssText='position:absolute;top:0;left:0;pointer-events:none;overflow:hidden;';
      this.container.appendChild(this.labelRenderer.domElement);
    }
  }

  /* ── Earth ── */
  async _buildEarth(world) {
    const tex = buildEarthTexture(world);
    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_R, 72, 72),
      new THREE.MeshPhongMaterial({
        map: tex, shininess:8,
        specular: new THREE.Color(0x112233),
      })
    );
    this.scene.add(this.sphere);
    this._buildCountryLines(world);
  }

  _buildCountryLines(world) {
    const positions=[];
    const addRing = ring => {
      for(let i=0;i<ring.length;i++){
        const v=latLon3D(ring[i][1],ring[i][0],GLOBE_R+0.001);
        positions.push(v.x,v.y,v.z);
        if(i>0&&i<ring.length-1){positions.push(v.x,v.y,v.z);}
      }
    };
    for(const f of world.countries.features||[]){
      const g=f.geometry;if(!g) continue;
      const polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
      for(const poly of polys) for(const ring of poly) addRing(ring);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    const lines=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({
      color:0x00f7ff,transparent:true,opacity:0.07,depthWrite:false,
    }));
    this.scene.add(lines);
    this._countryLines=lines;
  }

  /* ── Atmosphere shader (Fresnel rim glow) ── */
  _buildAtmosphere(){
    const vert=`varying vec3 vNormal;
void main(){vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
    const frag=`varying vec3 vNormal;
void main(){
  float i=pow(0.72-dot(vNormal,vec3(0,0,1)),4.);
  vec3 col=mix(vec3(0.,0.9,1.),vec3(0.6,0.,1.),smoothstep(0.,1.,i));
  gl_FragColor=vec4(col,i*0.75);
}`;
    this.atmo=new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_R*1.055,36,36),
      new THREE.ShaderMaterial({
        vertexShader:vert,fragmentShader:frag,
        blending:THREE.AdditiveBlending,side:THREE.BackSide,transparent:true,depthWrite:false,
      })
    );
    this.scene.add(this.atmo);
  }

  /* ── Stars ── */
  _buildStars(){
    const N=IS_COARSE?600:1800;
    const pos=new Float32Array(N*3),col=new Float32Array(N*3);
    const pal=[[.72,.82,1],[1,.92,.68],[.62,.9,1],[.85,.68,1],[1,1,1]];
    for(let i=0;i<N;i++){
      const t=Math.random()*Math.PI*2,p=Math.acos(2*Math.random()-1),r=12+Math.random()*30;
      pos[i*3]  =r*Math.sin(p)*Math.cos(t);
      pos[i*3+1]=r*Math.sin(p)*Math.sin(t);
      pos[i*3+2]=r*Math.cos(p);
      const c=pal[Math.floor(Math.random()*pal.length)];
      col[i*3]=c[0];col[i*3+1]=c[1];col[i*3+2]=c[2];
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(pos,3));
    g.setAttribute('color',   new THREE.BufferAttribute(col,3));
    this.stars=new THREE.Points(g,new THREE.PointsMaterial({size:0.04,vertexColors:true,transparent:true,opacity:.9,sizeAttenuation:true,depthWrite:false}));
    this.scene.add(this.stars);
  }

  /* ── Lights ── */
  _setupLights(){
    this.scene.add(new THREE.AmbientLight(0x223344,2));
    const sun=new THREE.DirectionalLight(0xffffff,1.8);
    sun.position.set(3,2,3);this.scene.add(sun);
    const fill=new THREE.PointLight(0x00f7ff,1,10);fill.position.set(-3,1,1);this.scene.add(fill);
    const warm=new THREE.PointLight(0x9d00ff,0.8,8);warm.position.set(2,-1,-2);this.scene.add(warm);
  }

  /* ── Controls ── */
  _setupControls(){
    if(!THREE.OrbitControls) return;
    this.controls=new THREE.OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=true;
    this.controls.dampingFactor=0.04;
    this.controls.enablePan=false;
    this.controls.minDistance=1.3;
    this.controls.maxDistance=8;
    this.controls.autoRotate=true;
    this.controls.autoRotateSpeed=0.35;
    this.controls.addEventListener('start',()=>{this.controls.autoRotate=false;});
  }

  /* ── Culture nodes ── */
  addNodes(cultures) {
    cultures.forEach((data,i)=>{
      /* Core sphere */
      const mesh=new THREE.Mesh(
        new THREE.SphereGeometry(IS_COARSE?0.018:0.012,16,16),
        new THREE.MeshPhongMaterial({
          color:regionColorInt(data),emissive:regionColorInt(data),
          emissiveIntensity:.45,shininess:80,transparent:true,opacity:0,
        })
      );
      const pos=latLon3D(data.lat,data.lon,GLOBE_R+0.013);
      mesh.position.copy(pos);
      mesh.userData={idx:i,culture:data};

      /* Glow halo */
      const glow=new THREE.Mesh(
        new THREE.SphereGeometry(0.028,8,8),
        new THREE.MeshBasicMaterial({
          color:regionColorInt(data),transparent:true,opacity:0,
          side:THREE.BackSide,depthWrite:false,blending:THREE.AdditiveBlending,
        })
      );
      mesh.add(glow);

      /* CSS2D label — hover only */
      let labelObj=null;
      if(THREE.CSS2DObject){
        const div=document.createElement('div');
        div.className='gx-node-label';
        div.textContent=data.name;
        div.style.color=regionColor(data);
        div.style.opacity='0';
        div.dataset.cultureId=data.id;
        div.addEventListener('click',ev=>{ev.stopPropagation();this._clickNode(i);});
        labelObj=new THREE.CSS2DObject(div);
        labelObj.position.set(0,-0.025,0);
        mesh.add(labelObj);
      }

      this.scene.add(mesh);
      this.nodeObjs.push({mesh,glow,label:labelObj,data,pulsePhase:Math.random()*Math.PI*2,baseR:GLOBE_R+0.013,idx:i});
    });
  }

  /* ── Geodesic arcs ── */
  addArcs(links) {
    links.forEach(link=>{
      const sN=this.nodeObjs.find(n=>n.data.id===link.source.id);
      const tN=this.nodeObjs.find(n=>n.data.id===link.target.id);
      if(!sN||!tN) return;

      const curve=geodesicCurve(link.source,link.target);
      const tube=new THREE.Mesh(
        new THREE.TubeGeometry(curve,80,0.0015,4,false),
        new THREE.MeshBasicMaterial({
          color:0x00f7ff,transparent:true,opacity:0,
          blending:THREE.AdditiveBlending,depthWrite:false,
        })
      );
      this.scene.add(tube);

      /* Traveling pulse bead */
      const pulse=new THREE.Mesh(
        new THREE.SphereGeometry(0.006,6,6),
        new THREE.MeshBasicMaterial({
          color:0xffffff,transparent:true,opacity:0,
          blending:THREE.AdditiveBlending,depthWrite:false,
        })
      );
      this.scene.add(pulse);

      this.arcObjs.push({tube,pulse,curve,progress:Math.random(),sN,tN,data:link});
    });
  }

  /* ── Spawn animation ── */
  spawnNodes(){
    if(this.spawned) return;
    this.spawned=true;
    this.nodeObjs.forEach((obj,i)=>{
      const d=i*90/1000;
      if(window.gsap){
        obj.mesh.scale.set(.01,.01,.01);
        gsap.to(obj.mesh.material,{opacity:1,duration:.6,delay:d,ease:'power2.out'});
        gsap.to(obj.mesh.scale,{x:1,y:1,z:1,duration:.6,delay:d,ease:'back.out(1.7)'});
        gsap.to(obj.glow.material,{opacity:.22,duration:.9,delay:d+.3});
      } else {obj.mesh.material.opacity=1;obj.glow.material.opacity=.22;}
    });
    const ld=this.nodeObjs.length*90/1000+.4;
    this.arcObjs.forEach(obj=>{
      if(window.gsap){
        gsap.to(obj.tube.material,{opacity:.15,duration:1.2,delay:ld});
        gsap.to(obj.pulse.material,{opacity:1,duration:.7,delay:ld+.5});
      } else {obj.tube.material.opacity=.15;obj.pulse.material.opacity=1;}
    });
  }

  /* ── Interaction ── */
  _bindEvents(){
    const cv=this.renderer.domElement;
    cv.addEventListener('mousemove',e=>this._onMove(e));
    cv.addEventListener('click',e=>this._onClickCanvas(e));
    cv.addEventListener('touchend',e=>{if(e.changedTouches.length){const t=e.changedTouches[0];this._setMouse(t.clientX,t.clientY);this._doClick();}},{passive:true});
    window.addEventListener('resize',()=>this._onResize(),{passive:true});
  }

  _setMouse(cx,cy){
    const r=this.renderer.domElement.getBoundingClientRect();
    this.mouse.x= ((cx-r.left)/r.width )*2-1;
    this.mouse.y=-((cy-r.top) /r.height)*2+1;
  }

  _onMove(e){this._setMouse(e.clientX,e.clientY);this._doHover();this._lastMouseX=e.clientX;this._lastMouseY=e.clientY;}

  _onClickCanvas(e){
    this._setMouse(e.clientX,e.clientY);
    this._doClick();
  }

  _doHover(){
    this.raycaster.setFromCamera(this.mouse,this.camera);
    const hits=this.raycaster.intersectObjects(this.nodeObjs.map(o=>o.mesh));
    if(hits.length){
      const obj=this.nodeObjs.find(o=>o.mesh===hits[0].object);
      if(obj&&obj!==this.hovered){
        if(this.hovered&&this.hovered!==this.selected) this._unhoverObj(this.hovered);
        this.hovered=obj;this._hoverObj(obj);
        this.renderer.domElement.style.cursor='pointer';
      }
      if(obj) this.onHover?.(obj.data,this._lastMouseX||0,this._lastMouseY||0);
    } else {
      if(this.hovered&&this.hovered!==this.selected){this._unhoverObj(this.hovered);this.hovered=null;this.renderer.domElement.style.cursor='default';}
      this.onHoverEnd?.();
    }
  }

  _doClick(){
    this.raycaster.setFromCamera(this.mouse,this.camera);
    const hits=this.raycaster.intersectObjects(this.nodeObjs.map(o=>o.mesh));
    if(hits.length){
      const obj=this.nodeObjs.find(o=>o.mesh===hits[0].object);
      if(obj) this._clickNode(obj.idx);
    } else {
      this.deselectAll();
      this.onDeselect?.();
    }
  }

  _clickNode(idx){
    const obj=this.nodeObjs[idx];if(!obj) return;
    if(this.selected===obj){this.deselectAll();this.onDeselect?.();return;}
    if(this.selected) this._deselectObj(this.selected);
    this.selected=obj;
    this._selectObj(obj);
    this.onSelect?.(obj.data);
    if(this.controls) this.controls.autoRotate=false;
  }

  _hoverObj(obj){
    if(obj.label?.element){obj.label.element.style.transition='opacity .2s';obj.label.element.style.opacity='1';}
    if(window.gsap){gsap.to(obj.mesh.scale,{x:1.4,y:1.4,z:1.4,duration:.2,ease:'power2.out'});gsap.to(obj.glow.material,{opacity:.5,duration:.2});}
    this._brightArcs(obj,true);
    this.showHoverArcs(obj);
  }
  _unhoverObj(obj){
    if(obj.label?.element&&obj!==this.selected){obj.label.element.style.opacity='0';}
    if(window.gsap){gsap.to(obj.mesh.scale,{x:1,y:1,z:1,duration:.2});gsap.to(obj.glow.material,{opacity:.22,duration:.2});}
    this._brightArcs(obj,false);
    this._clearHoverArcs();
  }
  _selectObj(obj){
    obj.mesh.material.emissiveIntensity=1;
    if(obj.label?.element){obj.label.element.style.opacity='1';obj.label.element.style.color='#ffd700';}
    if(window.gsap){gsap.to(obj.mesh.scale,{x:1.6,y:1.6,z:1.6,duration:.25,ease:'back.out(1.5)'});gsap.to(obj.glow.material,{opacity:.6,duration:.25});}
    this._brightArcs(obj,true);
    /* Ripple effect at node position */
    this._rippleAt(obj.mesh.position.clone());
    /* Speed up pulse beads on connected arcs */
    this.arcObjs.forEach(a=>{
      if(a.sN===obj||a.tN===obj) a._speed=0.008;
      else a._speed=0.003;
    });
  }
  _deselectObj(obj){
    obj.mesh.material.emissiveIntensity=.45;
    if(obj.label?.element){obj.label.element.style.opacity='0';obj.label.element.style.color=regionColor(obj.data);}
    if(window.gsap){gsap.to(obj.mesh.scale,{x:1,y:1,z:1,duration:.2});gsap.to(obj.glow.material,{opacity:.22,duration:.2});}
    this._brightArcs(obj,false);
    this.arcObjs.forEach(a=>{a._speed=0.003;});
  }

  deselectAll(){
    if(this.selected) this._deselectObj(this.selected);
    this.selected=null;
    if(this.controls) this.controls.autoRotate=true;
  }

  _brightArcs(obj,on){
    this.arcObjs.forEach(a=>{
      const hit=a.sN===obj||a.tN===obj;if(!hit) return;
      const op=on?.7:.15;
      if(window.gsap) gsap.to(a.tube.material,{opacity:op,duration:.3});
      else a.tube.material.opacity=op;
    });
  }

  /* ── Layer threads ── */
  highlightLayer(key, selectedCulture, allCultures, on){
    const cfg=LAYER_CFGS.find(c=>c.key===key);if(!cfg) return;
    /* Remove existing */
    this._layerMeshes=this._layerMeshes||{};
    (this._layerMeshes[key]||[]).forEach(m=>{this.scene.remove(m);m.geometry?.dispose();});
    this._layerMeshes[key]=[];
    if(!on||!selectedCulture) return;
    const peers=allCultures.filter(c=>c.id!==selectedCulture.id&&cfg.fn(c)).slice(0,10);
    peers.forEach(peer=>{
      const curve=geodesicCurve(selectedCulture,peer);
      const tube=new THREE.Mesh(
        new THREE.TubeGeometry(curve,60,0.003,4,false),
        new THREE.MeshBasicMaterial({
          color:cfg.stroke,transparent:true,opacity:.75,
          blending:THREE.AdditiveBlending,depthWrite:false,
        })
      );
      this.scene.add(tube);
      this._layerMeshes[key].push(tube);
    });
  }

  /* ── Lens arc overlay ── */
  setLensArcs(links, on){
    (this._lensArcs||[]).forEach(m=>{this.scene.remove(m);m.geometry?.dispose();});
    this._lensArcs=[];
    if(!on||!links.length) return;
    links.slice(0,40).forEach(link=>{
      const curve=geodesicCurve(link.source,link.target);
      const tube=new THREE.Mesh(
        new THREE.TubeGeometry(curve,60,0.002,4,false),
        new THREE.MeshBasicMaterial({
          color:0x00f7ff,transparent:true,opacity:.22,
          blending:THREE.AdditiveBlending,depthWrite:false,
        })
      );
      this.scene.add(tube);
      this._lensArcs.push(tube);
    });
  }

  /* ── Filter opacity ── */
  applyFilter(lens, visibleIds, eraActive){
    this.nodeObjs.forEach(obj=>{
      const inLens=lens==='all'||(obj.data.tags||[]).some(t=>LENS_ALIASES[lens]?.has(t));
      const inEra=!eraActive||visibleIds?.has(obj.data.id);
      const on=inLens&&inEra;
      /* Track filter factor — animate loop multiplies depth-facing opacity against this */
      obj._filterOpacity=on?1:0.04;
    });
  }

  /* ── Tag-based highlight: flash all cultures sharing a tag ── */
  highlightByTag(tag, on){
    this.nodeObjs.forEach(obj=>{
      const match=(obj.data.tags||[]).includes(tag)||(obj.data.keyTerms||[]).includes(tag);
      if(!match) return;
      if(on){
        if(window.gsap){gsap.to(obj.mesh.scale,{x:1.8,y:1.8,z:1.8,duration:.25,ease:'back.out(2)'});gsap.to(obj.glow.material,{opacity:.8,duration:.2});}
      } else {
        if(obj!==this.selected&&obj!==this.hovered){
          if(window.gsap){gsap.to(obj.mesh.scale,{x:1,y:1,z:1,duration:.35});gsap.to(obj.glow.material,{opacity:.22,duration:.35});}
        }
      }
    });
    /* Also draw faint arcs from all matching nodes to each other */
    this._tagArcs=this._tagArcs||[];
    this._tagArcs.forEach(m=>{this.scene.remove(m);m.geometry?.dispose();});
    this._tagArcs=[];
    if(!on) return;
    const matches=this.nodeObjs.filter(o=>(o.data.tags||[]).includes(tag));
    for(let i=0;i<matches.length;i++) for(let j=i+1;j<matches.length;j++){
      const curve=geodesicCurve(matches[i].data,matches[j].data);
      const tube=new THREE.Mesh(
        new THREE.TubeGeometry(curve,50,0.001,4,false),
        new THREE.MeshBasicMaterial({color:0xffd700,transparent:true,opacity:.3,blending:THREE.AdditiveBlending,depthWrite:false})
      );
      this.scene.add(tube);this._tagArcs.push(tube);
    }
  }

  /* ── Focus camera on a culture ── */
  focusOn(culture,zoom=2.2){
    if(!window.gsap||!this.controls) return;
    const target=latLon3D(culture.lat,culture.lon,zoom);
    gsap.to(this.camera.position,{
      x:target.x,y:target.y,z:target.z,
      duration:1.2,ease:'power3.inOut',
    });
    this.controls.autoRotate=false;
  }

  /* ── Fly camera to arc midpoint between two cultures ── */
  flyToArc(srcId, tgtId){
    const sN=this.nodeObjs.find(n=>n.data.id===srcId);
    const tN=this.nodeObjs.find(n=>n.data.id===tgtId);
    if(!sN||!tN||!window.gsap) return;
    const curve=geodesicCurve(sN.data,tN.data);
    const mid=curve.getPoint(0.5);
    const targetCam=mid.clone().normalize().multiplyScalar(2.4);
    gsap.to(this.camera.position,{x:targetCam.x,y:targetCam.y,z:targetCam.z,duration:1.1,ease:'power3.inOut'});
    /* Flash the arc */
    const arc=this.arcObjs.find(a=>(a.sN===sN&&a.tN===tN)||(a.sN===tN&&a.tN===sN));
    if(arc){
      if(window.gsap){
        gsap.fromTo(arc.tube.material,{opacity:.9},{opacity:.4,duration:1.2});
        gsap.fromTo(arc.pulse.material,{opacity:1},{opacity:.5,duration:1.2});
      }
    }
  }

  /* ── Hover preview arcs: show faint arcs to top connected nodes on hover ── */
  showHoverArcs(obj){
    this._clearHoverArcs();
    this._hoverArcMeshes=[];
    const top=this.arcObjs.filter(a=>a.sN===obj||a.tN===obj).slice(0,5);
    top.forEach(a=>{
      const other=a.sN===obj?a.tN:a.sN;
      const curve=geodesicCurve(obj.data,other.data);
      const tube=new THREE.Mesh(
        new THREE.TubeGeometry(curve,50,0.002,4,false),
        new THREE.MeshBasicMaterial({color:regionColorInt(obj.data),transparent:true,opacity:.45,blending:THREE.AdditiveBlending,depthWrite:false})
      );
      this.scene.add(tube);this._hoverArcMeshes.push(tube);
    });
  }
  _clearHoverArcs(){
    (this._hoverArcMeshes||[]).forEach(m=>{this.scene.remove(m);m.geometry?.dispose();});
    this._hoverArcMeshes=[];
  }

  /* ── Resize ── */
  _onResize(){
    const{w,h}=this._size();
    this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
    this.renderer.setSize(w,h);this.labelRenderer?.setSize(w,h);
  }

  /* ── Animation loop ── */
  _animate(){
    this.animId=requestAnimationFrame(()=>this._animate());
    const t=this.clock.getElapsedTime();

    /* Slow star drift */
    if(this.stars) this.stars.rotation.y=t*.01;

    /* Ripple animations */
    if(this._ripples){
      this._ripples=this._ripples.filter(r=>{
        r.scale+=0.035; r.mesh.scale.setScalar(r.scale);
        r.mesh.material.opacity=Math.max(0,(1-r.scale/3)*.7);
        if(r.scale>3){this.scene.remove(r.mesh);r.mesh.geometry.dispose();return false;}
        return true;
      });
    }

    /* Camera direction (unit vector from origin to camera) */
    const camDir=this.camera.position.clone().normalize();

    /* Node pulse + depth-facing opacity + label visibility */
    this.nodeObjs.forEach(obj=>{
      const ph=obj.pulsePhase;
      /* Tiny bob on surface */
      const basePos=latLon3D(obj.data.lat,obj.data.lon,obj.baseR+Math.sin(t*.5+ph)*.003);
      if(obj!==this.selected) obj.mesh.position.copy(basePos);

      /* Depth facing: dot product of node outward-normal with camera direction */
      const nodeNormal=obj.mesh.position.clone().normalize();
      const dot=nodeNormal.dot(camDir); // >0 = facing camera, <0 = back hemisphere

      /* Smooth opacity: full at dot>0.1, fades to 0.04 behind globe */
      const depthOpacity=dot>0.1?1:dot>-0.15?clamp((dot+0.15)/0.25,0.04,1):0.04;
      /* Don't override filter opacity set by applyFilter — multiply instead */
      const filterBase=obj._filterOpacity??1;
      const finalOpacity=depthOpacity*filterBase;
      obj.mesh.material.opacity=finalOpacity;
      obj.glow.material.opacity=dot>0?.22*filterBase:0;

      /* CSS2D label: show only on front hemisphere (and always show selected) */
      if(obj.label?.element){
        const isSel=obj===this.selected, isHov=obj===this.hovered;
        if(isSel){
          obj.label.element.style.opacity='1';
        } else if(isHov){
          obj.label.element.style.opacity=dot>0?'1':'0';
        } else {
          /* Show front-facing labels at low opacity for context, brighter near center */
          const lblOp=dot>0.5?(dot-0.5)*filterBase*0.9:0;
          obj.label.element.style.opacity=String(lblOp.toFixed(2));
        }
      }
    });

    /* Arc pulse beads */
    this.arcObjs.forEach(a=>{
      a.progress=(a.progress+(a._speed||.003))%1;
      const pt=a.curve.getPoint(a.progress);
      a.pulse.position.copy(pt);
      const fade=Math.sin(a.progress*Math.PI);
      a.pulse.material.opacity=fade*(a.tube.material.opacity>.3?1:.35);
      /* Pulse bead color matches arc highlight state */
      if(a._highlighted&&!a.pulse.material._highlighted){
        a.pulse.material.color.set(0xffffff);a.pulse.material._highlighted=true;
      }
    });

    this.controls?.update();
    this.renderer.render(this.scene,this.camera);
    this.labelRenderer?.render(this.scene,this.camera);
  }

  /* ── Ripple effect on culture select ── */
  _rippleAt(position){
    const geo=new THREE.RingGeometry(0.02,0.025,32);
    const mat=new THREE.MeshBasicMaterial({color:0x00f7ff,transparent:true,opacity:.7,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false});
    const mesh=new THREE.Mesh(geo,mat);
    mesh.position.copy(position);
    /* Orient ring to face outward from sphere center */
    mesh.lookAt(new THREE.Vector3(0,0,0));mesh.rotateX(Math.PI/2);
    this.scene.add(mesh);
    this._ripples=this._ripples||[];
    this._ripples.push({mesh,scale:1});
    /* Second wave delayed */
    setTimeout(()=>{
      const m2=mesh.clone();m2.material=mat.clone();
      this.scene.add(m2);this._ripples.push({mesh:m2,scale:0.5});
    },300);
  }

  destroy(){
    cancelAnimationFrame(this.animId);
    this.renderer.dispose();
    this.container.innerHTML='';
  }
}

// ══════════════════════════════════════════════════════════
// D3 MAP CLASS  (simplified from original)
// ══════════════════════════════════════════════════════════
class D3Map {
  constructor(container) {
    this.container=container;this.svg=null;this.root=null;
    this.projection=null;this.path=null;this.zoom=null;
    this.transform=d3.zoomIdentity;
    this.nodesSel=null;this.labelsSel=null;this.linksSel=null;
    this.W=0;this.H=0;this.inited=false;
    this.onSelect=null;this.onDeselect=null;
  }

  init(world,cultures,links){
    if(this.inited) return;this.inited=true;
    this.svg=d3.select(this.container).append('svg').attr('aria-label','2D world map');
    const root=this.root=this.svg.append('g').attr('class','map-root');
    this._resize();
    this.projection=d3.geoMercator().translate([this.W/2,this.H/2]).scale(this._baseScale());
    this.path=d3.geoPath(this.projection);
    root.append('path').attr('class','land').datum(world.land).attr('pointer-events','none');
    root.append('g').attr('class','countries').selectAll('path.country')
      .data(world.countries.features||[]).enter().append('path').attr('class','country').attr('pointer-events','none');
    this.linksSel=root.append('g').attr('class','links').selectAll('path').data(links).enter()
      .append('path').attr('class','connection-path').attr('pointer-events','none');
    const mapR=IS_COARSE?8:5;
    this.nodesSel=root.append('g').attr('class','nodes').selectAll('circle')
      .data(cultures,d=>d.id).enter().append('circle').attr('class','node').attr('r',mapR)
      .attr('fill',d=>regionColor(d))
      .on('click',(event,d)=>{event.stopPropagation();this.onSelect?.(d);});
    this.labelsSel=root.append('g').attr('class','labels').selectAll('text')
      .data(cultures,d=>d.id).enter().append('text').attr('class','node-label')
      .attr('fill',IS_COARSE?'rgba(0,247,255,.95)':'rgba(0,247,255,.88)')
      .attr('font-size',IS_COARSE?'12':'10').attr('font-family','sans-serif')
      .attr('stroke','rgba(5,10,18,.85)').attr('stroke-width',IS_COARSE?'3':'2.5')
      .attr('stroke-linejoin','round').attr('paint-order','stroke fill')
      .style('cursor','pointer').text(d=>d.name)
      .on('click',(event,d)=>{event.stopPropagation();this.onSelect?.(d);});
    this.zoom=d3.zoom().scaleExtent([.5,8]).on('zoom',e=>{this.transform=e.transform;root.attr('transform',e.transform);});
    this.svg.call(this.zoom);
    this.svg.on('click',()=>{this.onDeselect?.();});
    window.addEventListener('resize',()=>this._resize(),{passive:true});
    this.render(null,'all');
  }

  _resize(){
    const r=this.container.getBoundingClientRect();
    this.W=r.width||800;this.H=r.height||560;
    if(this.svg) this.svg.attr('width',this.W).attr('height',this.H).attr('viewBox',`0 0 ${this.W} ${this.H}`);
    if(this.projection) this.projection.translate([this.W/2,this.H/2]).scale(this._baseScale());
  }
  _baseScale(){return Math.max(100,Math.min(600,this.W*.18));}

  render(selectedId, lens){
    if(!this.inited||!this.projection||!this.path) return;
    this.nodesSel.attr('cx',d=>(this.projection([d.lon,d.lat])||[NaN,NaN])[0])
      .attr('cy',d=>(this.projection([d.lon,d.lat])||[NaN,NaN])[1])
      .attr('opacity',d=>{const on=lens==='all'||(d.tags||[]).some(t=>LENS_ALIASES[lens]?.has(t));return on?1:.25;})
      .classed('is-selected',d=>d.id===selectedId);
    this.labelsSel.attr('x',d=>(this.projection([d.lon,d.lat])||[NaN,NaN])[0]+(IS_COARSE?11:8))
      .attr('y',d=>(this.projection([d.lon,d.lat])||[NaN,NaN])[1]+3)
      .attr('fill',d=>d.id===selectedId?'rgba(255,215,0,.98)':'rgba(0,247,255,.85)')
      .attr('font-weight',d=>d.id===selectedId?'600':'400')
      .attr('opacity',1);
    this.linksSel.attr('d',l=>{
      const pa=this.projection([l.source.lon,l.source.lat]);
      const pb=this.projection([l.target.lon,l.target.lat]);
      if(!pa||!pb) return '';
      const mx=(pa[0]+pb[0])/2,my=(pa[1]+pb[1])/2;
      const dx=pb[0]-pa[0],dy=pb[1]-pa[1],dist=Math.hypot(dx,dy);
      const lift=Math.max(10,Math.min(60,dist*.18)),nx=-dy/(dist||1),ny=dx/(dist||1);
      return `M${pa[0]},${pa[1]} Q${mx+nx*lift},${my+ny*lift} ${pb[0]},${pb[1]}`;
    }).attr('opacity',l=>{if(!selectedId) return .14;const h=l.source.id===selectedId||l.target.id===selectedId;return h?.85:.05;});
    this.root.selectAll('path.land').attr('d',this.path);
    this.root.selectAll('path.country').attr('d',this.path);
  }

  focusOn(culture){
    const p=this.projection([culture.lon,culture.lat]);
    if(!p||!this.svg||!this.zoom) return;
    const k=IS_COARSE?5:4;
    const tx=this.W/2-p[0]*k,ty=this.H/2-p[1]*k;
    this.svg.transition().duration(600).call(this.zoom.transform,d3.zoomIdentity.translate(tx,ty).scale(k));
  }
}

// ══════════════════════════════════════════════════════════
// FORCE GRAPH CLASS
// D3 force simulation on canvas — toggle mode from globe
// ══════════════════════════════════════════════════════════
class ForceGraph {
  constructor(container) {
    this.container=container;
    this.canvas=null;this.ctx=null;
    this.sim=null;this.nodes=[];this.links=[];
    this.W=0;this.H=0;
    this.selected=null;
    this.dragging=null;
    this.onSelect=null;this.onDeselect=null;
    this._animId=null;this.time=0;
  }

  init(cultures,links){
    this.nodes=cultures.map(c=>({...c,x:this.W/2+(Math.random()-.5)*200,y:this.H/2+(Math.random()-.5)*200,vx:0,vy:0}));
    const nMap=new Map(this.nodes.map(n=>[n.id,n]));
    this.links=links.map(l=>({source:nMap.get(l.source.id),target:nMap.get(l.target.id),data:l})).filter(l=>l.source&&l.target);
    this.canvas=document.createElement('canvas');
    this.canvas.style.cssText='width:100%;height:100%;display:block;cursor:pointer;touch-action:manipulation;';
    this.container.appendChild(this.canvas);
    this.ctx=this.canvas.getContext('2d');
    this._resize();
    this._buildSim();
    this._bindEvents();
    this._loop();
  }

  _resize(){
    const dpr=window.devicePixelRatio||1,r=this.container.getBoundingClientRect();
    this.W=r.width;this.H=r.height;
    this.canvas.width=this.W*dpr;this.canvas.height=this.H*dpr;
    this.ctx=this.canvas.getContext('2d');this.ctx.scale(dpr,dpr);
    if(this.sim) this.sim.force('center',d3.forceCenter(this.W/2,this.H/2)).alpha(.3).restart();
  }

  _buildSim(){
    /* Degree map for node sizing */
    const deg=new Map();
    this.links.forEach(l=>{deg.set(l.source.id,(deg.get(l.source.id)||0)+1);deg.set(l.target.id,(deg.get(l.target.id)||0)+1);});
    this.nodes.forEach(n=>{n._deg=deg.get(n.id)||0;n._r=12+Math.min(n._deg*3,18);});
    this.sim=d3.forceSimulation(this.nodes)
      .force('link',d3.forceLink(this.links).id(d=>d.id).distance(d=>{
        /* Stronger connections = shorter distance */
        return 120;
      }).strength(.4))
      .force('charge',d3.forceManyBody().strength(-280))
      .force('center',d3.forceCenter(this.W/2,this.H/2))
      .force('collide',d3.forceCollide(d=>d._r+8))
      .alphaDecay(.02).on('tick',()=>{});
  }

  _bindEvents(){
    window.addEventListener('resize',()=>this._resize(),{passive:true});
    this.canvas.addEventListener('click',e=>this._onClick(e));
    this.canvas.addEventListener('mousemove',e=>this._onMove(e));
    this.canvas.addEventListener('mousedown',e=>this._onDown(e));
    this.canvas.addEventListener('mouseup',()=>this._onUp());
    this.canvas.addEventListener('touchstart',e=>{if(e.touches.length===1){e.preventDefault();this._onDown(e.touches[0]);}},{passive:false});
    this.canvas.addEventListener('touchmove',e=>{if(this.dragging){e.preventDefault();this._onMove(e.touches[0]);}},{passive:false});
    this.canvas.addEventListener('touchend',e=>{this._onUp();if(e.changedTouches.length){this._onClick(e.changedTouches[0]);}},{passive:true});
  }

  _getPos(e){const r=this.canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
  _hitNode(x,y){return this.nodes.find(n=>Math.hypot(x-n.x,y-n.y)<(n._r||14));}

  _onDown(e){const{x,y}=this._getPos(e);const n=this._hitNode(x,y);if(n){this.dragging=n;this.sim.alphaTarget(.3).restart();n.fx=n.x;n.fy=n.y;}}
  _onMove(e){
    const{x,y}=this._getPos(e);
    if(this.dragging){this.dragging.fx=x;this.dragging.fy=y;return;}
    this.canvas.style.cursor=this._hitNode(x,y)?'pointer':'default';
  }
  _onUp(){if(this.dragging){this.dragging.fx=null;this.dragging.fy=null;this.sim.alphaTarget(0);this.dragging=null;}}
  _onClick(e){
    const{x,y}=this._getPos(e);const n=this._hitNode(x,y);
    if(n&&!this.dragging){
      if(this.selected?.id===n.id){this.selected=null;this.onDeselect?.();}
      else{this.selected=n;this.onSelect?.(n);}
    } else if(!n){this.selected=null;this.onDeselect?.();}
  }

  applyFilter(lens){this._filterLens=lens;}

  _loop(){
    this._animId=requestAnimationFrame(()=>this._loop());
    this.time+=.016;
    this.sim.tick();
    this._draw();
  }

  _draw(){
    const{ctx,W,H,time}=this;
    ctx.clearRect(0,0,W,H);
    /* Background */
    const bg=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.max(W,H)*.7);
    bg.addColorStop(0,'#0a0e1a');bg.addColorStop(1,'#040710');
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    const lens=this._filterLens||'all';
    const selId=this.selected?.id;
    /* Links */
    this.links.forEach(l=>{
      const son=lens==='all'||(l.source.tags||[]).some(t=>LENS_ALIASES[lens]?.has(t));
      const ton=lens==='all'||(l.target.tags||[]).some(t=>LENS_ALIASES[lens]?.has(t));
      const active=selId&&(l.source.id===selId||l.target.id===selId);
      ctx.beginPath();ctx.moveTo(l.source.x,l.source.y);ctx.lineTo(l.target.x,l.target.y);
      ctx.strokeStyle=active?'rgba(0,247,255,.75)':(son&&ton)?'rgba(0,247,255,.12)':'rgba(0,247,255,.03)';
      ctx.lineWidth=active?1.8:1;ctx.stroke();
    });
    /* Nodes */
    this.nodes.forEach(n=>{
      const on=lens==='all'||(n.tags||[]).some(t=>LENS_ALIASES[lens]?.has(t));
      const sel=n.id===selId;
      const hex=regionColor(n);const r=n._r||14;
      ctx.globalAlpha=on?1:.1;
      /* Glow */
      const grd=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,r*2.5);
      grd.addColorStop(0,hex+'55');grd.addColorStop(1,hex+'00');
      ctx.beginPath();ctx.arc(n.x,n.y,r*2.5,0,Math.PI*2);ctx.fillStyle=grd;ctx.fill();
      /* Pulse ring on selected */
      if(sel){
        const pr=r+5+Math.sin(time*2.5)*4;
        ctx.beginPath();ctx.arc(n.x,n.y,pr,0,Math.PI*2);
        ctx.strokeStyle=hex+'99';ctx.lineWidth=1.5;
        ctx.globalAlpha=on?(0.4+Math.sin(time*2.5)*.15):.1;ctx.stroke();
        ctx.globalAlpha=on?1:.1;
      }
      /* Core */
      ctx.beginPath();ctx.arc(n.x,n.y,r,0,Math.PI*2);
      ctx.fillStyle=hex+(sel?'ff':'cc');
      ctx.shadowColor=hex;ctx.shadowBlur=sel?20:8;ctx.fill();ctx.shadowBlur=0;
      /* Symbol */
      ctx.fillStyle='#fff';ctx.font=`${Math.max(10,r-2)}px sans-serif`;
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(n.symbol,n.x,n.y);
      /* Label */
      ctx.fillStyle=sel?hex:'rgba(255,255,255,.7)';
      ctx.font=`${sel?'600 ':' '}9px Orbitron,monospace`;
      ctx.textAlign='center';ctx.textBaseline='top';
      const words=n.name.split(' ');
      words.forEach((w,i)=>ctx.fillText(w,n.x,n.y+r+3+i*11));
      ctx.globalAlpha=1;
    });
    /* Degree legend */
    ctx.fillStyle='rgba(0,247,255,.3)';ctx.font='10px Orbitron,monospace';
    ctx.textAlign='left';ctx.textBaseline='bottom';
    ctx.fillText('Node size = connection degree · Drag to rearrange',8,H-8);
  }

  destroy(){cancelAnimationFrame(this._animId);this.container.innerHTML='';}
}

// ══════════════════════════════════════════════════════════
// TIMELINE CONTROLLER
// Adds an era scrubber below the globe
// ══════════════════════════════════════════════════════════
class TimelineController {
  constructor(mountEl){
    this.mount=mountEl;
    this.startYear=-3000;this.endYear=2025;
    this.currentStart=-3000;this.currentEnd=2025;
    this.playing=false;this._playTimer=null;
    this.onChange=null;  /* callback(visibleIds:Set) */
    this._build();
  }

  _build(){
    this.mount.innerHTML=`
<div class="timeline-wrap" id="tlWrap" style="display:none;padding:10px 16px 6px;background:rgba(4,7,15,.8);border-top:1px solid rgba(0,247,255,.1);">
  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
    <span style="font-family:Orbitron,monospace;font-size:9px;letter-spacing:.12em;color:rgba(255,215,0,.65);flex-shrink:0;">TIMELINE</span>
    <div style="display:flex;gap:4px;flex-shrink:0;">
      <button id="tlPlay" class="tl-btn" title="Auto-play">▶</button>
      <button id="tlReset" class="tl-btn" title="Reset">↺</button>
    </div>
    <span id="tlLabel" style="font-family:Orbitron,monospace;font-size:10px;color:rgba(0,247,255,.85);min-width:140px;text-align:center;flex-shrink:0;">All eras</span>
    <input id="tlStart" type="range" min="-3000" max="2025" value="-3000" style="flex:1;min-width:80px;">
    <input id="tlEnd"   type="range" min="-3000" max="2025" value="2025"  style="flex:1;min-width:80px;">
  </div>
</div>`;
    const q=id=>document.getElementById(id);
    this.wrap  =q('tlWrap');
    this.slStart=q('tlStart');this.slEnd=q('tlEnd');
    this.label =q('tlLabel');
    this.playBtn=q('tlPlay');this.resetBtn=q('tlReset');
    this.slStart.addEventListener('input',()=>{this.currentStart=+this.slStart.value;this._clamp();this._emit();});
    this.slEnd.addEventListener('input',()=>{this.currentEnd=+this.slEnd.value;this._clamp();this._emit();});
    this.playBtn.addEventListener('click',()=>this.togglePlay());
    this.resetBtn.addEventListener('click',()=>this.reset());
  }

  _clamp(){
    if(this.currentStart>this.currentEnd-50){
      if(document.activeElement===this.slStart){this.currentStart=this.currentEnd-50;this.slStart.value=this.currentStart;}
      else{this.currentEnd=this.currentStart+50;this.slEnd.value=this.currentEnd;}
    }
    this._updateLabel();
  }

  _updateLabel(){
    const fmt=y=>y<0?`${Math.abs(y)} BCE`:`${y} CE`;
    this.label.textContent=`${fmt(this.currentStart)} – ${fmt(this.currentEnd)}`;
  }

  _emit(){
    if(!this.onChange) return;
    const isAll=this.currentStart<=-3000&&this.currentEnd>=2025;
    if(isAll){this.onChange(null);return;}
    /* collect culture ids visible in this window */
    /* (App will filter cultures using this) */
    this.onChange({start:this.currentStart,end:this.currentEnd});
  }

  show(v){this.wrap.style.display=v?'block':'none';}

  togglePlay(){
    this.playing=!this.playing;
    this.playBtn.textContent=this.playing?'⏸':'▶';
    if(this.playing){
      this.currentStart=-3000;this.currentEnd=-2800;
      this.slStart.value=-3000;this.slEnd.value=-2800;
      this._clamp();this._emit();
      this._playTimer=setInterval(()=>{
        this.currentEnd=Math.min(2025,this.currentEnd+80);
        this.slEnd.value=this.currentEnd;
        this._clamp();this._emit();
        if(this.currentEnd>=2025){this.togglePlay();}
      },120);
    } else {clearInterval(this._playTimer);}
  }

  reset(){
    clearInterval(this._playTimer);this.playing=false;this.playBtn.textContent='▶';
    this.currentStart=-3000;this.currentEnd=2025;
    this.slStart.value=-3000;this.slEnd.value=2025;
    this._updateLabel();this._emit();
  }
}

// ══════════════════════════════════════════════════════════
// TOUR CONTROLLER
// Auto-flies camera through Weave Path stops
// ══════════════════════════════════════════════════════════
class TourController {
  constructor(btnEl, progressEl){
    this.btn=btnEl;this.progressEl=progressEl;
    this.stops=[];this.idx=0;this.active=false;this._timer=null;
    this.onStop=null;  /* callback(culture, idx, total) */
    this.onEnd=null;
    this.btn?.addEventListener('click',()=>this.toggle());
  }

  setStops(cultures){this.stops=cultures;}

  toggle(){
    if(this.active) this.stop();
    else this.start();
  }

  start(){
    if(!this.stops.length) return;
    this.active=true;this.idx=0;
    if(this.btn) this.btn.innerHTML='<i class="fas fa-stop"></i> Stop Tour';
    if(this.btn) this.btn.classList.add('tour-active');
    this._fly();
  }

  stop(){
    this.active=false;clearTimeout(this._timer);
    if(this.btn){this.btn.innerHTML='<i class="fas fa-play-circle"></i> Tour';this.btn.classList.remove('tour-active');}
    if(this.progressEl) this.progressEl.style.display='none';
    this.onEnd?.();
  }

  _fly(){
    if(!this.active||this.idx>=this.stops.length){this.stop();return;}
    const c=this.stops[this.idx];
    /* Update progress */
    if(this.progressEl){
      this.progressEl.style.display='flex';
      this.progressEl.innerHTML=`
        <span style="font-family:Orbitron,monospace;font-size:9px;color:rgba(0,247,255,.7);">STOP ${this.idx+1} / ${this.stops.length}</span>
        <span style="font-family:Orbitron,monospace;font-size:10px;color:rgba(255,215,0,.9);margin-left:10px;">${c.symbol} ${c.name}</span>
        <div style="margin-left:auto;display:flex;gap:3px;">${this.stops.map((_,i)=>`<div style="width:8px;height:8px;border-radius:50%;background:${i===this.idx?'rgba(0,247,255,.9)':'rgba(0,247,255,.2)'};transition:background .3s;"></div>`).join('')}</div>`;
    }
    this.onStop?.(c, this.idx, this.stops.length);
    this.idx++;
    this._timer=setTimeout(()=>this._fly(), 4200);
  }
}

// ══════════════════════════════════════════════════════════
// SUGGESTED LINKS
// ══════════════════════════════════════════════════════════
function overlapScore(a,b){
  const A=new Set([...(a.tags||[]),...(a.keyTerms||[])].map(String));
  const B=new Set([...(b.tags||[]),...(b.keyTerms||[])].map(String));
  if(!A.size||!B.size) return 0;
  let inter=0;for(const t of A) if(B.has(t)) inter++;
  const union=A.size+B.size-inter;return union?inter/union:0;
}
function buildSuggested(cultures,linksOfficial){
  const out=[],existing=new Set(linksOfficial.map(l=>`${l.source.id}__${l.target.id}`));
  for(let i=0;i<cultures.length;i++) for(let j=i+1;j<cultures.length;j++){
    const a=cultures[i],b=cultures[j];
    if(existing.has(`${a.id}__${b.id}`)) continue;
    const score=overlapScore(a,b);if(score<.34) continue;
    out.push({source:a,target:b,label:'Suggested',themes:[],description:`Similarity score ${score.toFixed(2)}`,_kind:'suggested'});
  }
  return out.slice(0,240);
}

// ══════════════════════════════════════════════════════════
// CULTURE DETAIL PANEL  (same as original, condensed)
// ══════════════════════════════════════════════════════════
function renderDetailPanel(c,el){
  if(!c||!el) return;
  const set=(id,v)=>{const e=document.getElementById(id);if(e) e.textContent=v;};
  set('culture-symbol',c.symbol||'🌐');set('culture-name',c.name||'');
  set('culture-location',`${c.location||''}${c.region?(c.location?' • ':'')+c.region:''}`);
  set('culture-era',c.era||'');set('culture-desc',c.desc||'');

  /* Clickable tags — clicking highlights all cultures with that tag on the globe */
  const tagsEl=document.getElementById('culture-tags');
  if(tagsEl){
    tagsEl.innerHTML=(c.tags||[]).map(t=>`<button class="culture-tag culture-tag--btn" data-tag="${escapeAttr(t)}" type="button">${escapeHtml(t)}</button>`).join('');
    tagsEl.querySelectorAll('[data-tag]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const tag=btn.dataset.tag;
        const active=btn.classList.toggle('culture-tag--active');
        /* Toggle all other tags off first */
        tagsEl.querySelectorAll('[data-tag]').forEach(b=>{if(b!==btn)b.classList.remove('culture-tag--active');});
        window._cwApp?.globe?.highlightByTag(tag,active);
      });
    });
  }

  const sects=[
    {key:'creationStories',title:'Creation Stories',icon:'fa-stars'},
    {key:'corePrinciples',title:'Core Principles',icon:'fa-scale-balanced'},
    {key:'knowledgeSystems',title:'Knowledge Systems',icon:'fa-brain'},
    {key:'movement',title:'Travel & Exchange',icon:'fa-route'},
    {key:'highlights',title:'Highlights',icon:'fa-bolt'},
    {key:'modernLegacy',title:'Modern Legacy',icon:'fa-tower-observation'},
    {key:'agricultureSystems',title:'Agriculture & Land',icon:'fa-seedling'},
    {key:'martialArts',title:'Martial Arts',icon:'fa-hand-fist'},
    {key:'notableSitesOrTexts',title:'Sites & Texts',icon:'fa-landmark'},
    {key:'story',title:'Story',icon:'fa-book-open'},
  ];

  const extra=document.getElementById('culture-extra');
  if(!extra) return;

  const sectionsHtml=sects.map(s=>{
    const items=(c[s.key]||[]).slice(0,8);
    if(!items.length) return '';
    return `<section class="culture-card culture-extra-card">
      <header class="culture-card-header"><h4 class="culture-card-title"><i class="fas ${escapeAttr(s.icon)}"></i> ${escapeHtml(s.title)}</h4></header>
      <ul class="culture-card-list cw-scroll">${items.map(x=>`<li>${escapeHtml(String(x))}</li>`).join('')}</ul>
    </section>`;
  }).join('');

  /* Reading Links section */
  const links=Array.isArray(c.readingLinks)?c.readingLinks:[];
  const KIND_ICONS={'Primary Text':'fa-scroll','Museum':'fa-building-columns','Essay':'fa-file-lines','Reference':'fa-book','Video':'fa-video','Audio':'fa-headphones','Map':'fa-map'};
  const readingHtml=links.length?`
  <section class="culture-card culture-extra-card culture-reading-links">
    <header class="culture-card-header">
      <h4 class="culture-card-title"><i class="fas fa-book-open-reader"></i> Further Reading</h4>
    </header>
    <ul class="cw-reading-list">
      ${links.map(l=>{
        const icon=KIND_ICONS[String(l.kind||'')]||'fa-link';
        return `<li class="cw-reading-item">
          <a href="${escapeAttr(l.url||'#')}" target="_blank" rel="noopener noreferrer" class="cw-reading-link">
            <span class="cw-reading-icon"><i class="fas ${icon}"></i></span>
            <span class="cw-reading-body">
              <span class="cw-reading-title">${escapeHtml(l.title||l.url||'')}</span>
              ${l.kind?`<span class="cw-reading-kind">${escapeHtml(l.kind)}</span>`:''}
              ${l.desc?`<span class="cw-reading-desc">${escapeHtml(l.desc)}</span>`:''}
            </span>
            <span class="cw-reading-ext"><i class="fas fa-arrow-up-right-from-square"></i></span>
          </a>
        </li>`;
      }).join('')}
    </ul>
  </section>`:'';

  extra.innerHTML=`<div class="culture-extra-grid">${sectionsHtml}</div>${readingHtml}`;
}

function setDetailDefault(){
  const set=(id,v)=>{const e=document.getElementById(id);if(e) e.textContent=v;};
  set('culture-symbol','🌐');set('culture-name','Select a Wisdom Tradition');
  set('culture-location','');set('culture-era','');
  set('culture-desc',IS_COARSE?'Tap a dot to explore.':'Click a culture to explore details.');
  const tags=document.getElementById('culture-tags');if(tags) tags.innerHTML='';
  const extra=document.getElementById('culture-extra');if(extra) extra.innerHTML='';
  const conn=document.getElementById('connections');
  if(conn) conn.innerHTML='<div class="connection-empty">Select a culture to see connections.</div>';
}

function renderConnections(c,allLinks,byId){
  const conn=document.getElementById('connections');if(!conn) return;
  const rel=allLinks.filter(l=>l.source.id===c.id||l.target.id===c.id);
  if(!rel.length){conn.innerHTML='<div class="connection-empty">No links yet. Enable Suggested Links to see AI-inferred connections.</div>';return;}
  conn.innerHTML=rel.map(l=>{
    const other=l.source.id===c.id?l.target:l.source;
    const isSug=l._kind==='suggested';
    return `<div class="connection-card${isSug?' connection-card--suggested':''}" data-cid="${escapeAttr(other.id)}" data-src="${escapeAttr(c.id)}" data-tgt="${escapeAttr(other.id)}">
      <div class="connection-card-head">
        <div class="connection-symbol">${escapeHtml(other.symbol||'🌐')}</div>
        <div>
          <h4 class="connection-name">${escapeHtml(other.name)}</h4>
          <span class="connection-region">${escapeHtml(other.region||other.location||'')}</span>
        </div>
        <button class="connection-fly-btn" title="Fly to arc" data-src="${escapeAttr(c.id)}" data-tgt="${escapeAttr(other.id)}" type="button">
          <i class="fas fa-location-crosshairs"></i>
        </button>
      </div>
      ${l.label||l.description?`<p class="connection-desc"><strong>${escapeHtml(l.label||'Connection')}</strong>${l.description?' — '+escapeHtml(l.description):''}</p>`:''}
      ${(l.themes||[]).length?`<div class="connection-meta">${l.themes.map(t=>`<span class="connection-chip">${escapeHtml(t)}</span>`).join('')}</div>`:''}
      ${isSug?`<div class="connection-suggested-badge"><i class="fas fa-wand-magic-sparkles"></i> Suggested</div>`:''}
    </div>`;
  }).join('');
  /* Jump to culture */
  conn.querySelectorAll('[data-cid]').forEach(card=>{
    card.addEventListener('click',e=>{
      if(e.target.closest('.connection-fly-btn')) return;
      window._cwApp?.selectById(card.dataset.cid);
    });
  });
  /* Fly to arc midpoint */
  conn.querySelectorAll('.connection-fly-btn').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      window._cwApp?.globe?.flyToArc(btn.dataset.src,btn.dataset.tgt);
    });
  });
}

// ══════════════════════════════════════════════════════════
// WEAVE PATH HELPERS
// ══════════════════════════════════════════════════════════
const LENS_EXPLAIN={
  all:'All lenses — no filter.',
  'Creation':'Highlights origin/cosmology links.',
  'Navigation':'Highlights voyaging/wayfinding networks.',
  'Martial Arts':'Highlights warrior codes and training lineages.',
  'Stewardship':'Highlights reciprocity and land-sea governance.',
  'Ecology':'Highlights environment and seasonality.',
  'Governance':'Highlights councils, law, and institutional memory.',
};

function buildWeavePresets(lensCache,byId){
  const presets=new Map(),order=[];
  for(const[lens,links] of lensCache){
    if(!links.length) continue;
    /* simple walk: find most-connected node, walk to neighbors */
    const deg=new Map();
    links.forEach(l=>{deg.set(l.source.id,(deg.get(l.source.id)||0)+1);deg.set(l.target.id,(deg.get(l.target.id)||0)+1);});
    let start=[...deg.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0];if(!start) continue;
    const visited=new Set([start]),stops=[start];let cur=start;
    while(stops.length<8){
      const nexts=links.filter(l=>(l.source.id===cur&&!visited.has(l.target.id))||(l.target.id===cur&&!visited.has(l.source.id)));
      if(!nexts.length) break;
      const next=nexts[0].source.id===cur?nexts[0].target.id:nexts[0].source.id;
      visited.add(next);stops.push(next);cur=next;
    }
    const cultures=stops.map(id=>byId.get(id)).filter(Boolean);
    if(cultures.length<2) continue;
    const key=`weave:${lens.toLowerCase().replace(/\s+/g,'_')}`;
    presets.set(key,{key,name:`${lens} — Weave Path`,lens,desc:LENS_EXPLAIN[lens]||'',stops:cultures});
    order.push(key);
  }
  return{presets,order};
}

// ══════════════════════════════════════════════════════════
// COSMIC WEAVE — MAIN APP
// ══════════════════════════════════════════════════════════
class CosmicWeave {
  constructor(){
    /* Data */
    this.cultures=[];this.byId=new Map();
    this.linksOfficial=[];this.linksSuggested=[];
    this.showSuggested=false;
    this.lensCache=new Map();
    this.weavePresets=new Map();this.weaveOrder=[];this.weaveKey=null;this.weaveIdx=0;
    /* State */
    this.mode='globe';  /* globe | map | graph */
    this.lens='all';
    this.selectedId=null;
    this.layers={paths:true,food:false,water:false,navigation:false,trade:false,stewardship:false,governance:false};
    this.eraWindow=null;  /* null = all | {start,end} */
    /* Modules */
    this.globe=null;this.map=null;this.graph=null;
    this.timeline=null;this.tour=null;
    this.landmarkScene=null;this.tooltip=null;this.starOverlay=null;
    /* Containers */
    this._containers={};
  }

  async init(){
    this._setupContainers();
    const data=await loadAll();
    this.cultures=data.cultures;this.byId=data.byId;
    this.linksOfficial=data.linksOfficial;this.lensCache=data.lensCache;
    const{presets,order}=buildWeavePresets(this.lensCache,this.byId);
    this.weavePresets=presets;this.weaveOrder=order;
    /* Init globe */
    this.globe=new ThreeGlobe(this._containers.globe);
    await this.globe.init(data.world);
    this.globe.addNodes(this.cultures);
    this.globe.addArcs(this.linksOfficial);
    this.globe.spawnNodes();
    this.globe.onSelect=c=>this.selectCulture(c.id,true);
    this.globe.onDeselect=()=>this.deselectAll();
    /* Init map (lazy) */
    this.map=new D3Map(this._containers.map);
    this.map.onSelect=c=>this.selectCulture(c.id,true);
    this.map.onDeselect=()=>this.deselectAll();
    /* Init graph (lazy) */
    this.graph=new ForceGraph(this._containers.graph);
    this.graph.onSelect=c=>this.selectCulture(c.id,true);
    this.graph.onDeselect=()=>this.deselectAll();
    /* Timeline */
    this.timeline=new TimelineController(document.getElementById('tlMount')||document.createElement('div'));
    this.timeline.onChange=w=>{this.eraWindow=w;this._applyFilter();};
    /* Tour */
    this.tour=new TourController(document.getElementById('btnTour'),document.getElementById('tourProgress'));
    this.tour.onStop=(c,idx,total)=>{ this.selectCulture(c.id,true); if(this.globe&&this.mode==='globe') this.globe.focusOn(c,2.0); };
    this.tour.onEnd=()=>this._updateTourBtn();
    /* Wire UI */
    this._wireUI();
    this._wireKeyboard();
    /* Landmark mini-scene */
    this.landmarkScene=new LandmarkScene();
    /* Tooltip */
    const globeVp=document.getElementById('globe-viewport-3d');
    if(globeVp){this.tooltip=new TooltipManager(globeVp);}
    /* Hawaiian star overlay */
    if(globeVp){
      this.starOverlay=new CelestialStarOverlay(globeVp);
      this.globe.onHover=(culture,cx,cy)=>{this.tooltip?.show(culture,cx,cy);};
      this.globe.onHoverEnd=()=>{this.tooltip?.hide();};
    }
    /* Deep link */
    try{const id=new URL(location.href).searchParams.get('c');if(id&&this.byId.has(id)) this.selectCulture(id,false);}catch{}
    /* Default detail */
    setDetailDefault();
    /* Set mode */
    this.setMode('globe');
    /* Lazy-load map+graph data */
    setTimeout(()=>{
      this.map.init(data.world,this.cultures,this.linksOfficial);
      this.graph.init(this.cultures,this.linksOfficial);
    },800);
    /* Weave preset selector */
    this._populateWeaveSelect();
  }

  _setupContainers(){
    const globeEl=document.getElementById('globe-viewport-3d');
    const mapEl  =document.getElementById('map-viewport');
    const graphEl=document.getElementById('graph-viewport');
    this._containers={globe:globeEl,map:mapEl,graph:graphEl};
  }

  /* ── Mode switching ── */
  setMode(mode){
    this.mode=mode;
    ['globe','map','graph'].forEach(m=>{
      const el=this._containers[m];if(el) el.style.display=m===mode?'block':'none';
    });
    ['tabGlobe','tabMap','tabGraph'].forEach((id,i)=>{
      const m=['globe','map','graph'][i];
      document.getElementById(id)?.classList.toggle('active',mode===m);
    });
    /* Show/hide timeline based on mode */
    this.timeline?.show(mode==='globe'||mode==='map');
    /* Show/hide tour button */
    document.getElementById('btnTour')?.style && (document.getElementById('btnTour').style.display=mode==='globe'?'':'none');
  }

  /* ── Culture selection ── */
  selectCulture(id,push=true){
    const c=this.byId.get(id);if(!c) return;
    if(this.selectedId===id){this.deselectAll();return;}
    this.selectedId=id;
    /* Sync globe node selection */
    const obj=this.globe?.nodeObjs.find(n=>n.data.id===id);
    if(obj){
      if(this.globe.selected&&this.globe.selected!==obj) this.globe._deselectObj(this.globe.selected);
      this.globe.selected=obj;this.globe._selectObj(obj);
      if(this.controls) this.globe.controls.autoRotate=false;
      if(this.mode==='globe') this.globe.focusOn(c);
    }
    if(this.mode==='map') this.map?.focusOn(c);
    if(this.mode==='graph'){if(this.graph) this.graph.selected=this.graph.nodes.find(n=>n.id===id)||null;}
    this.map?.render(id,this.lens);
    /* Panels */
    renderDetailPanel(c,document.getElementById('culture-name'));
    /* Landmark preview disabled */
    // this.landmarkScene?.mount(id,'landmark-preview');
    const allL=this.showSuggested?[...this.linksOfficial,...this.linksSuggested]:this.linksOfficial;
    renderConnections(c,allL,this.byId);
    /* Layer threads */
    LAYER_CFGS.forEach(cfg=>this.globe?.highlightLayer(cfg.key,c,this.cultures,this.layers[cfg.key]));
    /* Deep link */
    if(push){try{const u=new URL(location.href);u.searchParams.set('c',id);history.replaceState({},'',u);}catch{}}
    /* Mobile scroll to details */
    if(IS_COARSE) setTimeout(()=>document.querySelector('.cw-panel--details')?.scrollIntoView({behavior:'smooth',block:'start'}),400);
  }

  selectById(id){this.selectCulture(id,true);}

  deselectAll(){
    this.selectedId=null;
    this.globe?.deselectAll();
    if(this.map) this.map.render(null,this.lens);
    if(this.graph) this.graph.selected=null;
    LAYER_CFGS.forEach(cfg=>this.globe?.highlightLayer(cfg.key,null,this.cultures,false));
    setDetailDefault();
    try{const u=new URL(location.href);u.searchParams.delete('c');history.replaceState({},'',u);}catch{}
    if(this.globe?.controls) this.globe.controls.autoRotate=true;
  }

  /* ── Lens ── */
  setLens(lens){
    this.lens=lens;
    document.querySelectorAll('.cw-lens').forEach(b=>b.classList.toggle('active',b.dataset.lens===lens));
    this.globe?.setLensArcs(lens==='all'?[]:(this.lensCache.get(lens)||[]),lens!=='all');
    this._applyFilter();
    this.map?.render(this.selectedId,lens);
    this.graph?.applyFilter(lens);
    /* Update weave preset to matching lens */
    if(lens!=='all'){
      const k=this.weaveOrder.find(k=>this.weavePresets.get(k)?.lens===lens);
      if(k){this.weaveKey=k;this._updateWeavePanel();}
    }
  }

  /* ── Layers ── */
  setLayer(key,on){
    this.layers[key]=on;
    const sel=this.selectedId?this.byId.get(this.selectedId):null;
    this.globe?.highlightLayer(key,sel,this.cultures,on);
  }

  /* ── Filter (lens + era) ── */
  _applyFilter(){
    const lens=this.lens;
    let visibleIds=null;
    if(this.eraWindow){
      visibleIds=new Set(this.cultures.filter(c=>c.eraStart<=this.eraWindow.end&&c.eraEnd>=this.eraWindow.start).map(c=>c.id));
    }
    this.globe?.applyFilter(lens,visibleIds,!!this.eraWindow);
    this.map?.render(this.selectedId,lens);
    this.graph?.applyFilter(lens);
  }

  /* ── Weave paths ── */
  _populateWeaveSelect(){
    const sel=document.getElementById('weavePreset');if(!sel) return;
    sel.innerHTML=this.weaveOrder.map(k=>{const p=this.weavePresets.get(k);return `<option value="${escapeAttr(k)}">${escapeHtml(p?.name||k)}</option>`;}).join('');
    this.weaveKey=this.weaveOrder[0]||null;
    this._updateWeavePanel();
  }
  _updateWeavePanel(){
    const p=this.weaveKey?this.weavePresets.get(this.weaveKey):null;
    const stops=p?.stops||[];
    const sum=document.getElementById('weaveSummary');
    if(sum) sum.innerHTML=p?`<strong>${escapeHtml(p.name)}</strong> • ${escapeHtml(p.desc)} • <strong>${stops.length}</strong> stops`:'Select a path.';
    const stopsEl=document.getElementById('weaveStops');
    if(stopsEl){
      stopsEl.innerHTML=stops.map((c,i)=>`<li class="cw-path-item ${i===this.weaveIdx?'active':''}" data-idx="${i}"><div><strong>${escapeHtml(c.symbol)} ${escapeHtml(c.name)}</strong><div class="cw-muted">${escapeHtml(c.location||c.region||'')}</div></div><div class="cw-muted">#${i+1}</div></li>`).join('');
      stopsEl.querySelectorAll('[data-idx]').forEach(li=>li.addEventListener('click',()=>{this.weaveIdx=+li.dataset.idx;this._goWeaveStop();}));
    }
    /* Update tour stops */
    this.tour?.setStops(stops);
    /* Render weave path arc on globe (if paths layer on) */
    this._renderWeavePath(stops);
  }
  _renderWeavePath(stops){
    (this._weaveArcMeshes||[]).forEach(m=>{this.globe?.scene.remove(m);m.geometry?.dispose();});
    this._weaveArcMeshes=[];
    if(!this.layers.paths||!stops.length||!this.globe) return;
    for(let i=0;i<stops.length-1;i++){
      const curve=geodesicCurve(stops[i],stops[i+1]);
      const tube=new THREE.Mesh(
        new THREE.TubeGeometry(curve,80,0.003,4,false),
        new THREE.MeshBasicMaterial({color:0xffd700,transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false})
      );
      this.globe.scene.add(tube);this._weaveArcMeshes.push(tube);
    }
  }
  _goWeaveStop(){
    const p=this.weaveKey?this.weavePresets.get(this.weaveKey):null;
    if(!p) return;
    const c=p.stops[this.weaveIdx];if(!c) return;
    this.selectCulture(c.id,true);
    this._updateWeavePanel();
  }
  weavePrev(){const p=this.weaveKey?this.weavePresets.get(this.weaveKey):null;if(!p) return;this.weaveIdx=Math.max(0,this.weaveIdx-1);this._goWeaveStop();}
  weaveNext(){const p=this.weaveKey?this.weavePresets.get(this.weaveKey):null;if(!p) return;this.weaveIdx=Math.min(p.stops.length-1,this.weaveIdx+1);this._goWeaveStop();}
  weaveShuffle(){if(!this.weaveOrder.length) return;this.weaveKey=this.weaveOrder[Math.floor(Math.random()*this.weaveOrder.length)];this.weaveIdx=0;this._updateWeavePanel();this._goWeaveStop();}

  _updateTourBtn(){document.getElementById('btnTour')?.classList.remove('tour-active');}

  /* ── Suggested links ── */
  toggleSuggested(){
    this.showSuggested=!this.showSuggested;
    if(this.showSuggested&&!this.linksSuggested.length) this.linksSuggested=buildSuggested(this.cultures,this.linksOfficial);
    if(this.selectedId){const c=this.byId.get(this.selectedId);const all=this.showSuggested?[...this.linksOfficial,...this.linksSuggested]:this.linksOfficial;renderConnections(c,all,this.byId);}
  }

  /* ── Keyboard ── */
  _wireKeyboard(){
    document.addEventListener('keydown',e=>{
      if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;
      if(e.key==='Escape'){this.deselectAll();return;}
      const cur=this.cultures.findIndex(c=>c.id===this.selectedId);
      if(e.key==='ArrowRight'||e.key==='ArrowDown') this.selectCulture(this.cultures[(cur+1)%this.cultures.length]?.id,true);
      else if(e.key==='ArrowLeft'||e.key==='ArrowUp') this.selectCulture(this.cultures[(cur-1+this.cultures.length)%this.cultures.length]?.id,true);
    });
  }

  /* ── UI wiring ── */
  _wireUI(){
    /* Star map toggle */
    document.getElementById('btnStarMap')?.addEventListener('click',()=>{
      const visible=this.starOverlay?.toggle(this.globe);
      document.getElementById('btnStarMap')?.classList.toggle('active',!!visible);
    });
    /* Tabs */
    document.getElementById('tabGlobe')?.addEventListener('click',()=>this.setMode('globe'));
    document.getElementById('tabMap')?.addEventListener('click',()=>this.setMode('map'));
    document.getElementById('tabGraph')?.addEventListener('click',()=>this.setMode('graph'));
    /* Lenses */
    document.querySelectorAll('.cw-lens').forEach(b=>b.addEventListener('click',()=>this.setLens(b.dataset.lens)));
    /* Layers */
    document.querySelectorAll('.cw-layer-btn').forEach(b=>{
      b.addEventListener('click',()=>{
        const k=b.dataset.layer;if(!k) return;
        if(k==='suggested'){this.toggleSuggested();b.classList.toggle('active',this.showSuggested);return;}
        this.layers[k]=!this.layers[k];b.classList.toggle('active',this.layers[k]);
        if(k==='paths') this._renderWeavePath(this.weaveKey?this.weavePresets.get(this.weaveKey)?.stops||[]:[]);
        else{const sel=this.selectedId?this.byId.get(this.selectedId):null;this.globe?.highlightLayer(k,sel,this.cultures,this.layers[k]);}
      });
    });
    /* Globe controls */
    document.getElementById('zoomIn')?.addEventListener('click',()=>{if(this.globe?.camera) this.globe.camera.position.multiplyScalar(.88);});
    document.getElementById('zoomOut')?.addEventListener('click',()=>{if(this.globe?.camera) this.globe.camera.position.multiplyScalar(1.12);});
    document.getElementById('resetView')?.addEventListener('click',()=>{
      if(this.globe?.controls){this.globe.controls.reset?.();this.globe.camera.position.set(0,0,2.8);}
      if(this.map) this.map.svg?.transition().duration(450).call(this.map.zoom.transform,d3.zoomIdentity);
    });
    document.getElementById('toggleLabels')?.addEventListener('click',()=>{
      this.globe?.nodeObjs.forEach(o=>{if(o.label?.element){const e=o.label.element;e.style.display=e.style.display==='none'?'':'none';}});
    });
    /* Guide */
    document.getElementById('toggleLayerLegend')?.addEventListener('click',()=>{const el=document.getElementById('layerLegend');el?.hasAttribute('hidden')?el.removeAttribute('hidden'):el?.setAttribute('hidden','');});
    /* Weave paths */
    document.getElementById('weavePreset')?.addEventListener('change',e=>{this.weaveKey=e.target.value;this.weaveIdx=0;this._updateWeavePanel();});
    document.getElementById('weavePrev')?.addEventListener('click',()=>this.weavePrev());
    document.getElementById('weaveNext')?.addEventListener('click',()=>this.weaveNext());
    document.getElementById('weaveShuffle')?.addEventListener('click',()=>this.weaveShuffle());
    document.getElementById('weaveAuto')?.addEventListener('click',()=>{/* toggle auto-advance */
      const btn=document.getElementById('weaveAuto');
      if(this._weaveAutoTimer){clearInterval(this._weaveAutoTimer);this._weaveAutoTimer=null;btn.innerHTML='<i class="fas fa-play"></i> Auto';btn.classList.remove('active');return;}
      btn.innerHTML='<i class="fas fa-pause"></i> Auto';btn.classList.add('active');
      this._weaveAutoTimer=setInterval(()=>this.weaveNext(),3500);
    });
    /* Copy link */
    document.getElementById('btnCopyLink')?.addEventListener('click',()=>{try{navigator.clipboard?.writeText(location.href);}catch{}});
    /* Connections click (delegated) */
    document.getElementById('connections')?.addEventListener('click',e=>{const card=e.target.closest('[data-cid]');if(card) this.selectCulture(card.dataset.cid,true);});
    /* Map controls */
    document.getElementById('btnResetMap')?.addEventListener('click',()=>{if(this.map?.svg) this.map.svg.transition().duration(450).call(this.map.zoom.transform,d3.zoomIdentity);});
    /* Discover random */
    document.getElementById('btnDiscover')?.addEventListener('click',()=>{if(this.cultures.length) this.selectCulture(this.cultures[Math.floor(Math.random()*this.cultures.length)].id,true);});
    /* Mobile nav */
    this._wireMobileNav();
  }

  _wireMobileNav(){
    const toggle=document.getElementById('mobile-menu-toggle'),links=document.getElementById('nav-links');
    if(!toggle||!links) return;
    const close=()=>{links.classList.remove('is-open');toggle.setAttribute('aria-expanded','false');toggle.innerHTML='<i class="fas fa-bars"></i>';};
    const open=()=>{links.classList.add('is-open');toggle.setAttribute('aria-expanded','true');toggle.innerHTML='<i class="fas fa-xmark"></i>';};
    toggle.addEventListener('click',e=>{e.stopPropagation();links.classList.contains('is-open')?close():open();});
    links.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
    document.addEventListener('click',e=>{if(!toggle.contains(e.target)&&!links.contains(e.target)) close();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape') close();});
  }
}

// ══════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════
async function boot() {
  /* Ensure Three.js is available */
  if(!window.THREE) {
    console.warn('[CW] Three.js not loaded — 3D globe unavailable');
    /* Still boot but globe will be empty */
  }
  const app=new CosmicWeave();
  window._cwApp=app;
  try { await app.init(); }
  catch(err) { console.error('[CW] Init failed:',err); }
}

if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
else boot();

})(); /* end IIFE */