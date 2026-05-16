// ============================================================
// LAYOUTS.JS — Définition des layouts par jeu
// Chaque layout définit :
//   - slots : zones où placer les personnages/joueurs
//   - rankLabels : labels de placement
//   - bgFile : fond automatique
//   - playerCount : nombre de joueurs
//   - slotType : 'parallelogram' | 'circle' | 'rectangle' | 'diamond'
// ============================================================

// ── ASSETS REMOTES ─────────────────────────────────────────────────────────
// Les dossiers characters/ et backgrounds/ ne sont pas dans ce repo (trop
// lourds — surtout SSBU à 1.1 GB) : ils vivent dans un repo séparé servi via
// le CDN jsDelivr. URL générée :
//   https://cdn.jsdelivr.net/gh/<user>/<repo>@<branch>/<path>
//
// Pour développer en local sans accès réseau, mets une chaîne vide :
//   ASSETS_BASE_URL = ''   → les images sont chargées depuis les dossiers
//   characters/ et backgrounds/ locaux (relatif au site).
const ASSETS_BASE_URL = 'https://cdn.jsdelivr.net/gh/kiokouwhite/projet-reverie-assets@main';

// Préfixe le path avec ASSETS_BASE_URL si c'est un chemin relatif. Laisse passer
// les URLs absolues (http://, https://, //, data:) et les chemins vides.
function assetUrl(path) {
  if (!path) return path;
  if (/^(https?:)?\/\//.test(path) || path.startsWith('data:')) return path;
  if (!ASSETS_BASE_URL) return path; // dev local sans CDN
  return ASSETS_BASE_URL + '/' + path.replace(/^\//, '');
}

const LAYOUTS = {

  // ── SUPER SMASH BROS ULTIMATE — 8 joueurs, parallélogrammes ──────────────
  ssbu: {
    bgFile: 'backgrounds/ssbu.jpg',
    playerCount: 8,
    rankLabels: ['1','2','3','4','5','5','7','7'],
    rankDisplay: ['1er','2e','3e','4e','5e','5e','7e','7e'],
    slots: [
      // { type, cx, cy, w, h, nameY, rankX, rankY } — base 1400x1400
      // Parallélogrammes : définis par BLACK_SLOTS + PURPLE_SLOTS dans app.js
      // On passe par le système existant pour SSBU
    ],
    useParallelogram: true, // utilise le système existant
  },

  // ── GUILTY GEAR STRIVE — 3 joueurs, cercles ──────────────────────────────
  ggst: {
    bgFile: 'backgrounds/ggst.jpg',
    playerCount: 3,
    rankLabels: ['1','2','3'],
    rankDisplay: ['1er','2e','3e'],
    slots: [
      { cx:929,  cy:627,  r:185, nameY:830,  rankX:929,  rankY:470 },
      { cx:631,  cy:1162, r:155, nameY:1330, rankX:631,  rankY:1020},
      { cx:1174, cy:1162, r:150, nameY:1330, rankX:1174, rankY:1020},
    ],
    slotType: 'circle',
    // hideRanks : ne dessine pas les numéros 1/2/3 par-dessus (déjà
    // intégrés dans l'image de fond ggst.jpg).
    hideRanks: true,
  },

  // ── TEKKEN 8 — 3 joueurs, cartes inclinées ───────────────────────────────
  tekken8: {
    bgFile: 'backgrounds/tekken8.jpg',
    playerCount: 3,
    rankLabels: ['1ER', '2ÈME', '3ÈME'],
    rankDisplay: ['1er', '2e', '3e'],
    slots: [
      // cx, cy = centre ; w, h = dimensions ; skewTop = décalage haut-gauche (trapèze)
      { cx:889,  cy:617,  w:295, h:410, skewTop:62, nameY:860,  rankX:735,  rankY:428, rankSize:88, nameSize:52 },
      { cx:612,  cy:1095, w:255, h:355, skewTop:52, nameY:1295, rankX:488,  rankY:935, rankSize:74, nameSize:42 },
      { cx:1157, cy:1095, w:255, h:355, skewTop:52, nameY:1295, rankX:1022, rankY:935, rankSize:74, nameSize:42 },
    ],
    slotType: 'tekken8',
  },

  // ── 2XKO — 3 joueurs, 2 personnages par joueur, parallélogrammes ────────────
  '2xko': {
    bgFile: 'backgrounds/2xko.jpg',
    playerCount: 3,
    rankLabels: ['1ER', '2ÈME', '3ÈME'],
    rankDisplay: ['1er', '2e', '3e'],
    slots: [
      // cx,cy = centre du duo ; w,h = une carte ; gap = espace entre 2 cartes ; slant = décalage haut (px)
      { cx:700,  cy:530,  w:225, h:440, gap:18, slant:30, nameY:775,  rankX:460, rankY:300, rankSize:90, nameSize:42 },
      { cx:365,  cy:975,  w:178, h:348, gap:14, slant:24, nameY:1168, rankX:195, rankY:800, rankSize:70, nameSize:34 },
      { cx:1035, cy:975,  w:178, h:348, gap:14, slant:24, nameY:1168, rankX:865, rankY:800, rankSize:70, nameSize:34 },
    ],
    slotType: '2xko',
  },

  // ── STREET FIGHTER 6 — 3 joueurs, formes "papier déchiré" ────────────────
  sf6: {
    bgFile: 'backgrounds/sf6.jpg',
    playerCount: 3,
    rankLabels: ['1','2','3'],
    rankDisplay: ['1er','2e','3e'],
    slots: [
      { cx:904,  cy:592, w:384, h:365, nameY:795,  rankX:720,  rankY:418 },
      { cx:674,  cy:1080,w:289, h:270, nameY:1235, rankX:534,  rankY:950 },
      { cx:1134, cy:1080,w:289, h:270, nameY:1235, rankX:994,  rankY:950 },
    ],
    slotType: 'torn', // polygone irrégulier pour matcher le cadre du fond
  },

  // ── DRAGON BALL FIGHTERZ — Side Game, pas de template ────────────────────
  dbfz: {
    bgFile: null,
    playerCount: 8,
    rankLabels: ['1','2','3','4','5','5','7','7'],
    rankDisplay: ['1er','2e','3e','4e','5e','5e','7e','7e'],
    slots: [],
    useParallelogram: true,
  },
};

// Réécrit les `bgFile` relatifs en URLs absolues via le CDN, une seule fois.
// Comme ça les consumers (app.js, multi.js) peuvent continuer à faire
// `img.src = layout.bgFile` sans wrap supplémentaire.
Object.values(LAYOUTS).forEach(l => {
  if (l.bgFile) l.bgFile = assetUrl(l.bgFile);
});

// Mapping noms start.gg → id interne
const STARTGG_GAME_MAP = {
  'Super Smash Bros. Ultimate': 'ssbu',
  'Guilty Gear -Strive-': 'ggst',
  'GUILTY GEAR -STRIVE-': 'ggst',
  'Guilty Gear Strive': 'ggst',
  'Tekken 8': 'tekken8',
  'TEKKEN 8': 'tekken8',
  '2XKO': '2xko',
  'Street Fighter 6': 'sf6',
  'Street Fighter™ 6': 'sf6',
  'Dragon Ball FighterZ': 'dbfz',
  'DRAGON BALL FighterZ': 'dbfz',
};

// Catégories
const MAIN_GAMES = ['ssbu','ggst','tekken8','2xko','sf6'];
const SIDE_GAMES = ['dbfz'];

// Couleurs des numéros de placement par jeu
const RANK_COLORS_BY_GAME = {
  ssbu:    ['#C87DD4','#F5C842','#F5C842','#FFFFFF','#FFFFFF','#FFFFFF','#FFFFFF','#FFFFFF'],
  ggst:    ['#C87DD4','#F5C842','#F5C842'],
  tekken8: ['#C87DD4','#F5C842','#F5C842'],
  '2xko':  ['#C87DD4','#F5C842','#F5C842'],
  sf6:     ['#C87DD4','#F5C842','#F5C842'],
  dbfz:    ['#C87DD4','#F5C842','#F5C842','#FFFFFF','#FFFFFF','#FFFFFF','#FFFFFF','#FFFFFF'],
};

// Noms affichés dans le sélecteur
const GAME_LABELS = {
  ssbu:    'Super Smash Bros. Ultimate',
  ggst:    'Guilty Gear -Strive-',
  tekken8: 'Tekken 8',
  '2xko':  '2XKO',
  sf6:     'Street Fighter 6',
  dbfz:    'Dragon Ball FighterZ',
};
