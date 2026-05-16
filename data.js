// ============================================================
// DATA.JS — Données des jeux, personnages, costumes, mémoire
// ============================================================

const ICON_BASE = 'https://raw.githubusercontent.com/adriancosmoem/ssbuicons/main/';

// Correspondance noms start.gg → id interne (tous jeux)
const STARTGG_TO_ID = {
  // ── SF6 ──────────────────────────────────────────────────
  "Ryu":"ryu","Ken":"ken","Chun-Li":"chun","Guile":"guile",
  "Zangief":"zangief","Dhalsim":"dhalsim","Jamie":"jamie","Juri":"juri",
  "Kimberly":"kimberly","Marisa":"marisa","Lily":"lily","Manon":"manon",
  "JP":"jp","Dee Jay":"dee","DeeJay":"dee","Cammy":"cammy","Blanka":"blanka",
  "E. Honda":"honda","Akuma":"akuma","Rashid":"rashid","Ed":"ed",
  "A.K.I.":"aki","Terry":"terry_sf6","Mai":"mai","Elena":"elena",
  "M. Bison":"bison","Ingrid":"ingrid",
  "Luke":"luke","Sagat":"sagat","Alex":"alex",

  // ── TEKKEN 8 ─────────────────────────────────────────────
  "Jin":"jin","Kazuya":"kazuya","Paul":"paul","Law":"law",
  "King":"king","Yoshimitsu":"yoshimitsu","Nina":"nina","Hwoarang":"hwoarang",
  "Xiaoyu":"xiaoyu","Steve":"steve","Jack-8":"jack8","Lars":"lars",
  "Alisa":"alisa","Claudio":"claudio","Asuka":"asuka","Lili":"lili",
  "Dragunov":"dragunov","Leroy":"leroy","Shaheen":"shaheen","Zafina":"zafina",
  "Feng":"feng","Feng Wei":"feng","Panda":"panda","Lee":"lee_t8","Reina":"reina",
  "Azucena":"azucena","Victor":"victor","Raven":"raven","Bryan":"bryan",
  "Devil Jin":"deviljin","Eddy":"eddy","Lidia":"lidia","Heihachi":"heihachi",
  "Armor King":"armorking","Jun":"jun","Kuma":"kuma","Fahkumram":"fahkumram",
  "Anna":"anna","Clive":"clive",

  // ── GUILTY GEAR STRIVE ────────────────────────────────────
  "Sol Badguy":"sol","Ky Kiske":"ky","May":"may","Axl Low":"axl",
  "Chipp Zanuff":"chipp","Potemkin":"potemkin","Faust":"faust",
  "Millia Rage":"millia","Zato-1":"zato","Ramlethal Valentine":"ramlethal",
  "Leo Whitefang":"leo","Nagoriyuki":"nagoriyuki","Giovanna":"giovanna",
  "Anji Mito":"anji","I-No":"ino","Goldlewis Dickinson":"goldlewis",
  "Jack-O'":"jacko","Happy Chaos":"happy","Baiken":"baiken",
  "Testament":"testament","Bridget":"bridget","Sin Kiske":"sin",
  "Bedman?":"bedman","Asuka R♯":"asuka","Queen Dizzy":"dizzy",
  "Elphelt Valentine":"elphelt","A.B.A":"aba","Johnny":"johnny",
  "Venom":"venom",

  // ── 2XKO ─────────────────────────────────────────────────
  "Ahri":"ahri","Darius":"darius","Ekko":"ekko","Illaoi":"illaoi",
  "Jinx":"jinx","Katarina":"katarina","Malphite":"malphite","Yasuo":"yasuo",
  "Akali":"akali","Blitzcrank":"blitzcrank","Braum":"braum","Caitlyn":"caitlyn",
  "Teemo":"teemo","Vi":"vi","Warwick":"warwick",

  // ── DBFZ ─────────────────────────────────────────────────
  "Goku (Super Saiyan)":"goku_ss","Vegeta (Super Saiyan)":"vegeta_ss",
  "Gohan (Teen)":"gohan_teen","Gohan (Adult)":"gohan_adult",
  "Frieza":"frieza","Cell":"cell","Piccolo":"piccolo","Trunks":"trunks",
  "Android 18":"a18","Android 16":"a16","Android 17":"a17",
  "Hit":"hit","Beerus":"beerus","Goku Black":"goku_black",
  "Zamasu (Fused)":"zamasu","Vegito (SSGSS)":"vegito","Gogeta (SS4)":"gogeta_ss4",
  "Broly":"broly","Bardock":"bardock","Cooler":"cooler",
  "Janemba":"janemba","Gogeta (SSGSS)":"gogeta","Kid Buu":"kid_buu",
  "Super Baby 2":"baby2","SSB Goku":"ssb_goku","SSB Vegeta":"ssb_vegeta",
  "Kefla":"kefla","Goku (Ultra Instinct)":"goku_ui","Master Roshi":"roshi",
  "Gamma 1":"gamma1","Gamma 2":"gamma2","Gotenks":"gotenks",
  "Videl":"videl","Broly (DBS)":"broly_dbs","Goku (GT)":"goku_gt",
  "Pan":"pan",

  // ── SMASH ULTIMATE ───────────────────────────────────────

  "Mario":"mario","Donkey Kong":"dk","Link":"link","Samus":"samus",
  "Dark Samus":"darksamus","Zero Suit Samus":"zsamus","Yoshi":"yoshi",
  "Kirby":"kirby","Fox":"fox","Pikachu":"pikachu","Luigi":"luigi","Ness":"ness",
  "Captain Falcon":"falcon","Jigglypuff":"jiggly","Peach":"peach","Daisy":"daisy",
  "Bowser":"bowser","Ice Climbers":"iceclimbers","Sheik":"sheik","Zelda":"zelda",
  "Dr. Mario":"drsmario","Pichu":"pichu","Falco":"falco","Marth":"marth",
  "Lucina":"lucina","Young Link":"yl","Ganondorf":"ganon","Mewtwo":"mewtwo",
  "Roy":"roy","Chrom":"chrom","Mr. Game & Watch":"gnaw","Meta Knight":"metaknight",
  "Pit":"pit","Dark Pit":"dpit","Wario":"wario","Snake":"snake","Ike":"ike",
  "Pokémon Trainer":"pkmtrainer","Diddy Kong":"diddykong","Lucas":"lucas",
  "Sonic":"sonic","King Dedede":"kingdedede","Olimar":"olimar","Lucario":"lucario",
  "R.O.B.":"rob","Toon Link":"toonlink","Wolf":"wolf","Villager":"villager",
  "Mega Man":"megaman","Wii Fit Trainer":"wiifittrainer","Rosalina & Luma":"rosalina",
  "Little Mac":"littlemac","Greninja":"greninja","Mii Brawler":"miib",
  "Mii Swordfighter":"miis","Mii Gunner":"miig","Palutena":"palutena",
  "Pac-Man":"pac","Robin":"robin","Shulk":"shulk","Bowser Jr.":"bowserjr",
  "Duck Hunt":"duckhunt","Ryu":"ryu","Ken":"ken","Cloud":"cloud","Corrin":"corrin",
  "Bayonetta":"bayonetta","Inkling":"inkling","Ridley":"ridley","Simon":"simon",
  "Richter":"richter","King K. Rool":"kk","Isabelle":"isabelle",
  "Incineroar":"incineroar","Piranha Plant":"piranah","Joker":"joker","Hero":"hero",
  "Banjo & Kazooie":"banjo","Terry":"terry","Byleth":"byleth","Min Min":"minmin",
  "Steve":"steve","Sephiroth":"sephiroth","Pyra":"pythra","Mythra":"pythra",
  "Pyra/Mythra":"pythra","Kazuya":"kazuya","Sora":"sora"
};

