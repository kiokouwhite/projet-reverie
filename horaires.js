// ============================================================
// HORAIRES.JS — Sondages hebdomadaires Discord
// ============================================================

// ── STATE ─────────────────────────────────────────────────────────────────────
const HR = {
  questions: [
    {
      text: 'A quelle heure arrivez-vous ?',
      options: [
        { emoji: '16h',  label: 'Installation' },
        { emoji: '17h',  label: 'Accueil partie 1' },
        { emoji: '18h',  label: 'Accueil partie 2' },
        { emoji: '19h',  label: 'Début des tournois' },
        { emoji: 'a20h', label: 'Après le début des tournois' },
      ],
    },
    {
      text: 'A quelle heure partez-vous ?',
      options: [
        { emoji: 'av22h', label: 'Avant le rangement' },
        { emoji: '23h',   label: 'Pendant le rangement' },
        { emoji: '0h',    label: 'A la fermeture' },
      ],
    },
    {
      text: 'Voulez-vous recevoir une tâche en priorité ?',
      options: [
        { emoji: 'seeding', label: 'Seeding (précisez si seul ou à plusieurs)' },
        { emoji: 'accueil', label: 'Accueil (précisez durée et nombre)' },
        { emoji: 'regie',   label: 'Régie (précisez combien de temps)' },
      ],
    },
  ],
  lastMessageIds: [],   // stockés après chaque post
  lastChannelId:  '',
  weeklyId: null,       // id du timer/schedule côté bot
  lastResults: null,    // derniers résultats bruts (pour le planning)
  planRoles: [
    { id: 'install',  icon: '🚀', title: 'Installation', slot: null,          users: [] },
    { id: 'acc1',     icon: '🏠', title: 'Accueil',      slot: '17h30-18h30', users: [] },
    { id: 'acc2',     icon: '🏠', title: 'Accueil',      slot: '18h30-19h30', users: [] },
    { id: 'regie',    icon: '💻', title: 'Régie',        slot: '19h30-fin',   users: [] },
    { id: 'seeding',  icon: '🌱', title: 'Seeding',      slot: null,          users: [] },
    { id: 'rangement',icon: '🧹', title: 'Rangement',    slot: 'A la fermeture', users: [] },
  ],
};

// ── INIT ──────────────────────────────────────────────────────────────────────
let hrInitDone = false;
function hrInit() {
  if (hrInitDone) return;
  hrInitDone = true;
  hrLoadBotSettings();
  hrLoadQuestions();   // charge les questions sauvegardées
  hrBuildQuestions();
  hrLoadLastMessageIds();
  // Précharger les emojis (app + serveur) en background pour afficher les
  // images dans les boutons à gauche des options. Re-rend après chargement.
  hrPreloadEmojis().then(() => {
    if (HR_EMOJIS.length) hrBuildQuestions();
  });
  // Charger automatiquement les salons (silent : pas d'erreur si bot non config)
  const hrSel = document.getElementById('hrChannelSelect');
  if (hrSel && hrSel.options.length <= 1) {
    hrLoadChannels(true);
  }
  // Restaurer l'état du panneau gauche (collapsed / visible) depuis la session précédente
  hrRestoreLeftPanelState();
}

// Bascule l'état "panneau gauche masqué". L'état est persisté en localStorage
// pour qu'un reload ou une navigation entre onglets ne casse pas la préférence.
function hrToggleLeftPanel() {
  const page = document.getElementById('hrPage');
  const btn  = document.getElementById('hrCollapseBtn');
  if (!page) return;
  page.classList.toggle('hr-left-collapsed');
  const collapsed = page.classList.contains('hr-left-collapsed');
  if (btn) {
    btn.textContent = collapsed ? '›' : '‹';
    btn.setAttribute('aria-label', collapsed ? 'Afficher le panneau gauche' : 'Masquer le panneau gauche');
  }
  try { localStorage.setItem('hr_left_collapsed', collapsed ? '1' : '0'); } catch {}
}

function hrRestoreLeftPanelState() {
  let saved = '0';
  try { saved = localStorage.getItem('hr_left_collapsed') || '0'; } catch {}
  if (saved === '1') {
    const page = document.getElementById('hrPage');
    const btn  = document.getElementById('hrCollapseBtn');
    if (page) page.classList.add('hr-left-collapsed');
    if (btn) {
      btn.textContent = '›';
      btn.setAttribute('aria-label', 'Afficher le panneau gauche');
    }
  }
}

// Charge HR_EMOJIS (app emojis du bot + emojis du serveur) en parallèle.
// Idempotent : si déjà chargé, ne refait rien.
async function hrPreloadEmojis() {
  if (HR_EMOJIS.length) return;
  const botUrl = (typeof hrGetBotUrl === 'function') ? hrGetBotUrl() : '';
  const secret = (typeof hrGetSecret === 'function') ? hrGetSecret() : '';
  if (!botUrl || !secret) return;
  const headers = { 'x-secret': secret };
  const fetchSafe = async (path) => {
    try {
      const res  = await fetch(`${botUrl}${path}`, { headers });
      const data = await res.json();
      return data.ok ? (data.emojis || []) : [];
    } catch(e) { return []; }
  };
  const [appEmojis, guildEmojis] = await Promise.all([
    fetchSafe('/app-emojis'),
    fetchSafe('/emojis'),
  ]);
  const seen = new Set();
  const merged = [];
  [...appEmojis, ...guildEmojis].forEach(e => {
    if (seen.has(e.name)) return;
    seen.add(e.name);
    merged.push(e);
  });
  HR_EMOJIS = merged;
}

// ── CONSTRUIRE LES ÉDITEURS DE QUESTIONS ──────────────────────────────────────
function hrBuildQuestions() {
  const wrap = document.getElementById('hrQuestionsWrap');
  if (!wrap) return;
  wrap.innerHTML = HR.questions.map((q, qi) => `
    <div class="hr-question-block" id="hrQ${qi}">
      <div class="hr-q-header">
        <span class="hr-q-num">Q${qi + 1}</span>
        <input type="text" class="hr-q-text" value="${escHR(q.text)}"
          oninput="hrSetQText(${qi}, this.value)" placeholder="Question…">
      </div>
      <div class="hr-options-list" id="hrOpts${qi}">
        ${q.options.map((opt, oi) => hrOptionHTML(qi, oi, opt)).join('')}
      </div>
      <button class="hr-add-opt-btn" onclick="hrAddOption(${qi})">+ Ajouter une option</button>
    </div>
  `).join('');
}

// Détecte si c'est un emoji Unicode (vs un nom custom comme "16h")
function hrIsUnicode(str) {
  return str && !/^[a-zA-Z0-9_]+$/.test(str);
}

function hrOptionHTML(qi, oi, opt) {
  const isUni = hrIsUnicode(opt.emoji);
  let btnContent;
  if (!opt.emoji) {
    btnContent = '<span class="hr-pick-icon">🔍</span>';
  } else if (isUni) {
    btnContent = `<span style="font-size:18px;line-height:1">${opt.emoji}</span>`;
  } else {
    // Custom emoji : si on a déjà chargé les emojis (app + serveur), afficher
    // l'image. Sinon fallback sur le nom abrégé.
    const found = HR_EMOJIS.find(e => e.name === opt.emoji);
    if (found && found.url) {
      btnContent = `<img src="${escHR(found.url)}" alt="${escHR(opt.emoji)}" class="hr-emoji-thumb">`;
    } else {
      const abbr = opt.emoji.length > 5 ? opt.emoji.slice(0, 5) + '…' : opt.emoji;
      btnContent = `<span class="hr-pick-name">${abbr}</span>`;
    }
  }
  return `
    <div class="hr-option-row" id="hrOpt${qi}_${oi}">
      <button class="hr-emoji-pick-btn" onclick="hrOpenPicker(${qi},${oi})" title="Choisir un emoji">
        ${btnContent}
      </button>
      <input type="text" class="hr-emoji-input" value="${escHR(opt.emoji)}"
        placeholder=":emoji:" id="hrEmojiInput${qi}_${oi}"
        oninput="hrSetOptEmoji(${qi},${oi},this.value)">
      <input type="text" class="hr-label-input" value="${escHR(opt.label)}"
        placeholder="Label affiché" oninput="hrSetOptLabel(${qi},${oi},this.value)">
      <button class="hr-del-opt-btn" onclick="hrDelOption(${qi},${oi})">✕</button>
    </div>`;
}

