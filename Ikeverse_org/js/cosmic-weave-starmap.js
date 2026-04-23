/**
 * cosmic-weave-starmap.js — v6 Final
 * ─────────────────────────────────────────────────────────────────
 * Based on the original doc-6 architecture (ensureIwaBird, canvas
 * pixel-processing, migration animation) but opens as a FULL-SCREEN
 * fixed overlay (z-index:9000) so the globe, culture labels, toolbar
 * and every other layer are completely hidden.
 *
 * Image path: assets/images/iwa-middle.png  (same-origin — no CORS)
 *             assets/images/hawaiian-star-compass.png
 */
(function () {
  'use strict';

  const HAW_LAT_RAD = 21.0 * Math.PI / 180;
  const IMG_IWA     = 'assets/images/iwa-middle.png';
  const IMG_COMPASS = 'assets/images/hawaiian-star-compass.png';

  /* ═══════════════════════════════════════════════
     32 COMPASS HOUSES
  ═══════════════════════════════════════════════ */
  const COMPASS_HOUSES = [
    {name:"ʻAKAU",    bearing:0,      type:"cardinal",      meaning:"North",    color:"#00f7ff"},
    {name:"HAKA",     bearing:11.25,  type:"house",         meaning:"N by E",   color:"#54d1ff"},
    {name:"NĀ LEO",   bearing:22.5,   type:"house",         meaning:"NNE",      color:"#54d1ff"},
    {name:"NALANI",   bearing:33.75,  type:"house",         meaning:"NE by N",  color:"#54d1ff"},
    {name:"MANU",     bearing:45,     type:"intercardinal", meaning:"NE",       color:"#a78bfa"},
    {name:"NOIO",     bearing:56.25,  type:"house",         meaning:"NE by E",  color:"#54d1ff"},
    {name:"ʻAINA",    bearing:67.5,   type:"house",         meaning:"ENE",      color:"#54d1ff"},
    {name:"LĀ",       bearing:78.75,  type:"house",         meaning:"E by N",   color:"#ffd700"},
    {name:"HIKINA",   bearing:90,     type:"cardinal",      meaning:"East",     color:"#ffd700"},
    {name:"LĀ",       bearing:101.25, type:"house",         meaning:"E by S",   color:"#ffd700"},
    {name:"ʻAINA",    bearing:112.5,  type:"house",         meaning:"ESE",      color:"#54d1ff"},
    {name:"NOIO",     bearing:123.75, type:"house",         meaning:"SE by E",  color:"#54d1ff"},
    {name:"MANU",     bearing:135,    type:"intercardinal", meaning:"SE",       color:"#a78bfa"},
    {name:"NALANI",   bearing:146.25, type:"house",         meaning:"SE by S",  color:"#54d1ff"},
    {name:"NĀ LEO",   bearing:157.5,  type:"house",         meaning:"SSE",      color:"#54d1ff"},
    {name:"HAKA",     bearing:168.75, type:"house",         meaning:"S by E",   color:"#54d1ff"},
    {name:"HEMA",     bearing:180,    type:"cardinal",      meaning:"South",    color:"#ff4757"},
    {name:"HAKA",     bearing:191.25, type:"house",         meaning:"S by W",   color:"#54d1ff"},
    {name:"NĀ LEO",   bearing:202.5,  type:"house",         meaning:"SSW",      color:"#54d1ff"},
    {name:"NALANI",   bearing:213.75, type:"house",         meaning:"SW by S",  color:"#54d1ff"},
    {name:"MANU",     bearing:225,    type:"intercardinal", meaning:"SW",       color:"#a78bfa"},
    {name:"NOIO",     bearing:236.25, type:"house",         meaning:"SW by W",  color:"#54d1ff"},
    {name:"ʻAINA",    bearing:247.5,  type:"house",         meaning:"WSW",      color:"#54d1ff"},
    {name:"LĀ",       bearing:258.75, type:"house",         meaning:"W by S",   color:"#ffd700"},
    {name:"KOMOHANA", bearing:270,    type:"cardinal",      meaning:"West",     color:"#ff9f43"},
    {name:"LĀ",       bearing:281.25, type:"house",         meaning:"W by N",   color:"#ffd700"},
    {name:"ʻAINA",    bearing:292.5,  type:"house",         meaning:"WNW",      color:"#54d1ff"},
    {name:"NOIO",     bearing:303.75, type:"house",         meaning:"NW by W",  color:"#54d1ff"},
    {name:"MANU",     bearing:315,    type:"intercardinal", meaning:"NW",       color:"#a78bfa"},
    {name:"NALANI",   bearing:326.25, type:"house",         meaning:"NW by N",  color:"#54d1ff"},
    {name:"NĀ LEO",   bearing:337.5,  type:"house",         meaning:"NNW",      color:"#54d1ff"},
    {name:"HAKA",     bearing:348.75, type:"house",         meaning:"N by W",   color:"#54d1ff"},
  ];
  const HORIZON_WINDS = [
    {name:"KOʻOLAU", bearing:45,  meaning:"NE Wind", color:"#a78bfa"},
    {name:"MALANAI",  bearing:135, meaning:"SE Wind",  color:"#a78bfa"},
    {name:"KONA",     bearing:225, meaning:"SW Wind",  color:"#a78bfa"},
    {name:"HOʻOLUA",  bearing:315, meaning:"NW Wind",  color:"#a78bfa"},
  ];

  /* ═══════════════════════════════════════════════
     65 STAR DATABASE
  ═══════════════════════════════════════════════ */
  const STAR_DB = [
    {id:"Arcturus",  ra:213.92,dec:19.18, mag:-0.04,con:"Boötes",       h:"Hōkūleʻa",           meaning:"The Star of Joy",              house_note:"Rises near MANU-NE; zenith star of home",    nav:"ZENITH star of Hawaiʻi (21°N) — passes directly overhead confirming Hawaiian latitude"},
    {id:"Sirius",    ra:101.29,dec:-16.72,mag:-1.46,con:"Canis Major",  h:"Kohu",               meaning:"The Gleaming / Misty One",     house_note:"Rises NOIO-SE; deep south bearing",          nav:"Primary south bearing star; brightest star in the sky"},
    {id:"Canopus",   ra:96.0,  dec:-52.7, mag:-0.72,con:"Carina",       h:"Hōkū-hoʻokele-waʻa",meaning:"The Canoe-Steering Star",      house_note:"Rises near HEMA-S; southern latitude star",  nav:"Primary deep-south latitude star; rises higher as you sail south"},
    {id:"Capella",   ra:79.17, dec:45.99, mag:0.08, con:"Auriga",       h:"Hōkū-lei",           meaning:"The Crown Star",               house_note:"Rises KOʻOLAU-NE; winter zenith star",       nav:"Overhead check star for Hawaiian latitude in winter"},
    {id:"Vega",      ra:279.24,dec:38.78, mag:0.03, con:"Lyra",         h:"Humu",               meaning:"The Trigger Fish",             house_note:"Rises KOʻOLAU-NE; summer overhead",          nav:"Summer overhead star; Summer Triangle; former pole star"},
    {id:"Procyon",   ra:114.83,dec:5.23,  mag:0.38, con:"Canis Minor",  h:"Kaelo",              meaning:"The Bailer",                   house_note:"Rises HIKINA-E; equatorial star",             nav:"Winter triangle with Sirius and Betelgeuse"},
    {id:"Altair",    ra:297.7, dec:8.87,  mag:0.76, con:"Aquila",       h:"Hōkū-maʻa-2",        meaning:"The Wandering Star (second)",  house_note:"Rises HIKINA-E; equatorial bearing",          nav:"Summer Triangle; nearly on celestial equator"},
    {id:"Aldebaran", ra:68.98, dec:16.51, mag:0.87, con:"Taurus",       h:"Hōkūʻula",           meaning:"The Red Star",                 house_note:"Rises KOʻOLAU-NE; red winter beacon",        nav:"Red eye of Taurus; winter bearing star; follows the Pleiades"},
    {id:"Antares",   ra:247.35,dec:-26.43,mag:1.09, con:"Scorpius",     h:"Kaʻaʻahai",          meaning:"Heart of the Scorpion",        house_note:"Rises NOIO-SE; summer south marker",          nav:"South bearing star; summer sentinel"},
    {id:"Spica",     ra:201.3, dec:-11.16,mag:0.97, con:"Virgo",        h:"Hōkū-keokeo",        meaning:"The White Star",               house_note:"Rises NOIO-SE; spring bearing",               nav:"Spring south bearing; Arc to Arcturus, spike to Spica"},
    {id:"Pollux",    ra:116.33,dec:28.03, mag:1.16, con:"Gemini",       h:"Nā Pōkea-2",         meaning:"Twin Stars (second)",          house_note:"Rises KOʻOLAU-NE; winter twin",              nav:"Twin bearing stars; winter overhead"},
    {id:"Fomalhaut", ra:344.41,dec:-29.62,mag:1.17, con:"Piscis Austrini",h:"Hōkū-ā",          meaning:"The Autumn Star",              house_note:"Rises NOIO-SE; autumn south",                 nav:"Autumn south bearing; lone southern beacon"},
    {id:"Deneb",     ra:310.36,dec:45.28, mag:1.25, con:"Cygnus",       h:"Hōkū-maʻa",          meaning:"The Wandering Star / Apart",   house_note:"Rises KOʻOLAU-NE; summer",                   nav:"Summer Triangle; Northern Cross top"},
    {id:"Mimosa",    ra:191.93,dec:-59.69,mag:1.25, con:"Crux",         h:"Newe-2",             meaning:"Southern Cross (right arm)",   house_note:"Rises HEMA-S; Southern Cross",                nav:"Southern Cross arm for south bearing"},
    {id:"Acrux",     ra:186.65,dec:-63.1, mag:0.77, con:"Crux",         h:"Newe-1",             meaning:"Southern Cross (foot)",        house_note:"Rises HEMA-S; deep south",                    nav:"Southern Cross foot; axis points to south pole"},
    {id:"Regulus",   ra:152.09,dec:11.97, mag:1.35, con:"Leo",          h:"Hōkū-kīhia",         meaning:"The Stabbing Star",            house_note:"Rises HIKINA-E; spring star",                 nav:"Spring bearing; heart of Leo"},
    {id:"Castor",    ra:113.65,dec:31.89, mag:1.58, con:"Gemini",       h:"Nā Pōkea-1",         meaning:"Twin Stars (first)",           house_note:"Rises KOʻOLAU-NE; winter twin",              nav:"Twin bearing stars with Pollux"},
    {id:"Elnath",    ra:81.57, dec:28.61, mag:1.65, con:"Taurus",       h:"",                   meaning:"",                             house_note:"Rises KOʻOLAU-NE",                           nav:"Northern horn of Taurus"},
    {id:"Alnilam",   ra:84.05, dec:-1.2,  mag:1.69, con:"Orion",        h:"Hoʻopuka-2",         meaning:"The Emerging — center belt",   house_note:"Rises HIKINA-E; east marker",                 nav:"Center belt; extremely reliable east marker"},
    {id:"Alioth",    ra:193.51,dec:55.96, mag:1.76, con:"Ursa Major",   h:"Nā Hiku-5",          meaning:"The Seven (fifth)",            house_note:"Circumpolar from Hawaiʻi",                    nav:"Handle start; brightest of the seven"},
    {id:"Dubhe",     ra:165.93,dec:61.75, mag:1.79, con:"Ursa Major",   h:"Nā Hiku-1",          meaning:"The Seven (first)",            house_note:"Circumpolar; points to north",                nav:"Primary north pointer; with Merak finds Polaris"},
    {id:"Mirfak",    ra:51.08, dec:49.86, mag:1.79, con:"Perseus",      h:"",                   meaning:"",                             house_note:"Rises KOʻOLAU-NE; autumn",                   nav:"Perseus autumn/winter reference"},
    {id:"Wezen",     ra:107.1, dec:-26.39,mag:1.83, con:"Canis Major",  h:"",                   meaning:"",                             house_note:"Rises NOIO-SE; south",                        nav:"Part of Canis Major; south reference"},
    {id:"Sargas",    ra:264.33,dec:-43.0, mag:1.87, con:"Scorpius",     h:"",                   meaning:"",                             house_note:"Rises HEMA-S; deep south",                    nav:"Lower Scorpius tail; south reference"},
    {id:"Alkaid",    ra:206.89,dec:49.31, mag:1.86, con:"Ursa Major",   h:"Nā Hiku-7",          meaning:"The Seven (seventh)",          house_note:"Circumpolar from Hawaiʻi",                    nav:"Handle tip; end of Nā Hiku"},
    {id:"Hadar",     ra:210.96,dec:-60.37,mag:0.61, con:"Centaurus",    h:"",                   meaning:"",                             house_note:"Rises HEMA-S; Southern Pointer",              nav:"Southern Pointer pair with Alpha Centauri"},
    {id:"Mizar",     ra:200.98,dec:54.93, mag:2.27, con:"Ursa Major",   h:"Nā Hiku-6",          meaning:"The Seven (sixth)",            house_note:"Circumpolar from Hawaiʻi",                    nav:"Middle handle; Mizar/Alcor vision test pair"},
    {id:"Alcyone",   ra:56.87, dec:24.11, mag:2.87, con:"Taurus",       h:"Ka Makaliʻi",         meaning:"The Little Eyes / Tender Eyes",house_note:"Rises KOʻOLAU-NE; Makahiki new year",        nav:"Makahiki New Year marker; heliacal rising = season of Lono"},
    {id:"Kochab",    ra:222.68,dec:74.16, mag:2.08, con:"Ursa Minor",   h:"",                   meaning:"",                             house_note:"Circumpolar; near pole",                      nav:"Former pole star (1500 BCE–500 CE)"},
    {id:"Polaris",   ra:37.95, dec:89.26, mag:2.02, con:"Ursa Minor",   h:"Hōkūpaʻa",           meaning:"The Fixed Star",               house_note:"ʻAKAU — north pole, never moves",             nav:"True north; altitude = latitude; never moves"},
    {id:"Algol",     ra:47.04, dec:40.96, mag:2.12, con:"Perseus",      h:"",                   meaning:"",                             house_note:"Rises KOʻOLAU-NE; autumn",                   nav:"Part of Perseus; north reference"},
    {id:"Schedar",   ra:10.13, dec:56.54, mag:2.24, con:"Cassiopeia",   h:"",                   meaning:"",                             house_note:"Near circumpolar; north reference",            nav:"North reference opposite Ursa Major"},
    {id:"GammaCas",  ra:14.18, dec:60.72, mag:2.47, con:"Cassiopeia",   h:"",                   meaning:"",                             house_note:"Near circumpolar",                            nav:"Center of Cassiopeia W"},
    {id:"Denebola",  ra:177.26,dec:14.57, mag:2.14, con:"Leo",          h:"",                   meaning:"",                             house_note:"Rises HIKINA-E",                              nav:"Lion tail; east end of Leo"},
    {id:"Caph",      ra:2.29,  dec:59.15, mag:2.27, con:"Cassiopeia",   h:"",                   meaning:"",                             house_note:"Near circumpolar",                            nav:"North reference; W endpoint of Cassiopeia"},
    {id:"Phecda",    ra:178.46,dec:53.69, mag:2.44, con:"Ursa Major",   h:"Nā Hiku-3",          meaning:"The Seven (third)",            house_note:"Circumpolar from Hawaiʻi",                    nav:"Bowl corner of Nā Hiku"},
    {id:"Sadr",      ra:305.56,dec:40.26, mag:2.23, con:"Cygnus",       h:"",                   meaning:"",                             house_note:"Rises KOʻOLAU-NE; summer",                   nav:"Northern Cross center"},
    {id:"Algieba",   ra:154.99,dec:19.84, mag:2.28, con:"Leo",          h:"",                   meaning:"",                             house_note:"Rises HIKINA-E; spring",                      nav:"Leo mane/sickle"},
    {id:"Merak",     ra:165.46,dec:56.38, mag:2.37, con:"Ursa Major",   h:"Nā Hiku-2",          meaning:"The Seven (second)",           house_note:"Circumpolar from Hawaiʻi",                    nav:"North pointer pair with Dubhe"},
    {id:"Graffias",  ra:241.36,dec:-19.81,mag:2.62, con:"Scorpius",     h:"",                   meaning:"",                             house_note:"Rises NOIO-SE; south",                        nav:"Head of Scorpius"},
    {id:"Megrez",    ra:183.86,dec:57.03, mag:3.32, con:"Ursa Major",   h:"Nā Hiku-4",          meaning:"The Seven (fourth) — pivot",   house_note:"Circumpolar from Hawaiʻi",                    nav:"Pivot of Nā Hiku bowl to handle"},
    {id:"Ruchbah",   ra:21.45, dec:60.24, mag:2.68, con:"Cassiopeia",   h:"",                   meaning:"",                             house_note:"Near circumpolar",                            nav:"Cassiopeia W north reference"},
    {id:"Mintaka",   ra:83.0,  dec:-0.3,  mag:2.23, con:"Orion",        h:"Hoʻopuka-3",         meaning:"The Emerging — west belt",     house_note:"Rises HIKINA-E; due east",                    nav:"Rises due east; primary east-west bearing"},
    {id:"Alnitak",   ra:85.19, dec:-1.94, mag:1.74, con:"Orion",        h:"Hoʻopuka-1",         meaning:"The Emerging — east belt",     house_note:"Rises HIKINA-E; east pointer",                nav:"Eastern belt; points to Sirius"},
    {id:"Bellatrix", ra:81.28, dec:6.35,  mag:1.64, con:"Orion",        h:"",                   meaning:"",                             house_note:"Rises HIKINA-E",                              nav:"Orion shoulder; defines belt direction"},
    {id:"Saiph",     ra:86.94, dec:-9.67, mag:2.06, con:"Orion",        h:"",                   meaning:"",                             house_note:"Rises NOIO-SE",                               nav:"South pointer; Orion base pair"},
    {id:"Rigel",     ra:78.63, dec:-8.2,  mag:0.18, con:"Orion",        h:"Puana",              meaning:"The Blossom / Flowering",      house_note:"Rises NOIO-SE; south bearing",                nav:"South bearing; Orion foot points south"},
    {id:"Betelgeuse",ra:88.79, dec:7.41,  mag:0.42, con:"Orion",        h:"Ke Aliʻi",           meaning:"The Chief",                    house_note:"Rises HIKINA-E; autumn herald",               nav:"Seasonal marker; bearing star southward"},
    {id:"Adhara",    ra:104.66,dec:-28.97,mag:1.5,  con:"Canis Major",  h:"",                   meaning:"",                             house_note:"Rises NOIO-SE; deep south",                   nav:"Deep south bearing"},
    {id:"Alpheratz", ra:2.1,   dec:29.09, mag:2.07, con:"Andromeda",    h:"",                   meaning:"",                             house_note:"Rises KOʻOLAU-NE; autumn",                   nav:"Great Square corner; autumn reference"},
    {id:"Mirach",    ra:17.43, dec:35.62, mag:2.07, con:"Andromeda",    h:"",                   meaning:"",                             house_note:"Rises KOʻOLAU-NE",                           nav:"Andromeda chain"},
    {id:"Hamal",     ra:31.79, dec:23.46, mag:2.0,  con:"Aries",        h:"",                   meaning:"",                             house_note:"Rises KOʻOLAU-NE",                           nav:"Autumn sky; historical equinox marker"},
    {id:"Markab",    ra:346.19,dec:15.21, mag:2.49, con:"Pegasus",      h:"",                   meaning:"",                             house_note:"Rises HIKINA-E; autumn",                      nav:"Great Square corner"},
    {id:"Scheat",    ra:345.94,dec:28.08, mag:2.44, con:"Pegasus",      h:"",                   meaning:"",                             house_note:"Rises KOʻOLAU-NE",                           nav:"Great Square corner"},
    {id:"Algenib",   ra:3.31,  dec:15.18, mag:2.83, con:"Pegasus",      h:"",                   meaning:"",                             house_note:"Rises HIKINA-E",                              nav:"Great Square corner"},
    {id:"AlbireoA",  ra:292.68,dec:27.96, mag:3.18, con:"Cygnus",       h:"",                   meaning:"",                             house_note:"Rises KOʻOLAU-NE; summer",                   nav:"Base of Northern Cross"},
    {id:"Gienah",    ra:311.55,dec:33.97, mag:2.46, con:"Cygnus",       h:"",                   meaning:"",                             house_note:"Rises KOʻOLAU-NE",                           nav:"Cross-arm of Northern Cross"},
    {id:"Dschubba",  ra:240.08,dec:-22.62,mag:2.32, con:"Scorpius",     h:"",                   meaning:"",                             house_note:"Rises NOIO-SE; south",                        nav:"Scorpius head; south reference"},
    {id:"Shaula",    ra:263.4, dec:-37.1, mag:1.62, con:"Scorpius",     h:"Nā Kā-1",            meaning:"The Stingers (first)",         house_note:"Rises HEMA-S; deep south stinger",            nav:"Deep south; tail tip of Scorpius"},
    {id:"Lesath",    ra:264.33,dec:-37.3, mag:2.69, con:"Scorpius",     h:"Nā Kā-2",            meaning:"The Stingers (second)",        house_note:"Rises HEMA-S; deep south stinger",            nav:"Deep south pair with Shaula"},
    {id:"EtaLeo",    ra:149.47,dec:16.76, mag:3.48, con:"Leo",          h:"",                   meaning:"",                             house_note:"Rises HIKINA-E",                              nav:"Sickle tip of Leo"},
    {id:"Gacrux",    ra:187.79,dec:-57.11,mag:1.63, con:"Crux",         h:"Newe-3",             meaning:"Southern Cross (head)",        house_note:"Rises HEMA-S; Southern Cross",                nav:"Cross top; axis points to south pole"},
    {id:"Imai",      ra:183.79,dec:-58.75,mag:2.79, con:"Crux",         h:"Newe-4",             meaning:"Southern Cross (left arm)",    house_note:"Rises HEMA-S; Southern Cross",                nav:"Completes the cross pattern"},
    {id:"RigilKent", ra:219.92,dec:-60.83,mag:-0.01,con:"Centaurus",    h:"Māhoe-hope",         meaning:"The After Twin",               house_note:"Rises HEMA-S; nearest star system",           nav:"Southern Pointer; nearest star system"},
    {id:"Segin",     ra:28.6,  dec:63.67, mag:3.35, con:"Cassiopeia",   h:"",                   meaning:"",                             house_note:"Near circumpolar",                            nav:"End of Cassiopeia W"},
  ];

  /* ═══════════════════════════════════════════════
     CROSS-TRADITION KNOWLEDGE
  ═══════════════════════════════════════════════ */
  const STAR_TRADITIONS = {
    Arcturus:[
      {trad:"Arabic",    icon:"☪", name:"Simāk al-Rāmiḥ",   text:"The Lame One with a Spear — one of 15 Behenian stars. Heliacal rising in spring announced the planting season across the Arab world."},
      {trad:"Greek",     icon:"⚡", name:"Arcturus",          text:"Guardian of the Bear. Hesiod (700 BCE) used its rising to structure the agricultural year — among the earliest written Western almanacs."},
      {trad:"Chinese",   icon:"龍", name:"大角 Dàjiǎo",       text:"Great Horn — brightest star of the Azure Dragon palace. Represented imperial authority. An auspicious star for the ruling dynasty."},
      {trad:"Babylonian",icon:"𒀭", name:"Šuginak",           text:"Chief of Heaven's Judges — watched for color changes interpreted as messages from Enlil, god of the northern sky."},
      {trad:"Polynesian",icon:"🌊", name:"Āretuha",           text:"The zenith star for the Hawaiian island chain. Navigators memorized star paths as songs — each verse a compass bearing home."},
    ],
    Sirius:[
      {trad:"Kemet",     icon:"𓇳", name:"Sopdet",            text:"She Who is Sharp — her heliacal rising after 70 invisible days marked the Nile flood and the New Year. She IS Isis. Osiris/Orion chases her forever."},
      {trad:"Arabic",    icon:"☪", name:"Al-Shiʿrā al-ʿAbūr", text:"Sirius the Crossing — the only star named in the Quran (53:49): 'the Lord of Sirius.' Arab navigators used it to cross the Indian Ocean."},
      {trad:"Greek",     icon:"⚡", name:"Seirios",            text:"The Scorching One — the Dog Star. Its heliacal rising in July marked the dog days. Both Hesiod and Homer reference it for farming and sailing."},
      {trad:"Chinese",   icon:"龍", name:"天狼 Tiānláng",      text:"Heavenly Wolf — a war omen star. Any unusual brightness was reported immediately to the emperor as a warning of border conflict."},
      {trad:"Babylonian",icon:"𒀭", name:"KAK.SI.SÁ",         text:"The Arrow — the Milky Way was the bow of a goddess, Sirius her arrow aimed at Orion. This imagery predates the Greek Orion myth by 2,000 years."},
    ],
    Canopus:[
      {trad:"Arabic",    icon:"☪", name:"Suhayl",             text:"The most revered star of the southern sky in Arab tradition. Poets wrote of its beauty. Navigators used it to cross the Indian Ocean safely."},
      {trad:"Chinese",   icon:"龍", name:"老人 Lǎorén",         text:"Old Man Star — an omen of longevity. The Taoist God of Longevity (Shoulao) was said to dwell within this star."},
      {trad:"Polynesian",icon:"🌊", name:"Atutahi",            text:"The Firstborn — left outside the Milky Way because it was too tapu (sacred) to be woven in with other stars. A solitary chief."},
    ],
    Polaris:[
      {trad:"Arabic",    icon:"☪", name:"Al-Qutb al-Shamālī", text:"The Northern Pivot — the Trust Star. Called 'the nail of the heavens.' Surrounding circumpolar stars were the Daughters of the Bier."},
      {trad:"Chinese",   icon:"龍", name:"北極星",             text:"The celestial emperor's throne — the Purple Forbidden Enclosure. Everything revolves around the emperor as around the pole star."},
      {trad:"Greek",     icon:"⚡", name:"Kynosoura",          text:"Dog's Tail — end of Ursa Minor. In classical antiquity, precession meant the pole was actually between Polaris and Kochab."},
      {trad:"Maya",      icon:"🔮", name:"Xaman Ek",           text:"Black God of the North — patron deity of merchants and travelers. Cacao offerings were made at road rest stops in his honor."},
    ],
    Betelgeuse:[
      {trad:"Arabic",    icon:"☪", name:"Ibṭ al-Jawzāʾ",      text:"The Armpit of the Central One — 'Betelgeuse' comes directly from this Arabic name. The anatomical naming of Orion also gave us Rigel, Mintaka."},
      {trad:"Kemet",     icon:"𓇳", name:"Shoulder of Sah",    text:"The shoulder of Osiris/Orion — holding the crook and flail of divine authority. The reddish color was noted as simultaneously dangerous and powerful."},
      {trad:"Chinese",   icon:"龍", name:"参宿四 Shēnxiùsì",    text:"4th Star of the Orion Mansion (7th of 28 Lunar Mansions). Color changes were interpreted as omens requiring court astronomer interpretation."},
    ],
    Rigel:[
      {trad:"Arabic",    icon:"☪", name:"Rijl al-Jawzāʾ",      text:"The Left Foot of the Central One — 'Rigel' comes directly from Arabic 'rijl' (foot). These anatomical names survive in daily use today."},
      {trad:"Kemet",     icon:"𓇳", name:"Foot of Sah",         text:"The foot of Osiris/Orion — the divine body mapped from shoulder (Betelgeuse) to foot (Rigel). The pharaoh's soul traced Orion's body to reach eternal life."},
    ],
    Antares:[
      {trad:"Greek",     icon:"⚡", name:"Antares",             text:"Rival of Mars — named for rivaling the red planet. Zeus placed Orion and the Scorpion on opposite sides of the sky so they could never meet again."},
      {trad:"Babylonian",icon:"𒀭", name:"MUL.GIR.TAB",        text:"The Scorpion — recognized before 3000 BCE. Omen text: 'If the Scorpion reaches for the Moon, the king will die in that month.'"},
      {trad:"Chinese",   icon:"龍", name:"心宿 Xīnxiù",         text:"Heart Mansion — 5th Lunar Mansion. Unusual brightness foretold war; dimness meant peace. Watched daily by court astronomers."},
      {trad:"Polynesian",icon:"🌊", name:"Te Matau a Māui",    text:"Māui's Fish Hook — the curved scorpion tail is the hook with which Māui fished the North Island of New Zealand up from the ocean."},
    ],
    Alcyone:[
      {trad:"Babylonian",icon:"𒀭", name:"MUL.MUL",             text:"The Stars (par excellence) — the Babylonians called the Pleiades simply 'The Stars.' They open the MUL.APIN tablet. Heliacal rising in May marked summer."},
      {trad:"Greek",     icon:"⚡", name:"Pleiades",            text:"The Sailing Stars — seven daughters of Atlas. Their rising in May started the Mediterranean sailing season; setting in November closed it."},
      {trad:"Kemet",     icon:"𓇳", name:"Nut's Piglets",       text:"The Seven Stars — used with Orion to calibrate the stellar calendar. Part of the 36 Decans dividing the year into 10-day periods."},
      {trad:"Māori",     icon:"🌊", name:"Matariki",            text:"Eyes of the God Tāne — their June rising heralds the Māori New Year. More visible stars = more abundant harvest. Public holiday in NZ since 2022."},
      {trad:"Aboriginal",icon:"🦘", name:"Seven Sisters",       text:"One of the most widespread Dreaming stories across Australia — seven women pursued across the sky by a man (Orion). Encodes deep kinship law."},
    ],
    Vega:[
      {trad:"Chinese",   icon:"龍", name:"织女星 Zhīnǚ xīng",   text:"The Weaving Maid — separated from her husband the Cowherd (Altair) by the Silver River. They meet once a year on the 7th night of the 7th month."},
      {trad:"Arabic",    icon:"☪", name:"Al-Nasr al-Wāqiʿ",   text:"The Falling Eagle — wings folded, diving. Paired with Altair (The Flying Eagle). Both are summer navigation and agricultural timing stars."},
      {trad:"Greek",     icon:"⚡", name:"Orpheus's Lyre",      text:"Orpheus's Lyre, thrown into the sky by the Muses. Vega was the pole star 14,000 years ago and will be again in 12,000 CE due to precession."},
    ],
    Fomalhaut:[
      {trad:"Babylonian",icon:"𒀭", name:"Lord of the Fish",    text:"One of four Royal Stars of ancient Persian astronomy — the south cardinal star. Its heliacal setting announced the darkest time of winter."},
      {trad:"Arabic",    icon:"☪", name:"Fam al-Ḥūt",          text:"Mouth of the Southern Fish — giving us 'Fomalhaut.' A lonely autumn beacon. Arab sailors on southern routes used it for latitude."},
    ],
  };


  /* ═══════════════════════════════════════════════
     HELPERS
  ═══════════════════════════════════════════════ */
  function risingAzimuth(decDeg) {
    const dec = decDeg * Math.PI / 180, lat = HAW_LAT_RAD;
    const cosA = -Math.sin(dec) / Math.cos(lat);
    if (Math.abs(cosA) > 1) return null;
    return Math.acos(cosA) * 180 / Math.PI;
  }
  function houseForBearing(bearing) {
    const b = ((bearing % 360) + 360) % 360;
    let best = COMPASS_HOUSES[0], bd = 360;
    COMPASS_HOUSES.forEach(h => {
      const d = Math.min(Math.abs(h.bearing - b), 360 - Math.abs(h.bearing - b));
      if (d < bd) { bd = d; best = h; }
    });
    return best;
  }
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function svgE(tag, attrs, text) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k,v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
    if (text != null) el.textContent = text;
    return el;
  }
  function getCameraHeading(cam) {
    if (!cam || !window.THREE) return 0;
    return (Math.atan2(cam.position.x, cam.position.z) * 180 / Math.PI + 360) % 360;
  }

  /* Enrich stars with rising/setting data */
  STAR_DB.forEach(star => {
    const az = risingAzimuth(star.dec);
    if (az === null) {
      star.rising_az = null; star.setting_az = null;
      star.rising_house  = star.dec > 0 ? 'Circumpolar — never sets' : 'Never rises from Hawaiʻi';
      star.setting_house = '';
    } else {
      star.rising_az     = az;
      star.setting_az    = 360 - az;
      star.rising_house  = houseForBearing(az).name + ' (' + houseForBearing(az).meaning + ')';
      star.setting_house = houseForBearing(360 - az).name + ' (' + houseForBearing(360 - az).meaning + ')';
    }
  });

  function mergeWithStarData() {
    const rich = window._starData; if (!rich) return;
    STAR_DB.forEach(s => {
      const r = rich.find(x => x.id === s.id); if (!r) return;
      s.moolelo = r.moolelo || '';
      s.cultural_notes = r.cultural_notes || {};
      s.distance_ly = r.distance_ly;
      s.type = r.type; s.spectral_type = r.spectral_type;
      if (!s.h && r.hawaiian_name) s.h = r.hawaiian_name;
      if (!s.meaning && r.hawaiian_meaning) s.meaning = r.hawaiian_meaning;
      if (!s.nav && r.navigation_use) s.nav = r.navigation_use;
    });
  }

  /* ═══════════════════════════════════════════════
     ʻIWA BIRD — canvas pixel-processing (doc-6 approach)
     Same-origin image: NO crossOrigin attribute needed.
     White pixels → transparent. Black pixels → opaque cyan.
     Cached in window._iwaDataUrl.
  ═══════════════════════════════════════════════ */
  function _processIwaImage(src, callback) {
    if (window._iwaDataUrl !== undefined) { callback(window._iwaDataUrl); return; }
    const tmp = new Image();                // no crossOrigin — same-origin
    tmp.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = tmp.naturalWidth; c.height = tmp.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(tmp, 0, 0);
        const id = ctx.getImageData(0, 0, c.width, c.height), d = id.data;
        for (let i = 0; i < d.length; i += 4) {
          const lum = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114) / 255;
          if (lum > 0.55) {
            d[i+3] = 0;
          } else {
            const str = 1 - lum / 0.55;
            d[i] = 0; d[i+1] = Math.round(247 * str);
            d[i+2] = Math.round(255 * str); d[i+3] = Math.round(245 * str);
          }
        }
        ctx.putImageData(id, 0, 0);
        window._iwaDataUrl = c.toDataURL();
        callback(window._iwaDataUrl);
      } catch (e) { window._iwaDataUrl = null; callback(null); }
    };
    tmp.onerror = () => { window._iwaDataUrl = null; callback(null); };
    tmp.src = src;
  }

  /* Place the ʻIwa bird in any container at compass center cx,cy */
  function ensureIwaBird(container, cx, cy) {
    const compassCx = Math.round(cx || container.clientWidth  / 2);
    const compassCy = Math.round(cy || container.clientHeight / 2);

    if (!document.getElementById('cw-iwa-keyframes')) {
      const ks = document.createElement('style');
      ks.id = 'cw-iwa-keyframes';
      ks.textContent = `
        @keyframes cw-iwa-migrate {
          0%   { transform:translate(calc(-50% + 320px),calc(-50% + 200px)) scale(.18) rotate(18deg); opacity:0; }
          12%  { opacity:.45; }
          38%  { transform:translate(calc(-50% + 120px),calc(-50% + 74px)) scale(.62) rotate(8deg); opacity:.82; }
          65%  { transform:translate(calc(-50% - 12px),calc(-50% - 14px)) scale(1.07) rotate(-3deg); opacity:1; }
          80%  { transform:translate(calc(-50% + 5px),calc(-50% + 6px)) scale(.97) rotate(1.5deg); }
          90%  { transform:translate(calc(-50% - 2px),calc(-50% - 3px)) scale(1.01) rotate(-.5deg); }
          100% { transform:translate(-50%,-50%) scale(1) rotate(0); opacity:1; }
        }
        @keyframes cw-iwa-soar {
          0%,100% { transform:translate(-50%,-50%) translateY(0) rotate(0) scale(1); }
          22%     { transform:translate(-50%,-50%) translateY(-8px) rotate(-1.5deg) scale(1.013); }
          50%     { transform:translate(-50%,-50%) translateY(-12px) rotate(.2deg) scale(1.02); }
          76%     { transform:translate(-50%,-50%) translateY(-5px) rotate(1.2deg) scale(.991); }
        }
        .cw-iwa-anchor {
          position:absolute; width:0; height:0; pointer-events:none; z-index:30;
        }
        .cw-iwa-html {
          position:absolute;
          width:52%; max-width:380px; min-width:130px;
          transform:translate(-50%,-50%);
          pointer-events:all; cursor:pointer;
          filter:drop-shadow(0 0 10px rgba(0,247,255,.6))
                 drop-shadow(0 0 24px rgba(0,247,255,.3))
                 drop-shadow(0 0 48px rgba(0,247,255,.14));
          animation:cw-iwa-migrate 2.6s cubic-bezier(.25,.46,.45,.94) forwards,
                    cw-iwa-soar 4.8s ease-in-out 2.6s infinite;
          user-select:none; -webkit-user-drag:none;
          transition:filter .18s;
        }
        .cw-iwa-html:hover {
          filter:drop-shadow(0 0 14px rgba(0,247,255,.9))
                 drop-shadow(0 0 32px rgba(0,247,255,.55))
                 drop-shadow(0 0 60px rgba(0,247,255,.28));
        }
        .cw-iwa-html.fallback {
          filter:invert(1) sepia(1) saturate(8) hue-rotate(148deg) brightness(1.4)
                 drop-shadow(0 0 12px rgba(0,247,255,.65));
          mix-blend-mode:screen;
        }
        .cw-iwa-hint {
          position:absolute; top:100px; left:0;
          transform:translateX(-50%);
          white-space:nowrap; font-family:Orbitron,monospace;
          font-size:8px; letter-spacing:.12em; color:rgba(0,247,255,.35);
          pointer-events:none;
          animation:cw-iwa-migrate 2.6s cubic-bezier(.25,.46,.45,.94) forwards;
        }
      `;
      document.head.appendChild(ks);
    }

    /* Create anchor if not present in this container */
    let anchor = container.querySelector('.cw-iwa-anchor');
    if (!anchor) {
      anchor = document.createElement('div');
      anchor.className = 'cw-iwa-anchor';
      const img = document.createElement('img');
      img.className = 'cw-iwa-html';
      img.alt = 'ʻIwa frigatebird — click for moʻolelo';
      img.draggable = false;
      img.addEventListener('click', showIwaMoolelo);
      _processIwaImage(IMG_IWA, dataUrl => {
        if (dataUrl) {
          img.src = dataUrl;
        } else {
          img.src = IMG_IWA;
          img.classList.add('fallback');
        }
      });
      anchor.appendChild(img);
      const hint = document.createElement('div');
      hint.className = 'cw-iwa-hint'; hint.textContent = 'ʻIWA · TAP';
      anchor.appendChild(hint);
      container.appendChild(anchor);
    }
    anchor.style.left = compassCx + 'px';
    anchor.style.top  = compassCy + 'px';
  }


  /* ═══════════════════════════════════════════════
     ʻIWA MOOLELO MODAL (SVG bird in header)
  ═══════════════════════════════════════════════ */

  /* ═══════════════════════════════════════════════
     ʻIWA MOOLELO MODAL
     Uses the actual iwa-middle.png (canvas-processed)
     in the header — same bird image as compass center.
  ═══════════════════════════════════════════════ */
  function showIwaMoolelo() {
    document.getElementById('cw-iwa-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'cw-iwa-modal';
    modal.className = 'cwsm-modal';

    const navItems = [
      "The ʻiwa never lands on water — it cannot swim and its feathers are not waterproofed. When spotted in open ocean, land is within 60 miles.",
      "ʻIwa always fly toward land at sunset. Watching their direction at dusk gives a bearing toward the nearest island.",
      "When ʻiwa circle high on thermals, they mark the edge of a reef or shallow bank below — even one not yet visible.",
      "A large flock flying in formation, all heading the same direction, is one of the strongest land-finding signs available.",
    ];

    modal.innerHTML = `
      <div class="cwsm-modal-head">
        <div id="cwsm-iwa-modal-img" class="cwsm-iwa-modal-img-wrap">
          <div class="cwsm-iwa-modal-loading">✦ ✦ ✦</div>
        </div>
        <div>
          <div class="cwsm-modal-title">ʻIWA</div>
          <div class="cwsm-modal-sub">Frigatebird · Thief · Living Compass</div>
          <div class="cwsm-modal-sci">Fregata minor · Great Frigatebird</div>
        </div>
        <button class="cwsm-modal-close" onclick="document.getElementById('cw-iwa-modal').remove()" type="button">✕</button>
      </div>
      <div class="cwsm-modal-body">
        <p class="cwsm-modal-lead">The ʻIwa is the master navigator's compass made flesh. Hawaiian voyagers called it ʻiwa — thief — because it steals fish from other seabirds in flight. To the navigator, the ʻiwa was a living landmark in the open ocean.</p>
        <div class="cwsm-sect-label"><i class="fas fa-compass"></i> How Navigators Read the ʻIwa</div>
        ${navItems.map((n,i)=>`<div class="cwsm-nav-item"><span class="cwsm-nav-num">${i+1}</span><span>${esc(n)}</span></div>`).join('')}
        <div class="cwsm-box cwsm-box--gold">
          <div class="cwsm-box-label"><i class="fas fa-feather"></i> The Bird Itself</div>
          <p>The ʻiwa (Fregata minor) has the largest wingspan-to-body-weight ratio of any bird — perfectly adapted for soaring on thermals for hours without flapping. The male inflates a brilliant red throat pouch during mating. They range up to 400 km from shore but always return to land each night.</p>
        </div>
        <div class="cwsm-box cwsm-box--purple">
          <div class="cwsm-box-label"><i class="fas fa-star"></i> The Bird at the Center</div>
          <p>In the Hōkūleʻa tradition, the ʻiwa represents the union of celestial navigation and nature reading — the complete voyager uses both stars and living signs. The bird at the center of Nainoa's compass is not decoration. It is a reminder that the ocean is alive.</p>
        </div>
        <div class="cwsm-box cwsm-box--green">
          <div class="cwsm-box-label"><i class="fas fa-scroll"></i> Moʻolelo</div>
          <p>The ʻiwa appears in Hawaiian mele as a symbol of grace, mastery, and the ability to move between worlds. For Nainoa Thompson, the ʻiwa at the heart of the compass honors the bird that helped the first Hawaiians find their islands across 2,400 miles of open Pacific.</p>
        </div>
        <div style="height:20px"></div>
      </div>`;

    document.body.appendChild(modal);
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('cwsm-modal--open')));

    /* Load the actual PNG via canvas processor — same image as compass center */
    _processIwaImage(IMG_IWA, dataUrl => {
      const wrap = document.getElementById('cwsm-iwa-modal-img');
      if (!wrap) return;
      wrap.innerHTML = '';
      const img = document.createElement('img');
      img.alt = 'ʻIwa frigatebird';
      img.style.cssText = 'width:90px;height:auto;display:block;' +
        'filter:drop-shadow(0 0 12px rgba(0,247,255,.6)) drop-shadow(0 0 28px rgba(0,247,255,.32));';
      if (dataUrl) {
        img.src = dataUrl;  /* transparent cyan bird — same as compass center */
      } else {
        img.src = IMG_IWA;
        /* fallback CSS filter — white bg disappears on dark modal */
        img.style.cssText += 'filter:invert(1) sepia(1) saturate(8) hue-rotate(148deg) brightness(1.35) drop-shadow(0 0 12px rgba(0,247,255,.6));mix-blend-mode:screen;';
      }
      wrap.appendChild(img);
    });

    setTimeout(() => {
      document.addEventListener('click', function _c(e) {
        if (!modal.contains(e.target)) { modal.remove(); document.removeEventListener('click', _c); }
      });
    }, 150);
  }

  function drawCompassRose(svg, W, H, heading, cx, cy, outerR) {
    cx = cx ?? W/2; cy = cy ?? H/2;
    outerR = outerR ?? Math.min(W,H) * .44;
    const innerR = outerR * .76;

    const compassG = svgE('g', { class:'cwsm-rose', transform:`translate(${cx},${cy}) rotate(${-heading})` });

    /* Rings */
    [[outerR,'rgba(0,247,255,.4)','1.8'],[outerR*.975,'rgba(0,247,255,.1)','.6'],
     [innerR,'rgba(255,215,0,.18)','.8'],[innerR*.96,'rgba(255,215,0,.06)','.4']].forEach(([r,s,w]) =>
      compassG.appendChild(svgE('circle',{cx:0,cy:0,r,fill:'none',stroke:s,'stroke-width':w})));

    COMPASS_HOUSES.forEach(h => {
      const rad = (h.bearing - 90) * Math.PI / 180;
      const isC = h.type === 'cardinal', isI = h.type === 'intercardinal';
      const tLen = isC ? outerR*.13 : isI ? outerR*.08 : outerR*.055;

      compassG.appendChild(svgE('line',{
        x1:outerR*Math.cos(rad), y1:outerR*Math.sin(rad),
        x2:(outerR-tLen)*Math.cos(rad), y2:(outerR-tLen)*Math.sin(rad),
        stroke:h.color,'stroke-width':isC?'2.8':isI?'2':'1','stroke-linecap':'round',
        opacity:isC?'1':isI?'.9':'.65',
      }));

      const lR = outerR+(isC?26:isI?20:15), lx=lR*Math.cos(rad), ly=lR*Math.sin(rad);
      compassG.appendChild(svgE('text',{
        x:lx,y:ly,'text-anchor':'middle','dominant-baseline':'middle',fill:h.color,
        'font-size':isC?'11':isI?'9':'7.5','font-family':'Orbitron,monospace',
        'font-weight':isC?'700':isI?'600':'500','letter-spacing':'.07em',
        transform:`rotate(${h.bearing},${lx},${ly})`,
        filter:isC?`drop-shadow(0 0 8px ${h.color})`:isI?`drop-shadow(0 0 5px ${h.color})`:'none',
        opacity:isC?'1':'.88',
      }, h.name));

      if (isC) {
        const slx=(lR+12)*Math.cos(rad), sly=(lR+12)*Math.sin(rad);
        compassG.appendChild(svgE('text',{x:slx,y:sly,'text-anchor':'middle','dominant-baseline':'middle',
          fill:'rgba(255,255,255,.32)','font-size':'7','font-family':'Orbitron,monospace',
          transform:`rotate(${h.bearing},${slx},${sly})`},h.meaning));
      }

      const sMidR = innerR*.68, sx=sMidR*Math.cos(rad), sy=sMidR*Math.sin(rad);
      const tAngle = h.bearing<=180 ? h.bearing : h.bearing-180;
      const flip = h.bearing>180 ? 'scale(-1,-1)' : '';
      compassG.appendChild(svgE('text',{x:0,y:0,'text-anchor':'middle','dominant-baseline':'middle',
        fill:isC?h.color:isI?`${h.color}cc`:`${h.color}88`,
        'font-size':isC?'8':isI?'7':'6','font-family':'Orbitron,monospace','font-weight':isC?'700':'500',
        filter:isC?`drop-shadow(0 0 5px ${h.color})`:'none','pointer-events':'none',
        transform:`translate(${sx},${sy}) rotate(${tAngle+90}) ${flip}`},`${h.name} · ${h.meaning}`));

      compassG.appendChild(svgE('line',{
        x1:innerR*Math.cos(rad),y1:innerR*Math.sin(rad),
        x2:innerR*.38*Math.cos(rad),y2:innerR*.38*Math.sin(rad),
        stroke:h.color,'stroke-width':isC?.9:isI?.6:.35,
        'stroke-dasharray':isC?'3 4':'2 5',opacity:isC?.48:isI?.28:.13,'pointer-events':'none',
      }));
    });

    HORIZON_WINDS.forEach(w => {
      const rad=(w.bearing-90)*Math.PI/180, lr=outerR+55, lx=lr*Math.cos(rad), ly=lr*Math.sin(rad);
      compassG.appendChild(svgE('text',{x:lx,y:ly,'text-anchor':'middle','dominant-baseline':'middle',
        fill:'rgba(167,139,250,.72)','font-size':'8.5','font-family':'Orbitron,monospace','font-weight':'700',
        'letter-spacing':'.1em',transform:`rotate(${w.bearing},${lx},${ly})`,
        filter:'drop-shadow(0 0 6px rgba(167,139,250,.5))'},w.name));
    });

    const at = outerR - 16;
    compassG.appendChild(svgE('path',{
      d:`M 0,-${at} L -7,-${at-22} L 0,-${at-9} L 7,-${at-22} Z`,
      fill:'#00f7ff', filter:'drop-shadow(0 0 10px rgba(0,247,255,.9))',
    }));

    /* Glow halos around center (bird is HTML layer on top) */
    const birdR = outerR * .22;
    const glowG = svgE('g', { transform:`translate(${cx},${cy})`, 'pointer-events':'none' });
    glowG.appendChild(svgE('circle',{cx:'0',cy:'0',r:String(birdR*1.6),fill:'none',stroke:'rgba(0,247,255,.07)','stroke-width':'1.5'}));
    glowG.appendChild(svgE('circle',{cx:'0',cy:'0',r:String(birdR*.95),fill:'none',stroke:'rgba(0,247,255,.04)','stroke-width':'.7'}));

    svg.appendChild(compassG);
    svg.appendChild(glowG);
  }


  /* ═══════════════════════════════════════════════
     TRADITION-AWARE LABEL LOOKUP
     Returns the star's name in the selected tradition.
  ═══════════════════════════════════════════════ */
  let _currentTrad = 'hawaiian';

  /* Build lookup: { starId: { trad: displayName } } from STAR_TRADITIONS */
  const TRAD_LABEL_MAP = {};
  Object.entries(STAR_TRADITIONS).forEach(([starId, entries]) => {
    TRAD_LABEL_MAP[starId] = {};
    entries.forEach(e => {
      TRAD_LABEL_MAP[starId][e.trad.toLowerCase()] = e.name;
    });
  });

  /* Additional names not in STAR_TRADITIONS */
  const EXTRA_TRAD_NAMES = {
    Polaris:    { arabic:'Al-Qutb', chinese:'北極星', greek:'Kynosoura', maya:'Xaman Ek' },
    Sirius:     { kemet:'Sopdet', greek:'Seirios', arabic:'Al-Shiʿrā', chinese:'天狼', babylonian:'KAK.SI.SÁ' },
    Arcturus:   { greek:'Arcturus', arabic:'Simāk', chinese:'大角', babylonian:'Šuginak', polynesian:'Āretuha' },
    Betelgeuse: { arabic:'Ibṭ al-Jawzāʾ', kemet:'Sah Shoulder', chinese:'参宿四' },
    Rigel:      { arabic:'Rijl al-Jawzāʾ', kemet:'Foot of Sah', greek:'Rigel' },
    Antares:    { greek:'Antares', babylonian:'MUL.GIR.TAB', chinese:'心宿', polynesian:'Te Matau a Māui' },
    Alcyone:    { babylonian:'MUL.MUL', greek:'Pleiades', kemet:"Nut's Piglets", maori:'Matariki', aboriginal:'Seven Sisters' },
    Vega:       { chinese:'织女星', arabic:'Al-Nasr', greek:"Orpheus's Lyre" },
    Fomalhaut:  { babylonian:'Lord of Fish', arabic:'Fam al-Ḥūt' },
    Canopus:    { arabic:'Suhayl', chinese:'老人', polynesian:'Atutahi' },
    Capella:    { arabic:'Al-ʿAyyūq', greek:'Capella', chinese:'五車' },
    Aldebaran:  { arabic:'Al-Dabarān', greek:'Aldebaran', chinese:'畢宿', babylonian:'Iku' },
    Procyon:    { greek:'Prokyon', arabic:'Al-Ghūmaisa', chinese:'南河' },
    Altair:     { arabic:'Al-Nasr al-Ṭāʾir', chinese:'牛郎', greek:'Altair' },
    Spica:      { arabic:'Al-Simāk', greek:'Stachys', chinese:'角宿' },
    Regulus:    { arabic:'Al-Malikiyy', greek:'Regulus', babylonian:'Sharru', chinese:'軒轅' },
    Deneb:      { arabic:'Dhanab al-Dajāja', greek:'Cygnus tail', chinese:'天津' },
    Pollux:     { arabic:'Al-Rās al-Tawʾam', greek:'Pollux', chinese:'北河' },
    Dubhe:      { arabic:'Dubb', chinese:'天樞', greek:'Ursa Major' },
    Polaris:    { arabic:'Al-Qutb', chinese:'勾陳一', greek:'Kynosoura', maya:'Xaman Ek' },
    Acrux:      { polynesian:'Newe foot', aboriginal:'Cross south' },
    Shaula:     { arabic:'Al-Shawla', chinese:'尾宿' },
  };

  function getTradLabel(star) {
    const trad = _currentTrad;
    if (trad === 'hawaiian') return star.h || star.id;
    if (trad === 'greek' || trad === 'western') return star.id;
    /* Check TRAD_LABEL_MAP first */
    const fromMap = TRAD_LABEL_MAP[star.id]?.[trad];
    if (fromMap) return fromMap;
    /* Then EXTRA_TRAD_NAMES */
    const fromExtra = EXTRA_TRAD_NAMES[star.id]?.[trad];
    if (fromExtra) return fromExtra;
    /* Fallback: use Hawaiian if available, else western */
    return star.h || star.id;
  }

  let _needsRedraw = false;

  /* ═══════════════════════════════════════════════
     DRAW STARS (enhanced — from doc-6)
  ═══════════════════════════════════════════════ */

  /* Shared star projector (used by both drawEnhancedStars and updateHitLayer) */
  function _projectStar(star, globe, W, H) {
    if (!globe?.camera || !window.THREE) return null;
    const THREE = window.THREE;
    const phi = star.dec*Math.PI/180, lam = star.ra*Math.PI/180;
    const v = new THREE.Vector3(50*Math.cos(phi)*Math.cos(lam),50*Math.sin(phi),50*Math.cos(phi)*Math.sin(lam));
    v.project(globe.camera);
    if (v.z >= 1.0) return null;
    return { x:(v.x*.5+.5)*W, y:(-v.y*.5+.5)*H };
  }

  /* Draw stars into SVG — visual only, pointer-events:none */
  function drawEnhancedStars(svg, globe, W, H, cx, cy, outerR) {
    cx = cx ?? W/2; cy = cy ?? H/2; outerR = outerR ?? Math.min(W,H)*.44;
    if (!globe?.camera || !window.THREE) return;
    const maxR = outerR;

    STAR_DB.forEach(star => {
      const pos = _projectStar(star, globe, W, H);
      if (!pos || Math.hypot(pos.x-cx,pos.y-cy) > maxR) return;

      const isHok=star.id==='Arcturus', hasHaw=!!star.h, bright=star.mag<0.5;
      const isSearch = window._cwsmSearchId === star.id;
      const baseR = Math.max(2.5, 7.5-Math.max(-1.5,star.mag)*1.6) * (isHok?1.6:isSearch?1.9:1);
      const glowR = baseR*(isHok?5:bright?4:hasHaw?3.5:2.5);

      if (isHok||bright||hasHaw||isSearch) {
        svg.appendChild(svgE('circle',{cx:pos.x.toFixed(1),cy:pos.y.toFixed(1),r:(glowR*1.5).toFixed(1),fill:isHok||isSearch?'rgba(255,215,0,.06)':'rgba(0,247,255,.04)'}));
        svg.appendChild(svgE('circle',{cx:pos.x.toFixed(1),cy:pos.y.toFixed(1),r:glowR.toFixed(1),fill:isHok||isSearch?'rgba(255,215,0,.18)':'rgba(0,247,255,.12)'}));
      }
      if (isSearch) {
        /* Pulsing ring around search-matched star */
        svg.appendChild(svgE('circle',{cx:pos.x.toFixed(1),cy:pos.y.toFixed(1),r:(baseR+8).toFixed(1),fill:'none',stroke:'rgba(255,215,0,.7)','stroke-width':'1.5','stroke-dasharray':'4 3'}));
      }

      const col=isHok?'#ffd700'
        :(star.id==='Betelgeuse'||star.id==='Antares'||star.id==='Aldebaran')?'#ffaa66'
        :(star.id==='Rigel'||star.id==='Spica')?'#aac8ff'
        :star.mag<0?'#fff8f0':hasHaw?'rgba(200,230,255,.95)':'rgba(160,195,245,.78)';

      svg.appendChild(svgE('circle',{cx:pos.x.toFixed(1),cy:pos.y.toFixed(1),r:baseR.toFixed(2),fill:col}));

      if (isHok||star.mag<0.5) {
        const len=baseR*(isHok?3.5:2.8);
        [[1,0],[0,1],[.707,.707],[-.707,.707]].forEach(([dx,dy])=>{
          svg.appendChild(svgE('line',{x1:(pos.x-dx*len).toFixed(1),y1:(pos.y-dy*len).toFixed(1),x2:(pos.x+dx*len).toFixed(1),y2:(pos.y+dy*len).toFixed(1),stroke:isHok?'rgba(255,215,0,.6)':'rgba(200,225,255,.4)','stroke-width':'.9','stroke-linecap':'round'}));
        });
      }

      const showLabel=isSearch||isHok||star.mag<0.5||(hasHaw&&star.mag<2.2)||(!hasHaw&&star.mag<1.5);
      if (showLabel) {
        const name = getTradLabel(star);
        const ox=pos.x>W*.76?-(baseR+6):baseR+7, anch=pos.x>W*.76?'end':'start';
        const lc=isHok||isSearch?'rgba(255,215,0,.98)':hasHaw?'rgba(0,247,255,.9)':'rgba(180,210,255,.6)';
        svg.appendChild(svgE('text',{x:(pos.x+ox).toFixed(1),y:(pos.y+3.5).toFixed(1),'text-anchor':anch,fill:lc,'font-size':isHok?'12':hasHaw?'9.5':'8','font-family':'Orbitron,monospace','font-weight':isHok||hasHaw?'600':'400',filter:isHok||isSearch?'drop-shadow(0 0 8px rgba(255,215,0,.8))':hasHaw?'drop-shadow(0 0 6px rgba(0,247,255,.6))':'none'},name));
        if (hasHaw&&star.id!==star.h) svg.appendChild(svgE('text',{x:(pos.x+ox).toFixed(1),y:(pos.y+15).toFixed(1),'text-anchor':anch,fill:'rgba(120,170,215,.35)','font-size':'7','font-family':'sans-serif'},star.id));
        if (hasHaw&&star.rising_az!==null){const rH=houseForBearing(star.rising_az);svg.appendChild(svgE('text',{x:(pos.x+ox).toFixed(1),y:(pos.y+26).toFixed(1),'text-anchor':anch,fill:`${rH.color}55`,'font-size':'6.5','font-family':'Orbitron,monospace'},`rises ${rH.name}`));}
      }
    });
  }

  /* HTML star hit layer — reliable cross-browser clicks.
     Returns array of {star, x, y} for caller. */
  function updateHitLayer(hitLayer, globe, W, H, cx, cy, outerR) {
    hitLayer.innerHTML = '';
    if (!globe?.camera) return;
    const maxR = outerR;

    STAR_DB.forEach(star => {
      const pos = _projectStar(star, globe, W, H);
      if (!pos || Math.hypot(pos.x-cx,pos.y-cy) > maxR) return;
      const baseR = Math.max(2.5,7.5-Math.max(-1.5,star.mag)*1.6);
      const hitDiam = Math.max(44, baseR*4); /* min 44px touch target */
      const btn = document.createElement('button');
      btn.type='button'; btn.className='cwsm-star-hit';
      btn.setAttribute('aria-label', (star.h||star.id) + (star.meaning?` — ${star.meaning}`:''));
      btn.style.cssText=`position:absolute;left:${pos.x.toFixed(0)}px;top:${pos.y.toFixed(0)}px;width:${hitDiam}px;height:${hitDiam}px;transform:translate(-50%,-50%);border-radius:50%;background:transparent;border:none;cursor:pointer;pointer-events:all;`;
      btn.addEventListener('pointerdown',e=>{e.stopPropagation();});
      btn.addEventListener('click',e=>{e.stopPropagation();navigator.vibrate?.(6);showStarPanel(star);});
      hitLayer.appendChild(btn);
    });

    /* ʻIwa bird hit zone (centered, larger) */
    const iwaBtn = document.createElement('button');
    iwaBtn.type='button'; iwaBtn.className='cwsm-iwa-hit';
    iwaBtn.setAttribute('aria-label','ʻIwa frigatebird — tap for moʻolelo');
    iwaBtn.style.cssText=`position:absolute;left:${cx.toFixed(0)}px;top:${cy.toFixed(0)}px;width:${Math.round(outerR*.55)}px;height:${Math.round(outerR*.38)}px;transform:translate(-50%,-50%);border-radius:50%;background:transparent;border:none;cursor:pointer;pointer-events:all;z-index:31;`;
    iwaBtn.addEventListener('click',e=>{e.stopPropagation();navigator.vibrate?.(8);showIwaMoolelo();});
    hitLayer.appendChild(iwaBtn);
  }

  function showStarPanel(star) {
    const isHok = star.id === 'Arcturus';
    const riseH = houseForBearing(star.rising_az ?? 0);
    const setH  = houseForBearing(star.setting_az ?? 0);
    const dist  = star.distance_ly ? `${star.distance_ly.toLocaleString()} light years` : '';
    const cultKeys = star.cultural_notes ? Object.keys(star.cultural_notes).filter(k => k!=='note'&&star.cultural_notes[k]) : [];
    const noteText = star.cultural_notes?.note || '';
    const traditions = STAR_TRADITIONS[star.id] || [];
    const starCol = isHok?'#ffd700'
      :(star.id==='Betelgeuse'||star.id==='Antares'||star.id==='Aldebaran')?'#ffaa66'
      :(star.id==='Rigel'||star.id==='Spica')?'#aac8ff':'#a0c8f0';

    /* Find or create panel inside the star map page */
    const page = document.getElementById('cwsm-page') || document.body;
    let panel = document.getElementById('cwsm-star-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'cwsm-star-panel';
      page.appendChild(panel);
    }

    const compassHtml = star.rising_az !== null ? `
      <div class="cwsm-compass-row">
        <div class="cwsm-cdir"><div class="cwsm-clab">RISES</div><div class="cwsm-chouse" style="color:${riseH.color}">${esc(riseH.name)}</div><div class="cwsm-cdeg">${star.rising_az.toFixed(1)}° · ${esc(riseH.meaning)}</div></div>
        <div class="cwsm-carr">⟶</div>
        <div class="cwsm-cdir"><div class="cwsm-clab">SETS</div><div class="cwsm-chouse" style="color:${setH.color}">${esc(setH.name)}</div><div class="cwsm-cdeg">${star.setting_az.toFixed(1)}° · ${esc(setH.meaning)}</div></div>
      </div>` : `<div class="cwsm-circum">${star.dec>0?'ʻAKAU — Circumpolar from Hawaiʻi, never sets':'Below the Hawaiian horizon'}</div>`;

    panel.innerHTML = `
      <div class="cwsm-panel-handle" id="cwsm-panel-handle"></div>
      <div class="cwsm-panel-inner">
        <div class="cwsm-panel-toprow">
          <button class="cwsm-panel-close" onclick="document.getElementById('cwsm-star-panel').classList.remove('cwsm-panel--open')" type="button" aria-label="Close">✕</button>
          <button class="cwsm-panel-share" id="cwsm-share-star-btn" type="button" title="Share this star"><i class="fas fa-share-nodes"></i></button>
        </div>
        <div class="cwsm-panel-head">
          <div class="cwsm-star-dot" style="background:${starCol};box-shadow:0 0 16px 5px ${starCol}88;"></div>
          <div class="cwsm-panel-names">
            ${star.h?`<div class="cwsm-panel-haw" style="color:${isHok?'#ffd700':'rgba(0,247,255,.95)'}">${esc(star.h)}</div>`:''}
            ${star.meaning?`<div class="cwsm-panel-meaning">"${esc(star.meaning)}"</div>`:''}
            <div class="cwsm-panel-western">${esc(star.id)} <span class="cwsm-panel-con">${esc(star.con)}</span></div>
          </div>
        </div>
        <div class="cwsm-panel-pills">
          <span class="cwsm-pill"><i class="fas fa-circle-dot"></i> Mag ${star.mag.toFixed(2)}</span>
          ${dist?`<span class="cwsm-pill"><i class="fas fa-ruler-horizontal"></i> ${esc(dist)}</span>`:''}
          ${star.spectral_type?`<span class="cwsm-pill">${esc(star.spectral_type)}</span>`:''}
        </div>
        ${compassHtml}
        ${star.nav?`<div class="cwsm-nav"><i class="fas fa-compass"></i> ${esc(star.nav)}</div>`:''}
        ${star.moolelo?`<div class="cwsm-sect"><div class="cwsm-sect-label"><i class="fas fa-scroll"></i> Moʻolelo</div><div class="cwsm-moolelo">${esc(star.moolelo)}</div></div>`:''}
        ${traditions.length?`
        <div class="cwsm-sect">
          <div class="cwsm-sect-label"><i class="fas fa-globe"></i> Across ${traditions.length} Tradition${traditions.length!==1?'s':''}</div>
          ${traditions.map(t=>`
          <div class="cwsm-trad">
            <div class="cwsm-trad-head"><span>${t.icon}</span><span class="cwsm-trad-name">${esc(t.name)}</span><span class="cwsm-trad-culture">${esc(t.trad)}</span></div>
            <p class="cwsm-trad-text">${esc(t.text)}</p>
          </div>`).join('')}
        </div>`:''}
        ${cultKeys.length?`
        <div class="cwsm-sect">
          <div class="cwsm-sect-label"><i class="fas fa-database"></i> From Stars Database</div>
          ${cultKeys.map(k=>`<div class="cwsm-trad"><div class="cwsm-trad-head"><span class="cwsm-trad-name" style="color:rgba(0,247,255,.8)">${esc(k)}</span></div><p class="cwsm-trad-text">${esc(star.cultural_notes[k])}</p></div>`).join('')}
        </div>`:''}
        ${noteText?`<div class="cwsm-note"><i class="fas fa-circle-info"></i> ${esc(noteText)}</div>`:''}
        <div style="height:48px"></div>
      </div>`;

    /* Wire share button */
    document.getElementById('cwsm-share-star-btn')?.addEventListener('click', function() {
      const url = location.origin + location.pathname + '?star=' + encodeURIComponent(star.id);
      navigator.clipboard?.writeText(url).catch(() => {});
      navigator.share?.({ title: (star.h || star.id) + ' — Ikeverse Star Map', url }).catch(() => {});
      navigator.vibrate?.(8);
      this.innerHTML = '✓';
      setTimeout(() => this.innerHTML = '<i class="fas fa-share-nodes"></i>', 1800);
    });

    requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('cwsm-panel--open')));

    /* Swipe down to close */
    let _sy = 0;
    const handle = document.getElementById('cwsm-panel-handle');
    handle?.addEventListener('touchstart', e => { _sy = e.touches[0].clientY; }, { passive:true });
    handle?.addEventListener('touchend', e => {
      if (e.changedTouches[0].clientY - _sy > 80) panel.classList.remove('cwsm-panel--open');
    }, { passive:true });
  }

  /* ═══════════════════════════════════════════════
     COMPASS INFO MODAL
  ═══════════════════════════════════════════════ */
  function showCompassInfo() {
    document.getElementById('cwsm-compass-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'cwsm-compass-modal';
    modal.className = 'cwsm-modal';
    modal.innerHTML = `
      <div class="cwsm-modal-head" style="border-bottom:1px solid rgba(255,215,0,.15);background:linear-gradient(180deg,rgba(255,215,0,.05),transparent);">
        <div>
          <div class="cwsm-modal-title" style="color:rgba(255,215,0,.92);text-shadow:0 0 20px rgba(255,215,0,.55);">Nainoa's Star Compass</div>
          <div class="cwsm-modal-sub" style="color:rgba(255,215,0,.45);">Ka Pānalāʻā Hōkū o Hawaiʻi</div>
        </div>
        <button class="cwsm-modal-close" onclick="document.getElementById('cwsm-compass-modal').remove()" type="button">✕</button>
      </div>
      <div class="cwsm-modal-body">
        <p class="cwsm-modal-lead">Developed by master navigator <strong>Nainoa Thompson</strong> of the Polynesian Voyaging Society. The compass divides the horizon into <strong>32 houses</strong> of 11.25° each — a complete memory system for every possible heading.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:14px;">
          ${[['ʻAKAU','North 0°','#00f7ff'],['HEMA','South 180°','#ff4757'],['HIKINA','East 90°','#ffd700'],['KOMOHANA','West 270°','#ff9f43'],['MANU','NE / SE / SW / NW','#a78bfa'],['NĀ LEO','NNE · NNW · SSE · SSW','#54d1ff'],['NALANI','NE by N / SE by S…','#54d1ff'],['NOIO','NE by E / SE by E…','#54d1ff'],['ʻAINA','ENE · ESE · WSW · WNW','#54d1ff'],['LĀ','E by N · E by S · W by N…','#ffd700']].map(([n,d,c])=>`
          <div class="cwsm-house-card"><div class="cwsm-house-name" style="color:${c}">${n}</div><div class="cwsm-house-desc">${d}</div></div>`).join('')}
        </div>
        <div class="cwsm-box cwsm-box--gold"><div class="cwsm-box-label">Four Horizon Winds</div><p>KOʻOLAU (NE) · MALANAI (SE) · KONA (SW) · HOʻOLUA (NW)</p></div>
        <div style="height:16px"></div>
      </div>`;
    document.body.appendChild(modal);
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('cwsm-modal--open')));
    setTimeout(() => {
      document.addEventListener('click', function _c(e) {
        if (!modal.contains(e.target)) { modal.remove(); document.removeEventListener('click', _c); }
      });
    }, 150);
  }


  /* ═══════════════════════════════════════════════
     FULL-SCREEN PAGE — the core: covers globe/labels/toolbar
  ═══════════════════════════════════════════════ */
  let _rafId = null;
  const TRAD_META = {
    hawaiian:{label:"Hawaiʻi",icon:"🌺",color:"#00f7ff"},
    kemet:   {label:"Kemet",   icon:"𓇳",color:"#f0c96a"},
    babylonian:{label:"Babylon",icon:"𒀭",color:"#c06030"},
    greek:   {label:"Greek",   icon:"⚡",color:"#8ecae6"},
    arabic:  {label:"Arabic",  icon:"☪", color:"#a78bfa"},
    chinese: {label:"Chinese", icon:"龍",color:"#b5e48c"},
    maya:    {label:"Maya",    icon:"🔮",color:"#88cc44"},
    polynesian:{label:"Polynesian",icon:"🌊",color:"#ffd700"},
    aboriginal:{label:"Aboriginal",icon:"🦘",color:"#fca5a5"},
  };


  /* ═══════════════════════════════════════════════
     FULL-SCREEN PAGE — covers globe, labels, toolbar
     Layout: topbar → content area (compass) → switcher
     Compass is centered in the CONTENT AREA (not full page).
     Hit layer = HTML divs (reliable click in all browsers).
  ═══════════════════════════════════════════════ */
  function openStarMapPage(globe) {
    if (document.getElementById('cwsm-page')) return;

    /* ── Page shell ── */
    const page = document.createElement('div');
    page.id = 'cwsm-page';
    document.body.appendChild(page);

    /* ── Compass background (positioned dynamically in loop) ── */
    const compassBg = document.createElement('img');
    compassBg.id = 'cwsm-compass-bg'; compassBg.src = IMG_COMPASS; compassBg.alt = '';
    compassBg.style.cssText = [
      'position:absolute',
      'object-fit:contain',
      'pointer-events:none',
      'z-index:1',
      'filter:invert(1) brightness(.18) contrast(2)',
      'mix-blend-mode:screen',
      'opacity:.52',
      'transition:opacity .3s',
    ].join(';');
    compassBg.onerror = () => compassBg.style.display='none';
    page.appendChild(compassBg);

    /* ── SVG: visual rendering only, pointer-events:none ── */
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.id = 'cwsm-svg';
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none;';
    page.appendChild(svg);

    /* ── HTML hit layer: reliable pointer events for star clicks ── */
    const hitLayer = document.createElement('div');
    hitLayer.id = 'cwsm-hit-layer';
    hitLayer.style.cssText = 'position:absolute;inset:0;z-index:20;pointer-events:none;overflow:hidden;';
    page.appendChild(hitLayer);

    /* ── Top bar ── */
    page.insertAdjacentHTML('beforeend', `
      <div id="cwsm-topbar">
        <button id="cwsm-close-btn" type="button" aria-label="Close Star Map">
          <i class="fas fa-chevron-left"></i>
          <span>Close Map</span>
        </button>
        <div id="cwsm-title">
          <div id="cwsm-title-main">KA PĀNALĀʻĀ AO</div>
          <div id="cwsm-title-sub">Cultural Star Map</div>
        </div>
        <button id="cwsm-search-toggle" type="button" aria-label="Search stars"><i class="fas fa-search"></i></button>
        <button id="cwsm-info-btn" type="button" aria-label="About the Compass"><i class="fas fa-circle-info"></i></button>
      </div>
      <div id="cwsm-search-bar" hidden>
        <input id="cwsm-search-input" type="search" placeholder="Search stars… Hōkūleʻa, Arcturus, Orion…"
               autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        <div id="cwsm-search-results"></div>
      </div>`);

    /* ── Bottom: tradition switcher ── */
    page.insertAdjacentHTML('beforeend', `
      <div id="cwsm-switcher">
        <div id="cwsm-switcher-label">Star names by tradition</div>
        <div id="cwsm-switcher-pills">
          ${Object.entries(TRAD_META).map(([key,t])=>`
          <button class="cwsm-trad-pill" data-trad="${key}" type="button" title="${t.label}">
            <span class="cwsm-trad-pill-icon">${t.icon}</span>
            <span class="cwsm-trad-pill-label">${t.label}</span>
          </button>`).join('')}
        </div>
      </div>`);

    /* ── Wire buttons ── */
    document.getElementById('cwsm-close-btn')?.addEventListener('click', closeStarMapPage);
    document.getElementById('cwsm-info-btn')?.addEventListener('click', showCompassInfo);

    const searchToggle = document.getElementById('cwsm-search-toggle');
    const searchBar    = document.getElementById('cwsm-search-bar');
    const searchInput  = document.getElementById('cwsm-search-input');
    const searchRes    = document.getElementById('cwsm-search-results');
    searchToggle?.addEventListener('click', () => {
      const open = searchBar.hidden;
      searchBar.hidden = !open;
      if (open) setTimeout(() => searchInput?.focus(), 50);
      else { searchInput.value=''; searchRes.innerHTML=''; window._cwsmSearchId=null; lastKey=''; }
      navigator.vibrate?.(6);
    });
    let _debT;
    searchInput?.addEventListener('input', () => {
      clearTimeout(_debT);
      _debT = setTimeout(() => {
        const q = (searchInput.value||'').trim().toLowerCase();
        window._cwsmSearchId = null;
        if (!q) { searchRes.innerHTML=''; lastKey=''; return; }
        const hits = STAR_DB.filter(s =>
          s.id.toLowerCase().includes(q) ||
          (s.h||'').toLowerCase().includes(q) ||
          (s.meaning||'').toLowerCase().includes(q) ||
          (s.con||'').toLowerCase().includes(q) ||
          Object.values(TRAD_LABEL_MAP[s.id]||{}).some(n=>n.toLowerCase().includes(q)) ||
          Object.values(EXTRA_TRAD_NAMES[s.id]||{}).some(n=>n.toLowerCase().includes(q))
        ).slice(0,7);
        searchRes.innerHTML = hits.map(s =>
          `<button class="cwsm-sr-btn" data-id="${s.id}" type="button">
            <span class="cwsm-sr-haw">${s.h||s.id}</span>
            <span class="cwsm-sr-west">${s.h?s.id:''} ${s.con||''}</span>
          </button>`
        ).join('') || '<div class="cwsm-sr-empty">No results</div>';
        searchRes.querySelectorAll('.cwsm-sr-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            window._cwsmSearchId = btn.dataset.id;
            const star = STAR_DB.find(s=>s.id===btn.dataset.id);
            if (star) { showStarPanel(star); searchInput.value=star.h||star.id; }
            searchRes.innerHTML=''; lastKey='';
            navigator.vibrate?.([6,30,12]);
          });
        });
        if (hits.length===1) window._cwsmSearchId = hits[0].id;
        lastKey='';
      }, 180);
    });

    /* ── Tradition pills ── */
    page.querySelectorAll('.cwsm-trad-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        _currentTrad = btn.dataset.trad;
        page.querySelectorAll('.cwsm-trad-pill').forEach(b => {
          const t = TRAD_META[b.dataset.trad];
          b.classList.toggle('cwsm-trad-pill--active', b===btn);
          b.style = b===btn ? `border-color:${t.color}55;background:${t.color}14;color:${t.color};` : '';
        });
        lastKey='';
        navigator.vibrate?.(8);
      });
    });

    document.addEventListener('keydown', _escHandler);

    /* ── Render loop ── */
    let lastKey='', bgStars=null, t0=Date.now();
    let _prevCx=-1, _prevCy=-1, _prevR=-1;

    function loop() {
      _rafId = requestAnimationFrame(loop);
      if (!globe.camera) return;

      const W = page.clientWidth, H = page.clientHeight;
      if (!W || !H) return;

      /* ── Content area geometry ──
         Topbar: absolute, ~68px visual + safe area
         Switcher: absolute at bottom, ~96px visual + safe area
         Compass must be fully inside this area.
      ── */
      const topbarEl   = document.getElementById('cwsm-topbar');
      const switcherEl = document.getElementById('cwsm-switcher');
      const TOP_H   = (topbarEl?.offsetHeight  || 68) + 8;
      const BOT_H   = (switcherEl?.offsetHeight || 96) + 8;
      const availH  = H - TOP_H - BOT_H;
      const availW  = W;

      /* Compass center sits in the middle of the content area */
      const cx = availW / 2;
      const cy = TOP_H + availH / 2;

      /* outerR: fits in content area with room for wind labels (outerR+60) and text */
      const outerR = Math.min(availW * 0.46, availH * 0.46) * 0.9;

      /* ── Camera key — only redraw if camera moved ── */
      const p = globe.camera.position;
      const key = `${W}x${H}:${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}:${cx.toFixed(0)},${cy.toFixed(0)},${outerR.toFixed(0)}:${_currentTrad}:${window._cwsmSearchId||''}`;
      if (key === lastKey) return;
      lastKey = key;

      /* ── Position compass background image dynamically ── */
      const bgDiam = outerR * 2.1;
      compassBg.style.left   = (cx - bgDiam/2).toFixed(0) + 'px';
      compassBg.style.top    = (cy - bgDiam/2).toFixed(0) + 'px';
      compassBg.style.width  = bgDiam.toFixed(0) + 'px';
      compassBg.style.height = bgDiam.toFixed(0) + 'px';

      /* ── Render SVG ── */
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.innerHTML = '';

      /* Fully opaque night sky */
      svg.appendChild(svgE('rect',{width:W,height:H,fill:'#00020e'}));
      /* Milky Way */
      svg.appendChild(svgE('ellipse',{cx:cx.toFixed(0),cy:cy.toFixed(0),rx:(W*.44).toFixed(0),ry:(availH*.18).toFixed(0),fill:'rgba(140,165,230,.04)',transform:`rotate(-32,${cx.toFixed(0)},${cy.toFixed(0)})`}));
      svg.appendChild(svgE('ellipse',{cx:cx.toFixed(0),cy:cy.toFixed(0),rx:(W*.28).toFixed(0),ry:(availH*.08).toFixed(0),fill:'rgba(170,195,255,.055)',transform:`rotate(-32,${cx.toFixed(0)},${cy.toFixed(0)})`}));

      /* Background field stars */
      if (!bgStars) bgStars = Array.from({length:320},()=>({x:Math.random(),y:Math.random(),r:Math.random()*1.1+.2,op:Math.random()*.28+.07,tw:Math.random()*Math.PI*2,sp:Math.random()*.6+.7}));
      const t=(Date.now()-t0)/1000;
      const bgG=document.createElementNS('http://www.w3.org/2000/svg','g');
      bgStars.forEach(s=>{
        const op=Math.min(.65,s.op+Math.sin(t*s.sp+s.tw)*.04);
        bgG.appendChild(svgE('circle',{cx:(s.x*W).toFixed(1),cy:(TOP_H+s.y*availH).toFixed(1),r:(s.r*(1+Math.sin(t*.7+s.tw)*.04)).toFixed(2),fill:'#a8c0f0',opacity:op.toFixed(2)}));
      });
      svg.appendChild(bgG);

      /* Named stars + constellation labels */
      drawEnhancedStars(svg, globe, W, H, cx, cy, outerR);

      /* 32-house compass rose */
      drawCompassRose(svg, W, H, getCameraHeading(globe.camera), cx, cy, outerR);

      /* ʻIwa bird HTML layer */
      ensureIwaBird(page, cx, cy);

      /* HTML hit layer for star + iwa clicks */
      updateHitLayer(hitLayer, globe, W, H, cx, cy, outerR);
    }
    loop();
    requestAnimationFrame(()=>requestAnimationFrame(()=>page.classList.add('cwsm-page--open')));
  }

  function _escHandler(e) {
    if (e.key==='Escape') {
      document.getElementById('cwsm-star-panel')?.classList.remove('cwsm-panel--open');
      document.getElementById('cwsm-compass-modal')?.remove();
      document.getElementById('cw-iwa-modal')?.remove();
    }
  }

  function closeStarMapPage() {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId=null; }
    document.removeEventListener('keydown', _escHandler);
    const page = document.getElementById('cwsm-page');
    if (!page) return;
    page.classList.remove('cwsm-page--open');
    setTimeout(()=>page.remove(), 360);
    document.getElementById('cwsm-star-panel')?.classList.remove('cwsm-panel--open');
    document.getElementById('cwsm-compass-modal')?.remove();
    document.getElementById('cw-iwa-modal')?.remove();
    document.getElementById('btnStarMap')?.classList.remove('active');
  }


  /* ═══════════════════════════════════════════════
     ALL CSS
  ═══════════════════════════════════════════════ */
  function injectCSS() {
    if (document.getElementById('cwsm-styles')) return;
    const s = document.createElement('style');
    s.id = 'cwsm-styles';
    s.textContent = `
      /* ── Full-screen page — pointer-events:none lets globe drag through ── */
      #cwsm-page {
        position: fixed; inset: 0; z-index: 9000;
        background: #00020e; overflow: hidden;
        font-family: 'Exo 2', sans-serif;
        opacity: 0; transition: opacity .32s ease;
        pointer-events: none;
      }
      #cwsm-page.cwsm-page--open { opacity: 1; }
      @keyframes cwsm-soar {
        0%,100%{transform:translate(-50%,-50%) translateY(0) rotate(0) scale(1);}
        22%    {transform:translate(-50%,-50%) translateY(-8px) rotate(-1.5deg) scale(1.013);}
        50%    {transform:translate(-50%,-50%) translateY(-12px) rotate(.2deg) scale(1.02);}
        76%    {transform:translate(-50%,-50%) translateY(-5px) rotate(1.2deg) scale(.991);}
      }
      .cwsm-rose { transition: transform .4s cubic-bezier(.4,0,.2,1); }

      /* ── Hit layer: container is pointer-events:none, children are all ── */
      #cwsm-hit-layer { pointer-events: none; }
      .cwsm-star-hit, .cwsm-iwa-hit { pointer-events: all !important; }

      /* ── Top bar ── */
      #cwsm-topbar {
        position: absolute; top: 0; left: 0; right: 0; z-index: 40;
        display: flex; align-items: center; gap: 8px;
        padding: max(10px,env(safe-area-inset-top,10px)) 12px 10px;
        background: linear-gradient(to bottom, rgba(0,2,14,.98) 60%, transparent 100%);
        pointer-events: all;
        min-height: 54px;
      }
      #cwsm-close-btn {
        display: flex; align-items: center; gap: 6px;
        padding: 8px 14px; border-radius: 22px;
        border: 1px solid rgba(255,215,0,.35); background: rgba(0,2,14,.9);
        color: rgba(255,215,0,.88); font-size: .76rem; font-family: 'Orbitron',monospace;
        letter-spacing: .05em; cursor: pointer; backdrop-filter: blur(14px);
        min-height: 40px; white-space: nowrap; flex-shrink: 0;
        transition: background .15s; touch-action: manipulation;
      }
      #cwsm-close-btn:hover { background: rgba(30,20,4,.95); }
      #cwsm-close-btn:active { transform: scale(.95); }
      #cwsm-title {
        flex: 1; text-align: center; min-width: 0; pointer-events: none;
      }
      #cwsm-title-main {
        font-family: 'Orbitron',monospace; font-size: .66rem; letter-spacing: .12em;
        color: rgba(255,215,0,.72); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      #cwsm-title-sub {
        font-size: .56rem; color: rgba(0,247,255,.42);
        font-family: 'Orbitron',monospace; letter-spacing: .07em;
      }
      #cwsm-search-toggle, #cwsm-info-btn {
        width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
        border: 1px solid rgba(0,247,255,.25); background: rgba(0,2,14,.9);
        color: rgba(0,247,255,.72); font-size: .88rem; cursor: pointer;
        backdrop-filter: blur(14px); display: flex; align-items: center; justify-content: center;
        touch-action: manipulation; transition: background .15s;
        min-width: 40px; min-height: 40px;
      }
      #cwsm-info-btn { border-color: rgba(255,215,0,.28); color: rgba(255,215,0,.72); }
      #cwsm-search-toggle:hover, #cwsm-info-btn:hover { background: rgba(0,20,30,.95); }

      /* Search bar */
      #cwsm-search-bar {
        position: absolute; z-index: 41; pointer-events: all;
        left: 10px; right: 10px;
        top: max(58px, calc(env(safe-area-inset-top,0px) + 58px));
      }
      #cwsm-search-input {
        width: 100%; box-sizing: border-box;
        padding: 11px 16px; border-radius: 14px;
        background: rgba(0,10,25,.96); border: 1px solid rgba(0,247,255,.4);
        color: rgba(255,255,255,.95); font-size: 16px; font-family: inherit;
        outline: none; backdrop-filter: blur(20px);
        box-shadow: 0 4px 24px rgba(0,0,0,.6);
      }
      #cwsm-search-input::placeholder { color: rgba(255,255,255,.3); }
      #cwsm-search-results {
        margin-top: 6px; border-radius: 14px; overflow: hidden;
        background: rgba(2,5,18,.98); border: 1px solid rgba(0,247,255,.18);
        backdrop-filter: blur(24px); box-shadow: 0 8px 32px rgba(0,0,0,.7);
        max-height: 50vh; overflow-y: auto;
      }
      .cwsm-sr-btn {
        display: flex; align-items: center; gap: 10px;
        width: 100%; padding: 12px 16px; text-align: left;
        background: none; border: none; border-bottom: 1px solid rgba(0,247,255,.06);
        cursor: pointer; touch-action: manipulation; transition: background .12s;
        color: inherit;
      }
      .cwsm-sr-btn:last-child { border-bottom: none; }
      .cwsm-sr-btn:active, .cwsm-sr-btn:hover { background: rgba(0,247,255,.07); }
      .cwsm-sr-haw { font-family: Orbitron,monospace; font-size: .78rem; color: rgba(0,247,255,.9); }
      .cwsm-sr-west { font-size: .67rem; color: rgba(255,255,255,.28); margin-left: auto; flex-shrink: 0; }
      .cwsm-sr-empty { padding: 14px 16px; font-size: .78rem; color: rgba(255,255,255,.3); text-align: center; }

      /* ── Tradition switcher (bottom) ── */
      #cwsm-switcher {
        position: absolute; bottom: 0; left: 0; right: 0; z-index: 40;
        padding: 8px 12px max(18px,env(safe-area-inset-bottom,18px));
        background: linear-gradient(to top, rgba(0,2,14,.98) 70%, transparent 100%);
        display: flex; flex-direction: column; align-items: center; gap: 6px;
        pointer-events: all;
      }
      #cwsm-switcher-label {
        font-family: 'Orbitron',monospace; font-size: .52rem; letter-spacing: .1em;
        color: rgba(0,247,255,.28); text-transform: uppercase;
      }
      #cwsm-switcher-pills {
        display: flex; flex-wrap: nowrap; gap: 4px;
        overflow-x: auto; -webkit-overflow-scrolling: touch;
        scrollbar-width: none; padding: 2px 2px; max-width: 100%;
      }
      #cwsm-switcher-pills::-webkit-scrollbar { display: none; }
      .cwsm-trad-pill {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 7px 10px; border-radius: 18px; flex-shrink: 0;
        border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.04);
        color: rgba(255,255,255,.5); cursor: pointer; font-size: .7rem; font-family: inherit;
        white-space: nowrap; min-height: 38px; touch-action: manipulation;
        transition: all .15s; user-select: none;
      }
      .cwsm-trad-pill:active { transform: scale(.92); }
      .cwsm-trad-pill-icon { font-size: .9rem; line-height: 1; }
      @media (max-width: 479px) {
        .cwsm-trad-pill-label { display: none; }
        .cwsm-trad-pill { padding: 8px 9px; min-height: 42px; }
        .cwsm-trad-pill-icon { font-size: 1.05rem; }
        #cwsm-close-btn span { display: none; }
        #cwsm-close-btn { padding: 0; width: 40px; justify-content: center; font-size: 1rem; }
        #cwsm-title-main { font-size: .6rem; }
      }

      /* ── Star info panel: bottom sheet inside the page ── */
      #cwsm-star-panel {
        position: absolute; bottom: 0; left: 0; right: 0; z-index: 50;
        background: rgba(2,5,18,.98); border-top: 1px solid rgba(0,247,255,.22);
        border-radius: 22px 22px 0 0; max-height: 86vh; overflow-y: auto;
        transform: translateY(102%); transition: transform .34s cubic-bezier(.25,.46,.45,.94);
        scrollbar-width: thin; scrollbar-color: rgba(0,247,255,.22) transparent;
        backdrop-filter: blur(24px); box-shadow: 0 -8px 48px rgba(0,0,0,.85);
        pointer-events: all;
      }
      #cwsm-star-panel::-webkit-scrollbar { width: 4px; }
      #cwsm-star-panel::-webkit-scrollbar-thumb { background:rgba(0,247,255,.22);border-radius:2px; }
      #cwsm-star-panel.cwsm-panel--open { transform: translateY(0); }
      .cwsm-panel-handle {
        width: 40px; height: 4px; background: rgba(0,247,255,.22);
        border-radius: 2px; margin: 12px auto 0; cursor: grab; touch-action: none;
      }
      .cwsm-panel-inner { padding: 10px 16px 48px; display: flex; flex-direction: column; gap: 12px; }
      .cwsm-panel-toprow { display: flex; align-items: center; justify-content: space-between; }
      .cwsm-panel-close {
        width: 36px; height: 36px; border-radius: 10px;
        border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05);
        color: rgba(255,255,255,.7); cursor: pointer; font-size: .9rem;
        display: flex; align-items: center; justify-content: center;
        touch-action: manipulation;
      }
      .cwsm-panel-close:hover { background: rgba(255,60,60,.15); color:#fff; }
      .cwsm-panel-share {
        width: 34px; height: 34px; border-radius: 9px;
        border: 1px solid rgba(0,247,255,.15); background: rgba(0,247,255,.06);
        color: rgba(0,247,255,.55); cursor: pointer; font-size: .8rem;
        display: flex; align-items: center; justify-content: center;
        touch-action: manipulation; transition: all .15s;
      }
      .cwsm-panel-share:hover { background:rgba(0,247,255,.15); color:rgba(0,247,255,.9); }
      .cwsm-panel-head { display: flex; align-items: center; gap: 12px; }
      .cwsm-star-dot { width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0; }
      .cwsm-panel-names { flex: 1; min-width: 0; }
      .cwsm-panel-haw { font-family:'Orbitron',monospace; font-size:.96rem; font-weight:700; letter-spacing:.04em; margin-bottom:2px; }
      .cwsm-panel-meaning { font-size:.7rem; color:rgba(255,215,0,.5); font-style:italic; margin-bottom:3px; }
      .cwsm-panel-western { font-size:.86rem; color:rgba(255,255,255,.82); display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
      .cwsm-panel-con { font-size:.62rem; letter-spacing:.07em; background:rgba(0,247,255,.08); border:1px solid rgba(0,247,255,.15); border-radius:4px; padding:1px 6px; color:rgba(0,247,255,.5); }
      .cwsm-panel-pills { display:flex; flex-wrap:wrap; gap:5px; }
      .cwsm-pill { display:inline-flex; align-items:center; gap:4px; font-size:.68rem; color:rgba(0,247,255,.65); background:rgba(0,247,255,.07); border:1px solid rgba(0,247,255,.12); border-radius:6px; padding:2px 8px; }
      .cwsm-compass-row { display:flex; align-items:center; gap:10px; padding:11px; border-radius:12px; background:rgba(0,247,255,.04); border:1px solid rgba(0,247,255,.12); }
      .cwsm-cdir { flex:1; text-align:center; }
      .cwsm-clab { font-family:'Orbitron',monospace; font-size:.5rem; letter-spacing:.1em; color:rgba(255,255,255,.28); margin-bottom:2px; }
      .cwsm-chouse { font-family:'Orbitron',monospace; font-size:.86rem; font-weight:700; margin-bottom:2px; }
      .cwsm-cdeg { font-size:.6rem; color:rgba(255,255,255,.28); }
      .cwsm-carr { font-size:.9rem; color:rgba(0,247,255,.22); }
      .cwsm-circum { padding:9px 12px; border-radius:9px; background:rgba(157,0,255,.06); border:1px solid rgba(157,0,255,.15); font-size:.75rem; color:rgba(200,170,255,.65); }
      .cwsm-nav { display:flex; align-items:flex-start; gap:8px; padding:9px 12px; border-radius:10px; background:rgba(255,215,0,.06); border:1px solid rgba(255,215,0,.15); font-size:.78rem; color:rgba(255,215,0,.85); line-height:1.55; }
      .cwsm-nav i { color:rgba(255,215,0,.5); flex-shrink:0; margin-top:2px; }
      .cwsm-sect { display:flex; flex-direction:column; gap:7px; }
      .cwsm-sect-label { font-family:'Orbitron',monospace; font-size:.58rem; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:rgba(0,247,255,.42); border-bottom:1px solid rgba(0,247,255,.08); padding-bottom:5px; display:flex; align-items:center; gap:6px; }
      .cwsm-moolelo { font-size:.8rem; line-height:1.72; color:rgba(200,228,248,.82); border-left:2px solid rgba(0,247,255,.22); padding-left:12px; font-style:italic; }
      .cwsm-trad { padding:9px 12px; border-radius:10px; background:rgba(255,255,255,.02); border:1px solid rgba(255,255,255,.06); }
      .cwsm-trad-head { display:flex; align-items:baseline; gap:7px; margin-bottom:4px; flex-wrap:wrap; }
      .cwsm-trad-name { font-family:'Orbitron',monospace; font-size:.68rem; font-weight:700; color:rgba(0,247,255,.88); }
      .cwsm-trad-culture { font-size:.58rem; color:rgba(255,255,255,.28); font-family:'Orbitron',monospace; margin-left:auto; }
      .cwsm-trad-text { font-size:.76rem; line-height:1.6; color:rgba(190,215,235,.72); margin:0; }
      .cwsm-note { font-size:.72rem; color:rgba(255,255,255,.4); font-style:italic; padding:7px 12px; border-radius:8px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07); }

      /* ── Modals ── */
      .cwsm-modal {
        position: fixed; z-index: 10000;
        width: min(500px,96vw); max-height: 88vh; overflow-y: auto;
        background: rgba(2,5,18,.98); border: 1px solid rgba(0,247,255,.2);
        border-radius: 20px; box-shadow: 0 24px 80px rgba(0,0,0,.9);
        font-family: 'Exo 2',sans-serif; scrollbar-width: thin;
        scrollbar-color: rgba(0,247,255,.2) transparent;
        opacity: 0; transition: opacity .22s, transform .22s;
        top: 50%; left: 50%; transform: translate(-50%,-50%) scale(.96);
        pointer-events: all;
      }
      .cwsm-modal::-webkit-scrollbar { width:4px; }
      .cwsm-modal::-webkit-scrollbar-thumb { background:rgba(0,247,255,.2);border-radius:2px; }
      .cwsm-modal.cwsm-modal--open { opacity:1; transform:translate(-50%,-50%) scale(1); }
      @media (max-width: 639px) {
        .cwsm-modal {
          top:auto!important; bottom:0!important; left:0!important; right:0!important;
          width:100vw!important; max-width:100vw!important; max-height:92vh!important;
          border-radius:22px 22px 0 0!important; transform:translateY(110%)!important;
        }
        .cwsm-modal.cwsm-modal--open { transform:translateY(0)!important; }
      }
      .cwsm-modal-head {
        position:relative; display:flex; align-items:center; gap:16px;
        padding:20px 20px 16px;
        border-bottom:1px solid rgba(0,247,255,.1);
        background:linear-gradient(180deg,rgba(0,247,255,.05),transparent);
      }
      .cwsm-iwa-modal-img-wrap {
        width:90px; height:60px; flex-shrink:0;
        display:flex; align-items:center; justify-content:center;
      }
      .cwsm-iwa-modal-loading { color:rgba(0,247,255,.3); font-size:.6rem; letter-spacing:.2em; }
      .cwsm-modal-title { font-family:Orbitron,monospace; font-size:1.12rem; font-weight:700; letter-spacing:.08em; color:rgba(0,247,255,.95); text-shadow:0 0 22px rgba(0,247,255,.6); margin-bottom:3px; }
      .cwsm-modal-sub { font-size:.72rem; color:rgba(255,215,0,.55); font-style:italic; margin-bottom:2px; }
      .cwsm-modal-sci { font-size:.64rem; color:rgba(255,255,255,.28); font-family:Orbitron,monospace; letter-spacing:.05em; }
      .cwsm-modal-close {
        position:absolute; top:12px; right:12px; width:36px; height:36px;
        border-radius:9px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.05);
        color:rgba(255,255,255,.7); cursor:pointer; display:flex; align-items:center; justify-content:center;
        font-size:.85rem; touch-action:manipulation; pointer-events:all;
      }
      .cwsm-modal-body { padding:16px 20px; display:flex; flex-direction:column; gap:13px; }
      .cwsm-modal-lead { font-size:.84rem; line-height:1.75; color:rgba(255,255,255,.78); border-left:3px solid rgba(0,247,255,.28); padding-left:13px; font-style:italic; margin:0; }
      .cwsm-nav-item { display:flex; gap:10px; margin-bottom:6px; padding:9px 11px; border-radius:10px; background:rgba(0,247,255,.04); border:1px solid rgba(0,247,255,.08); font-size:.79rem; line-height:1.6; color:rgba(255,255,255,.72); }
      .cwsm-nav-num { font-family:Orbitron,monospace; font-size:.62rem; color:rgba(0,247,255,.4); flex-shrink:0; margin-top:2px; width:14px; text-align:center; }
      .cwsm-box { padding:12px; border-radius:11px; }
      .cwsm-box--gold   { background:rgba(255,215,0,.04); border:1px solid rgba(255,215,0,.12); }
      .cwsm-box--purple { background:rgba(157,0,255,.05); border:1px solid rgba(157,0,255,.15); }
      .cwsm-box--green  { background:rgba(60,179,113,.04); border:1px solid rgba(60,179,113,.12); }
      .cwsm-box-label { font-family:Orbitron,monospace; font-size:.56rem; letter-spacing:.12em; text-transform:uppercase; margin-bottom:6px; color:rgba(0,247,255,.5); }
      .cwsm-box--gold .cwsm-box-label   { color:rgba(255,215,0,.5); }
      .cwsm-box--purple .cwsm-box-label { color:rgba(157,0,255,.55); }
      .cwsm-box--green .cwsm-box-label  { color:rgba(60,179,113,.55); }
      .cwsm-box p { font-size:.79rem; line-height:1.65; color:rgba(255,255,255,.68); margin:0; }
      .cwsm-house-card { padding:7px 9px; border-radius:8px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07); }
      .cwsm-house-name { font-family:Orbitron,monospace; font-size:.7rem; font-weight:700; margin-bottom:2px; }
      .cwsm-house-desc { font-size:.64rem; color:rgba(255,255,255,.38); }

      #btnStarMap.active {
        box-shadow:0 0 16px rgba(255,215,0,.4),0 0 32px rgba(157,0,255,.2)!important;
        border-color:rgba(255,215,0,.35)!important; color:rgba(255,215,0,.9)!important;
      }
    `;
    document.head.appendChild(s);
    document.addEventListener('keydown', e => {
      if (e.key==='Escape') {
        document.getElementById('cwsm-star-panel')?.classList.remove('cwsm-panel--open');
        document.getElementById('cwsm-compass-modal')?.remove();
        document.getElementById('cw-iwa-modal')?.remove();
      }
    });
  }

  function init() {
    injectCSS();
    mergeWithStarData();

    let tries = 0;
    const wait = setInterval(() => {
      tries++;
      const app = window._cwApp;
      if (!app || tries > 80) { clearInterval(wait); return; }
      const overlay = app.starOverlay, globe = app.globe;
      if (!overlay || !globe) return;
      clearInterval(wait);
      mergeWithStarData();

      /* Patch overlay.toggle → open/close full-page */
      const origToggle = overlay.toggle.bind(overlay);
      overlay.toggle = function(g) {
        const page = document.getElementById('cwsm-page');
        if (page) {
          /* Closing */
          closeStarMapPage();
          this.visible = false;
          document.getElementById('btnStarMap')?.classList.remove('active');
        } else {
          /* Opening */
          openStarMapPage(g || globe);
          this.visible = true;
          document.getElementById('btnStarMap')?.classList.add('active');
        }
      };

      /* Also wire btnStarMap directly (for desktop clicks) */
      const btn = document.getElementById('btnStarMap');
      if (btn) {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', () => overlay.toggle(globe));
      }

      injectCompassInfoBtn();

      /* Listen for mobile.js events */
      window.addEventListener('cw:openStarMap',  () => { if (!document.getElementById('cwsm-page')) overlay.toggle(globe); });
      window.addEventListener('cw:closeStarMap', () => { if ( document.getElementById('cwsm-page')) overlay.toggle(globe); });
      window.addEventListener('cw:compassInfo', showCompassInfo);

      /* Deep-link: open star map + panel if ?star= in URL */
      const _urlStar = new URLSearchParams(location.search).get('star');
      if (_urlStar) {
        setTimeout(() => {
          overlay.toggle(globe);
          setTimeout(() => {
            const s = STAR_DB.find(x => x.id === _urlStar || (x.h||'').toLowerCase() === _urlStar.toLowerCase());
            if (s) showStarPanel(s);
          }, 800);
        }, 1200);
      }

      console.info('[CW+StarMap v6] Full-page star map — 65 stars, 32 houses, canvas bird PNG');
    }, 200);

    const richWait = setInterval(() => {
      if (window._starData) { clearInterval(richWait); mergeWithStarData(); }
    }, 500);
    setTimeout(() => clearInterval(richWait), 8000);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else
    init();

})();