// Nom de base des fichiers (sans numéro de costume)
// Stock icons GitHub : Mario1.png … Mario8.png
// Mural art local    : characters/Mario1.png … characters/Mario8.png
const ICON_BASENAME = {
  // SF6
  ryu:"Ryu", ken:"Ken", chun:"Chunli", guile:"Guile",
  zangief:"Zangief", dhalsim:"Dhalsim", jamie:"Jamie", juri:"Juri",
  kimberly:"Kimberly", marisa:"Marisa", lily:"Lily", manon:"Manon",
  jp:"JP", dee:"Deejay", cammy:"Cammy", blanka:"Blanka",
  honda:"EHonda", akuma:"Akuma", rashid:"Rashid", ed:"Ed",
  aki:"Aki", terry_sf6:"Terry", mai:"Mai", elena:"Elena",
  bison:"Bison", ingrid:"Ingrid",
  luke:"Luke", sagat:"Sagat", alex:"Alex",
  // Tekken 8
  jin:"Jin", kazuya:"Kazuya", paul:"Paul", law:"Law",
  king:"King", yoshimitsu:"Yoshimitsu", nina:"Nina", hwoarang:"Hwoarang",
  xiaoyu:"Xiaoyu", steve:"Steve", jack8:"Jack8", lars:"Lars",
  alisa:"Alisa", claudio:"Claudio", asuka:"Asuka", lili:"Lili",
  dragunov:"Dragunov", leroy:"Leroy", shaheen:"Shaheen", zafina:"Zafina",
  feng:"Fengwei", panda:"Panda", lee_t8:"Lee", reina:"Reina",
  azucena:"Azucena", victor:"Victor", raven:"Raven", bryan:"Bryan",
  deviljin:"DevilJin", eddy:"Eddy", lidia:"Lidia", heihachi:"Heihachi",
  armorking:"ArmorKing", jun:"Jun", kuma:"Kuma", fahkumram:"Fahkumram",
  anna:"Anna", clive:"Clive",
  // GGST
  sol:"Sol", ky:"Ky", may:"May", axl:"Axl",
  chipp:"Chipp", potemkin:"Potemkin", faust:"Faust", millia:"Millia",
  zato:"Zato", ramlethal:"Ramlethal", leo:"Leo", nagoriyuki:"Nagoriyuki",
  giovanna:"Giovanna", anji:"Anji", ino:"INo", goldlewis:"Goldlewis",
  jacko:"JackO", happy:"HappyChaos", baiken:"Baiken", testament:"Testament",
  bridget:"Bridget", sin:"Sin", bedman:"Bedman", ggst_asuka:"AsukaR",
  dizzy:"Dizzy", elphelt:"Elphelt", aba:"ABA", johnny:"Johnny", venom:"Venom",
  // 2XKO
  ahri:"Ahri", darius:"Darius", ekko:"Ekko", illaoi:"Illaoi",
  jinx:"Jinx", katarina:"Katarina", malphite:"Malphite", yasuo:"Yasuo",
  akali:"Akali", blitzcrank:"Blitzcrank", braum:"Braum", caitlyn:"Caitlyn",
  teemo:"Teemo", vi:"Vi", warwick:"Warwick",
  // DBFZ
  goku_ss:"GokuSS", vegeta_ss:"VegetaSS", gohan_teen:"GohanTeen",
  gohan_adult:"GohanAdult", frieza:"Frieza", cell:"Cell", piccolo:"Piccolo",
  trunks:"Trunks", a18:"Android18", a16:"Android16", a17:"Android17",
  hit:"Hit", beerus:"Beerus", goku_black:"GokuBlack", zamasu:"Zamasu",
  vegito:"Vegito", gogeta_ss4:"GogetaSS4", broly:"Broly", bardock:"Bardock",
  cooler:"Cooler", janemba:"Janemba", gogeta:"Gogeta", kid_buu:"KidBuu",
  baby2:"SuperBaby2", ssb_goku:"SSBGoku", ssb_vegeta:"SSBVegeta",
  kefla:"Kefla", goku_ui:"GokuUI", roshi:"MasterRoshi",
  gamma1:"Gamma1", gamma2:"Gamma2", gotenks:"Gotenks", videl:"Videl",
  broly_dbs:"BrolyDBS", goku_gt:"GokuGT", pan:"Pan",
  // SSBU
  mario:"Mario", dk:"DonkeyKong", link:"Link",
  samus:"Samus", darksamus:"DarkSamus", zsamus:"ZeroSuitSamus",
  yoshi:"Yoshi", kirby:"Kirby", fox:"Fox",
  pikachu:"Pikachu", luigi:"Luigi", ness:"Ness",
  falcon:"CaptainFalcon", jiggly:"Jigglypuff", peach:"Peach",
  daisy:"Daisy", bowser:"Bowser", iceclimbers:"IceClimbers",
  sheik:"Sheik", zelda:"Zelda", drsmario:"DrMario",
  pichu:"Pichu", falco:"Falco", marth:"Marth",
  lucina:"Lucina", yl:"YoungLink", ganon:"Ganondorf",
  mewtwo:"Mewtwo", roy:"Roy", chrom:"Chrom",
  gnaw:"GameAndWatch", metaknight:"MetaKnight", pit:"Pit",
  dpit:"DarkPit", wario:"Wario", snake:"Snake",
  ike:"Ike", pkmtrainer:"PokemonTrainer", diddykong:"DiddyKong",
  lucas:"Lucas", sonic:"Sonic", kingdedede:"KingDedede",
  olimar:"Olimar", lucario:"Lucario", rob:"ROB",
  toonlink:"ToonLink", wolf:"Wolf", villager:"Villager",
  megaman:"MegaMan", wiifittrainer:"WiiFitTrainer", rosalina:"RosalinaAndLuma",
  littlemac:"LittleMac", greninja:"Greninja",
  miib:"MiiBrawler", miis:"MiiSwordfighter", miig:"MiiGunner",
  palutena:"Palutena", pac:"PacMan", robin:"Robin",
  shulk:"Shulk", bowserjr:"BowserJr", duckhunt:"DuckHunt",
  ryu:"Ryu", ken:"Ken", cloud:"Cloud",
  corrin:"Corrin", bayonetta:"Bayonetta", inkling:"Inkling",
  ridley:"Ridley", simon:"Simon", richter:"Richter",
  kk:"KingKRool", isabelle:"Isabelle", incineroar:"Incineroar",
  piranah:"PiranhaPlant", joker:"Joker", hero:"Hero",
  banjo:"BanjoAndKazooie", terry:"Terry", byleth:"Byleth",
  minmin:"MinMin", steve:"Steve", sephiroth:"Sephiroth",
  pythra:"Pyra", kazuya:"Kazuya", sora:"Sora"
};