// ── EMOJIS UNICODE STANDARD (catégories Discord) ──────────────────────────────
// Format : { em: '😀', name: 'sourire' }
const HR_UNICODE_CATS = [
  { cat: '😀 Personnes', emojis: [
    {em:'😀',name:'sourire'},
    {em:'😃',name:'grand sourire'},
    {em:'😄',name:'sourire yeux'},
    {em:'😁',name:'rire dents'},
    {em:'😆',name:'rire fort'},
    {em:'😅',name:'sueur sourire'},
    {em:'🤣',name:'rouler de rire'},
    {em:'😂',name:'pleurs de rire'},
    {em:'🙂',name:'légèrement souriant'},
    {em:'🙃',name:'sourire renversé'},
    {em:'😉',name:'clin d oeil'},
    {em:'😊',name:'rouge joues sourire'},
    {em:'😇',name:'auréole ange'},
    {em:'🥰',name:'amoureux coeur'},
    {em:'😍',name:'yeux coeur'},
    {em:'🤩',name:'yeux étoiles'},
    {em:'😘',name:'bisou'},
    {em:'😗',name:'sifflement'},
    {em:'😚',name:'bisou yeux fermés'},
    {em:'😙',name:'bisou souriant'},
    {em:'🥲',name:'sourire larme'},
    {em:'😋',name:'délicieux langue'},
    {em:'😛',name:'langue tirée'},
    {em:'😜',name:'clin oeil langue'},
    {em:'🤪',name:'fou zinzin'},
    {em:'😝',name:'yeux fermés langue'},
    {em:'🤑',name:'argent billets'},
    {em:'🤗',name:'câlin bras ouverts'},
    {em:'🤭',name:'main bouche chut'},
    {em:'🤫',name:'chut silence'},
    {em:'🤔',name:'pensif réfléchi'},
    {em:'🤐',name:'bouche fermée zip'},
    {em:'😐',name:'neutre'},
    {em:'😑',name:'sans expression'},
    {em:'😏',name:'malicieux'},
    {em:'😒',name:'mécontent'},
    {em:'🙄',name:'yeux levés au ciel'},
    {em:'😬',name:'grimace gêne'},
    {em:'🤥',name:'menteur nez'},
    {em:'😌',name:'soulagé'},
    {em:'😔',name:'triste abattu'},
    {em:'😪',name:'baillant'},
    {em:'😴',name:'dormant'},
    {em:'😷',name:'masque malade'},
    {em:'🤒',name:'thermomètre fièvre'},
    {em:'🤕',name:'bandage blessé'},
    {em:'🤢',name:'nauséeux vert'},
    {em:'🤧',name:'éternuement mouchoir'},
    {em:'🥵',name:'chaud surchauffé'},
    {em:'🥶',name:'froid gelé'},
    {em:'🥴',name:'étourdi'},
    {em:'😵',name:'assommé'},
    {em:'🤯',name:'explosion tête choqué'},
    {em:'🤠',name:'cowboy chapeau'},
    {em:'🥳',name:'fête anniversaire'},
    {em:'😎',name:'lunettes cool'},
    {em:'🤓',name:'lunettes nerd geek'},
    {em:'🧐',name:'monocle sérieux'},
    {em:'😕',name:'perplexe'},
    {em:'😟',name:'inquiet'},
    {em:'🙁',name:'légèrement triste'},
    {em:'☹️',name:'triste frown'},
    {em:'😮',name:'bouche ouverte surpris'},
    {em:'😲',name:'choqué stupéfait'},
    {em:'😳',name:'rouge gêné'},
    {em:'🥺',name:'suppliant yeux'},
    {em:'😦',name:'froncement sourcils'},
    {em:'😧',name:'angoissé'},
    {em:'😨',name:'effrayé peur'},
    {em:'😰',name:'sueur anxiété'},
    {em:'😥',name:'déçu soulagé'},
    {em:'😢',name:'pleurs larme'},
    {em:'😭',name:'sanglots'},
    {em:'😱',name:'cri peur'},
    {em:'😖',name:'confus'},
    {em:'😩',name:'las épuisé'},
    {em:'😫',name:'fatigué'},
    {em:'🥱',name:'bâillement ennui'},
    {em:'😤',name:'vapeur nez agacé'},
    {em:'😡',name:'rouge colère'},
    {em:'😠',name:'en colère'},
    {em:'🤬',name:'jurons colère'},
    {em:'😈',name:'démon souriant'},
    {em:'👿',name:'démon en colère'},
    {em:'💀',name:'crâne mort'},
    {em:'☠️',name:'tête mort croisée'},
    {em:'💩',name:'caca'},
    {em:'🤡',name:'clown'},
    {em:'👹',name:'ogre monstre'},
    {em:'👺',name:'gobelin'},
    {em:'👻',name:'fantôme'},
    {em:'👽',name:'extraterrestre'},
    {em:'👾',name:'alien jeu'},
    {em:'🤖',name:'robot'},
    {em:'👋',name:'bonjour main'},
    {em:'🤚',name:'main levée dos'},
    {em:'🖐️',name:'main doigts'},
    {em:'✋',name:'stop main'},
    {em:'🖖',name:'vulcain salut'},
    {em:'👌',name:'ok parfait'},
    {em:'✌️',name:'victoire paix deux doigts'},
    {em:'🤞',name:'doigts croisés chance'},
    {em:'🤟',name:'je t aime signe'},
    {em:'🤘',name:'rock cornes'},
    {em:'🤙',name:'appelle moi'},
    {em:'👈',name:'pointer gauche'},
    {em:'👉',name:'pointer droite'},
    {em:'👆',name:'pointer haut'},
    {em:'👇',name:'pointer bas'},
    {em:'☝️',name:'index haut'},
    {em:'👍',name:'pouce haut bien'},
    {em:'👎',name:'pouce bas nul'},
    {em:'✊',name:'poing levé'},
    {em:'👊',name:'coup poing'},
    {em:'🤛',name:'poing gauche'},
    {em:'🤜',name:'poing droite'},
    {em:'👏',name:'applaudissement'},
    {em:'🙌',name:'mains levées'},
    {em:'🫶',name:'coeur mains'},
    {em:'🤝',name:'poignée mains'},
    {em:'🙏',name:'prière merci'},
    {em:'💪',name:'muscle bras fort'},
    {em:'👀',name:'yeux regard'},
    {em:'👅',name:'langue'},
    {em:'👄',name:'lèvres bouche'},
    {em:'👶',name:'bébé'},
    {em:'🧒',name:'enfant'},
    {em:'👦',name:'garçon'},
    {em:'👧',name:'fille'},
    {em:'🧑',name:'personne adulte'},
    {em:'👨',name:'homme'},
    {em:'👩',name:'femme'},
    {em:'👴',name:'vieil homme'},
    {em:'👵',name:'vieille femme'},
    {em:'👮',name:'policier'},
    {em:'🕵️',name:'détective'},
    {em:'💂',name:'garde'},
    {em:'🥷',name:'ninja'},
    {em:'👷',name:'ouvrier casque'},
    {em:'🤴',name:'prince'},
    {em:'👸',name:'princesse'},
    {em:'🤵',name:'smoking'},
    {em:'👰',name:'mariée'},
    {em:'🎅',name:'père noël'},
    {em:'🤶',name:'mère noël'},
    {em:'🦸',name:'super héros'},
    {em:'🦹',name:'super vilain'},
    {em:'🧙',name:'sorcier mage'},
    {em:'🧝',name:'elfe'},
    {em:'🧛',name:'vampire'},
    {em:'🧟',name:'zombie'},
    {em:'🧞',name:'génie'},
    {em:'🧜',name:'sirène'},
    {em:'🧚',name:'fée'},
    {em:'👫',name:'couple homme femme'},
    {em:'👬',name:'deux hommes'},
    {em:'👭',name:'deux femmes'},
    {em:'💏',name:'bisou couple'},
    {em:'💑',name:'couple coeur'},
    {em:'🗣️',name:'parler discours'},
    {em:'👥',name:'groupe personnes'},
    {em:'🫂',name:'câlin'},
    {em:'👣',name:'empreintes pieds'},
  ]},
  { cat: '🌿 Nature', emojis: [
    {em:'🐶',name:'chien'},
    {em:'🐱',name:'chat'},
    {em:'🐭',name:'souris'},
    {em:'🐹',name:'hamster'},
    {em:'🐰',name:'lapin'},
    {em:'🦊',name:'renard'},
    {em:'🐻',name:'ours'},
    {em:'🐼',name:'panda'},
    {em:'🐨',name:'koala'},
    {em:'🐯',name:'tigre'},
    {em:'🦁',name:'lion'},
    {em:'🐮',name:'vache'},
    {em:'🐷',name:'cochon'},
    {em:'🐸',name:'grenouille'},
    {em:'🐵',name:'singe'},
    {em:'🙈',name:'singe yeux'},
    {em:'🙉',name:'singe oreilles'},
    {em:'🙊',name:'singe bouche'},
    {em:'🐔',name:'poulet'},
    {em:'🐧',name:'pingouin'},
    {em:'🐦',name:'oiseau'},
    {em:'🐤',name:'poussin'},
    {em:'🦆',name:'canard'},
    {em:'🦅',name:'aigle'},
    {em:'🦉',name:'hibou chouette'},
    {em:'🦇',name:'chauve souris'},
    {em:'🐺',name:'loup'},
    {em:'🐗',name:'sanglier'},
    {em:'🐴',name:'cheval'},
    {em:'🦄',name:'licorne'},
    {em:'🐝',name:'abeille'},
    {em:'🦋',name:'papillon'},
    {em:'🐌',name:'escargot'},
    {em:'🐞',name:'coccinelle'},
    {em:'🦟',name:'moustique'},
    {em:'🦗',name:'grillon'},
    {em:'🕷️',name:'araignée'},
    {em:'🦂',name:'scorpion'},
    {em:'🐢',name:'tortue'},
    {em:'🐍',name:'serpent'},
    {em:'🦎',name:'lézard'},
    {em:'🦕',name:'dinosaure'},
    {em:'🐙',name:'pieuvre'},
    {em:'🦑',name:'calmar'},
    {em:'🦀',name:'crabe'},
    {em:'🐡',name:'poisson globe'},
    {em:'🐠',name:'poisson tropical'},
    {em:'🐟',name:'poisson'},
    {em:'🐬',name:'dauphin'},
    {em:'🐳',name:'baleine'},
    {em:'🦈',name:'requin'},
    {em:'🐊',name:'crocodile'},
    {em:'🐅',name:'tigre sauvage'},
    {em:'🐆',name:'léopard'},
    {em:'🦓',name:'zèbre'},
    {em:'🐘',name:'éléphant'},
    {em:'🦛',name:'hippopotame'},
    {em:'🦏',name:'rhinocéros'},
    {em:'🐪',name:'chameau'},
    {em:'🦒',name:'girafe'},
    {em:'🦘',name:'kangourou'},
    {em:'🐕',name:'chien'},
    {em:'🐩',name:'caniche'},
    {em:'🐈',name:'chat assis'},
    {em:'🦔',name:'hérisson'},
    {em:'🌸',name:'fleur cerisier'},
    {em:'💐',name:'bouquet fleurs'},
    {em:'🌹',name:'rose'},
    {em:'🌺',name:'hibiscus'},
    {em:'🌻',name:'tournesol'},
    {em:'🌼',name:'fleur jaune'},
    {em:'🌷',name:'tulipe'},
    {em:'🌱',name:'plante pousse'},
    {em:'🌲',name:'arbre pin'},
    {em:'🌳',name:'arbre feuillu'},
    {em:'🌴',name:'palmier'},
    {em:'🌵',name:'cactus'},
    {em:'☘️',name:'trèfle'},
    {em:'🍀',name:'trèfle quatre feuilles chance'},
    {em:'🍁',name:'feuille érable'},
    {em:'🍂',name:'feuilles automne'},
    {em:'🍃',name:'feuilles vent'},
    {em:'🍄',name:'champignon'},
    {em:'🌾',name:'blé céréales'},
    {em:'💧',name:'goutte eau'},
    {em:'🌊',name:'vague mer'},
    {em:'🌀',name:'cyclone tourbillon'},
    {em:'🌈',name:'arc en ciel'},
    {em:'❄️',name:'flocon neige'},
    {em:'☃️',name:'bonhomme neige'},
    {em:'⛄',name:'bonhomme neige dehors'},
    {em:'🌪️',name:'tornade'},
    {em:'☀️',name:'soleil'},
    {em:'🌙',name:'lune croissant'},
    {em:'⭐',name:'étoile'},
    {em:'🌟',name:'étoile brillante'},
    {em:'🌠',name:'étoile filante'},
    {em:'🌌',name:'galaxie voie lactée'},
    {em:'⛅',name:'nuage soleil'},
    {em:'🌧️',name:'pluie'},
    {em:'⛈️',name:'orage'},
    {em:'🌩️',name:'éclair'},
    {em:'🌨️',name:'neige'},
    {em:'🌍',name:'terre europe afrique'},
    {em:'🌎',name:'terre amériques'},
    {em:'🌏',name:'terre asie'},
    {em:'🏔️',name:'montagne neige'},
    {em:'🌋',name:'volcan'},
    {em:'🏕️',name:'camping'},
    {em:'🏖️',name:'plage'},
    {em:'🏜️',name:'désert'},
    {em:'🏝️',name:'île déserte'},
    {em:'🏞️',name:'parc national'},
  ]},
  { cat: '🍔 Nourriture', emojis: [
    {em:'🍏',name:'pomme verte'},
    {em:'🍎',name:'pomme rouge'},
    {em:'🍐',name:'poire'},
    {em:'🍊',name:'orange mandarine'},
    {em:'🍋',name:'citron'},
    {em:'🍌',name:'banane'},
    {em:'🍉',name:'pastèque'},
    {em:'🍇',name:'raisin'},
    {em:'🍓',name:'fraise'},
    {em:'🫐',name:'myrtille'},
    {em:'🍒',name:'cerise'},
    {em:'🍑',name:'pêche'},
    {em:'🥭',name:'mangue'},
    {em:'🍍',name:'ananas'},
    {em:'🥥',name:'noix de coco'},
    {em:'🥝',name:'kiwi'},
    {em:'🍅',name:'tomate'},
    {em:'🍆',name:'aubergine'},
    {em:'🥑',name:'avocat'},
    {em:'🥦',name:'brocoli'},
    {em:'🥬',name:'salade verte'},
    {em:'🥒',name:'concombre'},
    {em:'🌶️',name:'piment'},
    {em:'🧄',name:'ail'},
    {em:'🧅',name:'oignon'},
    {em:'🥔',name:'pomme de terre'},
    {em:'🌽',name:'maïs'},
    {em:'🥐',name:'croissant'},
    {em:'🍞',name:'pain'},
    {em:'🥖',name:'baguette'},
    {em:'🧀',name:'fromage'},
    {em:'🥚',name:'oeuf'},
    {em:'🍳',name:'oeuf poêle'},
    {em:'🥞',name:'pancakes'},
    {em:'🧇',name:'gaufre'},
    {em:'🥓',name:'bacon'},
    {em:'🥩',name:'steak viande'},
    {em:'🍗',name:'cuisse poulet'},
    {em:'🍖',name:'os viande'},
    {em:'🌭',name:'hot dog'},
    {em:'🍔',name:'burger hamburger'},
    {em:'🍟',name:'frites'},
    {em:'🍕',name:'pizza'},
    {em:'🥪',name:'sandwich'},
    {em:'🌮',name:'taco'},
    {em:'🌯',name:'wrap'},
    {em:'🥗',name:'salade'},
    {em:'🍝',name:'pâtes spaghetti'},
    {em:'🍜',name:'ramen nouilles'},
    {em:'🍲',name:'pot potage'},
    {em:'🍛',name:'curry riz'},
    {em:'🍣',name:'sushi'},
    {em:'🍱',name:'bento japonais'},
    {em:'🥟',name:'raviolis gyoza'},
    {em:'🍤',name:'crevette frite'},
    {em:'🍙',name:'onigiri'},
    {em:'🍚',name:'riz cuit'},
    {em:'🧁',name:'cupcake'},
    {em:'🍰',name:'gâteau tranche'},
    {em:'🎂',name:'gâteau anniversaire'},
    {em:'🍮',name:'crème caramel flan'},
    {em:'🍭',name:'sucette'},
    {em:'🍬',name:'bonbon'},
    {em:'🍫',name:'chocolat'},
    {em:'🍿',name:'popcorn'},
    {em:'🍩',name:'donut'},
    {em:'🍪',name:'cookie biscuit'},
    {em:'🍯',name:'miel pot'},
    {em:'🧃',name:'jus boîte'},
    {em:'🥤',name:'verre paille'},
    {em:'🧋',name:'bubble tea'},
    {em:'☕',name:'café'},
    {em:'🍵',name:'thé'},
    {em:'🧉',name:'maté'},
    {em:'🍺',name:'bière'},
    {em:'🍻',name:'trinquer bières'},
    {em:'🥂',name:'champagne flûtes'},
    {em:'🍷',name:'vin rouge'},
    {em:'🥃',name:'whisky verre'},
    {em:'🍸',name:'cocktail'},
    {em:'🍹',name:'cocktail tropical'},
    {em:'🧊',name:'glaçon glace'},
    {em:'🍴',name:'fourchette couteau'},
    {em:'🥢',name:'baguettes'},
    {em:'🧂',name:'sel'},
  ]},
  { cat: '⚽ Activités', emojis: [
    {em:'⚽',name:'football'},
    {em:'🏀',name:'basketball'},
    {em:'🏈',name:'football américain'},
    {em:'⚾',name:'baseball'},
    {em:'🥎',name:'softball'},
    {em:'🎾',name:'tennis'},
    {em:'🏐',name:'volleyball'},
    {em:'🏉',name:'rugby'},
    {em:'🥏',name:'frisbee'},
    {em:'🎱',name:'billard'},
    {em:'🏓',name:'ping pong tennis de table'},
    {em:'🏸',name:'badminton'},
    {em:'🏒',name:'hockey glace'},
    {em:'🥅',name:'filet but'},
    {em:'⛳',name:'golf'},
    {em:'🏹',name:'arc flèche tir'},
    {em:'🎣',name:'pêche'},
    {em:'🤿',name:'plongée masque'},
    {em:'🥊',name:'boxe gants'},
    {em:'🥋',name:'arts martiaux'},
    {em:'🎽',name:'maillot sport'},
    {em:'🛹',name:'skateboard'},
    {em:'🛼',name:'roller'},
    {em:'🛷',name:'luge'},
    {em:'⛸️',name:'patin glace'},
    {em:'🎿',name:'ski'},
    {em:'🏋️',name:'haltères musculation'},
    {em:'🤸',name:'gymnastique'},
    {em:'🤺',name:'escrime'},
    {em:'🏇',name:'équitation jockey'},
    {em:'⛷️',name:'skieur'},
    {em:'🏂',name:'snowboard'},
    {em:'🤼',name:'lutte'},
    {em:'🧘',name:'méditation yoga'},
    {em:'🏄',name:'surf'},
    {em:'🚣',name:'aviron'},
    {em:'🧗',name:'escalade'},
    {em:'🚴',name:'vélo cyclisme'},
    {em:'🏆',name:'trophée'},
    {em:'🥇',name:'médaille or'},
    {em:'🥈',name:'médaille argent'},
    {em:'🥉',name:'médaille bronze'},
    {em:'🏅',name:'médaille sport'},
    {em:'🎖️',name:'décoration militaire'},
    {em:'🎪',name:'cirque chapiteau'},
    {em:'🤹',name:'jongleur'},
    {em:'🎭',name:'théâtre masques'},
    {em:'🎨',name:'palette peinture'},
    {em:'🎬',name:'clap cinéma'},
    {em:'🎤',name:'micro chant'},
    {em:'🎧',name:'casque audio'},
    {em:'🎼',name:'partition musique'},
    {em:'🎹',name:'piano'},
    {em:'🥁',name:'batterie'},
    {em:'🎷',name:'saxophone'},
    {em:'🎺',name:'trompette'},
    {em:'🎸',name:'guitare'},
    {em:'🎻',name:'violon'},
    {em:'🎮',name:'manette jeu vidéo'},
    {em:'🕹️',name:'joystick'},
    {em:'🎯',name:'cible fléchettes'},
    {em:'🎲',name:'dé chance'},
    {em:'🧩',name:'puzzle'},
    {em:'♟️',name:'échecs'},
    {em:'🃏',name:'joker carte'},
    {em:'🎰',name:'machine sous'},
    {em:'🎳',name:'bowling'},
  ]},
  { cat: '✈️ Voyage', emojis: [
    {em:'🚗',name:'voiture'},
    {em:'🚕',name:'taxi'},
    {em:'🚙',name:'SUV 4x4'},
    {em:'🚌',name:'bus'},
    {em:'🏎️',name:'voiture course'},
    {em:'🚓',name:'voiture police'},
    {em:'🚑',name:'ambulance'},
    {em:'🚒',name:'camion pompiers'},
    {em:'🚚',name:'camion livraison'},
    {em:'🚜',name:'tracteur'},
    {em:'🛵',name:'scooter'},
    {em:'🚲',name:'vélo'},
    {em:'🛴',name:'trottinette'},
    {em:'🛹',name:'skateboard'},
    {em:'🚏',name:'arrêt bus'},
    {em:'⛽',name:'station essence'},
    {em:'🚦',name:'feux tricolores'},
    {em:'🛑',name:'stop panneau'},
    {em:'⚓',name:'ancre bateau'},
    {em:'⛵',name:'voilier'},
    {em:'🚤',name:'bateau rapide'},
    {em:'🚢',name:'bateau paquebot'},
    {em:'✈️',name:'avion'},
    {em:'🛩️',name:'petit avion'},
    {em:'🛫',name:'décollage avion'},
    {em:'🛬',name:'atterrissage avion'},
    {em:'💺',name:'siège avion'},
    {em:'🚁',name:'hélicoptère'},
    {em:'🚀',name:'fusée'},
    {em:'🛸',name:'soucoupe volante'},
    {em:'🪐',name:'planète'},
    {em:'🌍',name:'monde terre'},
    {em:'🗺️',name:'carte monde'},
    {em:'🧭',name:'boussole'},
    {em:'🏔️',name:'montagne'},
    {em:'🌋',name:'volcan'},
    {em:'🏕️',name:'camping tente'},
    {em:'🏖️',name:'plage'},
    {em:'🏜️',name:'désert'},
    {em:'🏝️',name:'île'},
    {em:'🏟️',name:'stade'},
    {em:'🏛️',name:'musée colonnes'},
    {em:'🏠',name:'maison'},
    {em:'🏡',name:'maison jardin'},
    {em:'🏢',name:'immeuble bureau'},
    {em:'🏥',name:'hôpital'},
    {em:'🏦',name:'banque'},
    {em:'🏨',name:'hôtel'},
    {em:'🏪',name:'magasin'},
    {em:'🏫',name:'école'},
    {em:'🏭',name:'usine'},
    {em:'🏯',name:'château japonais'},
    {em:'🏰',name:'château'},
    {em:'🗼',name:'tour eiffel'},
    {em:'🗽',name:'statue liberté'},
    {em:'⛪',name:'église'},
    {em:'🕌',name:'mosquée'},
    {em:'🕋',name:'kaaba mecque'},
    {em:'⛩️',name:'torii japon'},
    {em:'⛲',name:'fontaine'},
    {em:'⛺',name:'tente camping'},
    {em:'🌁',name:'brouillard ville'},
    {em:'🌃',name:'nuit étoiles ville'},
    {em:'🏙️',name:'skyline ville'},
    {em:'🌅',name:'lever soleil'},
    {em:'🌆',name:'coucher soleil ville'},
    {em:'🌉',name:'pont nuit'},
    {em:'🎡',name:'grande roue'},
    {em:'🎢',name:'montagnes russes'},
    {em:'🎠',name:'carrousel manège'},
    {em:'🎪',name:'cirque'},
  ]},
  { cat: '💡 Objets', emojis: [
    {em:'⌚',name:'montre'},
    {em:'📱',name:'téléphone smartphone'},
    {em:'💻',name:'ordinateur portable'},
    {em:'⌨️',name:'clavier'},
    {em:'🖥️',name:'écran ordinateur bureau'},
    {em:'🖱️',name:'souris ordinateur'},
    {em:'💾',name:'disquette'},
    {em:'💿',name:'CD disque'},
    {em:'📀',name:'DVD'},
    {em:'📷',name:'appareil photo'},
    {em:'📸',name:'flash photo'},
    {em:'📹',name:'caméra vidéo'},
    {em:'🎥',name:'cinéma caméra'},
    {em:'📺',name:'télévision TV'},
    {em:'📻',name:'radio'},
    {em:'☎️',name:'téléphone fixe'},
    {em:'📟',name:'bip pager'},
    {em:'📠',name:'fax'},
    {em:'⏰',name:'réveil alarme'},
    {em:'⌛',name:'sablier temps'},
    {em:'⏳',name:'sablier en cours'},
    {em:'📡',name:'antenne satellite'},
    {em:'🔋',name:'batterie'},
    {em:'🔌',name:'prise électrique'},
    {em:'💡',name:'ampoule idée'},
    {em:'🔦',name:'lampe torche'},
    {em:'🕯️',name:'bougie'},
    {em:'💰',name:'sac argent'},
    {em:'💵',name:'billet dollar'},
    {em:'💳',name:'carte crédit'},
    {em:'🪙',name:'pièce monnaie'},
    {em:'📈',name:'graphique hausse'},
    {em:'📉',name:'graphique baisse'},
    {em:'📊',name:'graphique barres'},
    {em:'📋',name:'presse papiers'},
    {em:'📌',name:'punaise'},
    {em:'📍',name:'épingle localisation'},
    {em:'📎',name:'trombone'},
    {em:'📏',name:'règle'},
    {em:'📐',name:'équerre'},
    {em:'✂️',name:'ciseaux'},
    {em:'🗑️',name:'poubelle'},
    {em:'🔒',name:'cadenas fermé'},
    {em:'🔓',name:'cadenas ouvert'},
    {em:'🔑',name:'clé'},
    {em:'🗝️',name:'vieille clé'},
    {em:'🔨',name:'marteau'},
    {em:'⛏️',name:'pioche'},
    {em:'🛠️',name:'outils'},
    {em:'⚔️',name:'épées croisées'},
    {em:'🛡️',name:'bouclier'},
    {em:'🔧',name:'clé anglaise'},
    {em:'🔩',name:'boulon vis'},
    {em:'⚙️',name:'engrenage'},
    {em:'⚖️',name:'balance justice'},
    {em:'🔗',name:'chaîne lien'},
    {em:'🧲',name:'aimant'},
    {em:'🧰',name:'boîte outils'},
    {em:'🧱',name:'brique mur'},
    {em:'🪞',name:'miroir'},
    {em:'🛏️',name:'lit'},
    {em:'🛋️',name:'canapé'},
    {em:'🚿',name:'douche'},
    {em:'🛁',name:'baignoire'},
    {em:'🧴',name:'lotion flacon'},
    {em:'🧹',name:'balai'},
    {em:'🧺',name:'panier'},
    {em:'🧻',name:'papier toilette'},
    {em:'🧼',name:'savon'},
    {em:'🧽',name:'éponge'},
    {em:'💊',name:'pilule médicament'},
    {em:'💉',name:'seringue vaccin'},
    {em:'🩺',name:'stéthoscope médecin'},
    {em:'🩻',name:'radio scanner'},
    {em:'🌡️',name:'thermomètre'},
    {em:'🧬',name:'ADN génétique'},
    {em:'🧪',name:'tube essai'},
    {em:'🔭',name:'télescope astronomie'},
    {em:'🔬',name:'microscope'},
    {em:'🛒',name:'chariot courses'},
    {em:'🧸',name:'ours peluche'},
    {em:'🎁',name:'cadeau'},
    {em:'🎀',name:'ruban noeud'},
    {em:'🎊',name:'confettis fête'},
    {em:'🎉',name:'fête anniversaire'},
    {em:'🎈',name:'ballon'},
  ]},
  { cat: '🔣 Symboles', emojis: [
    {em:'❤️',name:'coeur rouge amour'},
    {em:'🧡',name:'coeur orange'},
    {em:'💛',name:'coeur jaune'},
    {em:'💚',name:'coeur vert'},
    {em:'💙',name:'coeur bleu'},
    {em:'💜',name:'coeur violet'},
    {em:'🖤',name:'coeur noir'},
    {em:'🤍',name:'coeur blanc'},
    {em:'🤎',name:'coeur marron'},
    {em:'💔',name:'coeur brisé'},
    {em:'❤️‍🔥',name:'coeur feu passion'},
    {em:'💕',name:'deux coeurs'},
    {em:'💞',name:'coeurs tournants'},
    {em:'💓',name:'coeur battant'},
    {em:'💗',name:'coeur grandissant'},
    {em:'💖',name:'coeur brillant'},
    {em:'💘',name:'coeur flèche cupidon'},
    {em:'💝',name:'coeur ruban'},
    {em:'✅',name:'ok vrai valide'},
    {em:'❌',name:'croix faux non'},
    {em:'⭕',name:'cercle rouge'},
    {em:'🛑',name:'stop interdit'},
    {em:'⛔',name:'sens interdit'},
    {em:'🚫',name:'interdit'},
    {em:'❓',name:'point interrogation'},
    {em:'❗',name:'point exclamation'},
    {em:'‼️',name:'double exclamation'},
    {em:'⁉️',name:'exclamation interrogation'},
    {em:'💯',name:'cent pour cent parfait'},
    {em:'🔥',name:'feu flamme'},
    {em:'✨',name:'étincelles'},
    {em:'💫',name:'étoile tournante'},
    {em:'⚡',name:'éclair foudre'},
    {em:'💥',name:'explosion'},
    {em:'🌟',name:'étoile brillante'},
    {em:'⭐',name:'étoile'},
    {em:'🔔',name:'cloche'},
    {em:'🔕',name:'cloche muette'},
    {em:'📢',name:'haut parleur'},
    {em:'📣',name:'mégaphone'},
    {em:'💬',name:'bulle dialogue'},
    {em:'💭',name:'bulle pensée'},
    {em:'📝',name:'mémo note'},
    {em:'📅',name:'calendrier'},
    {em:'📆',name:'agenda'},
    {em:'🔖',name:'marque page'},
    {em:'🏷️',name:'étiquette'},
    {em:'📌',name:'punaise'},
    {em:'♻️',name:'recyclage'},
    {em:'⚠️',name:'avertissement danger'},
    {em:'☢️',name:'radioactif'},
    {em:'☣️',name:'biohazard'},
    {em:'⬆️',name:'flèche haut'},
    {em:'➡️',name:'flèche droite'},
    {em:'⬇️',name:'flèche bas'},
    {em:'⬅️',name:'flèche gauche'},
    {em:'↩️',name:'retour gauche'},
    {em:'↪️',name:'retour droite'},
    {em:'🔀',name:'mélanger aléatoire'},
    {em:'🔁',name:'répéter boucle'},
    {em:'▶️',name:'lecture play'},
    {em:'⏸️',name:'pause'},
    {em:'⏹️',name:'stop arrêt'},
    {em:'⏭️',name:'suivant avance'},
    {em:'⏮️',name:'précédent retour'},
    {em:'🔇',name:'muet son'},
    {em:'🔈',name:'son faible'},
    {em:'🔊',name:'son fort'},
    {em:'📶',name:'signal wifi barres'},
    {em:'🔞',name:'interdit mineurs'},
    {em:'💱',name:'échange monnaie'},
    {em:'💲',name:'dollar symbole'},
    {em:'🆒',name:'cool'},
    {em:'🆓',name:'gratuit free'},
    {em:'🆕',name:'nouveau new'},
    {em:'🆗',name:'ok'},
    {em:'🆘',name:'sos urgence'},
    {em:'🆙',name:'up'},
    {em:'🆚',name:'versus VS'},
    {em:'☮️',name:'paix'},
    {em:'✝️',name:'croix chrétienne'},
    {em:'☪️',name:'islam croissant'},
    {em:'✡️',name:'étoile david judaïsme'},
    {em:'☯️',name:'yin yang'},
    {em:'♾️',name:'infini'},
    {em:'#️⃣',name:'hashtag dièse'},
    {em:'*️⃣',name:'astérisque'},
    {em:'0️⃣',name:'zéro chiffre'},
    {em:'1️⃣',name:'un chiffre'},
    {em:'2️⃣',name:'deux chiffre'},
    {em:'3️⃣',name:'trois chiffre'},
    {em:'4️⃣',name:'quatre chiffre'},
    {em:'5️⃣',name:'cinq chiffre'},
    {em:'6️⃣',name:'six chiffre'},
    {em:'7️⃣',name:'sept chiffre'},
    {em:'8️⃣',name:'huit chiffre'},
    {em:'9️⃣',name:'neuf chiffre'},
    {em:'🔟',name:'dix chiffre'},
  ]},
  { cat: '🏳️ Drapeaux', emojis: [
    {em:'🏳️',name:'drapeau blanc'},
    {em:'🏴',name:'drapeau noir'},
    {em:'🚩',name:'drapeau rouge signalement'},
    {em:'🏁',name:'drapeau damier arrivée'},
    {em:'🏴‍☠️',name:'drapeau pirate'},
    {em:'🏳️‍🌈',name:'drapeau arc en ciel LGBT'},
    {em:'🏳️‍⚧️',name:'drapeau transgenre'},
    {em:'🇫🇷',name:'france drapeau français'},
    {em:'🇧🇪',name:'belgique'},
    {em:'🇨🇭',name:'suisse'},
    {em:'🇨🇦',name:'canada'},
    {em:'🇺🇸',name:'états-unis usa américain'},
    {em:'🇬🇧',name:'royaume-uni britannique anglais'},
    {em:'🇩🇪',name:'allemagne'},
    {em:'🇪🇸',name:'espagne'},
    {em:'🇮🇹',name:'italie'},
    {em:'🇵🇹',name:'portugal'},
    {em:'🇯🇵',name:'japon'},
    {em:'🇨🇳',name:'chine'},
    {em:'🇰🇷',name:'corée du sud'},
    {em:'🇧🇷',name:'brésil'},
    {em:'🇲🇽',name:'mexique'},
    {em:'🇦🇺',name:'australie'},
    {em:'🇷🇺',name:'russie'},
    {em:'🇮🇳',name:'inde'},
    {em:'🇳🇱',name:'pays-bas hollande'},
    {em:'🇸🇪',name:'suède'},
    {em:'🇳🇴',name:'norvège'},
    {em:'🇩🇰',name:'danemark'},
    {em:'🇫🇮',name:'finlande'},
    {em:'🇵🇱',name:'pologne'},
    {em:'🇦🇷',name:'argentine'},
    {em:'🇹🇷',name:'turquie'},
    {em:'🇸🇦',name:'arabie saoudite'},
    {em:'🇿🇦',name:'afrique du sud'},
    {em:'🇲🇦',name:'maroc'},
    {em:'🇩🇿',name:'algérie'},
    {em:'🇹🇳',name:'tunisie'},
    {em:'🇸🇳',name:'sénégal'},
    {em:'🇨🇲',name:'cameroun'},
    {em:'🇨🇮',name:'côte d ivoire'},
    {em:'🇬🇭',name:'ghana'},
    {em:'🇳🇬',name:'nigéria'},
    {em:'🇪🇬',name:'égypte'},
    {em:'🇦🇹',name:'autriche'},
    {em:'🇬🇷',name:'grèce'},
    {em:'🇷🇴',name:'roumanie'},
    {em:'🇺🇦',name:'ukraine'},
    {em:'🇨🇿',name:'tchéquie'},
    {em:'🇭🇺',name:'hongrie'},
    {em:'🇸🇰',name:'slovaquie'},
    {em:'🇭🇷',name:'croatie'},
    {em:'🇷🇸',name:'serbie'},
    {em:'🇮🇱',name:'israël'},
    {em:'🇮🇷',name:'iran'},
    {em:'🇮🇶',name:'irak'},
    {em:'🇵🇰',name:'pakistan'},
    {em:'🇧🇩',name:'bangladesh'},
    {em:'🇹🇭',name:'thaïlande'},
    {em:'🇻🇳',name:'vietnam'},
    {em:'🇵🇭',name:'philippines'},
    {em:'🇮🇩',name:'indonésie'},
    {em:'🇲🇾',name:'malaisie'},
    {em:'🇸🇬',name:'singapour'},
    {em:'🇳🇿',name:'nouvelle-zélande'},
    {em:'🇨🇴',name:'colombie'},
    {em:'🇨🇱',name:'chili'},
    {em:'🇵🇪',name:'pérou'},
    {em:'🇻🇪',name:'venezuela'},
    {em:'🇨🇺',name:'cuba'},
    {em:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',name:'angleterre'},
    {em:'🏴󠁧󠁢󠁳󠁣󠁴󠁿',name:'écosse'},
    {em:'🏴󠁧󠁢󠁷󠁬󠁳󠁿',name:'pays de galles'},
    {em:'🇪🇺',name:'union européenne europe'},
    {em:'🇺🇳',name:'nations unies ONU'},
  ]},
];

// ── EMOJI PICKER ──────────────────────────────────────────────────────────────
let HR_EMOJIS      = []; // cache emojis serveur
let HR_PICKER_TAB  = 'server'; // 'server' | 'standard'

async function hrOpenPicker(qi, oi) {
  document.querySelectorAll('.hr-emoji-picker-popup').forEach(p => p.remove());

  const anchor = document.getElementById(`hrOpt${qi}_${oi}`);
  if (!anchor) return;

  // Charger emojis (app + serveur) si pas encore fait
  await hrPreloadEmojis();

  const popup = document.createElement('div');
  popup.className = 'hr-emoji-picker-popup';
  anchor.style.position = 'relative';
  anchor.appendChild(popup);

  // Empêche les clics à l'intérieur du popup de remonter au document (évite la fermeture lors du changement d'onglet)
  popup.addEventListener('click', e => e.stopPropagation());

  hrRenderPicker(popup, qi, oi, HR_PICKER_TAB);

  setTimeout(() => {
    document.addEventListener('click', function closePicker(ev) {
      if (!popup.contains(ev.target) && !ev.target.closest('.hr-emoji-pick-btn')) {
        popup.remove();
        document.removeEventListener('click', closePicker);
      }
    });
  }, 10);
}

let HR_SELECTED_CAT = 0; // index catégorie unicode active

function hrRenderPicker(popup, qi, oi, tab) {
  HR_PICKER_TAB = tab;
  const hasServer = HR_EMOJIS.length > 0;

  let bodyHTML = '';
  let catBarHTML = '';

  if (tab === 'server') {
    if (!hasServer) {
      bodyHTML = '<p class="hr-picker-empty">Aucun emoji custom trouvé.<br>Configure le bot et réessaie.</p>';
    } else {
      bodyHTML = `<div class="hr-picker-grid" id="hrPickerGrid">
        ${HR_EMOJIS.map(e => `
          <button class="hr-picker-emoji" title=":${e.name}:"
            onclick="hrPickEmoji(${qi},${oi},'${e.name}','${e.url}',false)">
            <img src="${e.url}" alt="${e.name}">
            <span>${e.name}</span>
          </button>`).join('')}
      </div>`;
    }
  } else {
    // Barre de catégories cliquable
    catBarHTML = `<div class="hr-picker-catbar">
      ${HR_UNICODE_CATS.map((cat, idx) => {
        const icon = cat.cat.split(' ')[0]; // premier caractère = emoji
        return `<button class="hr-picker-catbtn ${idx === HR_SELECTED_CAT ? 'active' : ''}"
          title="${cat.cat}"
          onclick="hrSelectUnicodeCat(this.closest('.hr-emoji-picker-popup'),${qi},${oi},${idx})">
          ${icon}
        </button>`;
      }).join('')}
    </div>`;

    // Grille de la catégorie sélectionnée
    const cat = HR_UNICODE_CATS[HR_SELECTED_CAT];
    bodyHTML = `
      <div class="hr-picker-cat-label">${cat.cat}</div>
      <div class="hr-picker-grid hr-picker-grid-unicode" id="hrPickerGrid">
        ${cat.emojis.map(({em, name}) => `
          <button class="hr-picker-emoji hr-picker-emoji-unicode" title="${name}"
            onclick="hrPickEmoji(${qi},${oi},'${em}','',true)">
            <span class="hr-unicode-em">${em}</span>
          </button>`).join('')}
      </div>`;
  }

  popup.innerHTML = `
    <div class="hr-picker-tabs">
      <button class="hr-picker-tab ${tab==='server'?'active':''}" onclick="hrSwitchPickerTab(this.closest('.hr-emoji-picker-popup'),${qi},${oi},'server')">🖥️ Serveur</button>
      <button class="hr-picker-tab ${tab==='standard'?'active':''}" onclick="hrSwitchPickerTab(this.closest('.hr-emoji-picker-popup'),${qi},${oi},'standard')">😀 Standard</button>
    </div>
    <div class="hr-picker-search-wrap">
      <input type="text" class="hr-picker-search" placeholder="🔍 Rechercher…" oninput="hrFilterPicker(this.value,${qi},${oi})">
    </div>
    ${catBarHTML}
    <div class="hr-picker-body">${bodyHTML}</div>`;

  popup.querySelector('.hr-picker-search').focus();
}

function hrSwitchPickerTab(popup, qi, oi, tab) {
  HR_SELECTED_CAT = 0;
  hrRenderPicker(popup, qi, oi, tab);
}

function hrSelectUnicodeCat(popup, qi, oi, idx) {
  HR_SELECTED_CAT = idx;
  // Mettre à jour les boutons actifs
  popup.querySelectorAll('.hr-picker-catbtn').forEach((btn, i) => {
    btn.classList.toggle('active', i === idx);
  });
  // Re-render uniquement la body
  const cat = HR_UNICODE_CATS[idx];
  const body = popup.querySelector('.hr-picker-body');
  body.innerHTML = `
    <div class="hr-picker-cat-label">${cat.cat}</div>
    <div class="hr-picker-grid hr-picker-grid-unicode" id="hrPickerGrid">
      ${cat.emojis.map(({em, name}) => `
        <button class="hr-picker-emoji hr-picker-emoji-unicode" title="${name}"
          onclick="hrPickEmoji(${qi},${oi},'${em}','',true)">
          <span class="hr-unicode-em">${em}</span>
        </button>`).join('')}
    </div>`;
  body.scrollTop = 0;
}

function hrFilterPicker(query, qi, oi) {
  const q = query.toLowerCase().trim();
  const body = document.querySelector('.hr-picker-body');
  if (!body) return;

  if (!q) {
    // Retour à la catégorie sélectionnée
    const cat = HR_UNICODE_CATS[HR_SELECTED_CAT] || HR_UNICODE_CATS[0];
    if (HR_PICKER_TAB === 'standard') {
      body.innerHTML = `
        <div class="hr-picker-cat-label">${cat.cat}</div>
        <div class="hr-picker-grid hr-picker-grid-unicode" id="hrPickerGrid">
          ${cat.emojis.map(({em, name}) => `
            <button class="hr-picker-emoji hr-picker-emoji-unicode" title="${name}"
              onclick="hrPickEmoji(${qi},${oi},'${em}','',true)">
              <span class="hr-unicode-em">${em}</span>
            </button>`).join('')}
        </div>`;
    } else {
      body.querySelectorAll('.hr-picker-emoji').forEach(btn => btn.style.display = '');
    }
    return;
  }

  if (HR_PICKER_TAB === 'standard') {
    // Recherche par nom dans toutes les catégories
    const allEmojis = HR_UNICODE_CATS.flatMap(c => c.emojis);
    const results = allEmojis.filter(({name}) => name.toLowerCase().includes(q));
    body.innerHTML = `
      <div class="hr-picker-cat-label">Résultats pour "${q}" (${results.length})</div>
      <div class="hr-picker-grid hr-picker-grid-unicode" id="hrPickerGrid">
        ${results.slice(0, 120).map(({em, name}) => `
          <button class="hr-picker-emoji hr-picker-emoji-unicode" title="${name}"
            onclick="hrPickEmoji(${qi},${oi},'${em}','',true)">
            <span class="hr-unicode-em">${em}</span>
          </button>`).join('')}
      </div>`;
  } else {
    body.querySelectorAll('.hr-picker-emoji').forEach(btn => {
      btn.style.display = btn.title.toLowerCase().includes(q) ? '' : 'none';
    });
  }
}

function hrPickEmoji(qi, oi, value, url, isUnicode) {
  HR.questions[qi].options[oi].emoji = value;
  hrSaveQuestions();
  const input = document.getElementById(`hrEmojiInput${qi}_${oi}`);
  if (input) input.value = value;
  const btn = document.querySelector(`#hrOpt${qi}_${oi} .hr-emoji-pick-btn`);
  if (btn) {
    if (isUnicode) {
      btn.innerHTML = `<span style="font-size:18px;line-height:1">${value}</span>`;
    } else {
      const abbr = value.length > 5 ? value.slice(0, 5) + '…' : value;
      btn.innerHTML = `<img src="${url}" class="hr-emoji-thumb" onerror="this.outerHTML='<span class=\\'hr-pick-name\\'>${abbr}</span>'">`;
    }
  }
  document.querySelectorAll('.hr-emoji-picker-popup').forEach(p => p.remove());
}

function hrSetQText(qi, val)        { HR.questions[qi].text = val; hrSaveQuestions(); }
function hrSetOptEmoji(qi, oi, val) { HR.questions[qi].options[oi].emoji = val.trim(); hrSaveQuestions(); }
function hrSetOptLabel(qi, oi, val) { HR.questions[qi].options[oi].label = val; hrSaveQuestions(); }

function hrAddOption(qi) {
  HR.questions[qi].options.push({ emoji: '', label: '' });
  hrSaveQuestions();
  hrBuildQuestions();
}

function hrDelOption(qi, oi) {
  HR.questions[qi].options.splice(oi, 1);
  hrSaveQuestions();
  hrBuildQuestions();
}

function escHR(s) { return (s||'').replace(/"/g,'&quot;'); }

// ── HELPERS BOT ───────────────────────────────────────────────────────────────
function hrGetBotUrl()   { return (document.getElementById('hrBotUrl')?.value   || '').trim().replace(/\/$/, ''); }
function hrGetSecret()   { return (document.getElementById('hrBotSecret')?.value || '').trim(); }
function hrGetChannelId(){ return (document.getElementById('hrChannelId')?.value || '').trim(); }

function hrPostStatus(type, msg) {
  const el = document.getElementById('hrPostStatus');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'dc-status dc-status-' + type;
  el.style.display = 'block';
}

function hrChannelStatus(type, msg) {
  const el = document.getElementById('hrChannelStatus');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'dc-status dc-status-' + type;
  el.style.display = 'block';
}

function hrWeeklyStatus(type, msg) {
  const el = document.getElementById('hrWeeklyStatus');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'dc-status dc-status-' + type;
  el.style.display = 'block';
}

// ── CHARGER LES SALONS ────────────────────────────────────────────────────────
async function hrLoadChannels(silent = false) {
  const botUrl = hrGetBotUrl();
  const secret = hrGetSecret();
  if (!botUrl || !secret) {
    if (!silent) hrPostStatus('error', '⚠️ Configure l\'URL bot et le secret dans ⚙️ Configuration');
    return;
  }

  // Feedback immédiat sur le bouton lui-même (sauf en silent)
  const btn = document.querySelector('[onclick="hrLoadChannels()"]');
  const originalText = btn ? btn.textContent : '';
  if (btn && !silent) { btn.disabled = true; btn.textContent = '⏳ Chargement…'; }

  if (!silent) hrChannelStatus('loading', '⏳ Connexion au bot…');
  const _ctrl = new AbortController();
  const _tmr  = setTimeout(() => _ctrl.abort(), 30000);
  try {
    const res  = await fetch(`${botUrl}/channels`, { headers: { 'x-secret': secret }, signal: _ctrl.signal });
    const data = await res.json();
    if (!data.ok) {
      if (!silent) hrPostStatus('error', `❌ ${data.error}`);
      return;
    }

    const sel = document.getElementById('hrChannelSelect');
    const inp = document.getElementById('hrChannelId');

    // Grouper par serveur puis par catégorie (multi-server)
    const byGuild = new Map();
    data.channels.forEach(c => {
      const g = c.guildName || 'Serveur';
      const cat = c.category || '—';
      if (!byGuild.has(g)) byGuild.set(g, {});
      const cats = byGuild.get(g);
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(c);
    });
    const multiGuild = byGuild.size > 1;
    const opts = ['<option value="">— Choisir un salon —</option>'];
    for (const [guildName, cats] of byGuild) {
      const catNames = Object.keys(cats).sort((a, b) => {
        if (a === '—') return 1; if (b === '—') return -1;
        return a.localeCompare(b);
      });
      for (const cat of catNames) {
        const label = multiGuild ? `${guildName} › ${cat}` : cat;
        opts.push(`<optgroup label="${escHR(label)}">`);
        opts.push(...cats[cat].map(c => `<option value="${c.id}">#${escHR(c.name)}</option>`));
        opts.push(`</optgroup>`);
      }
    }

    if (sel) {
      sel.innerHTML = opts.join('');
      sel.style.display = 'block';
      sel.onchange = () => { if (inp) inp.value = sel.value; };
    }
    if (!silent) {
      hrChannelStatus('ok', `✅ ${data.channels.length} salons chargés`);
      if (btn) btn.textContent = '✅ Salons chargés';
    }
  } catch(e) {
    if (!silent) {
      if (e.name === 'AbortError') {
        hrChannelStatus('error', '❌ Délai dépassé (30 s) — bot inaccessible ou URL incorrecte');
      } else {
        hrChannelStatus('error', `❌ ${e.message}`);
      }
      if (btn) btn.textContent = originalText;
    }
  } finally {
    clearTimeout(_tmr);
    if (btn && !silent) btn.disabled = false;
  }
}

// ── POSTER LES SONDAGES ───────────────────────────────────────────────────────
async function hrPost() {
  const botUrl   = hrGetBotUrl();
  const secret   = hrGetSecret();
  const channelId = hrGetChannelId();

  if (!botUrl)    { hrPostStatus('error', '❌ Entre l\'URL du bot'); return; }
  if (!secret)    { hrPostStatus('error', '❌ Entre le secret');     return; }
  if (!channelId) { hrPostStatus('error', '❌ Sélectionne un salon'); return; }

  const btn = document.querySelector('[onclick="hrPost()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Envoi…'; }
  hrPostStatus('loading', '⏳ Envoi des sondages…');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000); // timeout 15 s

  try {
    const res  = await fetch(`${botUrl}/post-horaires`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-secret': secret },
      body: JSON.stringify({ channelId, questions: HR.questions }),
      signal: controller.signal,
    });
    const data = await res.json();
    if (data.ok) {
      HR.lastMessageIds = data.messageIds;
      HR.lastChannelId  = channelId;
      hrSaveLastMessageIds();
      hrPostStatus('ok', `✅ ${data.messageIds.length} sondage(s) postés !`);
    } else {
      hrPostStatus('error', `❌ ${data.error}`);
    }
  } catch(e) {
    if (e.name === 'AbortError') {
      hrPostStatus('error', '❌ Délai dépassé — bot inaccessible (vérifie l\'URL)');
    } else {
      hrPostStatus('error', `❌ ${e.message}`);
    }
  } finally {
    clearTimeout(timer);
    if (btn) { btn.disabled = false; btn.textContent = '📨 Poster les sondages maintenant'; }
  }
}

// ── PROGRAMMATION HEBDOMADAIRE ────────────────────────────────────────────────
async function hrSetWeekly() {
  const botUrl    = hrGetBotUrl();
  const secret    = hrGetSecret();
  const channelId = hrGetChannelId();
  const day       = parseInt(document.getElementById('hrDay')?.value ?? 5);
  const timeVal   = document.getElementById('hrTime')?.value || '17:00';
  const [hour, minute] = timeVal.split(':').map(Number);

  if (!botUrl || !secret || !channelId) {
    hrWeeklyStatus('error', '❌ Configure le bot et le salon d\'abord'); return;
  }

  hrWeeklyStatus('loading', '⏳ Activation…');
  try {
    const res  = await fetch(`${botUrl}/horaires-schedule`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-secret': secret },
      body: JSON.stringify({ channelId, questions: HR.questions, dayOfWeek: day, hour, minute }),
    });
    const data = await res.json();
    if (data.ok) {
      const days = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
      hrWeeklyStatus('ok', `✅ Envoi chaque ${days[day]} à ${timeVal}`);
    } else {
      hrWeeklyStatus('error', `❌ ${data.error}`);
    }
  } catch(e) {
    hrWeeklyStatus('error', `❌ ${e.message}`);
  }
}

