/**
 * cosmic-weave-starmap.js
 * ─────────────────────────────────────────────────────────────────
 * Hawaiian Star Compass — Full Enhancement
 *
 * Adds to the existing star map toggle:
 *   1. Nainoa Thompson's 32-house Hawaiian star compass rose
 *   2. All 65 stars with Hawaiian names, moʻolelo, navigation info
 *   3. Compass image background (white removed via CSS filter)
 *   4. Dynamic compass rotation tied to globe camera heading
 *   5. Rising/setting house for each star (computed for Hawaiʻi lat 21°N)
 *   6. Glowing color text — cyan for stars, gold for Hawaiian names
 *   7. House highlight when a star is hovered/selected
 *
 * Deploy: add AFTER cosmic-weave.js in cosmic-weave.html
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  const HAW_LAT_RAD = 21.0 * Math.PI / 180; // Hawaiʻi latitude

  /* ════════════════════════════════════════════════════════════
     32 COMPASS HOUSES — Nainoa Thompson's system
     Each house = 11.25° arc on the horizon
  ════════════════════════════════════════════════════════════ */
  const COMPASS_HOUSES = [
    { name: "ʻAKAU",    bearing: 0,      type: "cardinal", meaning: "North",         color: "#00f7ff" },
    { name: "HAKA",     bearing: 11.25,  type: "house",    meaning: "N by E",        color: "#54d1ff" },
    { name: "NĀ LEO",   bearing: 22.5,   type: "house",    meaning: "NNE",           color: "#54d1ff" },
    { name: "NALANI",   bearing: 33.75,  type: "house",    meaning: "NE by N",       color: "#54d1ff" },
    { name: "MANU",     bearing: 45,     type: "intercardinal", meaning: "NE",       color: "#a78bfa" },
    { name: "NOIO",     bearing: 56.25,  type: "house",    meaning: "NE by E",       color: "#54d1ff" },
    { name: "ʻAINA",    bearing: 67.5,   type: "house",    meaning: "ENE",           color: "#54d1ff" },
    { name: "LĀ",       bearing: 78.75,  type: "house",    meaning: "E by N",        color: "#ffd700" },
    { name: "HIKINA",   bearing: 90,     type: "cardinal", meaning: "East",          color: "#ffd700" },
    { name: "LĀ",       bearing: 101.25, type: "house",    meaning: "E by S",        color: "#ffd700" },
    { name: "ʻAINA",    bearing: 112.5,  type: "house",    meaning: "ESE",           color: "#54d1ff" },
    { name: "NOIO",     bearing: 123.75, type: "house",    meaning: "SE by E",       color: "#54d1ff" },
    { name: "MANU",     bearing: 135,    type: "intercardinal", meaning: "SE",       color: "#a78bfa" },
    { name: "NALANI",   bearing: 146.25, type: "house",    meaning: "SE by S",       color: "#54d1ff" },
    { name: "NĀ LEO",   bearing: 157.5,  type: "house",    meaning: "SSE",           color: "#54d1ff" },
    { name: "HAKA",     bearing: 168.75, type: "house",    meaning: "S by E",        color: "#54d1ff" },
    { name: "HEMA",     bearing: 180,    type: "cardinal", meaning: "South",         color: "#ff4757" },
    { name: "HAKA",     bearing: 191.25, type: "house",    meaning: "S by W",        color: "#54d1ff" },
    { name: "NĀ LEO",   bearing: 202.5,  type: "house",    meaning: "SSW",           color: "#54d1ff" },
    { name: "NALANI",   bearing: 213.75, type: "house",    meaning: "SW by S",       color: "#54d1ff" },
    { name: "MANU",     bearing: 225,    type: "intercardinal", meaning: "SW",       color: "#a78bfa" },
    { name: "NOIO",     bearing: 236.25, type: "house",    meaning: "SW by W",       color: "#54d1ff" },
    { name: "ʻAINA",    bearing: 247.5,  type: "house",    meaning: "WSW",           color: "#54d1ff" },
    { name: "LĀ",       bearing: 258.75, type: "house",    meaning: "W by S",        color: "#ffd700" },
    { name: "KOMOHANA", bearing: 270,    type: "cardinal", meaning: "West",          color: "#ff9f43" },
    { name: "LĀ",       bearing: 281.25, type: "house",    meaning: "W by N",        color: "#ffd700" },
    { name: "ʻAINA",    bearing: 292.5,  type: "house",    meaning: "WNW",           color: "#54d1ff" },
    { name: "NOIO",     bearing: 303.75, type: "house",    meaning: "NW by W",       color: "#54d1ff" },
    { name: "MANU",     bearing: 315,    type: "intercardinal", meaning: "NW",       color: "#a78bfa" },
    { name: "NALANI",   bearing: 326.25, type: "house",    meaning: "NW by N",       color: "#54d1ff" },
    { name: "NĀ LEO",   bearing: 337.5,  type: "house",    meaning: "NNW",           color: "#54d1ff" },
    { name: "HAKA",     bearing: 348.75, type: "house",    meaning: "N by W",        color: "#54d1ff" },
  ];

  /* Four horizon wind quadrants */
  const HORIZON_WINDS = [
    { name: "KOʻOLAU",  bearing: 45,  meaning: "NE Horizon Wind", color: "#a78bfa" },
    { name: "MALANAI",  bearing: 135, meaning: "SE Horizon Wind",  color: "#a78bfa" },
    { name: "KONA",     bearing: 225, meaning: "SW Horizon Wind",  color: "#a78bfa" },
    { name: "HOʻOLUA",  bearing: 315, meaning: "NW Horizon Wind",  color: "#a78bfa" },
  ];

  /* ════════════════════════════════════════════════════════════
     STAR DATA — 65 stars with full Hawaiian info
     Built in so no fetch required
  ════════════════════════════════════════════════════════════ */
  const STAR_DB = [
    { id:"Arcturus",   ra:213.92, dec:19.18,  mag:-0.04, con:"Boötes",     h:"Hōkūleʻa",         nav:"ZENITH star of Hawaiʻi (21°N) — passes directly overhead confirming Hawaiian latitude", meaning:"The Star of Joy", house_note:"Rises near MANU-NE; the zenith star of home" },
    { id:"Sirius",     ra:101.29, dec:-16.72, mag:-1.46, con:"Canis Major", h:"Kohu",              nav:"Primary south bearing star; brightest star in the sky", meaning:"The Gleaming / The Misty One", house_note:"Rises NOIO-SE; deep south bearing" },
    { id:"Canopus",    ra:96.0,   dec:-52.7,  mag:-0.72, con:"Carina",      h:"Hōkū-hoʻokele-waʻa",nav:"Primary deep-south latitude star; rises higher as you sail south", meaning:"The Canoe-Steering Star", house_note:"Rises near HEMA-S; southern latitude star" },
    { id:"Capella",    ra:79.17,  dec:45.99,  mag:0.08,  con:"Auriga",      h:"Hōkū-lei",          nav:"Overhead check star for Hawaiian latitude in winter", meaning:"The Crown Star / The Garland Star", house_note:"Rises KOʻOLAU-NE; winter zenith star" },
    { id:"Vega",       ra:279.24, dec:38.78,  mag:0.03,  con:"Lyra",        h:"Humu",              nav:"Summer overhead star; part of Summer Triangle; former pole star", meaning:"The Trigger Fish", house_note:"Rises KOʻOLAU-NE; summer overhead" },
    { id:"Procyon",    ra:114.83, dec:5.23,   mag:0.38,  con:"Canis Minor", h:"Kaelo",             nav:"Winter triangle with Sirius and Betelgeuse; triangulation star", meaning:"The Bailer", house_note:"Rises HIKINA-E; equatorial star" },
    { id:"Altair",     ra:297.7,  dec:8.87,   mag:0.76,  con:"Aquila",      h:"Hōkū-maʻa-2",      nav:"Summer Triangle; nearly on celestial equator; useful equatorial bearing", meaning:"The Wandering Star (second)", house_note:"Rises HIKINA-E; equatorial bearing" },
    { id:"Aldebaran",  ra:68.98,  dec:16.51,  mag:0.87,  con:"Taurus",      h:"Hōkūʻula",          nav:"Red eye of Taurus; winter bearing star; follows the Pleiades", meaning:"The Red Star / The Crimson Star", house_note:"Rises KOʻOLAU-NE; red winter beacon" },
    { id:"Antares",    ra:247.35, dec:-26.43, mag:1.09,  con:"Scorpius",    h:"Kaʻaʻahai",         nav:"South bearing star; summer sentinel; opposite Orion in the sky", meaning:"The Heart of the Scorpion", house_note:"Rises NOIO-SE; summer south marker" },
    { id:"Spica",      ra:201.3,  dec:-11.16, mag:0.97,  con:"Virgo",       h:"Hōkū-keokeo",       nav:"Spring south bearing star; Arc to Arcturus, spike to Spica", meaning:"The White Star", house_note:"Rises NOIO-SE; spring bearing" },
    { id:"Pollux",     ra:116.33, dec:28.03,  mag:1.16,  con:"Gemini",      h:"Nā Pōkea-2",        nav:"Twin bearing stars; winter sky overhead stars", meaning:"The Twin Stars (second)", house_note:"Rises KOʻOLAU-NE; winter twin" },
    { id:"Fomalhaut",  ra:344.41, dec:-29.62, mag:1.17,  con:"Piscis Austrini", h:"Hōkū-ā",        nav:"Autumn south bearing star; bright lone star in southern autumn sky", meaning:"The Autumn Star", house_note:"Rises NOIO-SE; autumn south" },
    { id:"Deneb",      ra:310.36, dec:45.28,  mag:1.25,  con:"Cygnus",      h:"Hōkū-maʻa",         nav:"Summer Triangle; top of Northern Cross; overhead in summer", meaning:"The Wandering Star / The Star Apart", house_note:"Rises KOʻOLAU-NE; summer" },
    { id:"Mimosa",     ra:191.93, dec:-59.69, mag:1.25,  con:"Crux",        h:"Newe-2",             nav:"Southern Cross arm; part of cross-arm for south bearing", meaning:"The Southern Cross (right arm)", house_note:"Rises HEMA-S; Southern Cross" },
    { id:"Acrux",      ra:186.65, dec:-63.1,  mag:0.77,  con:"Crux",        h:"Newe-1",             nav:"Southern Cross foot; long axis points to south celestial pole", meaning:"The Southern Cross (foot)", house_note:"Rises HEMA-S; deep south" },
    { id:"Regulus",    ra:152.09, dec:11.97,  mag:1.35,  con:"Leo",         h:"Hōkū-kīhia",        nav:"Spring bearing star; ecliptic marker; heart of Leo", meaning:"The Stabbing Star", house_note:"Rises HIKINA-E; spring star" },
    { id:"Castor",     ra:113.65, dec:31.89,  mag:1.58,  con:"Gemini",      h:"Nā Pōkea-1",        nav:"Twin bearing stars with Pollux", meaning:"The Twin Stars (first)", house_note:"Rises KOʻOLAU-NE; winter twin" },
    { id:"Elnath",     ra:81.57,  dec:28.61,  mag:1.65,  con:"Taurus",      h:"",                  nav:"Northern horn of Taurus; also part of Auriga pentagon", meaning:"", house_note:"Rises KOʻOLAU-NE" },
    { id:"Alnilam",    ra:84.05,  dec:-1.2,   mag:1.69,  con:"Orion",       h:"Hoʻopuka-2",        nav:"Center of east-west belt trio; extremely reliable east marker", meaning:"The Emerging — center belt star", house_note:"Rises HIKINA-E; east marker" },
    { id:"Alioth",     ra:193.51, dec:55.96,  mag:1.76,  con:"Ursa Major",  h:"Nā Hiku-5",         nav:"Handle start; brightest of the seven", meaning:"The Seven (fifth)", house_note:"Circumpolar from Hawaiʻi" },
    { id:"Dubhe",      ra:165.93, dec:61.75,  mag:1.79,  con:"Ursa Major",  h:"Nā Hiku-1",         nav:"Primary north pointer; line through Dubhe and Merak finds Polaris", meaning:"The Seven (first)", house_note:"Circumpolar; points to north" },
    { id:"Mirfak",     ra:51.08,  dec:49.86,  mag:1.79,  con:"Perseus",     h:"",                  nav:"Perseus autumn/winter reference; north of Pleiades", meaning:"", house_note:"Rises KOʻOLAU-NE; autumn" },
    { id:"Wezen",      ra:107.1,  dec:-26.39, mag:1.83,  con:"Canis Major", h:"",                  nav:"Part of Canis Major body; south reference", meaning:"", house_note:"Rises NOIO-SE; south" },
    { id:"Sargas",     ra:264.33, dec:-43.0,  mag:1.87,  con:"Scorpius",    h:"",                  nav:"Lower Scorpius tail; south reference", meaning:"", house_note:"Rises HEMA-S; deep south" },
    { id:"Alkaid",     ra:206.89, dec:49.31,  mag:1.86,  con:"Ursa Major",  h:"Nā Hiku-7",         nav:"Handle tip; end of the Nā Hiku pattern", meaning:"The Seven (seventh)", house_note:"Circumpolar from Hawaiʻi" },
    { id:"Hadar",      ra:210.96, dec:-60.37, mag:0.61,  con:"Centaurus",   h:"",                  nav:"Southern Pointer pair with Alpha Centauri → points to Southern Cross", meaning:"", house_note:"Rises HEMA-S; Southern Pointer" },
    { id:"Mizar",      ra:200.98, dec:54.93,  mag:2.27,  con:"Ursa Major",  h:"Nā Hiku-6",         nav:"Middle handle star; Mizar/Alcor pair as vision test", meaning:"The Seven (sixth)", house_note:"Circumpolar from Hawaiʻi" },
    { id:"Alcyone",    ra:56.87,  dec:24.11,  mag:2.87,  con:"Taurus",      h:"Ka Makaliʻi",        nav:"New Year marker (heliacal rising = Makahiki season)", meaning:"The Little Eyes / The Tender Eyes", house_note:"Rises KOʻOLAU-NE; marks Makahiki new year" },
    { id:"Kochab",     ra:222.68, dec:74.16,  mag:2.08,  con:"Ursa Minor",  h:"",                  nav:"Former pole star (1500 BCE–500 CE); now guard star to Polaris", meaning:"", house_note:"Circumpolar; near pole" },
    { id:"Polaris",    ra:37.95,  dec:89.26,  mag:2.02,  con:"Ursa Minor",  h:"Hōkūpaʻa",          nav:"True north; altitude above horizon = latitude; most important direction star", meaning:"The Fixed Star / The Immovable Star", house_note:"ʻAKAU — the north pole, never moves" },
    { id:"Algol",      ra:47.04,  dec:40.96,  mag:2.12,  con:"Perseus",     h:"",                  nav:"Part of Perseus; autumn/winter north reference", meaning:"", house_note:"Rises KOʻOLAU-NE; autumn" },
    { id:"Schedar",    ra:10.13,  dec:56.54,  mag:2.24,  con:"Cassiopeia",  h:"",                  nav:"North reference on opposite side of pole from Ursa Major", meaning:"", house_note:"Near circumpolar; north reference" },
    { id:"GammaCas",   ra:14.18,  dec:60.72,  mag:2.47,  con:"Cassiopeia",  h:"",                  nav:"Center of Cassiopeia W; north reference fulcrum", meaning:"", house_note:"Near circumpolar" },
    { id:"Denebola",   ra:177.26, dec:14.57,  mag:2.14,  con:"Leo",         h:"",                  nav:"Lion's tail; east end of Leo", meaning:"", house_note:"Rises HIKINA-E" },
    { id:"Caph",       ra:2.29,   dec:59.15,  mag:2.27,  con:"Cassiopeia",  h:"",                  nav:"North reference; W endpoint of Cassiopeia W", meaning:"", house_note:"Near circumpolar" },
    { id:"Phecda",     ra:178.46, dec:53.69,  mag:2.44,  con:"Ursa Major",  h:"Nā Hiku-3",         nav:"Bowl corner; part of the Nā Hiku asterism", meaning:"The Seven (third)", house_note:"Circumpolar from Hawaiʻi" },
    { id:"Sadr",       ra:305.56, dec:40.26,  mag:2.23,  con:"Cygnus",      h:"",                  nav:"Cross center of Cygnus; Northern Cross arm intersection", meaning:"", house_note:"Rises KOʻOLAU-NE; summer" },
    { id:"Algieba",    ra:154.99, dec:19.84,  mag:2.28,  con:"Leo",         h:"",                  nav:"Leo mane/sickle; part of lion's head", meaning:"", house_note:"Rises HIKINA-E; spring" },
    { id:"Merak",      ra:165.46, dec:56.38,  mag:2.37,  con:"Ursa Major",  h:"Nā Hiku-2",         nav:"North pointer pair with Dubhe; line extended 5x finds Polaris", meaning:"The Seven (second)", house_note:"Circumpolar from Hawaiʻi" },
    { id:"Graffias",   ra:241.36, dec:-19.81, mag:2.62,  con:"Scorpius",    h:"",                  nav:"Head of Scorpius; south reference", meaning:"", house_note:"Rises NOIO-SE; south" },
    { id:"Megrez",     ra:183.86, dec:57.03,  mag:3.32,  con:"Ursa Major",  h:"Nā Hiku-4",         nav:"Pivot point of Nā Hiku between bowl and handle", meaning:"The Seven (fourth) — the pivot", house_note:"Circumpolar from Hawaiʻi" },
    { id:"Ruchbah",    ra:21.45,  dec:60.24,  mag:2.68,  con:"Cassiopeia",  h:"",                  nav:"Part of Cassiopeia W; north reference", meaning:"", house_note:"Near circumpolar" },
    { id:"Mintaka",    ra:83.0,   dec:-0.3,   mag:2.23,  con:"Orion",       h:"Hoʻopuka-3",        nav:"Primary east-west bearing star; rises due east at all latitudes", meaning:"The Emerging — western belt star", house_note:"Rises HIKINA-E; due east" },
    { id:"Alnitak",    ra:85.19,  dec:-1.94,  mag:1.74,  con:"Orion",       h:"Hoʻopuka-1",        nav:"Eastern belt star; points southeast toward Sirius when extended", meaning:"The Emerging — eastern belt star", house_note:"Rises HIKINA-E; east pointer" },
    { id:"Bellatrix",  ra:81.28,  dec:6.35,   mag:1.64,  con:"Orion",       h:"",                  nav:"Part of Orion shoulder pair defining belt direction", meaning:"", house_note:"Rises HIKINA-E" },
    { id:"Saiph",      ra:86.94,  dec:-9.67,  mag:2.06,  con:"Orion",       h:"",                  nav:"Secondary south pointer; part of Orion base pair", meaning:"", house_note:"Rises NOIO-SE" },
    { id:"Rigel",      ra:78.63,  dec:-8.2,   mag:0.18,  con:"Orion",       h:"Puana",             nav:"South bearing star; marks the foot of Orion pointing toward south", meaning:"The Blossom / The Flowering", house_note:"Rises NOIO-SE; south bearing" },
    { id:"Betelgeuse", ra:88.79,  dec:7.41,   mag:0.42,  con:"Orion",       h:"Ke Aliʻi",          nav:"Seasonal marker; bearing star for southward passages", meaning:"The Chief", house_note:"Rises HIKINA-E; autumn herald" },
    { id:"Adhara",     ra:104.66, dec:-28.97, mag:1.5,   con:"Canis Major", h:"",                  nav:"Deep south bearing; part of dog's hind legs", meaning:"", house_note:"Rises NOIO-SE; deep south" },
    { id:"Alpheratz",  ra:2.1,    dec:29.09,  mag:2.07,  con:"Andromeda",   h:"",                  nav:"Corner of Great Square of Pegasus; autumn sky reference", meaning:"", house_note:"Rises KOʻOLAU-NE; autumn" },
    { id:"Mirach",     ra:17.43,  dec:35.62,  mag:2.07,  con:"Andromeda",   h:"",                  nav:"Andromeda chain; autumn sky reference", meaning:"", house_note:"Rises KOʻOLAU-NE" },
    { id:"Hamal",      ra:31.79,  dec:23.46,  mag:2.0,   con:"Aries",       h:"",                  nav:"Autumn sky reference; historical equinox marker", meaning:"", house_note:"Rises KOʻOLAU-NE" },
    { id:"Markab",     ra:346.19, dec:15.21,  mag:2.49,  con:"Pegasus",     h:"",                  nav:"Great Square corner; autumn sky reference", meaning:"", house_note:"Rises HIKINA-E; autumn" },
    { id:"Scheat",     ra:345.94, dec:28.08,  mag:2.44,  con:"Pegasus",     h:"",                  nav:"Great Square corner", meaning:"", house_note:"Rises KOʻOLAU-NE" },
    { id:"Algenib",    ra:3.31,   dec:15.18,  mag:2.83,  con:"Pegasus",     h:"",                  nav:"Great Square corner; southeast reference", meaning:"", house_note:"Rises HIKINA-E" },
    { id:"AlbireoA",   ra:292.68, dec:27.96,  mag:3.18,  con:"Cygnus",      h:"",                  nav:"Base of Northern Cross; beak of Cygnus", meaning:"", house_note:"Rises KOʻOLAU-NE; summer" },
    { id:"Gienah",     ra:311.55, dec:33.97,  mag:2.46,  con:"Cygnus",      h:"",                  nav:"Cross-arm of Northern Cross; wing reference", meaning:"", house_note:"Rises KOʻOLAU-NE" },
    { id:"Dschubba",   ra:240.08, dec:-22.62, mag:2.32,  con:"Scorpius",    h:"",                  nav:"Scorpius head; south reference", meaning:"", house_note:"Rises NOIO-SE; south" },
    { id:"Shaula",     ra:263.4,  dec:-37.1,  mag:1.62,  con:"Scorpius",    h:"Nā Kā-1",           nav:"Deep south bearing; tail tip of Scorpius; lowest visible south star from Hawaiʻi", meaning:"The Stingers (first)", house_note:"Rises HEMA-S; deep south stinger" },
    { id:"Lesath",     ra:264.33, dec:-37.3,  mag:2.69,  con:"Scorpius",    h:"Nā Kā-2",           nav:"Deep south bearing pair with Shaula", meaning:"The Stingers (second)", house_note:"Rises HEMA-S; deep south stinger" },
    { id:"EtaLeo",     ra:149.47, dec:16.76,  mag:3.48,  con:"Leo",         h:"",                  nav:"Sickle tip of Leo", meaning:"", house_note:"Rises HIKINA-E" },
    { id:"Gacrux",     ra:187.79, dec:-57.11, mag:1.63,  con:"Crux",        h:"Newe-3",            nav:"Southern Cross top; head of the long axis pointing to south pole", meaning:"The Southern Cross (head)", house_note:"Rises HEMA-S; Southern Cross" },
    { id:"Imai",       ra:183.79, dec:-58.75, mag:2.79,  con:"Crux",        h:"Newe-4",            nav:"Southern Cross second arm; completes the cross pattern", meaning:"The Southern Cross (left arm)", house_note:"Rises HEMA-S; Southern Cross" },
    { id:"RigilKent",  ra:219.92, dec:-60.83, mag:-0.01, con:"Centaurus",   h:"Māhoe-hope",        nav:"Southern Pointer — with Hadar, points to Southern Cross", meaning:"The After Twin / The Following Twin", house_note:"Rises HEMA-S; nearest star system" },
    { id:"Segin",      ra:28.6,   dec:63.67,  mag:3.35,  con:"Cassiopeia",  h:"",                  nav:"End of Cassiopeia W", meaning:"", house_note:"Near circumpolar" },
  ];

  /* ════════════════════════════════════════════════════════════
     COMPUTE RISING AZIMUTH for a star at Hawaiʻi (lat 21°N)
     Returns bearing in degrees (0=N, 90=E, 180=S, 270=W)
     Returns null if star is circumpolar or never rises
  ════════════════════════════════════════════════════════════ */
  function risingAzimuth (decDeg) {
    const dec = decDeg * Math.PI / 180;
    const lat = HAW_LAT_RAD;
    // cos(A) = -sin(dec) / cos(lat)
    const cosA = -Math.sin(dec) / Math.cos(lat);
    if (Math.abs(cosA) > 1) return null; // circumpolar or never rises
    const az = Math.acos(cosA) * 180 / Math.PI;
    return az; // rising azimuth (E hemisphere = 0-180)
  }

  /* Get the compass house name for a given azimuth bearing */
  function houseForBearing (bearing) {
    // Normalize to 0-360
    const b = ((bearing % 360) + 360) % 360;
    let closest = COMPASS_HOUSES[0], minDiff = 360;
    COMPASS_HOUSES.forEach(h => {
      const diff = Math.min(
        Math.abs(h.bearing - b),
        360 - Math.abs(h.bearing - b)
      );
      if (diff < minDiff) { minDiff = diff; closest = h; }
    });
    return closest;
  }

  /* Build rising/setting info for each star */
  STAR_DB.forEach(star => {
    const az = risingAzimuth(star.dec);
    if (az === null) {
      star.rising_az  = null;
      star.setting_az = null;
      star.rising_house  = star.dec > 0 ? "Circumpolar — never sets (northern sky)" : "Never rises from Hawaiʻi";
      star.setting_house = "";
    } else {
      star.rising_az     = az;                // NE quadrant
      star.setting_az    = 360 - az;          // NW quadrant
      star.rising_house  = houseForBearing(az).name + " (" + houseForBearing(az).meaning + ")";
      star.setting_house = houseForBearing(360 - az).name + " (" + houseForBearing(360 - az).meaning + ")";
    }
  });

  /* Merge with window._starData if available (adds moʻolelo etc.) */
  function mergeWithStarData () {
    const rich = window._starData;
    if (!rich) return;
    STAR_DB.forEach(s => {
      const r = rich.find(x => x.id === s.id);
      if (!r) return;
      s.moolelo = r.moolelo || '';
      s.cultural_notes = r.cultural_notes || {};
      s.distance_ly    = r.distance_ly;
      s.type           = r.type;
      s.spectral_type  = r.spectral_type;
      if (!s.h && r.hawaiian_name) s.h = r.hawaiian_name;
      if (!s.meaning && r.hawaiian_meaning) s.meaning = r.hawaiian_meaning;
      if (!s.nav && r.navigation_use) s.nav = r.navigation_use;
    });
  }

  /* ════════════════════════════════════════════════════════════
     STAR INFO PANEL — enhanced with all data
  ════════════════════════════════════════════════════════════ */
  let _activePanel = null;
  let _activeStar  = null;

  function showStarPanel (star) {
    _activeStar = star.id;
    let panel = document.getElementById('cw-hsc-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'cw-hsc-panel';
      panel.style.cssText = `
        position:fixed; top:0; right:-420px; width:min(400px,100vw);
        height:100vh; z-index:15000;
        background:rgba(2,5,18,.97);
        border-left:1px solid rgba(0,247,255,.18);
        backdrop-filter:blur(24px);
        box-shadow:-12px 0 48px rgba(0,0,0,.7);
        overflow-y:auto; overflow-x:hidden;
        transition:right .3s cubic-bezier(.4,0,.2,1);
        scrollbar-width:thin;
        scrollbar-color:rgba(0,247,255,.25) transparent;
        font-family:'Exo 2',sans-serif;
      `;
      document.body.appendChild(panel);
    }
    _activePanel = panel;

    const isHok = star.id === 'Arcturus';
    const riseHouse = houseForBearing(star.rising_az ?? 0);
    const setHouse  = houseForBearing(star.setting_az ?? 0);
    const dist = star.distance_ly ? `${star.distance_ly.toLocaleString()} light years` : '';

    // Build cultural notes html
    const culturalKeys = star.cultural_notes ? Object.keys(star.cultural_notes).filter(k => k !== 'note' && star.cultural_notes[k]) : [];
    const noteText = star.cultural_notes?.note || '';

    const culturalHtml = culturalKeys.length ? `
      <div class="hsc-section">
        <div class="hsc-label"><i class="fas fa-globe"></i> Across Traditions</div>
        ${culturalKeys.map(k => `
          <div class="hsc-trad">
            <span class="hsc-trad-name">${k}</span>
            <span class="hsc-trad-text">${esc(star.cultural_notes[k])}</span>
          </div>`).join('')}
      </div>` : '';

    const compassHtml = star.rising_az !== null ? `
      <div class="hsc-compass-row">
        <div class="hsc-compass-dir">
          <div class="hsc-dir-label">RISES</div>
          <div class="hsc-dir-house" style="color:${riseHouse.color};">${riseHouse.name}</div>
          <div class="hsc-dir-deg">${star.rising_az.toFixed(1)}° · ${riseHouse.meaning}</div>
        </div>
        <div class="hsc-compass-arc">⟶</div>
        <div class="hsc-compass-dir">
          <div class="hsc-dir-label">SETS</div>
          <div class="hsc-dir-house" style="color:${setHouse.color};">${setHouse.name}</div>
          <div class="hsc-dir-deg">${star.setting_az.toFixed(1)}° · ${setHouse.meaning}</div>
        </div>
      </div>` : `
      <div class="hsc-compass-row">
        <div class="hsc-dir-house" style="color:#9d00ff;text-align:center;width:100%;">
          ${star.dec > 0 ? 'ʻAKAU — Circumpolar from Hawaiʻi' : 'Below horizon from Hawaiʻi'}
        </div>
      </div>`;

    panel.innerHTML = `
      <style>
        #cw-hsc-panel .hsc-inner { padding:24px 20px; display:flex; flex-direction:column; gap:16px; }
        #cw-hsc-panel .hsc-close {
          position:absolute; top:16px; right:16px; width:34px; height:34px;
          display:flex; align-items:center; justify-content:center;
          border-radius:9px; border:1px solid rgba(255,255,255,.12);
          background:rgba(255,255,255,.05); color:rgba(255,255,255,.7);
          cursor:pointer; font-size:.9rem;
        }
        #cw-hsc-panel .hsc-close:hover { background:rgba(255,60,60,.15); color:#fff; }
        #cw-hsc-panel .hsc-head { display:flex; align-items:center; gap:16px; padding-top:8px; }
        #cw-hsc-panel .hsc-star-glow {
          width:60px; height:60px; border-radius:50%; flex-shrink:0;
          display:flex; align-items:center; justify-content:center;
          background:radial-gradient(circle,${isHok?'rgba(255,215,0,.2)':'rgba(0,247,255,.15)'} 0%,transparent 70%);
        }
        #cw-hsc-panel .hsc-star-dot {
          width:18px; height:18px; border-radius:50%;
          background:${isHok?'#ffd700':'#a0c8f0'};
          box-shadow:0 0 16px 6px ${isHok?'rgba(255,215,0,.6)':'rgba(0,200,255,.5)'};
        }
        #cw-hsc-panel .hsc-names { flex:1; min-width:0; }
        #cw-hsc-panel .hsc-hawaiian {
          font-family:'Orbitron',monospace; font-size:1.05rem; font-weight:700;
          letter-spacing:.06em;
          color:${isHok?'#ffd700':'rgba(0,247,255,.95)'};
          text-shadow:0 0 20px ${isHok?'rgba(255,215,0,.6)':'rgba(0,247,255,.4)'};
          margin-bottom:4px;
        }
        #cw-hsc-panel .hsc-meaning { font-size:.78rem; color:rgba(255,215,0,.55); font-style:italic; margin-bottom:4px; }
        #cw-hsc-panel .hsc-western { font-size:.9rem; color:rgba(255,255,255,.85); display:flex; align-items:center; gap:8px; }
        #cw-hsc-panel .hsc-con {
          font-size:.7rem; letter-spacing:.08em; text-transform:uppercase;
          color:rgba(0,247,255,.5); background:rgba(0,247,255,.08);
          border:1px solid rgba(0,247,255,.15); border-radius:4px; padding:1px 6px;
        }
        #cw-hsc-panel .hsc-stats { display:flex; flex-wrap:wrap; gap:7px; }
        #cw-hsc-panel .hsc-stat {
          display:inline-flex; align-items:center; gap:5px; font-size:.74rem;
          color:rgba(0,247,255,.65); background:rgba(0,247,255,.07);
          border:1px solid rgba(0,247,255,.12); border-radius:6px; padding:3px 9px;
        }
        #cw-hsc-panel .hsc-nav {
          display:flex; align-items:flex-start; gap:8px; padding:10px 12px;
          border-radius:10px; background:rgba(255,215,0,.06);
          border:1px solid rgba(255,215,0,.15); font-size:.82rem;
          color:rgba(255,215,0,.85); line-height:1.5;
        }
        #cw-hsc-panel .hsc-nav i { color:rgba(255,215,0,.5); flex-shrink:0; margin-top:2px; }
        #cw-hsc-panel .hsc-moolelo {
          font-size:.83rem; line-height:1.7; color:rgba(255,255,255,.75);
          border-left:2px solid rgba(0,247,255,.25); padding-left:12px; font-style:italic;
        }
        #cw-hsc-panel .hsc-compass-row {
          display:flex; align-items:center; gap:12px;
          padding:14px; border-radius:12px;
          background:rgba(0,247,255,.04); border:1px solid rgba(0,247,255,.12);
        }
        #cw-hsc-panel .hsc-compass-dir { flex:1; text-align:center; }
        #cw-hsc-panel .hsc-dir-label {
          font-family:'Orbitron',monospace; font-size:.6rem; letter-spacing:.12em;
          color:rgba(255,255,255,.3); margin-bottom:4px;
        }
        #cw-hsc-panel .hsc-dir-house {
          font-family:'Orbitron',monospace; font-size:.95rem; font-weight:700;
          letter-spacing:.05em;
          text-shadow:0 0 16px currentColor;
          margin-bottom:3px;
        }
        #cw-hsc-panel .hsc-dir-deg { font-size:.7rem; color:rgba(255,255,255,.35); }
        #cw-hsc-panel .hsc-compass-arc { font-size:1.4rem; color:rgba(0,247,255,.3); }
        #cw-hsc-panel .hsc-section { display:flex; flex-direction:column; gap:8px; }
        #cw-hsc-panel .hsc-label {
          font-family:'Orbitron',monospace; font-size:.65rem; font-weight:600;
          letter-spacing:.12em; text-transform:uppercase; color:rgba(0,247,255,.45);
          border-bottom:1px solid rgba(0,247,255,.1); padding-bottom:5px;
          display:flex; align-items:center; gap:6px;
        }
        #cw-hsc-panel .hsc-trad { display:flex; gap:8px; align-items:flex-start; padding:4px 0; }
        #cw-hsc-panel .hsc-trad-name {
          width:88px; flex-shrink:0; font-size:.7rem; font-weight:600;
          text-transform:capitalize; letter-spacing:.04em; color:rgba(0,247,255,.6);
        }
        #cw-hsc-panel .hsc-trad-text { font-size:.8rem; color:rgba(255,255,255,.65); line-height:1.45; }
        #cw-hsc-panel .hsc-note {
          font-size:.75rem; color:rgba(255,255,255,.4); font-style:italic; line-height:1.5;
          padding:8px 12px; border-radius:8px; background:rgba(255,255,255,.03);
          border:1px solid rgba(255,255,255,.07);
        }
      </style>
      <div class="hsc-inner">
        <button class="hsc-close" onclick="document.getElementById('cw-hsc-panel').style.right='-420px'"><i class="fas fa-times"></i></button>

        <div class="hsc-head">
          <div class="hsc-star-glow"><div class="hsc-star-dot"></div></div>
          <div class="hsc-names">
            ${star.h ? `<div class="hsc-hawaiian">${esc(star.h)}</div>` : ''}
            ${star.meaning ? `<div class="hsc-meaning">${esc(star.meaning)}</div>` : ''}
            <div class="hsc-western">
              ${esc(star.id)}
              <span class="hsc-con">${esc(star.con)}</span>
            </div>
          </div>
        </div>

        <div class="hsc-stats">
          <span class="hsc-stat"><i class="fas fa-circle-dot"></i> Mag ${star.mag.toFixed(2)}</span>
          ${dist ? `<span class="hsc-stat"><i class="fas fa-ruler-horizontal"></i> ${dist}</span>` : ''}
          ${star.type ? `<span class="hsc-stat"><i class="fas fa-star"></i> ${esc(star.type)}</span>` : ''}
          ${star.spectral_type ? `<span class="hsc-stat">${esc(star.spectral_type)}</span>` : ''}
        </div>

        ${compassHtml}

        ${star.nav ? `<div class="hsc-nav"><i class="fas fa-compass"></i>${esc(star.nav)}</div>` : ''}

        ${star.moolelo ? `
          <div class="hsc-section">
            <div class="hsc-label"><i class="fas fa-scroll"></i> Moʻolelo</div>
            <div class="hsc-moolelo">${esc(star.moolelo)}</div>
          </div>` : ''}

        ${culturalHtml}
        ${noteText ? `<div class="hsc-note"><i class="fas fa-circle-info"></i> ${esc(noteText)}</div>` : ''}
      </div>`;

    setTimeout(() => { panel.style.right = '0'; }, 30);
  }

  function esc (s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ════════════════════════════════════════════════════════════
     GET CAMERA HEADING — angle from camera position to north
  ════════════════════════════════════════════════════════════ */
  function getCameraHeading (camera) {
    if (!camera || !window.THREE) return 0;
    const p = camera.position;
    // Azimuth of camera around the Y axis (the globe's "longitude")
    // Returns 0 when camera is on the +Z axis, 90 when on +X, etc.
    return (Math.atan2(p.x, p.z) * 180 / Math.PI + 360) % 360;
  }

  /* ════════════════════════════════════════════════════════════
     DRAW THE COMPASS ROSE — SVG ring with 32 houses
  ════════════════════════════════════════════════════════════ */
  /* ══ ʻIWA FRIGATEBIRD moʻolelo ══════════════════════════════ */
  const IWA_MOOLELO = {
    name: "ʻIwa",
    meaning: "Frigatebird / Thief",
    significance: "The ʻIwa — the frigatebird — is the master navigator's compass made flesh. Hawaiian voyagers called it ʻiwa, meaning 'thief,' because it steals fish from other seabirds in flight. But to the navigator, the ʻiwa was something far more sacred: a living landmark in the open ocean.",
    navigation: [
      "The ʻiwa never lands on the water — it cannot swim and its feathers are not waterproofed. When a navigator spots ʻiwa in the open ocean, land is within 60 miles.",
      "ʻIwa always fly toward land at sunset to roost. Watching which direction they fly at dusk gives the navigator a bearing toward the nearest island.",
      "When ʻiwa circle high on thermals above the sea, they mark the edge of a reef or shallow bank — even one not visible. The birds know where the fish are, and the fish know where the reef is.",
      "A large flock of ʻiwa flying in formation, all heading the same direction, is one of the strongest land-finding signs available to a navigator far from shore.",
    ],
    ecology: "The ʻiwa (Fregata minor, Great Frigatebird) has the largest wingspan-to-body-weight ratio of any bird — perfectly adapted for soaring on thermals without flapping for hours. The male inflates a brilliant red throat pouch during mating season. They range up to 400km from shore in search of food, but always return to land each night.",
    symbol: "In the Hōkūleʻa tradition, the ʻiwa represents the union of celestial navigation and nature reading — the complete voyager uses both stars and living signs. The bird at the center of Nainoa's star compass is not decoration. It is a reminder that the ocean is alive, and that navigation is a conversation with that life.",
    cultural: "The ʻiwa appears in Hawaiian mele (chants) as a symbol of grace, mastery, and the ability to move between worlds — the sky above and the ocean below. For Nainoa Thompson, the ʻiwa placed at the heart of the compass honors the bird that helped the first Hawaiians find their islands across 2,400 miles of open Pacific."
  };

  function showIwaMoolelo () {
    const existing = document.getElementById('cw-iwa-modal');
    if (existing) { existing.remove(); return; }

    const modal = document.createElement('div');
    modal.id = 'cw-iwa-modal';
    modal.style.cssText = `
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      z-index:20000; width:min(500px,96vw); max-height:85vh; overflow-y:auto;
      background:rgba(2,5,18,.98); border:1px solid rgba(0,247,255,.2);
      border-radius:20px; padding:0;
      box-shadow:0 24px 80px rgba(0,0,0,.85), 0 0 60px rgba(0,247,255,.06);
      font-family:'Exo 2',sans-serif; scrollbar-width:thin;
      scrollbar-color:rgba(0,247,255,.2) transparent;
    `;

    modal.innerHTML = `
      <div style="position:relative;">
        <!-- Header with bird silhouette -->
        <div style="padding:28px 28px 20px;border-bottom:1px solid rgba(0,247,255,.1);
                    background:linear-gradient(180deg,rgba(0,247,255,.05),transparent);
                    display:flex;align-items:center;gap:20px;">
          <!-- SVG frigatebird -->
          <svg viewBox="0 0 120 80" width="90" height="60" style="flex-shrink:0;filter:drop-shadow(0 0 12px rgba(0,247,255,.5));">
            <g fill="rgba(0,247,255,.85)" stroke="none">
              <!-- Body -->
              <ellipse cx="60" cy="42" rx="22" ry="10"/>
              <!-- Head -->
              <ellipse cx="82" cy="34" rx="10" ry="8"/>
              <!-- Beak (hooked) -->
              <path d="M 90,32 Q 102,30 104,34 Q 102,36 94,36 Z"/>
              <!-- Tail (forked — distinctive frigatebird feature) -->
              <path d="M 40,44 Q 20,55 8,70 Q 15,58 22,52"/>
              <path d="M 40,44 Q 22,48 6,54 Q 14,46 22,44"/>
              <!-- Left wing (spread) -->
              <path d="M 58,38 Q 30,20 4,28 Q 15,24 30,28 Q 44,30 58,40"/>
              <path d="M 58,38 Q 40,16 12,10 Q 26,14 42,22 Q 52,28 58,38"/>
              <!-- Right wing (spread) -->
              <path d="M 62,38 Q 88,22 116,28 Q 104,24 90,28 Q 76,30 62,40"/>
              <path d="M 62,38 Q 82,16 108,10 Q 96,14 80,22 Q 68,28 62,38"/>
              <!-- Throat pouch (male) -->
              <ellipse cx="82" cy="40" rx="6" ry="5" fill="rgba(255,50,50,.4)" stroke="rgba(255,100,100,.3)" stroke-width="0.8"/>
            </g>
          </svg>
          <div>
            <div style="font-family:Orbitron,monospace;font-size:1.3rem;font-weight:700;
                        letter-spacing:.08em;color:rgba(0,247,255,.95);
                        text-shadow:0 0 24px rgba(0,247,255,.6);margin-bottom:4px;">ʻIWA</div>
            <div style="font-size:.8rem;color:rgba(255,215,0,.6);font-style:italic;margin-bottom:2px;">${IWA_MOOLELO.meaning}</div>
            <div style="font-size:.72rem;color:rgba(255,255,255,.3);font-family:Orbitron,monospace;letter-spacing:.06em;">
              Fregata minor · Great Frigatebird
            </div>
          </div>
          <button onclick="this.closest('#cw-iwa-modal').remove()" style="
            position:absolute;top:16px;right:16px;width:34px;height:34px;
            border-radius:9px;border:1px solid rgba(255,255,255,.12);
            background:rgba(255,255,255,.05);color:rgba(255,255,255,.7);
            cursor:pointer;display:flex;align-items:center;justify-content:center;
            font-size:.85rem;">✕</button>
        </div>

        <div style="padding:22px 28px;display:flex;flex-direction:column;gap:18px;">

          <!-- Significance -->
          <p style="font-size:.88rem;line-height:1.75;color:rgba(255,255,255,.78);
                    border-left:3px solid rgba(0,247,255,.3);padding-left:14px;
                    font-style:italic;">
            ${IWA_MOOLELO.significance}
          </p>

          <!-- Navigation Signs -->
          <div>
            <div style="font-family:Orbitron,monospace;font-size:.68rem;font-weight:700;
                        letter-spacing:.14em;text-transform:uppercase;
                        color:rgba(0,247,255,.5);margin-bottom:12px;
                        display:flex;align-items:center;gap:8px;">
              <i class="fas fa-compass"></i> How Navigators Read the ʻIwa
            </div>
            ${IWA_MOOLELO.navigation.map((n, i) => `
              <div style="display:flex;gap:12px;margin-bottom:10px;
                          padding:10px 12px;border-radius:10px;
                          background:rgba(0,247,255,.04);
                          border:1px solid rgba(0,247,255,.08);">
                <div style="font-family:Orbitron,monospace;font-size:.7rem;
                            color:rgba(0,247,255,.4);flex-shrink:0;
                            margin-top:2px;width:18px;text-align:center;">
                  ${i + 1}
                </div>
                <div style="font-size:.82rem;line-height:1.6;color:rgba(255,255,255,.72);">${n}</div>
              </div>`).join('')}
          </div>

          <!-- Ecology -->
          <div style="padding:14px;border-radius:12px;
                      background:rgba(255,215,0,.04);border:1px solid rgba(255,215,0,.1);">
            <div style="font-family:Orbitron,monospace;font-size:.65rem;letter-spacing:.12em;
                        color:rgba(255,215,0,.5);margin-bottom:8px;text-transform:uppercase;">
              <i class="fas fa-feather"></i> The Bird Itself
            </div>
            <p style="font-size:.82rem;line-height:1.65;color:rgba(255,255,255,.68);">
              ${IWA_MOOLELO.ecology}
            </p>
          </div>

          <!-- Symbol -->
          <div style="padding:14px;border-radius:12px;
                      background:rgba(157,0,255,.05);border:1px solid rgba(157,0,255,.15);">
            <div style="font-family:Orbitron,monospace;font-size:.65rem;letter-spacing:.12em;
                        color:rgba(157,0,255,.6);margin-bottom:8px;text-transform:uppercase;">
              <i class="fas fa-star"></i> The Bird at the Center
            </div>
            <p style="font-size:.82rem;line-height:1.65;color:rgba(255,255,255,.68);">
              ${IWA_MOOLELO.symbol}
            </p>
          </div>

          <!-- Cultural -->
          <div style="padding:14px;border-radius:12px;
                      background:rgba(60,179,113,.04);border:1px solid rgba(60,179,113,.12);">
            <div style="font-family:Orbitron,monospace;font-size:.65rem;letter-spacing:.12em;
                        color:rgba(60,179,113,.6);margin-bottom:8px;text-transform:uppercase;">
              <i class="fas fa-scroll"></i> Moʻolelo
            </div>
            <p style="font-size:.82rem;line-height:1.65;color:rgba(255,255,255,.68);">
              ${IWA_MOOLELO.cultural}
            </p>
          </div>

        </div>
      </div>`;

    document.body.appendChild(modal);
    // Close on backdrop click outside modal content
    setTimeout(() => {
      document.addEventListener('click', function closeOnOutside(e) {
        if (!modal.contains(e.target)) {
          modal.remove();
          document.removeEventListener('click', closeOnOutside);
        }
      });
    }, 100);
  }

  function drawCompassRose (svg, W, H, cameraHeading) {
    const cx = W / 2, cy = H / 2;
    const outerR   = Math.min(W, H) * 0.47;
    const innerR   = outerR * 0.76;
    const spokeR   = outerR * 0.94; // where spoke labels end (inside outer ring)
    const birdR    = outerR * 0.22; // frigatebird hitzone radius

    const E = (tag, attrs, text) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, v));
      if (text != null) el.textContent = text;
      return el;
    };

    const compassG = E('g', { class: 'cw-compass-rose' });
    compassG.setAttribute('transform', `translate(${cx},${cy}) rotate(${-cameraHeading})`);

    /* ── Rings ── */
    compassG.appendChild(E('circle', { cx:0, cy:0, r: outerR, fill:'none',
      stroke:'rgba(0,247,255,.4)', 'stroke-width':'1.8' }));
    compassG.appendChild(E('circle', { cx:0, cy:0, r: outerR * 0.975, fill:'none',
      stroke:'rgba(0,247,255,.1)', 'stroke-width':'0.6' }));
    compassG.appendChild(E('circle', { cx:0, cy:0, r: innerR, fill:'none',
      stroke:'rgba(255,215,0,.18)', 'stroke-width':'0.8' }));
    compassG.appendChild(E('circle', { cx:0, cy:0, r: innerR * 0.96, fill:'none',
      stroke:'rgba(255,215,0,.06)', 'stroke-width':'0.4' }));

    /* ── All 32 houses — tick + BOTH outer label AND inner radial spoke label ── */
    COMPASS_HOUSES.forEach((house, idx) => {
      const rad = (house.bearing - 90) * Math.PI / 180;
      const isCardinal      = house.type === 'cardinal';
      const isIntercardinal = house.type === 'intercardinal';

      /* Tick mark on outer ring */
      const tickLen = isCardinal ? outerR * 0.13 : isIntercardinal ? outerR * 0.08 : outerR * 0.055;
      compassG.appendChild(E('line', {
        x1: outerR * Math.cos(rad),       y1: outerR * Math.sin(rad),
        x2: (outerR - tickLen) * Math.cos(rad), y2: (outerR - tickLen) * Math.sin(rad),
        stroke: house.color,
        'stroke-width': isCardinal ? '2.8' : isIntercardinal ? '2' : '1',
        'stroke-linecap': 'round',
        opacity: isCardinal ? '1' : isIntercardinal ? '0.9' : '0.65',
      }));

      /* ── OUTER label (outside ring) — house name ── */
      const outerLabelR = outerR + (isCardinal ? 26 : isIntercardinal ? 20 : 15);
      const olx = outerLabelR * Math.cos(rad);
      const oly = outerLabelR * Math.sin(rad);

      const outerLabel = E('text', {
        x: olx, y: oly,
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        fill: house.color,
        'font-size': isCardinal ? '11' : isIntercardinal ? '9' : '7.5',
        'font-family': 'Orbitron,monospace',
        'font-weight': isCardinal ? '700' : isIntercardinal ? '600' : '500',
        'letter-spacing': '.07em',
        transform: `rotate(${house.bearing}, ${olx}, ${oly})`,
        filter: isCardinal
          ? `drop-shadow(0 0 8px ${house.color})`
          : isIntercardinal ? `drop-shadow(0 0 5px ${house.color})` : 'none',
        opacity: isCardinal ? '1' : '0.88',
      }, house.name);
      compassG.appendChild(outerLabel);

      /* Cardinal bearing sub-label outside */
      if (isCardinal) {
        const slx = (outerLabelR + 12) * Math.cos(rad);
        const sly = (outerLabelR + 12) * Math.sin(rad);
        compassG.appendChild(E('text', {
          x: slx, y: sly,
          'text-anchor': 'middle', 'dominant-baseline': 'middle',
          fill: 'rgba(255,255,255,.32)', 'font-size': '7',
          'font-family': 'Orbitron,monospace',
          transform: `rotate(${house.bearing}, ${slx}, ${sly})`,
        }, house.meaning));
      }

      /* ── INNER radial spoke label — radiates from inner ring toward center ──
         This recreates the radial text spokes visible in the compass image.
         Text sits between innerR and innerR*0.45, rotated along the spoke.
      ── */
      const spokeMidR = innerR * 0.68;
      const slx = spokeMidR * Math.cos(rad);
      const sly = spokeMidR * Math.sin(rad);

      // Rotate text so it reads along the spoke (outward from center)
      // Flip text on left side so it reads correctly
      const textAngle = house.bearing <= 180 ? house.bearing : house.bearing - 180;
      const flip      = house.bearing > 180 ? 'scale(-1,-1)' : '';

      // Degree label for ALL houses on inner spoke
      const degStr = `${house.bearing.toFixed(2)}°`;
      const spokeLabel = E('text', {
        x: 0, y: 0,
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        fill: isCardinal ? house.color : isIntercardinal ? `${house.color}cc` : `${house.color}88`,
        'font-size': isCardinal ? '8' : isIntercardinal ? '7' : '6',
        'font-family': 'Orbitron,monospace',
        'font-weight': isCardinal ? '700' : '500',
        'letter-spacing': '.06em',
        filter: isCardinal ? `drop-shadow(0 0 6px ${house.color})` : 'none',
        transform: `translate(${slx},${sly}) rotate(${textAngle + 90}) ${flip}`,
        'pointer-events': 'none',
      }, `${house.name} · ${house.meaning}`);
      compassG.appendChild(spokeLabel);

      /* Spoke line from inner ring inward */
      const spokeInnerR = innerR * 0.38;
      const alpha = isCardinal ? '0.5' : isIntercardinal ? '0.3' : '0.15';
      compassG.appendChild(E('line', {
        x1: innerR * Math.cos(rad),       y1: innerR * Math.sin(rad),
        x2: spokeInnerR * Math.cos(rad),  y2: spokeInnerR * Math.sin(rad),
        stroke: house.color,
        'stroke-width': isCardinal ? '0.9' : isIntercardinal ? '0.6' : '0.4',
        'stroke-dasharray': isCardinal ? '3 4' : '2 5',
        opacity: alpha,
        'pointer-events': 'none',
      }));
    });

    /* ── Four horizon wind labels (outside outerR) ── */
    HORIZON_WINDS.forEach(wind => {
      const rad = (wind.bearing - 90) * Math.PI / 180;
      const lr  = outerR + 55;
      const lx  = lr * Math.cos(rad), ly = lr * Math.sin(rad);

      compassG.appendChild(E('text', {
        x: lx, y: ly, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        fill: 'rgba(167,139,250,.72)',
        'font-size': '8.5', 'font-family': 'Orbitron,monospace', 'font-weight': '700',
        'letter-spacing': '.1em',
        transform: `rotate(${wind.bearing}, ${lx}, ${ly})`,
        filter: 'drop-shadow(0 0 6px rgba(167,139,250,.5))',
      }, wind.name));

      compassG.appendChild(E('text', {
        x: (lr + 11) * Math.cos(rad), y: (lr + 11) * Math.sin(rad),
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        fill: 'rgba(167,139,250,.35)', 'font-size': '6.5',
        'font-family': 'Orbitron,monospace',
        transform: `rotate(${wind.bearing}, ${(lr+11)*Math.cos(rad)}, ${(lr+11)*Math.sin(rad)})`,
      }, wind.meaning));
    });

    /* ── North arrow ── */
    const arrowTip = outerR - 16;
    compassG.appendChild(E('path', {
      d: `M 0,-${arrowTip} L -7,-${arrowTip - 22} L 0,-${arrowTip - 9} L 7,-${arrowTip - 22} Z`,
      fill: '#00f7ff',
      filter: 'drop-shadow(0 0 10px rgba(0,247,255,.9))',
    }));

    svg.appendChild(compassG);

    /* ── ʻIWA glow halo only — bird lives in HTML layer (ensureIwaBird) ── */
    const iwaGlowG = E('g', { transform: `translate(${cx},${cy})`, 'pointer-events':'none' });
    iwaGlowG.appendChild(E('circle', { cx:'0', cy:'0', r: String(birdR * 1.6),
      fill:'none', stroke:'rgba(0,247,255,.07)', 'stroke-width':'1.5' }));
    iwaGlowG.appendChild(E('circle', { cx:'0', cy:'0', r: String(birdR * 0.95),
      fill:'none', stroke:'rgba(0,247,255,.04)', 'stroke-width':'0.7' }));
    svg.appendChild(iwaGlowG);
  }

  /* ════════════════════════════════════════════════════════════
     DRAW STARS — enhanced with glow, Hawaiian labels, compass house
  ════════════════════════════════════════════════════════════ */
  function drawEnhancedStars (svg, globe, W, H) {
    if (!globe?.camera) return;
    const THREE = window.THREE;
    if (!THREE) return;

    function project (ra, dec) {
      const phi   = dec * Math.PI / 180;
      const lam   = ra  * Math.PI / 180;
      const v = new THREE.Vector3(
        50 * Math.cos(phi) * Math.cos(lam),
        50 * Math.sin(phi),
        50 * Math.cos(phi) * Math.sin(lam)
      );
      v.project(globe.camera);
      return {
        x: (v.x * 0.5 + 0.5) * W,
        y: (-v.y * 0.5 + 0.5) * H,
        inFront: v.z < 1.0,
      };
    }

    const E = (tag, attrs, text) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k,v));
      if (text != null) el.textContent = text;
      return el;
    };

    const cx = W / 2, cy = H / 2;

    STAR_DB.forEach(star => {
      const pos = project(star.ra, star.dec);
      if (!pos.inFront) return;

      // Clip stars inside the compass ring
      const dist = Math.hypot(pos.x - cx, pos.y - cy);
      const maxR = Math.min(W, H) * 0.44;
      if (dist > maxR) return;

      const isHok    = star.id === 'Arcturus';
      const hasHaw   = !!star.h;
      const isBright = star.mag < 0.5;
      const baseR    = Math.max(2.5, 7.5 - Math.max(-1.5, star.mag) * 1.6) * (isHok ? 1.6 : 1);

      // Glow layers
      const glowColor = isHok ? '#ffd700' :
                        hasHaw ? 'rgba(0,247,255,.9)' : 'rgba(180,210,255,.7)';
      const glowR = baseR * (isHok ? 5 : isBright ? 4 : hasHaw ? 3.5 : 2.5);

      if (isHok || isBright || hasHaw) {
        const glow1 = E('circle', {
          cx: pos.x.toFixed(1), cy: pos.y.toFixed(1), r: (glowR * 1.5).toFixed(1),
          fill: isHok ? 'rgba(255,215,0,.06)' : 'rgba(0,247,255,.04)',
        });
        const glow2 = E('circle', {
          cx: pos.x.toFixed(1), cy: pos.y.toFixed(1), r: glowR.toFixed(1),
          fill: isHok ? 'rgba(255,215,0,.18)' : 'rgba(0,247,255,.12)',
        });
        svg.appendChild(glow1);
        svg.appendChild(glow2);
      }

      // Star body
      const starColor = isHok ? '#ffd700' :
                        star.id === 'Betelgeuse' || star.id === 'Antares' || star.id === 'Aldebaran' ? '#ffaa66' :
                        star.id === 'Rigel' || star.id === 'Spica' ? '#aac8ff' :
                        star.mag < 0 ? '#fff8f0' :
                        hasHaw ? 'rgba(200,230,255,.95)' : 'rgba(160,195,245,.78)';

      const circle = E('circle', {
        cx: pos.x.toFixed(1), cy: pos.y.toFixed(1), r: baseR.toFixed(2),
        fill: starColor,
        class: 'cw-hsc-star',
        style: 'cursor:pointer;',
        'data-star-id': star.id,
      });

      // 4-point sparkle for brightest
      if (isHok || star.mag < 0.5) {
        const len = baseR * (isHok ? 3.5 : 2.8);
        [[1,0],[0,1],[.707,.707],[-.707,.707]].forEach(([dx,dy]) => {
          svg.appendChild(E('line', {
            x1: (pos.x - dx*len).toFixed(1), y1: (pos.y - dy*len).toFixed(1),
            x2: (pos.x + dx*len).toFixed(1), y2: (pos.y + dy*len).toFixed(1),
            stroke: isHok ? 'rgba(255,215,0,.6)' : 'rgba(200,225,255,.4)',
            'stroke-width': '.9', 'stroke-linecap': 'round',
          }));
        });
      }

      svg.appendChild(circle);

      // Label — Hawaiian name (gold) or Western name (cyan)
      const showLabel = isHok || star.mag < 0.5 || (hasHaw && star.mag < 2.2) || (!hasHaw && star.mag < 1.5);
      if (showLabel) {
        const labelName = star.h || star.id;
        const ox = pos.x > W * 0.76 ? -(baseR + 6) : baseR + 7;
        const anchor = pos.x > W * 0.76 ? 'end' : 'start';
        const labelColor = isHok ? 'rgba(255,215,0,.98)' :
                          hasHaw ? 'rgba(0,247,255,.9)' : 'rgba(180,210,255,.6)';
        const glowFilter = isHok
          ? 'drop-shadow(0 0 8px rgba(255,215,0,.8))'
          : hasHaw ? 'drop-shadow(0 0 6px rgba(0,247,255,.6))' : 'none';

        const label = E('text', {
          x: (pos.x + ox).toFixed(1), y: (pos.y + 3.5).toFixed(1),
          'text-anchor': anchor, fill: labelColor,
          'font-size': isHok ? '12' : hasHaw ? '9.5' : '8',
          'font-family': 'Orbitron,monospace',
          'font-weight': isHok || hasHaw ? '600' : '400',
          filter: glowFilter,
          'pointer-events': 'none',
        }, labelName);
        svg.appendChild(label);

        // Sub-label: Western name if showing Hawaiian
        if (hasHaw && star.id !== star.h) {
          svg.appendChild(E('text', {
            x: (pos.x + ox).toFixed(1), y: (pos.y + 15).toFixed(1),
            'text-anchor': anchor, fill: 'rgba(120,170,215,.35)',
            'font-size': '7', 'font-family': 'sans-serif',
            'pointer-events': 'none',
          }, star.id));
        }

        // Compass house sub-label for named stars
        if (hasHaw && star.rising_az !== null) {
          const rHouse = houseForBearing(star.rising_az);
          svg.appendChild(E('text', {
            x: (pos.x + ox).toFixed(1), y: (pos.y + (hasHaw ? 26 : 15)).toFixed(1),
            'text-anchor': anchor, fill: `${rHouse.color}55`,
            'font-size': '6.5', 'font-family': 'Orbitron,monospace',
            'pointer-events': 'none',
          }, `rises ${rHouse.name}`));
        }
      }
    });
  }

  /* ════════════════════════════════════════════════════════════
     BUILD COMPASS IMAGE BACKGROUND
  ════════════════════════════════════════════════════════════ */
  function ensureCompassBg (container) {
    let bg = document.getElementById('cw-hsc-compass-bg');
    if (bg) return bg;

    bg = document.createElement('img');
    bg.id = 'cw-hsc-compass-bg';
    // Save hawaiian-star-compass.png to assets/images/ in your repo
    bg.src = 'assets/images/hawaiian-star-compass.png';
    bg.alt = 'Nainoa\'s Hawaiian Star Compass';
    bg.style.cssText = `
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: min(94%, 94vh);
      height: min(94%, 94vh);
      object-fit: contain;
      pointer-events: none;
      z-index: 10;
      /* Remove white background — invert black→white, then screen makes white visible on dark */
      filter: invert(1) brightness(0.18) contrast(2);
      mix-blend-mode: screen;
      opacity: 0.55;
      transition: opacity .3s;
    `;
    container.appendChild(bg);

    // Fade in once loaded
    bg.onload = () => { bg.style.opacity = '0.55'; };
    bg.onerror = () => { bg.style.display = 'none'; }; // silently hide if not found

    return bg;
  }

  /* ════════════════════════════════════════════════════════════
     ʻIWA BIRD — HTML layer (avoids SVG image white-box issue)
     Uses mix-blend-mode: screen properly on an HTML img element.
     Animates the ʻiwa migration path to Hawaiʻi on open.
  ════════════════════════════════════════════════════════════ */
  /* ensureIwaBird(container, cx, cy)
     cx, cy = exact pixel center of the compass inside the container.
     Uses a zero-size anchor <div> placed AT the compass center,
     so the bird img inside is always pixel-perfect centered on the compass.
     Migration animation offsets from that anchor via transform only.
  */
  function ensureIwaBird (container, cx, cy) {
    const compassCx = Math.round(cx || container.clientWidth  / 2);
    const compassCy = Math.round(cy || container.clientHeight / 2);

    // Inject keyframes + base styles once
    if (!document.getElementById('cw-iwa-keyframes')) {
      const ks = document.createElement('style');
      ks.id = 'cw-iwa-keyframes';
      ks.textContent = `
        /* Migration: ʻiwa flies in from SE, arcs to compass center */
        @keyframes cw-iwa-migrate {
          0%   { transform: translate(calc(-50% + 320px), calc(-50% + 210px)) scale(0.18) rotate(18deg); opacity: 0; }
          12%  { opacity: 0.45; }
          38%  { transform: translate(calc(-50% + 120px), calc(-50% + 75px))  scale(0.6)  rotate(8deg);  opacity: 0.8; }
          65%  { transform: translate(calc(-50% - 12px),  calc(-50% - 14px))  scale(1.06) rotate(-3deg); opacity: 1; }
          80%  { transform: translate(calc(-50% + 5px),   calc(-50% + 6px))   scale(0.97) rotate(1.5deg); }
          90%  { transform: translate(calc(-50% - 2px),   calc(-50% - 3px))   scale(1.01) rotate(-0.5deg); }
          100% { transform: translate(-50%, -50%) scale(1) rotate(0deg); opacity: 1; }
        }
        /* Gentle thermal soar after arriving */
        @keyframes cw-iwa-soar {
          0%,100% { transform: translate(-50%,-50%) translateY(0px)   rotate(0deg)    scale(1); }
          22%     { transform: translate(-50%,-50%) translateY(-7px)  rotate(-1.4deg) scale(1.012); }
          50%     { transform: translate(-50%,-50%) translateY(-10px) rotate(0.2deg)  scale(1.018); }
          76%     { transform: translate(-50%,-50%) translateY(-4px)  rotate(1.1deg)  scale(0.992); }
        }
        /* Anchor: zero-size div pinned to compass center pixel */
        #cw-iwa-anchor {
          position: absolute;
          width: 0; height: 0;
          pointer-events: none;
          z-index: 20;
        }
        /* Bird img centered on the anchor */
        #cw-iwa-html {
          position: absolute;
          /* size = ~28% of container, capped */
          width: 42%;
          max-width: 320px;
          min-width: 110px;
          /* centered on anchor */
          transform: translate(-50%, -50%);
          pointer-events: all;
          cursor: pointer;
          /* invert black→white, colorize cyan, blend-mode removes white bg box */
          filter: invert(1) grayscale(1) contrast(30) sepia(1) hue-rotate(148deg) saturate(9) brightness(1.5);
          mix-blend-mode: screen;
          animation:
            cw-iwa-migrate 2.6s cubic-bezier(.25,.46,.45,.94) forwards,
            cw-iwa-soar    4.8s ease-in-out 2.6s infinite;
          user-select: none;
          -webkit-user-drag: none;
          transition: filter .18s;
        }
        #cw-iwa-html:hover {
          filter: invert(1) grayscale(1) contrast(30) sepia(1) hue-rotate(148deg) saturate(12) brightness(2.2);
        }
        /* Click hint below bird */
        #cw-iwa-hint {
          position: absolute;
          /* nudge down ~60% of the img height from anchor */
          top: 84px;
          left: 0;
          transform: translateX(-50%);
          white-space: nowrap;
          font-family: Orbitron, monospace;
          font-size: 8px;
          letter-spacing: .12em;
          color: rgba(0,247,255,.38);
          pointer-events: none;
          animation: cw-iwa-migrate 2.6s cubic-bezier(.25,.46,.45,.94) forwards;
        }
      `;
      document.head.appendChild(ks);
    }

    // Create or update the anchor position
    let anchor = document.getElementById('cw-iwa-anchor');
    if (!anchor) {
      anchor = document.createElement('div');
      anchor.id = 'cw-iwa-anchor';

      const img = document.createElement('img');
      img.id  = 'cw-iwa-html';
      img.src = 'assets/images/iwa-middle.png';
      img.alt = 'ʻIwa frigatebird — click for moʻolelo';
      img.draggable = false;
      img.addEventListener('click', showIwaMoolelo);
      anchor.appendChild(img);

      const hint = document.createElement('div');
      hint.id = 'cw-iwa-hint';
      hint.textContent = 'ʻIWA · CLICK';
      anchor.appendChild(hint);

      container.appendChild(anchor);
    }

    // Always update anchor position to exact compass center
    anchor.style.left = compassCx + 'px';
    anchor.style.top  = compassCy + 'px';
  }

  function removeIwaBird () {
    document.getElementById('cw-iwa-anchor')?.remove();
  }

  /* ════════════════════════════════════════════════════════════
     PATCH THE EXISTING STAR OVERLAY
  ════════════════════════════════════════════════════════════ */
  function patchStarOverlay (overlay, globe) {
    if (!overlay || overlay._hsc_patched) return;
    overlay._hsc_patched = true;

    const origBuild = overlay._build?.bind(overlay);
    const origDraw  = overlay._draw?.bind(overlay);

    /* Override _build to add compass background */
    if (origBuild) {
      overlay._build = function () {
        origBuild();
        ensureCompassBg(this.container);
        ensureIwaBird(this.container);
        // Wire click events on the SVG (hit layer for stars)
        this._hitLayer?.addEventListener('click', (e) => {
          const starId = e.target.dataset?.starId;
          if (!starId) return;
          const star = STAR_DB.find(s => s.id === starId);
          if (star) showStarPanel(star);
        });
      };
    }

    /* Override _draw to add compass ring + enhanced stars */
    if (origDraw) {
      overlay._draw = function (g) {
        origDraw(g); // call original (draws background, milky way, existing stars, constellation lines)

        if (!this.svg || !g) return;
        const W = this.container.clientWidth || 800;
        const H = this.container.clientHeight || 560;
        const heading = getCameraHeading(g.camera);

        // Draw compass rose as outer ring on top of existing star field
        drawCompassRose(this.svg, W, H, heading);
        // Draw enhanced stars (on top, with glow + Hawaiian labels)
        drawEnhancedStars(this.svg, g, W, H);

        // Add compass image + ʻiwa bird pinned to SVG compass center
        ensureCompassBg(this.container);
        ensureIwaBird(this.container, W / 2, H / 2);

        // Update hit layer for our stars
        _updateEnhancedHitLayer(this._hitLayer, g, W, H);
      };
    }

    /* If _draw doesn't exist (different version), add from scratch */
    if (!origDraw) {
      overlay._hscGlobe = globe;
      overlay._loop = function (g) {
        let lastPos = null;
        const tick = () => {
          if (!this.visible) return;
          requestAnimationFrame(tick);
          const p = g.camera?.position;
          const key = p ? `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}` : '';
          if (key === lastPos) return;
          lastPos = key;
          const W = this.container.clientWidth || 800;
          const H = this.container.clientHeight || 560;
          if (!this.svg) {
            this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            this.svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:12;background:transparent;';
            this.container.appendChild(this.svg);
          }
          this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
          this.svg.innerHTML = '';
          this.svg.appendChild((() => { const r = document.createElementNS('http://www.w3.org/2000/svg','rect'); r.setAttribute('width',W); r.setAttribute('height',H); r.setAttribute('fill','rgba(0,2,14,.08)'); r.setAttribute('pointer-events','none'); return r; })());
          drawCompassRose(this.svg, W, H, getCameraHeading(g.camera));
          drawEnhancedStars(this.svg, g, W, H);
          ensureCompassBg(this.container);
          ensureIwaBird(this.container, W / 2, H / 2);
        };
        requestAnimationFrame(tick);
      };
    }
  }

  /* ════════════════════════════════════════════════════════════
     UPDATE HIT LAYER for our star db (for panel click)
  ════════════════════════════════════════════════════════════ */
  function _updateEnhancedHitLayer (hitLayer, globe, W, H) {
    if (!hitLayer || !globe?.camera || !window.THREE) return;
    const THREE = window.THREE;
    const cx = W / 2, cy = H / 2;
    const maxR = Math.min(W, H) * 0.44;

    STAR_DB.forEach(star => {
      const phi = star.dec * Math.PI / 180;
      const lam = star.ra  * Math.PI / 180;
      const v = new THREE.Vector3(
        50 * Math.cos(phi) * Math.cos(lam),
        50 * Math.sin(phi),
        50 * Math.cos(phi) * Math.sin(lam)
      );
      v.project(globe.camera);
      const sx = (v.x * 0.5 + 0.5) * W;
      const sy = (-v.y * 0.5 + 0.5) * H;
      if (v.z >= 1.0) return;
      if (Math.hypot(sx - cx, sy - cy) > maxR) return;

      const existing = hitLayer.querySelector(`[data-star-id="${star.id}"]`);
      if (existing) {
        existing.setAttribute('cx', sx.toFixed(1));
        existing.setAttribute('cy', sy.toFixed(1));
      } else {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        const baseR = Math.max(2.5, 7.5 - Math.max(-1.5, star.mag) * 1.6);
        c.setAttribute('cx', sx.toFixed(1));
        c.setAttribute('cy', sy.toFixed(1));
        c.setAttribute('r', Math.max(18, baseR * 2).toFixed(1));
        c.setAttribute('fill', 'transparent');
        c.setAttribute('data-star-id', star.id);
        c.style.cursor = 'pointer';
        c.style.pointerEvents = 'all';
        c.addEventListener('click', e => {
          e.stopPropagation();
          const s = STAR_DB.find(x => x.id === star.id);
          if (s) showStarPanel(s);
        });
        hitLayer.appendChild(c);
      }
    });
  }

  /* ════════════════════════════════════════════════════════════
     ADD COMPASS INFO BUTTON to star panel
  ════════════════════════════════════════════════════════════ */
  function injectCompassInfoBtn () {
    const starBtn = document.getElementById('btnStarMap');
    if (!starBtn || document.getElementById('btnCompassInfo')) return;

    const infoBtn = document.createElement('button');
    infoBtn.id   = 'btnCompassInfo';
    infoBtn.type = 'button';
    infoBtn.title = 'About the Hawaiian Star Compass';
    infoBtn.className = 'cw-ctrl';
    infoBtn.innerHTML = '<i class="fas fa-circle-info"></i>';
    infoBtn.style.cssText = 'border-color:rgba(255,215,0,.25);color:rgba(255,215,0,.7);';
    infoBtn.addEventListener('click', showCompassInfo);
    starBtn.parentNode.insertBefore(infoBtn, starBtn.nextSibling);
  }

  function showCompassInfo () {
    const existing = document.getElementById('cw-compass-info-modal');
    if (existing) { existing.remove(); return; }

    const modal = document.createElement('div');
    modal.id = 'cw-compass-info-modal';
    modal.style.cssText = `
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      z-index:20000; width:min(480px,94vw); max-height:80vh; overflow-y:auto;
      background:rgba(2,5,18,.98); border:1px solid rgba(255,215,0,.25);
      border-radius:18px; padding:28px 24px;
      box-shadow:0 20px 80px rgba(0,0,0,.8), 0 0 40px rgba(255,215,0,.06);
      font-family:'Exo 2',sans-serif; scrollbar-width:thin;
    `;
    modal.innerHTML = `
      <button onclick="this.closest('#cw-compass-info-modal').remove()" style="
        position:absolute;top:14px;right:14px;width:32px;height:32px;
        border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);
        color:rgba(255,255,255,.7);cursor:pointer;display:flex;align-items:center;justify-content:center;">
        <i class="fas fa-times"></i>
      </button>
      <h3 style="font-family:Orbitron,monospace;font-size:1rem;font-weight:700;letter-spacing:.08em;
                 color:rgba(255,215,0,.95);margin-bottom:6px;
                 text-shadow:0 0 20px rgba(255,215,0,.5);">
        Nainoa's Hawaiian Star Compass
      </h3>
      <p style="font-size:.78rem;color:rgba(255,215,0,.45);margin-bottom:18px;letter-spacing:.06em;font-family:Orbitron,monospace;">
        Ka Pānalāʻā Hōkū o Hawaiʻi
      </p>
      <p style="font-size:.85rem;line-height:1.7;color:rgba(255,255,255,.75);margin-bottom:14px;">
        Developed by master navigator <strong style="color:rgba(255,215,0,.85);">Nainoa Thompson</strong> 
        of the Polynesian Voyaging Society, this compass divides the horizon into 
        <strong style="color:rgba(0,247,255,.85);">32 houses</strong> of 11.25° each.
      </p>
      <p style="font-size:.85rem;line-height:1.7;color:rgba(255,255,255,.75);margin-bottom:18px;">
        Hawaiian navigators memorized which stars rose and set in each house, 
        allowing them to hold a heading across thousands of miles of open ocean 
        without instruments — guided only by stars, waves, birds, and wind.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;">
        ${[
          ['ʻAKAU','North (0°)','#00f7ff'],
          ['HEMA','South (180°)','#ff4757'],
          ['HIKINA','East (90°)','#ffd700'],
          ['KOMOHANA','West (270°)','#ff9f43'],
          ['MANU','NE/SE/SW/NW (45° each)','#a78bfa'],
          ['NĀ LEO','NNE/NNW/SSE/SSW','#54d1ff'],
          ['NALANI','NE by N / SE by S...','#54d1ff'],
          ['NOIO','NE by E / SE by E...','#54d1ff'],
          ['ʻAINA','ENE / ESE / WSW / WNW','#54d1ff'],
          ['LĀ','E by N / E by S / W by N...','#ffd700'],
        ].map(([name, desc, color]) => `
          <div style="padding:8px 10px;border-radius:8px;
                      background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);">
            <div style="font-family:Orbitron,monospace;font-size:.78rem;font-weight:700;
                        color:${color};text-shadow:0 0 10px ${color}66;margin-bottom:3px;">${name}</div>
            <div style="font-size:.72rem;color:rgba(255,255,255,.4);">${desc}</div>
          </div>`).join('')}
      </div>
      <div style="font-size:.78rem;color:rgba(0,247,255,.4);border-top:1px solid rgba(255,255,255,.07);
                  padding-top:12px;line-height:1.6;">
        <strong style="color:rgba(0,247,255,.6);">Four horizon winds:</strong><br>
        KOʻOLAU (NE) · MALANAI (SE) · KONA (SW) · HOʻOLUA (NW)
      </div>`;
    document.body.appendChild(modal);
  }

  /* ════════════════════════════════════════════════════════════
     INJECT CSS
  ════════════════════════════════════════════════════════════ */
  function injectCSS () {
    if (document.getElementById('cw-hsc-styles')) return;
    const s = document.createElement('style');
    s.id = 'cw-hsc-styles';
    s.textContent = `
      /* Close panel on ESC */
      .cw-hsc-star { transition: r .15s; }
      .cw-hsc-star:hover { r: 8px; }

      /* Compass rose rotation transition */
      .cw-compass-rose { transition: transform .4s cubic-bezier(.4,0,.2,1); }

      /* Info modal backdrop */
      #cw-compass-info-modal { backdrop-filter: blur(20px); }

      /* Panel scrollbar */
      #cw-hsc-panel::-webkit-scrollbar { width: 4px; }
      #cw-hsc-panel::-webkit-scrollbar-thumb { background: rgba(0,247,255,.25); border-radius: 2px; }

      /* btnStarMap active glow enhancement */
      #btnStarMap.active {
        box-shadow: 0 0 16px rgba(255,215,0,.4), 0 0 32px rgba(157,0,255,.2) !important;
      }
    `;
    document.head.appendChild(s);
    // ESC closes panel
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const p = document.getElementById('cw-hsc-panel');
        const m = document.getElementById('cw-compass-info-modal');
        if (p) p.style.right = '-420px';
        if (m) m.remove();
      }
    });
  }

  /* ════════════════════════════════════════════════════════════
     INIT
  ════════════════════════════════════════════════════════════ */
  function init () {
    injectCSS();

    // Merge rich star data if already loaded
    mergeWithStarData();

    // Wait for app and star overlay to be ready
    let attempts = 0;
    const wait = setInterval(() => {
      attempts++;
      const app = window._cwApp;
      if (!app || attempts > 60) { clearInterval(wait); return; }

      const overlay = app.starOverlay;
      const globe   = app.globe;
      if (!overlay || !globe) return;

      clearInterval(wait);

      // Merge rich star data once more (may have loaded by now)
      mergeWithStarData();

      // Patch the overlay
      patchStarOverlay(overlay, globe);

      // Add info button
      injectCompassInfoBtn();

      // Override star map button to also close our panel on deactivate
      const origToggle = overlay.toggle.bind(overlay);
      overlay.toggle = function (g) {
        const wasVisible = this.visible;
        const result = origToggle(g);
        if (wasVisible) {
          const p = document.getElementById('cw-hsc-panel');
          if (p) p.style.right = '-420px';
          const bg = document.getElementById('cw-hsc-compass-bg');
          if (bg) bg.style.opacity = '0';
          removeIwaBird();
        } else {
          const bg = document.getElementById('cw-hsc-compass-bg');
          if (bg) bg.style.opacity = '0.55';
        }
        return result;
      };

      console.info('[CW+HSC] Hawaiian Star Compass loaded —', STAR_DB.length, 'stars, 32 houses.');
    }, 200);

    // Also listen for _starData becoming available
    const richWait = setInterval(() => {
      if (window._starData) {
        clearInterval(richWait);
        mergeWithStarData();
      }
    }, 500);
    setTimeout(() => clearInterval(richWait), 8000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();