// Stock icon GitHub (pour sélecteur de costumes)
function getStockIconUrl(charId, costume) {
  const base = ICON_BASENAME[charId];
  if (!base) return null;
  return ICON_BASE + base + costume + '.png';
}

// Mapping jeu → sous-dossier
const GAME_CHAR_FOLDER = {
  ssbu:    'characters/SSBU',
  sf6:     'characters/SF6',
  ggst:    'characters/GGST',
  tekken8: 'characters/T8',
  '2xko':  'characters/2XKO',
  dbfz:    'characters/DBFZ',
};

// Jeux avec costumes numérotés (Mario1.png, Mario2.png...)
const GAMES_WITH_COSTUMES = ['ssbu'];

// Basenames dont l'extension est .jpg
const CHAR_EXT_JPG = new Set([
  'ArmorKing','Azucena','Bryan','Claudio','Fahkumram','Heihachi',
  'Hwoarang','Lili','Nina','Paul','Raven','Reina','Xiaoyu','Yoshimitsu',
]);
// Basenames dont l'extension est .avif (2XKO)
// Fichiers 2XKO effectivement présents en .avif (ls characters/2XKO/)
const CHAR_EXT_AVIF = new Set([
  'Ahri','Akali','Blitzcrank','Braum','Caitlyn','Darius','Ekko',
  'Illaoi','Jinx','Teemo','Vi','Warwick','Yasuo',
  // Katarina et Malphite ajoutés ici s'ils apparaissent dans le dossier
]);