async function hrCancelWeekly() {
  const botUrl = hrGetBotUrl();
  const secret = hrGetSecret();
  if (!botUrl || !secret) { hrWeeklyStatus('error', '❌ Configure le bot d\'abord'); return; }

  try {
    const res  = await fetch(`${botUrl}/horaires-schedule`, {
      method: 'DELETE',
      headers: { 'x-secret': secret },
    });
    const data = await res.json();
    if (data.ok) hrWeeklyStatus('ok', '✅ Envoi hebdomadaire désactivé');
    else hrWeeklyStatus('error', `❌ ${data.error}`);
  } catch(e) {
    hrWeeklyStatus('error', `❌ ${e.message}`);
  }
}

// ── RÉSULTATS ─────────────────────────────────────────────────────────────────
function hrResultsStatus(type, msg) {
  const el = document.getElementById('hrResultsStatus');
  if (!el) return;
  el.textContent   = msg;
  el.className     = 'dc-status dc-status-' + type;
  el.style.display = 'block';
}

async function hrFetchResults() {
  const botUrl    = hrGetBotUrl();
  const secret    = hrGetSecret();
  const channelId = HR.lastChannelId || hrGetChannelId();
  const msgIds    = HR.lastMessageIds;

  if (!botUrl || !secret) { hrResultsStatus('error', '❌ Configure le bot d\'abord'); return; }
  if (!channelId)         { hrResultsStatus('error', '❌ Aucun salon connu — poste d\'abord les sondages'); return; }
  if (!Array.isArray(msgIds) || !msgIds.length) {
    hrResultsStatus('error', '❌ Aucun message connu — poste d\'abord les sondages');
    return;
  }

  const btn = document.getElementById('hrFetchBtn');
  const originalText = btn ? btn.textContent.trim() : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Chargement…'; }
  hrResultsStatus('loading', '⏳ Récupération des résultats…');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000); // timeout 30 s

  try {
    const params = `channelId=${encodeURIComponent(channelId)}&messageIds=${msgIds.map(encodeURIComponent).join(',')}`;
    const url    = `${botUrl}/horaires-results?${params}`;
    console.log('[hrFetchResults] GET', url);

    const res  = await fetch(url, {
      headers: { 'x-secret': secret },
      signal: controller.signal,
    });

    console.log('[hrFetchResults] status', res.status, res.headers.get('content-type'));

    // Lire le texte brut d'abord pour diagnostiquer les erreurs non-JSON
    const text = await res.text();
    console.log('[hrFetchResults] body (first 200 chars):', text.slice(0, 200));

    let data;
    try { data = JSON.parse(text); }
    catch(_) {
      hrResultsStatus('error', `❌ Réponse invalide du bot (HTTP ${res.status}) — vérifie la console`);
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
      return;
    }

    if (!data.ok) {
      hrResultsStatus('error', `❌ ${data.error || 'Erreur inconnue'}`);
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
      return;
    }

    hrRenderResults(data.results);
    hrResultsStatus('ok', '✅ Résultats mis à jour');
    if (btn) { btn.textContent = '✅ Résultats chargés'; }
  } catch(e) {
    console.error('[hrFetchResults] erreur:', e);
    if (e.name === 'AbortError') {
      hrResultsStatus('error', '❌ Délai dépassé (30 s) — l\'endpoint répond trop lentement');
    } else {
      hrResultsStatus('error', `❌ ${e.message}`);
    }
    if (btn) btn.textContent = originalText;
  } finally {
    clearTimeout(timer);
    if (btn) btn.disabled = false;
  }
}

