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

/* ══════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════ */
const CULTURES_URL = 'docs/cultures.json';
const WORLD_URL    = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const IS_COARSE    = window.matchMedia?.('(pointer: coarse)').matches ?? false;
const PRM          = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const GLOBE_R      = 1.0;  /* sphere radius in Three.js units */

/* ── Performance caches ── */
let _sunCache = null, _sunTime = 0, _lastDeclutter = 0;

/* ══════════════════════════════════════════════════════════
   MATH / GEO HELPERS
══════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════
   DATA HELPERS  (same as original cosmic-weave.js)
══════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════
   EARTH CANVAS TEXTURE
   Renders D3 equirectangular map onto a canvas used as
   THREE.CanvasTexture — wraps perfectly onto SphereGeometry
══════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════
   GEODESIC ARC POINTS
   Returns CatmullRomCurve3 that arcs over the sphere surface
══════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════
   THREE.JS GLOBE CLASS
══════════════════════════════════════════════════════════ */
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

  _onMove(e){this._setMouse(e.clientX,e.clientY);this._doHover();}

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
    } else {
      if(this.hovered&&this.hovered!==this.selected){this._unhoverObj(this.hovered);this.hovered=null;this.renderer.domElement.style.cursor='default';}
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

/* ══════════════════════════════════════════════════════════
   D3 MAP CLASS  (simplified from original)
══════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════
   FORCE GRAPH CLASS
   D3 force simulation on canvas — toggle mode from globe
══════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════
   TIMELINE CONTROLLER
   Adds an era scrubber below the globe
══════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════
   TOUR CONTROLLER
   Auto-flies camera through Weave Path stops
══════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════
   SUGGESTED LINKS
══════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════
   CULTURE DETAIL PANEL  (same as original, condensed)
══════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════
   WEAVE PATH HELPERS
══════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════
   COSMIC WEAVE — MAIN APP
══════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════════════════ */
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