// Mural art — résout via assetUrl() pour pointer sur le CDN jsDelivr (ou en
// local si ASSETS_BASE_URL est vide). Voir layouts.js pour la config.
// ── Détection tolérante du charId depuis un nom start.gg ──
// Pour les cas où start.gg renvoie une variante du nom officiel (ex.
// "Sol" au lieu de "Sol Badguy", "Jack-O" au lieu de "Jack-O'", etc.).
// Stratégie : normalize (lowercase, sans accents/ponctuation/espaces)
// puis exact match → puis containment dans les deux sens → puis prefix.
function _normalizeCharName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // strip accents
    .replace(/[^a-z0-9]/g, '');                         // garde alphanum
}
let _normalizedStartggMap = null;
function _getNormalizedStartggMap() {
  if (_normalizedStartggMap) return _normalizedStartggMap;
  _normalizedStartggMap = {};
  Object.keys(STARTGG_TO_ID).forEach(k => {
    _normalizedStartggMap[_normalizeCharName(k)] = { id: STARTGG_TO_ID[k], original: k };
  });
  return _normalizedStartggMap;
}
function findCharIdFromName(name) {
  if (!name) return null;
  // 1. Exact direct match (rapide)
  if (STARTGG_TO_ID[name]) return STARTGG_TO_ID[name];
  // 2. Match normalisé exact
  const norm = _normalizeCharName(name);
  if (!norm) return null;
  const map = _getNormalizedStartggMap();
  if (map[norm]) return map[norm].id;
  // 3. Containment : "sol" ⊂ "solbadguy", "asuka" ⊂ "asukar"
  for (const k of Object.keys(map)) {
    if (k.includes(norm) || norm.includes(k)) return map[k].id;
  }
  return null;
}
// Expose globally pour multi.js
if (typeof window !== 'undefined') window.findCharIdFromName = findCharIdFromName;

function getMuralArtUrl(charId, costume, game) {
  const base = ICON_BASENAME[charId];
  if (!base) return null;
  const g = game || (typeof currentGame !== 'undefined' ? currentGame : 'ssbu');
  const folder = GAME_CHAR_FOLDER[g] || 'characters/SSBU';
  let ext = 'png';
  if (!GAMES_WITH_COSTUMES.includes(g)) {
    if (CHAR_EXT_AVIF.has(base)) ext = 'avif';
    else if (CHAR_EXT_JPG.has(base)) ext = 'jpg';
  }
  const filename = GAMES_WITH_COSTUMES.includes(g) ? `${base}${costume}.${ext}` : `${base}.${ext}`;
  const relPath = `${folder}/${filename}`;
  return (typeof assetUrl === 'function') ? assetUrl(relPath) : relPath;
}