function hrRenderResults(results) {
  HR.lastResults = results;   // garder pour le planning
  const wrap = document.getElementById('hrResults');
  if (!wrap) return;

  if (!results || !results.length) {
    wrap.innerHTML = '<p class="hr-results-empty">Aucun résultat disponible</p>';
    return;
  }

  const blocksHTML = results.map((msgResult, qi) => {
    const q = HR.questions[qi] || { text: `Question ${qi + 1}`, options: [] };
    const reactions = msgResult.reactions || [];

    // Construire un map emoji → users depuis les résultats du bot
    const reactionMap = {};
    reactions.forEach(r => { reactionMap[r.emoji] = r; });

    const rows = q.options.map(opt => {
      const r = reactionMap[opt.emoji] || { count: 0, users: [] };
      const users = r.users || [];
      return `
        <div class="hr-result-row">
          <div class="hr-result-opt">
            <span class="hr-result-emoji">:${opt.emoji}:</span>
            <span class="hr-result-label">${escHR(opt.label)}</span>
            <span class="hr-result-count">${users.length}</span>
          </div>
          ${users.length ? `<div class="hr-result-users">${users.map(u =>
            `<span class="hr-result-user">${escHR(u.name || u)}</span>`
          ).join('')}</div>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="hr-result-block">
        <div class="hr-result-q-title">Q${qi + 1} — ${escHR(q.text)}</div>
        ${rows}
      </div>`;
  }).join('');

  // ── Sections par rôle Discord (TO FG / TO Smash) ──
  // Construites à partir de tous les votants annotés par le bot.
  const allVoters = new Map(); // id → user object
  results.forEach(r => (r.reactions || []).forEach(react =>
    (react.users || []).forEach(u => {
      if (typeof u === 'object' && u.id) allVoters.set(u.id, u);
    })
  ));
  const voters = [...allVoters.values()];
  const toFG    = voters.filter(u => u.toFG);
  const toSmash = voters.filter(u => u.toSmash);

  // N'afficher les sections que si au moins un votant est annoté avec ce rôle
  // (sinon ça veut dire que TO_FG_ROLE_ID / TO_SMASH_ROLE_ID ne sont pas configurés)
  const renderRoleSection = (title, list) => list.length ? `
    <div class="hr-result-block">
      <div class="hr-result-q-title">${title}</div>
      <div class="hr-result-row">
        <div class="hr-result-users" style="padding:6px 0;">
          ${list.map(u => `<span class="hr-result-user">${escHR(u.name)}</span>`).join('')}
        </div>
      </div>
    </div>` : '';

  wrap.innerHTML = blocksHTML + renderRoleSection('🎮 TO FG', toFG) + renderRoleSection('💥 TO Smash', toSmash);

  // Déclencher le planning automatiquement
  hrBuildPlanningUI();
}

// ── PLANNING ──────────────────────────────────────────────────────────────────

// Echappe une chaîne pour usage dans un attribut onclick JS
function hrEscJS(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g,  "\\'")
    .replace(/"/g,  '\\"');
}

// Construit la liste de tous les votants (toutes questions confondues)
// Retourne un tableau de { id, name }
function hrGetAllVoters() {
  if (!HR.lastResults) return [];
  const all = new Map(); // name → { id, name, toFG, toSmash }
  HR.lastResults.forEach(qRes => {
    (qRes.reactions || []).forEach(r => {
      (r.users || []).forEach(u => {
        if (typeof u === 'object') {
          if (!all.has(u.name)) {
            all.set(u.name, { id: u.id || null, name: u.name, toFG: !!u.toFG, toSmash: !!u.toSmash });
          } else {
            // Mergeer les flags TO si une autre réaction de la même personne les expose
            const existing = all.get(u.name);
            existing.toFG    = existing.toFG    || !!u.toFG;
            existing.toSmash = existing.toSmash || !!u.toSmash;
          }
        } else if (!all.has(u)) {
          all.set(u, { id: null, name: u, toFG: false, toSmash: false });
        }
      });
    });
  });
  return [...all.values()];
}

// Assignation automatique à partir des résultats bruts
function hrAutoAssign(results) {
  HR.planRoles.forEach(r => { r.users = []; });
  if (!results || !results.length) return;

  const q0 = results[0]?.reactions || [];   // heure d'arrivée
  const q1 = results[1]?.reactions || [];   // heure de départ
  const q2 = results[2]?.reactions || [];   // tâche préférée

  // Helpers pour gérer users en string ou { id, name }
  const uName = u => (typeof u === 'object' ? u.name : u);
  const uObj  = u => (typeof u === 'object' ? u : { id: null, name: u });

  // Collecte tous les utilisateurs dans une Map name → {id, name}
  const allUsers = new Map();
  [...q0, ...q1, ...q2].forEach(r => {
    (r.users || []).forEach(u => {
      const obj = uObj(u);
      if (!allUsers.has(obj.name)) allUsers.set(obj.name, obj);
    });
  });
  const getUser = name => allUsers.get(name) || { id: null, name };

  // Sets de noms par option
  const arr  = {};
  q0.forEach(r => { arr[r.emoji]  = new Set((r.users || []).map(uName)); });
  const dep  = {};
  q1.forEach(r => { dep[r.emoji]  = new Set((r.users || []).map(uName)); });
  const task = {};
  q2.forEach(r => { task[r.emoji] = new Set((r.users || []).map(uName)); });

  const inst    = arr['16h']      || new Set();
  const a17     = arr['17h']      || new Set();
  const seeded  = task['seeding'] || new Set();
  const regie   = task['regie']   || new Set();
  const acc     = task['accueil'] || new Set();
  // Rangement : ceux qui ont voté "00h" = A la fermeture en heure de départ.
  // On accepte plusieurs alias possibles selon le naming des emojis Q2.
  const rangement = dep['00h'] || dep['minuit'] || dep['0h'] || new Set();

  HR.planRoles.find(r => r.id === 'install').users   = [...inst].map(getUser);
  HR.planRoles.find(r => r.id === 'regie').users     = [...regie].map(getUser);
  HR.planRoles.find(r => r.id === 'seeding').users   = [...seeded].map(getUser);
  HR.planRoles.find(r => r.id === 'rangement').users = [...rangement].map(getUser);

  const acc1 = [], acc2 = [];
  acc.forEach(name => {
    if (inst.has(name) || a17.has(name)) acc1.push(getUser(name));
    else                                 acc2.push(getUser(name));
  });
  HR.planRoles.find(r => r.id === 'acc1').users = acc1;
  HR.planRoles.find(r => r.id === 'acc2').users = acc2;
}

// Construit l'UI planning (chips + textarea)
function hrBuildPlanningUI() {
  if (!HR.lastResults) return;
  const sec = document.getElementById('hrPlanningSection');
  if (sec) sec.style.display = '';
  hrAutoAssign(HR.lastResults);
  hrRenderPlanningRoles();
}

// Détermine l'équipe d'un user pour la coloration du Mii.
//   - toSmash true (et toFG false) → 'smash' (bleu, sprite source non teinté)
//   - toFG true (et toSmash false ou inconnu) → 'fg' (rouge, hue-rotate)
//   - les deux ou aucun → 'fg' par défaut (l'utilisateur peut toujours réorganiser)
function hrMiiTeamOf(user) {
  if (!user) return 'fg';
  if (user.toSmash && !user.toFG) return 'smash';
  if (user.toFG && !user.toSmash) return 'fg';
  if (user.toSmash) return 'smash'; // multi-rôle : Smash en priorité
  return 'fg';
}

// Détermine le rôle visuel (uniforme) selon le VOTE DE PRIORITÉ (Q3) de la
// personne — pas selon le slot où elle est draguée. Logique : le sprite reflète
// "ce pour quoi elle s'est portée volontaire" donc elle garde le même look où
// qu'on la place dans le planning.
//
// On lit la config Q3 (HR.questions[2].options) pour savoir QUEL emoji
// représente "accueil" et "régie", parce que l'utilisateur peut avoir customisé
// les emojis (ex : 🏠 au lieu du string 'accueil'). Match par label de l'option,
// fallback par index (seeding=0, accueil=1, regie=2 dans la config par défaut).
function hrMiiGetPriorityEmojis() {
  const q3opts = HR.questions?.[2]?.options || [];
  let accueilEmoji = null;
  let regieEmoji   = null;
  for (const opt of q3opts) {
    const label = (opt.label || '').toLowerCase();
    if (!accueilEmoji && /accueil/.test(label)) accueilEmoji = opt.emoji;
    if (!regieEmoji   && /r[ée]gie/.test(label)) regieEmoji   = opt.emoji;
  }
  // Fallback par index si les labels ont été modifiés
  if (!accueilEmoji && q3opts[1]) accueilEmoji = q3opts[1].emoji;
  if (!regieEmoji   && q3opts[2]) regieEmoji   = q3opts[2].emoji;
  return { accueilEmoji, regieEmoji };
}

//   - a voté l'emoji régie   → 'regie'   (uniforme régie)
//   - a voté l'emoji accueil → 'accueil' (robe + tablier)
//   - sinon                  → null      (Mii t-shirt normal)
// Si la personne a voté plusieurs priorités, régie l'emporte sur accueil
// (plus spécifique). Stratégies multiples pour gérer le fait que les Q3
// emojis peuvent être :
//   - des strings ('accueil', 'regie')          → match par nom
//   - des unicode customisés ('🏠', '🖥️')        → match par config OU par
//                                                 unicode connu
//   - des emojis custom Discord (':teamhall:')  → match par nom partiel
// Sets de codepoints unicode pour la stratégie 3. Set est utilisé au lieu
// d'une regex range parce que certains moteurs (vu en debug) ne matchent pas
// `[\u{1F3E0}-\u{1F3EC}]` comme attendu — Set évite toute ambiguïté de syntaxe.
const HR_MII_REGIE_CP = new Set([
  0x1F5A5, // 🖥 DESKTOP COMPUTER
  0x1F4BB, // 💻 LAPTOP COMPUTER
  0x2328,  // ⌨ KEYBOARD
  0x1F5B1, // 🖱 COMPUTER MOUSE
]);
const HR_MII_ACCUEIL_CP = new Set([
  0x1F3E0, // 🏠 HOUSE BUILDING
  0x1F3E1, // 🏡 HOUSE WITH GARDEN
  0x1F3E2, // 🏢 OFFICE BUILDING
  0x1F3E5, // 🏥 HOSPITAL
  0x1F3E8, // 🏨 HOTEL
  0x1F3E9, // 🏩 LOVE HOTEL
  0x1F3EA, // 🏪 CONVENIENCE STORE
  0x1F3EB, // 🏫 SCHOOL (cas de l'utilisateur)
  0x1F3EC, // 🏬 DEPARTMENT STORE
  0x1F6AA, // 🚪 DOOR
]);

// Vérifie si la string emoji contient au moins un codepoint du Set.
function hrMiiHasCp(str, set) {
  for (const ch of String(str)) {
    if (set.has(ch.codePointAt(0))) return true;
  }
  return false;
}

function hrMiiPriorityRoleFromEmojis(emojis, priorityMap) {
  if (!emojis || !emojis.length) return null;
  const emojiStrs = emojis.map(e => String(e));

  // Stratégie 1 : match exact contre l'emoji de l'option Q3 dont le label
  //   contient "régie" / "accueil" (via hrMiiGetPriorityEmojis).
  if (priorityMap?.regieEmoji   && emojiStrs.includes(priorityMap.regieEmoji))   return 'regie';
  if (priorityMap?.accueilEmoji && emojiStrs.includes(priorityMap.accueilEmoji)) return 'accueil';

  // Stratégie 2 : match par nom (emoji = string 'regie'/'accueil' ou nom
  //   custom Discord du type ':regie_v2:' / ':frontdesk_accueil:').
  if (emojiStrs.some(e => /r[ée]gie/i.test(e)))  return 'regie';
  if (emojiStrs.some(e => /accueil/i.test(e)))   return 'accueil';

  // Stratégie 3 : codepoints unicode bien connus, dernier filet de sécurité.
  //   Vérifié via Set au lieu de regex pour fiabilité cross-engine.
  if (emojiStrs.some(e => hrMiiHasCp(e, HR_MII_REGIE_CP)))   return 'regie';
  if (emojiStrs.some(e => hrMiiHasCp(e, HR_MII_ACCUEIL_CP))) return 'accueil';

  return null;
}

// Construit le HTML d'une carte Mii pour un user dans un slot donné.
// `visualRole` ('accueil' | 'regie' | null) est dérivé du vote de priorité Q3
// par l'appelant (cf. hrMiiPriorityRoleFromEmojis) — passé en argument plutôt
// que recalculé ici pour éviter de re-traverser les Q3 par carte.
function hrMiiCardHTML(user, fromRoleId, visualRole) {
  const team = hrMiiTeamOf(user);
  const useUniform = visualRole === 'accueil' || visualRole === 'regie';
  // Filtre teinte : 'none' pour Smash (couleur source) ou si on porte un uniforme
  // (qui a ses propres couleurs et ne doit pas être teinté).
  const tintFilter = (team === 'fg' && !useUniform)
    ? 'hue-rotate(155deg) saturate(1.25) brightness(0.92)'
    : 'none';

  const bodySrc = visualRole === 'regie'   ? 'mii/body-regie.png'
                : visualRole === 'accueil' ? 'mii/body-accueil.png'
                                            : 'mii/body.png';
  const armLSrc = visualRole === 'regie'   ? 'mii/arm-left-regie.png'
                : visualRole === 'accueil' ? 'mii/arm-left-accueil.png'
                                            : 'mii/arm-left.png';
  const armRSrc = visualRole === 'regie'   ? 'mii/arm-right-regie.png'
                : visualRole === 'accueil' ? 'mii/arm-right-accueil.png'
                                            : 'mii/arm-right.png';

  // Pour accueil/régie, les bras passent DERRIÈRE le corps (l'uniforme recouvre
  // la pointe d'épaule). Pour le Mii normal, les bras passent DEVANT.
  const armsHTML = `
    <img class="hr-mii-part hr-mii-arm-left"  src="${armLSrc}" style="filter:${useUniform ? 'none' : tintFilter}" draggable="false">
    <img class="hr-mii-part hr-mii-arm-right" src="${armRSrc}" style="filter:${useUniform ? 'none' : tintFilter}" draggable="false">`;

  const fromAttr = hrEscJS(fromRoleId || 'pool');
  return `
    <div class="hr-mii-card" data-name="${escHR(user.name)}" data-from="${fromAttr}"
         onpointerdown="hrMiiDragStart(event)"
         onpointermove="hrMiiDragMove(event)"
         onpointerup="hrMiiDragEnd(event)"
         onpointercancel="hrMiiDragEnd(event)">
      <div class="hr-mii-frame">
        <div class="hr-mii-stack">
          <img class="hr-mii-part hr-mii-hair-back" src="mii/hair-back.png" draggable="false">
          ${useUniform ? armsHTML : ''}
          <img class="hr-mii-part hr-mii-body" src="${bodySrc}" style="filter:${useUniform ? 'none' : tintFilter}" draggable="false">
          ${!useUniform ? armsHTML : ''}
          <img class="hr-mii-part hr-mii-face" src="mii/face.png" draggable="false">
        </div>
      </div>
      <button class="hr-mii-name" tabindex="-1" type="button">${escHR(user.name)}</button>
    </div>`;
}

// Rend les cartes de rôles avec des personnages Mii draggables. Pool des non
// assignés splitté en 2 colonnes (TO Smash, TO FG) suivant le design "mii-name".
function hrRenderPlanningRoles() {
  const wrap = document.getElementById('hrPlanningRoles');
  if (!wrap) return;

  const allVoters   = hrGetAllVoters(); // [{ id, name, toFG, toSmash }]
  const assignedNames = new Set(HR.planRoles.flatMap(r => r.users.map(u => u.name || u)));
  const unassigned  = allVoters.filter(u => !assignedNames.has(u.name));
  const smashUnassigned = unassigned.filter(u => hrMiiTeamOf(u) === 'smash');
  const fgUnassigned    = unassigned.filter(u => hrMiiTeamOf(u) === 'fg');

  // Map nom → emojis votés en Q3 (priorité tâche), pour affichage discret en
  // overlay sur le badge nom du Mii.
  const userPriorityEmojis = new Map();
  const q3 = HR.lastResults?.[2];
  if (q3?.reactions) {
    q3.reactions.forEach(r => {
      (r.users || []).forEach(u => {
        const name = typeof u === 'object' ? u.name : u;
        if (!userPriorityEmojis.has(name)) userPriorityEmojis.set(name, []);
        userPriorityEmojis.get(name).push(r.emoji);
      });
    });
  }

  // Pour les Mii on garde les emojis prio mais en overlay-bulle au-dessus du
  // bouton nom, pour ne pas casser le rendu du badge style Mii Maker.
  const prioBubble = (name) => {
    const emojis = userPriorityEmojis.get(name) || [];
    if (!emojis.length) return '';
    const html = emojis.map(em => {
      if (hrIsUnicode(em)) return `<span class="hr-plan-prio-uni">${em}</span>`;
      const found = HR_EMOJIS.find(e => e.name === em);
      if (found && found.url) return `<img src="${escHR(found.url)}" alt=":${escHR(em)}:" class="hr-plan-prio-img" title=":${escHR(em)}:">`;
      return `<span class="hr-plan-prio-name">:${escHR(em)}:</span>`;
    }).join('');
    return `<span class="hr-mii-prio">${html}</span>`;
  };

  // Pré-calcule QUEL emoji représente "accueil" vs "régie" dans la config
  // Q3 actuelle (peut être custom). Une seule fois pour tout le render.
  const priorityMap = hrMiiGetPriorityEmojis();

  // Helper : carte Mii enrichie avec la bulle priorité dans le coin haut-droit
  // du cadre, indépendante du badge nom Mii Maker. Le visualRole (uniforme)
  // est dérivé du vote Q3 de la personne — donc reste constant peu importe
  // où elle est draguée dans le planning.
  const card = (user, fromRoleId) => {
    const visualRole = hrMiiPriorityRoleFromEmojis(userPriorityEmojis.get(user.name), priorityMap);
    const html = hrMiiCardHTML(user, fromRoleId, visualRole);
    const prio = prioBubble(user.name);
    return prio ? html.replace('<div class="hr-mii-frame">', `<div class="hr-mii-frame">${prio}`) : html;
  };

  let html = '';

  // ── Pool des non assignés — 2 colonnes Smash / FG ────────────────────────
  html += `<div class="hr-mii-roster">
    <div class="hr-mii-roster-team">
      <div class="hr-mii-roster-head">
        <div class="hr-mii-roster-title"><span class="hr-mii-team-dot hr-mii-team-smash"></span>TO Smash</div>
        <div class="hr-mii-roster-meta">${smashUnassigned.length} / ${allVoters.filter(u => hrMiiTeamOf(u) === 'smash').length}</div>
      </div>
      <div class="hr-mii-roster-tray" data-dropzone="">
        ${smashUnassigned.length
          ? smashUnassigned.map(u => card(u, 'pool')).join('')
          : '<div class="hr-mii-empty">Tous assignés.</div>'}
      </div>
    </div>
    <div class="hr-mii-roster-team">
      <div class="hr-mii-roster-head">
        <div class="hr-mii-roster-title"><span class="hr-mii-team-dot hr-mii-team-fg"></span>TO FG</div>
        <div class="hr-mii-roster-meta">${fgUnassigned.length} / ${allVoters.filter(u => hrMiiTeamOf(u) === 'fg').length}</div>
      </div>
      <div class="hr-mii-roster-tray" data-dropzone="">
        ${fgUnassigned.length
          ? fgUnassigned.map(u => card(u, 'pool')).join('')
          : '<div class="hr-mii-empty">Tous assignés.</div>'}
      </div>
    </div>
  </div>`;

  // ── Cartes de rôles ──────────────────────────────────────────────────────
  html += `<div class="hr-plan-roles-grid">` + HR.planRoles.map(role => {
    const cardsHtml = role.users.length
      ? role.users.map(u => card(u.name ? u : { id: null, name: u, toFG: false, toSmash: false }, role.id)).join('')
      : '<div class="hr-mii-empty hr-mii-empty-slot">Déposer ici…</div>';

    const headerLabel = role.slot
      ? `<span class="hr-plan-title">${role.title}</span><span class="hr-plan-slot">${role.slot}</span>`
      : `<span class="hr-plan-title">${role.title}</span>`;

    const datalist = `<datalist id="hrPlanDL_${role.id}">
      ${allVoters.map(u => `<option value="${escHR(u.name)}">`).join('')}
    </datalist>`;

    return `
      <div class="hr-plan-role" data-dropzone="${hrEscJS(role.id)}">
        <div class="hr-plan-role-header">
          <span class="hr-plan-icon">${role.icon}</span>
          ${headerLabel}
          <span class="hr-plan-count">${role.users.length}</span>
        </div>
        <div class="hr-plan-chips">${cardsHtml}</div>
        <div class="hr-plan-add-row">
          <input class="hr-plan-add-input" id="hrPlanAdd_${role.id}" type="text"
            placeholder="Ajouter…" list="hrPlanDL_${role.id}"
            onkeydown="if(event.key==='Enter'){hrPlanAddUser('${hrEscJS(role.id)}');event.preventDefault();}">
          ${datalist}
          <button class="hr-plan-add-btn" onclick="hrPlanAddUser('${hrEscJS(role.id)}')">+</button>
        </div>
      </div>`;
  }).join('') + `</div>`;

  wrap.innerHTML = html;
  // Lancer la boucle physique (idempotente) maintenant que des cartes existent.
  hrMiiEnsureLoop();
  hrUpdatePlanMsg();
}

// ──────────────────────────────────────────────────────────────────────────────
// DRAG + PHYSIQUE PENDULAIRE DES MIIS
// Porte le système du design "mii-name" : chaque carte a son propre état de
// pendule (bras gauche, bras droit, cheveux) entraîné par l'accélération du
// corps. Un seul RAF global itère toutes les cartes visibles.
// ──────────────────────────────────────────────────────────────────────────────

// Paramètres de pendule (souples, faiblement amortis → les bras swinguent
// après un coup sec). Asymétrie volontaire G/D pour casser l'effet miroir.
const HR_MII_ARM_L = { k: 0.018, d: 0.06,  drive: 1.4, max: 45 };
const HR_MII_ARM_R = { k: 0.020, d: 0.065, drive: 1.4, max: 45 };
const HR_MII_HAIR  = { k: 0.05,  d: 0.12,  drive: 0.45, max: 18 };

let hrMiiRafId = null;
let hrMiiDragState = null; // { card, lastX, lastY }

function hrMiiInitPhys(card) {
  card._phys = {
    pos:    { x: 0, y: 0 },
    bodyVel:{ x: 0, y: 0 },
    bodyAccX: 0,
    armL:   { a: 0, v: 0 },
    armR:   { a: 0, v: 0 },
    hair:   { a: 0, v: 0 },
    jiggle: 0,
    dragging: false,
  };
}

function hrMiiStep(limb, cfg, drive) {
  const f = -cfg.k * limb.a - cfg.d * limb.v + cfg.drive * drive;
  limb.v += f;
  limb.a += limb.v;
  if (limb.a >  cfg.max) { limb.a =  cfg.max; limb.v *= -0.3; }
  if (limb.a < -cfg.max) { limb.a = -cfg.max; limb.v *= -0.3; }
}

function hrMiiWriteFrame(card) {
  const s = card._phys;
  if (!s) return;
  card.style.setProperty('--tx', s.pos.x + 'px');
  card.style.setProperty('--ty', s.pos.y + 'px');
  const stack = card.querySelector('.hr-mii-stack');
  if (!stack) return;
  const bobY = s.dragging ? Math.sin(s.jiggle * 1.6) * 2.2 : Math.sin(s.jiggle * 0.7) * 1.0;
  const tilt = s.bodyVel.x * -3.5 + (s.dragging ? Math.sin(s.jiggle * 2.2) * 0.7 : 0);
  stack.style.transform = `translateY(${bobY.toFixed(2)}px) rotate(${tilt.toFixed(2)}deg)`;
  const hair = stack.querySelector('.hr-mii-hair-back');
  const armL = stack.querySelector('.hr-mii-arm-left');
  const armR = stack.querySelector('.hr-mii-arm-right');
  // On écrase complètement le transform pour éviter de cumuler le filtre
  // d'origine (qui n'est pas sur transform mais sur filter, donc ok).
  if (hair) hair.style.transform = `rotate(${s.hair.a.toFixed(2)}deg)`;
  if (armL) armL.style.transform = `rotate(${s.armL.a.toFixed(2)}deg)`;
  if (armR) armR.style.transform = `rotate(${s.armR.a.toFixed(2)}deg)`;
}

function hrMiiTick() {
  const cards = document.querySelectorAll('.hr-mii-card');
  cards.forEach(card => {
    if (!card._phys) hrMiiInitPhys(card);
    const s = card._phys;
    const prevVx = s.bodyVel.x;
    s.bodyVel.x *= 0.82;
    s.bodyVel.y *= 0.82;
    s.bodyAccX  = s.bodyVel.x - prevVx;
    hrMiiStep(s.armL, HR_MII_ARM_L, -s.bodyAccX * 6.0);
    hrMiiStep(s.armR, HR_MII_ARM_R, -s.bodyAccX * 6.0);
    hrMiiStep(s.hair, HR_MII_HAIR,  -s.bodyAccX * 2.4);
    s.jiggle += 0.06;
    hrMiiWriteFrame(card);
  });
  hrMiiRafId = requestAnimationFrame(hrMiiTick);
}

function hrMiiEnsureLoop() {
  if (hrMiiRafId == null) hrMiiRafId = requestAnimationFrame(hrMiiTick);
}

function hrMiiDragStart(e) {
  if (e.button !== undefined && e.button !== 0) return;
  e.preventDefault();
  const card = e.currentTarget;
  if (!card._phys) hrMiiInitPhys(card);
  card._phys.dragging = true;
  card.classList.add('hr-mii-dragging');
  card.setPointerCapture?.(e.pointerId);
  hrMiiDragState = { card, lastX: e.clientX, lastY: e.clientY };
}

function hrMiiDragMove(e) {
  if (!hrMiiDragState || hrMiiDragState.card !== e.currentTarget) return;
  const s = e.currentTarget._phys;
  const dx = e.clientX - hrMiiDragState.lastX;
  const dy = e.clientY - hrMiiDragState.lastY;
  hrMiiDragState.lastX = e.clientX;
  hrMiiDragState.lastY = e.clientY;
  s.pos.x += dx;
  s.pos.y += dy;
  s.bodyVel.x += dx * 0.08;
  s.bodyVel.y += dy * 0.08;

  // Feedback visuel sur la dropzone survolée
  const els = document.elementsFromPoint(e.clientX, e.clientY);
  const zone = els.find(el => el.dataset && el.dataset.dropzone !== undefined);
  document.querySelectorAll('.hr-mii-roster-tray.hr-plan-dragover, .hr-plan-role.hr-plan-dragover')
    .forEach(el => { if (el !== zone) el.classList.remove('hr-plan-dragover'); });
  if (zone) zone.classList.add('hr-plan-dragover');
}

function hrMiiDragEnd(e) {
  if (!hrMiiDragState || hrMiiDragState.card !== e.currentTarget) return;
  const card = e.currentTarget;
  const s = card._phys;
  s.dragging = false;
  card.classList.remove('hr-mii-dragging');
  card.releasePointerCapture?.(e.pointerId);

  // Impulsion aléatoire au lâcher pour que les bras continuent d'osciller
  s.armL.v += (Math.random() - 0.5) * 4;
  s.armR.v += (Math.random() - 0.5) * 4;

  // Détecter la dropzone sous le pointeur
  const els = document.elementsFromPoint(e.clientX, e.clientY);
  const zone = els.find(el => el.dataset && el.dataset.dropzone !== undefined);
  const toRoleId = zone ? zone.dataset.dropzone : null;

  document.querySelectorAll('.hr-plan-dragover').forEach(el => el.classList.remove('hr-plan-dragover'));
  hrMiiDragState = null;

  // Settle l'offset visuel (le re-render va replacer la carte dans le DOM)
  const settle = () => {
    s.pos.x *= 0.7;
    s.pos.y *= 0.7;
    hrMiiWriteFrame(card);
    if (Math.abs(s.pos.x) + Math.abs(s.pos.y) > 0.5) requestAnimationFrame(settle);
    else { s.pos.x = 0; s.pos.y = 0; hrMiiWriteFrame(card); }
  };
  requestAnimationFrame(settle);

  // Effectuer le déplacement dans HR.planRoles (logique inchangée du DnD HTML5)
  const name = card.dataset.name;
  const fromRoleId = card.dataset.from;
  hrMiiCommitMove(name, fromRoleId, toRoleId);
}

// Identique à l'ancien hrPlanDrop mais paramétrée pour être appelée depuis le
// nouveau système pointer + le drop sur la même source ne fait rien.
function hrMiiCommitMove(name, fromRoleId, toRoleId) {
  if (!name) return;
  // Si pas de dropzone détectée OU drop sur la source → no-op
  if (toRoleId === null) return;
  if (fromRoleId === (toRoleId || 'pool')) return;

  if (fromRoleId && fromRoleId !== 'pool') {
    const fromRole = HR.planRoles.find(r => r.id === fromRoleId);
    if (fromRole) fromRole.users = fromRole.users.filter(u => (u.name || u) !== name);
  }
  if (toRoleId) {
    const toRole = HR.planRoles.find(r => r.id === toRoleId);
    if (toRole && !toRole.users.some(u => (u.name || u) === name)) {
      const known = hrGetAllVoters().find(v => v.name === name);
      toRole.users.push(known || { id: null, name, toFG: false, toSmash: false });
    }
  }
  hrRenderPlanningRoles();
}

// ── Anciens wrappers DnD HTML5 conservés au cas où du code legacy les appelle ─
function hrPlanDragStart(e, name, fromRoleId) { /* noop : remplacé par pointer */ }
function hrPlanDragOver(e, el) { e.preventDefault?.(); }
function hrPlanDragLeave(el) {}
function hrPlanDrop(e, el, toRoleId) {}

// Retirer un utilisateur d'un rôle
function hrPlanRemoveUser(roleId, username) {
  const role = HR.planRoles.find(r => r.id === roleId);
  if (!role) return;
  role.users = role.users.filter(u => (u.name || u) !== username);
  hrRenderPlanningRoles();
}

// Ajouter un utilisateur à un rôle
function hrPlanAddUser(roleId) {
  const input = document.getElementById(`hrPlanAdd_${roleId}`);
  if (!input) return;
  const name = input.value.trim();
  if (!name) return;
  const role = HR.planRoles.find(r => r.id === roleId);
  if (!role) return;
  if (role.users.some(u => (u.name || u) === name)) { input.value = ''; return; }
  // Chercher l'ID dans la liste des votants connus
  const known = hrGetAllVoters().find(v => v.name === name);
  role.users.push(known || { id: null, name });
  input.value = '';
  hrRenderPlanningRoles();
}

// Helper : génère une mention Discord (<@id> ou @nom fallback)
function hrMention(users) {
  return users.map(u => u.id ? `<@${u.id}>` : `@${u.name || u}`).join(' ');
}

// Construit la structure d'embed Discord à partir de HR.planRoles
// Retourne un seul embed avec un field par catégorie remplie.
function hrBuildPlanningEmbed() {
  const byId = {};
  HR.planRoles.forEach(r => { byId[r.id] = r; });

  const fields = [];
  if (byId.install?.users?.length) {
    fields.push({ name: '🚀 Installation', value: hrMention(byId.install.users), inline: false });
  }
  const accLines = [];
  if (byId.acc1?.users?.length) accLines.push(`**17h30-18h30** : ${hrMention(byId.acc1.users)}`);
  if (byId.acc2?.users?.length) accLines.push(`**18h30-19h30** : ${hrMention(byId.acc2.users)}`);
  if (accLines.length) {
    fields.push({ name: '🏠 Accueil', value: accLines.join('\n'), inline: false });
  }
  if (byId.regie?.users?.length) {
    fields.push({ name: '💻 Régie · 19h30-fin', value: hrMention(byId.regie.users), inline: false });
  }
  if (byId.seeding?.users?.length) {
    fields.push({ name: '🌱 Seeding', value: hrMention(byId.seeding.users), inline: false });
  }
  if (byId.rangement?.users?.length) {
    fields.push({ name: '🧹 Rangement · A la fermeture', value: hrMention(byId.rangement.users), inline: false });
  }

  if (!fields.length) return null;

  return {
    title: '📋 Planning',
    color: 0x9b7fb8, // violet projet rêverie
    fields,
    timestamp: new Date().toISOString(),
  };
}

// Génère et met à jour la textarea Discord (version texte brut)
function hrUpdatePlanMsg() {
  const ta = document.getElementById('hrPlanningMsg');
  if (!ta) return;

  const byId = {};
  HR.planRoles.forEach(r => { byId[r.id] = r; });

  const parts = [];

  if (byId.install.users.length)
    parts.push(`🚀 Installation\n${hrMention(byId.install.users)}`);

  const accLines = [];
  if (byId.acc1.users.length) accLines.push(`17h30-18h30 : ${hrMention(byId.acc1.users)}`);
  if (byId.acc2.users.length) accLines.push(`18h30-19h30 : ${hrMention(byId.acc2.users)}`);
  if (accLines.length) parts.push(`🏠 Accueil\n${accLines.join('\n')}`);

  if (byId.regie.users.length)
    parts.push(`💻 Régie\n19h30-fin : ${hrMention(byId.regie.users)}`);

  if (byId.seeding.users.length)
    parts.push(`🌱 Seeding\n${hrMention(byId.seeding.users)}`);

  if (byId.rangement?.users?.length)
    parts.push(`🧹 Rangement\nA la fermeture : ${hrMention(byId.rangement.users)}`);

  ta.value = parts.join('\n\n');
}

// Copier dans le presse-papier
function hrCopyPlanning() {
  const ta = document.getElementById('hrPlanningMsg');
  if (!ta || !ta.value) { hrPlanningStatus('error', '❌ Message vide'); return; }
  navigator.clipboard.writeText(ta.value)
    .then(() => hrPlanningStatus('ok', '✅ Copié dans le presse-papier !'))
    .catch(() => {
      try { ta.select(); document.execCommand('copy'); hrPlanningStatus('ok', '✅ Copié !'); }
      catch(_) { hrPlanningStatus('error', '❌ Impossible de copier'); }
    });
}

// Toggle l'aperçu Discord-style du planning embed
function hrTogglePlanningPreview() {
  const preview = document.getElementById('hrPlanningPreview');
  const btn = document.getElementById('hrPreviewBtn');
  if (!preview) return;
  if (preview.style.display === 'none' || !preview.style.display) {
    hrRenderPlanningPreview();
    preview.style.display = 'block';
    if (btn) btn.textContent = '🙈 Cacher';
  } else {
    preview.style.display = 'none';
    if (btn) btn.textContent = '👁️ Aperçu';
  }
}

// Rend une preview HTML qui imite l'embed Discord (barre colorée à gauche,
// titre, fields). Reflète exactement ce qui sera posté.
function hrRenderPlanningPreview() {
  const preview = document.getElementById('hrPlanningPreview');
  if (!preview) return;
  const embed = hrBuildPlanningEmbed();
  if (!embed) {
    preview.innerHTML = '<div class="hr-embed-empty">Aucun rôle assigné — rien à prévisualiser</div>';
    return;
  }
  // Couleur en hex pour la barre gauche
  const hex = '#' + embed.color.toString(16).padStart(6, '0');
  preview.innerHTML = `
    <div class="hr-embed-preview-card" style="border-left-color:${hex};">
      <div class="hr-embed-preview-title">${escHR(embed.title)}</div>
      ${embed.fields.map(f => `
        <div class="hr-embed-preview-field">
          <div class="hr-embed-preview-field-name">${escHR(f.name)}</div>
          <div class="hr-embed-preview-field-value">${hrFormatMentionsForPreview(f.value)}</div>
        </div>
      `).join('')}
      <div class="hr-embed-preview-timestamp">${new Date(embed.timestamp).toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'short'})}</div>
    </div>
    <div class="hr-embed-preview-hint">↑ aperçu de l'embed qui sera posté</div>
  `;
}

// Convertit les <@id> en chips de mention pour l'aperçu (Discord les affiche
// comme des bulles cliquables, on simule avec un span).
function hrFormatMentionsForPreview(text) {
  const escaped = escHR(text);
  // <@id> dans le texte original → on les retrouve via &lt;@...&gt; après échappement
  return escaped.replace(/&lt;@(\d+)&gt;/g, (_, id) => {
    // Récupérer le pseudo depuis les votants connus si possible
    const known = hrGetAllVoters().find(u => u.id === id);
    const display = known ? '@' + known.name : '@user';
    return `<span class="hr-embed-mention">${escHR(display)}</span>`;
  });
}

// Poster le planning via le bot (toujours en embed)
async function hrPostPlanning() {
  const botUrl    = hrGetBotUrl();
  const secret    = hrGetSecret();
  const channelId = HR.lastChannelId || hrGetChannelId();

  if (!botUrl || !secret) { hrPlanningStatus('error', '❌ Configure le bot d\'abord'); return; }
  if (!channelId)         { hrPlanningStatus('error', '❌ Aucun salon sélectionné');   return; }

  const embed = hrBuildPlanningEmbed();
  if (!embed) { hrPlanningStatus('error', '❌ Aucun rôle assigné'); return; }
  const body = { channelId, embeds: [embed] };

  const btn = document.getElementById('hrPostPlanBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Envoi…'; }
  hrPlanningStatus('loading', '⏳ Envoi du planning…');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const res  = await fetch(`${botUrl}/post-announce`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-secret': secret },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch(_) {
      hrPlanningStatus('error', `❌ Réponse invalide du bot (HTTP ${res.status})`);
      return;
    }
    if (!data.ok) { hrPlanningStatus('error', `❌ ${data.error || 'Erreur'}`); return; }
    hrPlanningStatus('ok', `✅ Planning posté dans #${data.channel} !`);
    if (btn) btn.textContent = '✅ Posté !';
  } catch(e) {
    console.error('[hrPostPlanning]', e);
    if (e.name === 'AbortError') hrPlanningStatus('error', '❌ Délai dépassé (30 s)');
    else hrPlanningStatus('error', `❌ ${e.message}`);
    if (btn) { btn.textContent = '📨 Poster dans Discord'; }
  } finally {
    clearTimeout(timer);
    if (btn) btn.disabled = false;
  }
}

function hrPlanningStatus(type, msg) {
  const el = document.getElementById('hrPlanningStatus');
  if (!el) return;
  el.textContent   = msg;
  el.className     = 'dc-status dc-status-' + type;
  el.style.display = 'block';
}

// ── PERSISTANCE ───────────────────────────────────────────────────────────────
function hrSaveBotSettings() {
  const url    = document.getElementById('hrBotUrl')?.value.trim();
  const secret = document.getElementById('hrBotSecret')?.value.trim();
  if (url)    localStorage.setItem('hr_bot_url',    url);
  if (secret) localStorage.setItem('hr_bot_secret', secret);
}

function hrLoadBotSettings() {
  const url    = localStorage.getItem('hr_bot_url')    || localStorage.getItem('dc_bot_url');
  const secret = localStorage.getItem('hr_bot_secret') || localStorage.getItem('dc_bot_secret');
  const urlEl    = document.getElementById('hrBotUrl');
  const secretEl = document.getElementById('hrBotSecret');
  if (url    && urlEl)    urlEl.value    = url;
  if (secret && secretEl) secretEl.value = secret;
}

function hrSaveQuestions() {
  try { localStorage.setItem('hr_questions', JSON.stringify(HR.questions)); } catch(e) {}
}

function hrLoadQuestions() {
  try {
    const saved = localStorage.getItem('hr_questions');
    if (saved) HR.questions = JSON.parse(saved);
  } catch(e) {}
}

function hrSaveLastMessageIds() {
  localStorage.setItem('hr_last_msg_ids',   JSON.stringify(HR.lastMessageIds));
  localStorage.setItem('hr_last_channel_id', HR.lastChannelId);
}

function hrLoadLastMessageIds() {
  try {
    const ids = localStorage.getItem('hr_last_msg_ids');
    if (ids) HR.lastMessageIds = JSON.parse(ids);
    const cid = localStorage.getItem('hr_last_channel_id');
    if (cid) {
      HR.lastChannelId = cid;
      const inp = document.getElementById('hrChannelId');
      if (inp && !inp.value) inp.value = cid;
    }
  } catch(e) {}
}