// Cache mural art : clé = "charId_costume"
const imgCache = {};

function preloadMural(charId, costume, game) {
  const g = game || (typeof currentGame !== 'undefined' ? currentGame : 'ssbu');
  const key = `${g}_${charId}_${costume}`;
  if (imgCache[key]) return;
  imgCache[key] = { _loaded: false, _img: null };
  const img = new Image();
  img.onload  = () => { imgCache[key]._loaded = true; imgCache[key]._img = img; };
  img.onerror = () => { imgCache[key]._loaded = false; };
  img.src = getMuralArtUrl(charId, costume, g);
}

// ── MÉMOIRE PAR JOUEUR (localStorage) ───────────────────────────────────────
// Clé : "top8_player_prefs"
// Valeur : { "sg_12345": { charId:"mario", costume:3 }, ... }

function loadPlayerPrefs() {
  try { return JSON.parse(localStorage.getItem('top8_player_prefs') || '{}'); }
  catch { return {}; }
}

function savePlayerPref(startggId, charId, costume) {
  if (!startggId) return;
  const prefs = loadPlayerPrefs();
  prefs[`sg_${startggId}`] = { charId, costume };
  localStorage.setItem('top8_player_prefs', JSON.stringify(prefs));
}

function getPlayerPref(startggId) {
  if (!startggId) return null;
  return loadPlayerPrefs()[`sg_${startggId}`] || null;
}

// ── DONNÉES DES JEUX ─────────────────────────────────────────────────────────
const GAMES = {
  ssbu: {
    name: "Super Smash Bros. Ultimate",
    short: "SmashUltimate",
    sub1: "SUPER SMASH BROS ULTIMATE",
    sub2: "RÉSULTATS",
    chars: [
      {id:"mario",name:"Mario",icon:"🔴"},{id:"dk",name:"Donkey Kong",icon:"🦍"},
      {id:"link",name:"Link",icon:"🗡️"},{id:"samus",name:"Samus",icon:"🚀"},
      {id:"zsamus",name:"Zero Suit Samus",icon:"🔵"},{id:"yoshi",name:"Yoshi",icon:"🦎"},
      {id:"kirby",name:"Kirby",icon:"🌸"},{id:"fox",name:"Fox",icon:"🦊"},
      {id:"pikachu",name:"Pikachu",icon:"⚡"},{id:"luigi",name:"Luigi",icon:"💚"},
      {id:"ness",name:"Ness",icon:"⚾"},{id:"falcon",name:"Captain Falcon",icon:"🏎️"},
      {id:"jiggly",name:"Jigglypuff",icon:"🎤"},{id:"peach",name:"Peach",icon:"👑"},
      {id:"daisy",name:"Daisy",icon:"🌼"},{id:"bowser",name:"Bowser",icon:"🐢"},
      {id:"iceclimbers",name:"Ice Climbers",icon:"❄️"},{id:"sheik",name:"Sheik",icon:"🎴"},
      {id:"zelda",name:"Zelda",icon:"🔮"},{id:"drsmario",name:"Dr. Mario",icon:"💊"},
      {id:"pichu",name:"Pichu",icon:"🐭"},{id:"falco",name:"Falco",icon:"🦅"},
      {id:"marth",name:"Marth",icon:"⚔️"},{id:"lucina",name:"Lucina",icon:"🔵"},
      {id:"yl",name:"Young Link",icon:"🏹"},{id:"ganon",name:"Ganondorf",icon:"👹"},
      {id:"mewtwo",name:"Mewtwo",icon:"✨"},{id:"roy",name:"Roy",icon:"🔥"},
      {id:"chrom",name:"Chrom",icon:"🛡️"},{id:"gnaw",name:"Game & Watch",icon:"🖥️"},
      {id:"metaknight",name:"Meta Knight",icon:"🦇"},{id:"pit",name:"Pit",icon:"😇"},
      {id:"dpit",name:"Dark Pit",icon:"😈"},{id:"wario",name:"Wario",icon:"🧄"},
      {id:"snake",name:"Snake",icon:"🐍"},{id:"ike",name:"Ike",icon:"💪"},
      {id:"pkmtrainer",name:"Pokémon Trainer",icon:"🎒"},{id:"diddykong",name:"Diddy Kong",icon:"🍌"},
      {id:"lucas",name:"Lucas",icon:"🧸"},{id:"sonic",name:"Sonic",icon:"💨"},
      {id:"kingdedede",name:"King Dedede",icon:"🔨"},{id:"olimar",name:"Olimar",icon:"🌱"},
      {id:"lucario",name:"Lucario",icon:"🔷"},{id:"rob",name:"R.O.B",icon:"🤖"},
      {id:"toonlink",name:"Toon Link",icon:"🌊"},{id:"wolf",name:"Wolf",icon:"🐺"},
      {id:"villager",name:"Villager",icon:"🏡"},{id:"megaman",name:"Mega Man",icon:"💙"},
      {id:"wiifittrainer",name:"Wii Fit Trainer",icon:"🧘"},{id:"rosalina",name:"Rosalina",icon:"⭐"},
      {id:"littlemac",name:"Little Mac",icon:"🥊"},{id:"greninja",name:"Greninja",icon:"💧"},
      {id:"miib",name:"Mii Brawler",icon:"🥋"},{id:"miis",name:"Mii Swordfighter",icon:"🗡️"},
      {id:"miig",name:"Mii Gunner",icon:"🔫"},{id:"palutena",name:"Palutena",icon:"🌟"},
      {id:"pac",name:"Pac-Man",icon:"🟡"},{id:"robin",name:"Robin",icon:"📚"},
      {id:"shulk",name:"Shulk",icon:"🟠"},{id:"bowserjr",name:"Bowser Jr.",icon:"🎨"},
      {id:"duckhunt",name:"Duck Hunt",icon:"🦆"},{id:"ryu",name:"Ryu",icon:"👊"},
      {id:"ken",name:"Ken",icon:"🔥"},{id:"cloud",name:"Cloud",icon:"☁️"},
      {id:"corrin",name:"Corrin",icon:"🐉"},{id:"bayonetta",name:"Bayonetta",icon:"💋"},
      {id:"inkling",name:"Inkling",icon:"🦑"},{id:"ridley",name:"Ridley",icon:"🟣"},
      {id:"simon",name:"Simon",icon:"⛪"},{id:"richter",name:"Richter",icon:"🕍"},
      {id:"kk",name:"King K. Rool",icon:"🐊"},{id:"isabelle",name:"Isabelle",icon:"🐕"},
      {id:"incineroar",name:"Incineroar",icon:"🐯"},{id:"piranah",name:"Piranha Plant",icon:"🪴"},
      {id:"joker",name:"Joker",icon:"🃏"},{id:"hero",name:"Hero",icon:"⚗️"},
      {id:"banjo",name:"Banjo-Kazooie",icon:"🐻"},{id:"terry",name:"Terry",icon:"🗽"},
      {id:"byleth",name:"Byleth",icon:"🌿"},{id:"minmin",name:"Min Min",icon:"🍜"},
      {id:"steve",name:"Steve",icon:"⛏️"},{id:"sephiroth",name:"Sephiroth",icon:"🌑"},
      {id:"pythra",name:"Pyra/Mythra",icon:"🔱"},{id:"kazuya",name:"Kazuya",icon:"🖤"},
      {id:"sora",name:"Sora",icon:"🔑"}
    ]
  },
  sf6: {
    name:"Street Fighter 6", short:"SF6", sub1:"STREET FIGHTER 6", sub2:"RÉSULTATS",
    chars:[
      {id:"ryu",name:"Ryu",icon:"👊"},{id:"ken",name:"Ken",icon:"🔥"},
      {id:"chun",name:"Chun-Li",icon:"💫"},{id:"guile",name:"Guile",icon:"🇺🇸"},
      {id:"zangief",name:"Zangief",icon:"💪"},{id:"dhalsim",name:"Dhalsim",icon:"🔱"},
      {id:"jamie",name:"Jamie",icon:"🍶"},{id:"juri",name:"Juri",icon:"🌀"},
      {id:"kimberly",name:"Kimberly",icon:"🎒"},{id:"marisa",name:"Marisa",icon:"⚔️"},
      {id:"lily",name:"Lily",icon:"🌿"},{id:"manon",name:"Manon",icon:"🥇"},
      {id:"jp",name:"JP",icon:"🪄"},{id:"dee",name:"Dee Jay",icon:"🎵"},
      {id:"cammy",name:"Cammy",icon:"🎯"},{id:"blanka",name:"Blanka",icon:"⚡"},
      {id:"honda",name:"E. Honda",icon:"🏯"},{id:"akuma",name:"Akuma",icon:"👹"},
      {id:"rashid",name:"Rashid",icon:"🌪️"},{id:"ed",name:"Ed",icon:"🥊"},
      {id:"aki",name:"A.K.I.",icon:"🐍"},
      // ⚠️ Terry SF6 utilise l'id "terry_sf6" (pas "terry") pour éviter la
      // collision avec Terry de SSBU dans STARTGG_TO_ID.
      {id:"terry_sf6",name:"Terry",icon:"🗽"},
      {id:"mai",name:"Mai",icon:"🌸"},{id:"elena",name:"Elena",icon:"💃"},
      // Persos ajoutés ici pour que le mapping start.gg → GAMES.chars les
      // trouve. Si le mural local manque dans le repo, le fallback start.gg
      // (p.charImgUrl) prend le relais.
      {id:"luke",name:"Luke",icon:"🥊"},{id:"sagat",name:"Sagat",icon:"👁️"},
      {id:"alex",name:"Alex",icon:"🥋"},
      {id:"bison",name:"M. Bison",icon:"🦇"},{id:"ingrid",name:"Ingrid",icon:"✨"}
    ]
  },
  tekken8: {
    name:"Tekken 8", short:"Tekken8", sub1:"TEKKEN 8", sub2:"RÉSULTATS",
    chars:[
      {id:"jin",      name:"Jin",         icon:"⚡"},
      {id:"kazuya",   name:"Kazuya",      icon:"🖤"},
      {id:"paul",     name:"Paul",        icon:"🔥"},
      {id:"law",      name:"Law",         icon:"🥋"},
      {id:"king",     name:"King",        icon:"🐆"},
      {id:"yoshimitsu",name:"Yoshimitsu", icon:"🗡️"},
      {id:"nina",     name:"Nina",        icon:"💄"},
      {id:"hwoarang", name:"Hwoarang",    icon:"🦵"},
      {id:"xiaoyu",   name:"Xiaoyu",      icon:"🐼"},
      {id:"steve",    name:"Steve",       icon:"🥊"},
      {id:"jack8",    name:"Jack-8",      icon:"🤖"},
      {id:"lars",     name:"Lars",        icon:"⚡"},
      {id:"alisa",    name:"Alisa",       icon:"🤖"},
      {id:"claudio",  name:"Claudio",     icon:"⭐"},
      {id:"asuka",    name:"Asuka",       icon:"🌸"},
      {id:"lili",     name:"Lili",        icon:"💐"},
      {id:"dragunov", name:"Dragunov",    icon:"🎖️"},
      {id:"leroy",    name:"Leroy",       icon:"🥢"},
      {id:"shaheen",  name:"Shaheen",     icon:"🦅"},
      {id:"zafina",   name:"Zafina",      icon:"🔮"},
      {id:"feng",     name:"Feng Wei",    icon:"🐉"},
      {id:"panda",    name:"Panda",       icon:"🐻"},
      {id:"lee_t8",   name:"Lee",         icon:"🌙"},
      {id:"reina",    name:"Reina",       icon:"⚡"},
      {id:"azucena",  name:"Azucena",     icon:"☕"},
      {id:"raven",    name:"Raven",       icon:"🐦"},
      {id:"bryan",    name:"Bryan",       icon:"💀"},
      {id:"deviljin", name:"Devil Jin",   icon:"👹"},
      {id:"eddy",     name:"Eddy",        icon:"🕺"},
      {id:"lidia",    name:"Lidia",       icon:"⚔️"},
      {id:"heihachi", name:"Heihachi",    icon:"👴"},
      {id:"armorking",name:"Armor King",  icon:"👑"},
      {id:"jun",      name:"Jun",         icon:"🌺"},
      {id:"kuma",     name:"Kuma",        icon:"🐻"},
      {id:"fahkumram",name:"Fahkumram",   icon:"🦅"},
    ]
  },
  '2xko': {
    name:"2XKO", short:"2XKO", sub1:"2XKO", sub2:"RÉSULTATS",
    chars:[
      {id:"ahri",       name:"Ahri",       icon:"🦊"},
      {id:"akali",      name:"Akali",      icon:"🗡️"},
      {id:"blitzcrank", name:"Blitzcrank", icon:"⚙️"},
      {id:"braum",      name:"Braum",      icon:"🛡️"},
      {id:"caitlyn",    name:"Caitlyn",    icon:"🎯"},
      {id:"darius",     name:"Darius",     icon:"⚔️"},
      {id:"ekko",       name:"Ekko",       icon:"⏰"},
      {id:"illaoi",     name:"Illaoi",     icon:"🐙"},
      {id:"jinx",       name:"Jinx",       icon:"💥"},
      {id:"katarina",   name:"Katarina",   icon:"🔪"},
      {id:"malphite",   name:"Malphite",   icon:"🪨"},
      {id:"teemo",      name:"Teemo",      icon:"🍄"},
      {id:"vi",         name:"Vi",         icon:"👊"},
      {id:"warwick",    name:"Warwick",    icon:"🐺"},
      {id:"yasuo",      name:"Yasuo",      icon:"💨"},
    ]
  },
  ggst: {
    name:"Guilty Gear Strive", short:"GGST", sub1:"GUILTY GEAR STRIVE", sub2:"RÉSULTATS",
    chars:[
      {id:"sol",name:"Sol Badguy",icon:"🔥"},{id:"ky",name:"Ky Kiske",icon:"⚡"},
      {id:"may",name:"May",icon:"⚓"},{id:"axl",name:"Axl Low",icon:"⛓️"},
      {id:"chipp",name:"Chipp Zanuff",icon:"🥷"},{id:"potemkin",name:"Potemkin",icon:"💪"},
      {id:"faust",name:"Faust",icon:"🎭"},{id:"millia",name:"Millia Rage",icon:"💇"},
      {id:"zato",name:"Zato-1",icon:"🎪"},{id:"ramlethal",name:"Ramlethal",icon:"🗡️"},
      {id:"leo",name:"Leo Whitefang",icon:"🦁"},{id:"nagoriyuki",name:"Nagoriyuki",icon:"🩸"},
      {id:"giovanna",name:"Giovanna",icon:"🐺"},{id:"anji",name:"Anji Mito",icon:"🦋"},
      {id:"ino",name:"I-No",icon:"🎸"},{id:"goldlewis",name:"Goldlewis",icon:"🛸"},
      {id:"jacko",name:"Jack-O",icon:"🎃"},{id:"happy",name:"Happy Chaos",icon:"🎩"},
      {id:"baiken",name:"Baiken",icon:"🌸"},{id:"testament",name:"Testament",icon:"💀"},
      {id:"bridget",name:"Bridget",icon:"🪀"},{id:"sin",name:"Sin Kiske",icon:"🍖"},
      {id:"bedman",name:"Bedman?",icon:"🛏️"},{id:"asuka",name:"Asuka R♯",icon:"📖"},
      // Persos ajoutés pour matcher STARTGG_TO_ID (sinon find() retourne
      // undefined et la modale d'édition affiche "Aucun personnage").
      {id:"dizzy",name:"Dizzy",icon:"🪽"},{id:"elphelt",name:"Elphelt",icon:"💒"},
      {id:"aba",name:"A.B.A",icon:"🔑"},{id:"johnny",name:"Johnny",icon:"🎩"},
      {id:"venom",name:"Venom",icon:"🎱"}
    ]
  }
};

// ── CONFIG LAYOUT ─────────────────────────────────────────────────────────────
const CONFIG = {
  REF_SIZE:1400, SKEW:67, OFFSET_X:51, OFFSET_Y:0,
  T1:{x:903,y:95,s:46,l:3},
  T2:{x:901,y:165,s:43,l:11.5},
  T3:{x:905,y:229,s:40,l:13},
  BLACK_SLOTS:[
    {xBL:444,yT:311,w:278,h:202},{xBL:917,yT:311,w:277,h:202},
    {xBL:444,yT:573,w:277,h:201},{xBL:917,yT:573,w:277,h:201},
    {xBL:444,yT:834,w:296,h:201},{xBL:917,yT:834,w:295,h:201},
    {xBL:444,yT:1095,w:277,h:201},{xBL:917,yT:1095,w:277,h:201},
  ],
  PURPLE_SLOTS:[
    {xBL:699,yT:311,w:129,h:202},{xBL:1172,yT:311,w:129,h:202},
    {xBL:699,yT:573,w:129,h:201},{xBL:1172,yT:573,w:129,h:201},
    {xBL:699,yT:834,w:129,h:201},{xBL:1172,yT:834,w:129,h:201},
    {xBL:699,yT:1095,w:129,h:201},{xBL:1172,yT:1095,w:129,h:201},
  ],
  RANK_LABELS:['1','2','3','4','5','5','7','7'],
  RANKS_DISPLAY:['1er','2e','3e','4e','5e','5e','7e','7e'],
  RANK_COLORS:[
    {fill:'#F5C842',stroke:'#8B6A00'},{fill:'#C8D0E0',stroke:'#5A6A80'},
    {fill:'#D87040',stroke:'#7A3A10'},{fill:'#D87040',stroke:'#7A3A10'},
    {fill:'#FFFFFF',stroke:'#888888'},{fill:'#FFFFFF',stroke:'#888888'},
    {fill:'#FFFFFF',stroke:'#888888'},{fill:'#FFFFFF',stroke:'#888888'},
  ]
};
