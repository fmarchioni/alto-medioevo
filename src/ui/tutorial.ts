/**
 * L'insegnamento: il mercante chiede se serve una spiegazione e la illustra
 * in un piccolo libro miniato. Testi originali (riscritti, non copiati dal
 * programma per C64), con le regole ricavate dal listato.
 */
import { createPlayer } from '../domain/turn';
import { MAX_PALAZZO } from '../domain/investments';
import { PALAZZO_SERVI, THRONE_THRESHOLD } from '../domain/rank';
import { merchantPortrait } from './art';
import { bubble, coin, helmet, hood, person, shield } from './comics';
import { realmScene } from './realm';
import { crest } from './fazioni';
import type { FactionId } from '../domain/fazioni';
import { pick, speechBox, type Speaker } from './speaker';
import { VERSION, versionDateText } from '../version';

export const LAPO: Speaker = { name: 'Messer Lapo', role: 'mercante girovago', portrait: merchantPortrait };

interface Page {
  title: string;
  text: string[];
  quip: string;
  art: () => string;
}

const frame = (inner: string, label: string) =>
  `<svg viewBox="0 0 320 170" class="mini-art" role="img" aria-label="${label}">${inner}</svg>`;

const sun = (x: number, y: number) =>
  `<g class="a-glow"><circle cx="${x}" cy="${y}" r="14" fill="#f2c94c"/>${[...Array(8)].map((_, i) => {
    const a = (i * Math.PI) / 4;
    return `<path d="M${x + Math.cos(a) * 18} ${y + Math.sin(a) * 18} L${x + Math.cos(a) * 25} ${y + Math.sin(a) * 25}" stroke="#d9a520" stroke-width="2.5"/>`;
  }).join('')}</g>`;

const sheaf = (x: number, y: number) =>
  `<g transform="translate(${x} ${y})"><path d="M0 0 l-6 -26 M0 0 l0 -28 M0 0 l6 -26 M0 0 l-3 -27 M0 0 l3 -27" stroke="#c9a032" stroke-width="2"/>
   <path d="M-7 -12 h14" stroke="#8a6b3e" stroke-width="3"/><path d="M-8 -28 q8 -8 16 0" fill="#e0b94a"/></g>`;

/** Ruota dell'anno: le sei fasi del turno, come una ruota della fortuna. */
function wheelOfYear(): string {
  const phases = ['Delibera', 'Imprevisto', 'Rendite', 'Dispendimenti', 'Lo reame', 'Fine anno'];
  const cx = 82, cy = 85, R = 66;
  const p = (a: number, r: number) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r].map(v => v.toFixed(1));
  const seg = phases.map((_, i) => {
    const a0 = (i / 6) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / 6) * 2 * Math.PI - Math.PI / 2;
    const [lx, ly] = p((a0 + a1) / 2, R * 0.66);
    return `<path d="M${cx} ${cy} L${p(a0, R).join(' ')} A${R} ${R} 0 0 1 ${p(a1, R).join(' ')}z" fill="${i % 2 ? '#e8d3a0' : '#f3e6c2'}" stroke="#8a6b3e"/>
      <text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central" class="wheel-num" fill="#8b2a1e">${i + 1}</text>`;
  }).join('');
  const legend = phases.map((ph, i) => `<text x="172" y="${32 + i * 22}" class="wheel-label" fill="#5a1a12">${i + 1} ${ph}</text>`).join('');
  return frame(`<rect width="320" height="170" fill="#efe0b6"/>
    <g class="r-spin" style="transform-origin:${cx}px ${cy}px">${seg}</g>
    <circle cx="${cx}" cy="${cy}" r="13" fill="#b8902e" stroke="#5a3d26" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="4" fill="#5a3d26"/>
    <path d="M${cx} ${cy - R - 2} l-6 -10 h12z" fill="#8b2a1e"/>
    <path d="M160 18 v136" stroke="#c9a46a" stroke-dasharray="2 3"/>${legend}`, "la ruota dell'anno con le sei fasi del turno");
}

/** Le tre gabelle: il boccale, la macina, il banco del mercato, ciascuno con il suo rovescio. */
function taxArt(): string {
  const panel = (x: number, title: string, icon: string, back: string) => `<g transform="translate(${x} 18)">
    <rect width="92" height="132" rx="6" fill="#f6ecd2" stroke="#8a6b3e" stroke-width="2"/>
    <text x="46" y="18" text-anchor="middle" font-size="11" fill="#8b2a1e"${title.length > 7 ? ' textLength="80" lengthAdjust="spacingAndGlyphs"' : ''}>${title}</text>
    <g transform="translate(46 64)">${icon}</g>
    <path d="M10 92 h72" stroke="#c9a46a" stroke-dasharray="3 3"/>
    <g transform="translate(46 116)">${back}</g></g>`;
  const face = (mood: 'sad' | 'ok') => `<circle r="12" fill="#f0c9a0" stroke="#6b4a2c"/><circle cx="-4" cy="-3" r="1.5" fill="#2b2118"/><circle cx="4" cy="-3" r="1.5" fill="#2b2118"/>
    <path d="${mood === 'sad' ? 'M-5 6 q5 -5 10 0' : 'M-5 4 q5 5 10 0'}" stroke="#2b2118" stroke-width="1.5" fill="none"/>`;
  return frame(`<rect width="320" height="170" fill="#e8dcc0"/>
    ${panel(10, 'BEVERE', '<path d="M-14 -22 h24 v34 h-24z" fill="#c9a46a" stroke="#6b4a2c" stroke-width="2"/><path d="M10 -14 h6 v16 h-6" fill="none" stroke="#6b4a2c" stroke-width="3"/><path d="M-14 -22 q12 -10 24 0" fill="#fff"/>', face('sad'))}
    ${panel(114, 'MACINA', '<circle r="22" fill="#b8b0a0" stroke="#5f584c" stroke-width="2"/><circle r="5" fill="#5f584c"/><path d="M-22 0 h44 M0 -22 v44" stroke="#8a8270"/>', `${[-14, -4, 6].map(x => `<g transform="translate(${x} 6)"><path d="M0 0 V-14" stroke="#a8801f" stroke-width="2"/><ellipse cx="0" cy="-14" rx="3" ry="5" fill="#d6b25a"/></g>`).join('')}<path d="M12 -6 l6 -6 l6 6" stroke="#8b2a1e" stroke-width="2" fill="none"/>`)}
    ${panel(218, 'COMMERZIO', '<path d="M-26 -10 h52 l-6 -14 h-40z" fill="#8b2a1e"/><rect x="-22" y="-10" width="44" height="26" fill="#d9c49a" stroke="#6b5a47"/><circle cx="-8" cy="4" r="5" fill="#e3bb4f"/><circle cx="6" cy="4" r="5" fill="#e3bb4f"/>', `<g class="a-run">${person(-10, 10, '#5b6b8a', '')}</g>`)}
    ${bubble(70, 150, 'Ogni gabella ha un prezzo!', 160, 140)}`, 'le tre gabelle e il loro rovescio');
}

/** Le cinque genti che premono ai confini, con i loro stemmi. */
function factionsArt(): string {
  const genti: FactionId[] = ['franchi', 'ungari', 'longobardi', 'bizantini', 'saraceni'];
  return frame(`<rect width="320" height="170" fill="#f2c08a"/>
    <path d="M0 130 Q160 116 320 128 V170 H0z" fill="#9a8a4e"/>
    ${genti.map((f, i) => `<g transform="translate(${14 + i * 60} 22)" class="a-bob" style="animation-delay:${i * 0.15}s">${crest(f, 52)}</g>`).join('')}
    <g class="a-clash-l">${person(130, 150, '#8b2a1e', helmet + shield('#d6b25a') + '<path d="M8 -20 l24 -18" stroke="#c8c8c8" stroke-width="3"/>')}</g>
    <g class="a-clash-r">${person(196, 150, '#3e3a2e', hood('#2b2118') + '<path d="M-8 -20 l-24 -18" stroke="#c8c8c8" stroke-width="3"/>')}</g>
    <g transform="translate(262 148)">${[0, 1, 2].map(i => coin(i * 9, -6 - i * 4, 'a-bounce', i * 0.2)).join('')}</g>`, 'gli stemmi delle cinque genti e un duello');
}

const PAGES: Page[] = [
  {
    title: 'La terra e il raccolto',
    text: [
      'Ogni anno le vostre terre producono un raccolto: più acri possedete, più grano può nascere.',
      'Il grano però non entra da solo nei granai. Si compra dal raccolto dell\'anno, e mai più di quanto ne sia nato. Quando il raccolto è abbondante costa poco; quando è scarso, il prezzo sale.',
      'Ogni trent\'anni ciascun signore ha dieci annate abbondanti (grano da 1 a 15 scudi ogni mille), dieci medie (da 16 a 40) e dieci di carestia (da 41 a 60), mai più di tre uguali di fila.',
      'I granai tengono 50 misure per ogni acro, e potete costruirne di nuovi: a fine anno il grano in più marcisce, e anche quello conservato perde un poco ogni anno per ratti e muffa.',
      'Due vie portano al trono. Si può dare al popolo molto grano, che fa nascere servi e rende con la macina. Oppure si può fare i mercanti: comprare nelle annate buone, riempire i granai e vendere le scorte quando i vicini patiscono la fame. Le famiglie affamate verranno allora a stabilirsi nelle vostre terre.',
    ],
    quip: 'Comprate quando i contadini cantano, vendete quando piangono!',
    art: () => frame(`<rect width="320" height="170" fill="#bfe0f2"/>${sun(270, 34)}
      <path d="M0 96 Q90 76 180 92 T320 86 V170 H0z" fill="#8cbf63"/>
      ${[0, 1, 2, 3, 4, 5].map(i => `<path d="M${10 + i * 52} ${110 + (i % 2) * 8} l46 -3 l3 18 l-46 3z" fill="${i % 2 ? '#d9b84a' : '#c9a032'}" stroke="#8a6b3e" stroke-width=".6"/>`).join('')}
      ${[40, 70, 100, 210, 240].map((x, i) => sheaf(x, 150 + (i % 2) * 6)).join('')}
      <g class="a-dig" style="transform-origin:150px 150px">${person(150, 150, '#8a6b3e', '<path d="M8 -22 q20 -6 22 12" stroke="#6b4a2c" stroke-width="2.5" fill="none"/><path d="M30 -10 q8 -2 10 6" stroke="#b8b8b8" stroke-width="3" fill="none"/>')}</g>
      ${bubble(160, 20, 'Che raccolto, quest\'anno!', 158, 104)}`, 'contadini che mietono il grano sotto il sole'),
  },
  {
    title: 'Il popolo',
    text: [
      'Ogni anno il popolo chiede una certa quantità di grano. Date di più e nasceranno nuovi servi; date di meno e la fame ne porterà via.',
      'Ma il popolo si abitua presto: il grano dato oltre la domanda la fa crescere l\'anno dopo. Se poi viene una carestia e il grano non basta, la fame non perdona.',
      'Distribuire il grano chiude il mercato fino all\'anno seguente. I servi sono la vostra ricchezza: senza di loro nessuno pagherebbe le gabelle.',
    ],
    quip: 'Un signore senza servi è come un mercante senza clienti: un uomo solo con tanta merce!',
    art: () => frame(`<rect width="320" height="170" fill="#f0e2bc"/>
      <path d="M0 140 H320 V170 H0z" fill="#b59a6a"/>
      <g transform="translate(30 140)"><rect x="0" y="-60" width="70" height="60" fill="#a8844f" stroke="#5a3d26"/>
        <path d="M-6 -60 L35 -92 L76 -60z" fill="#8b2a1e"/><rect x="26" y="-34" width="18" height="34" fill="#4a3424"/>
        ${[0, 1, 2, 3].map(i => `<ellipse cx="${10 + i * 16}" cy="6" rx="7" ry="6" fill="#d6b25a" stroke="#8a6b3e"/>`).join('')}</g>
      ${[0, 1, 2, 3, 4].map(i => `<g class="a-bob" style="animation-delay:${i * 0.15}s">${person(140 + i * 34, 150, ['#6e4a2f', '#8b5a3c', '#5b6b8a', '#6f8f4e', '#8a6b3e'][i], i === 0 ? '<ellipse cx="12" cy="-18" rx="6" ry="4" fill="#d6b25a"/>' : '')}</g>`).join('')}
      <g transform="translate(296 152) scale(.7)">${person(0, 0, '#c94a2e')}</g>
      ${bubble(150, 18, 'Pane per tutti!', 146, 104)}`, 'il popolo in fila davanti al granaio'),
  },
  {
    title: 'Imprevisti e pugna',
    text: [
      'Di tanto in tanto la sorte bussa alla porta: peste, alluvioni, doni di principi lontani, briganti che chiedono riscatto.',
      'Ogni anno, poi, l\'araldo porta notizie da una città del reame: piogge, cavallette, un\'eredità, la visita del re. Alcune chiedono una scelta. Quanto spesso arrivano, lo decidete all\'inizio: quanto temete la sorte?',
      'Ai confini premono cinque genti: Franchi, Ungari, Longobardi, Bizantini e Saraceni. Chi vi attacca dipende da dove sta la vostra città, e ognuna prende di mira una parte diversa del feudo: il tesoro, i campi, il commercio, i servi.',
      'Davanti a loro c\'è sempre più di una via. Combattere: ogni servo vale mezzo nemico, quindi più popolo avete più vi difendete; ma le orde crescono di anno in anno. Se vincete fate bottino e per anni non tornano; se perdete, vi prendono proprio ciò che cercavano. Pagare: nessun rischio, ma chi paga una volta viene cercato ancora. Allearsi, con un matrimonio, un giuramento o un patto: per anni vi lasciano in pace, o vi arricchiscono, ma il prezzo si paga ogni anno.',
    ],
    quip: 'Io, quando vedo briganti, pago e scappo. Ma io sono un mercante: voi siete un signore!',
    art: factionsArt,
  },
  {
    title: 'Tre gabelle, tre rovesci',
    text: [
      'Tre gabelle riempiono le casse, e ognuna ha un rovescio che si paga negli anni seguenti. Umore del popolo e fiducia dei mercanti non si conoscono con esattezza: ogni anno ne vedete solo il livello (ottimo, buono, normale, infelice, rabbia), e cambiano anche un poco a caso.',
      'Il bevere tassa vino e cervogia, e rende secondo quanti servi avete. Ma più è alto, più scende l\'umore del popolo: finché è ottimo o buono nessuno si ribella, da normale in giù il popolo può assaltare i granai, tanto più spesso quanto più è scontento. E un popolo scontento lavora male negli opifici.',
      'La macina si paga sul grano che distribuite. Anche lei esce dalle tasche del popolo e pesa sull\'umore, meno del bevere: le due gabelle insieme non possono essere alte. Il grano dato oltre la domanda rende il popolo più tollerante verso le gabelle, ma l\'anno dopo ne vorrà di più.',
      'Il commerzio tassa mercati e opifici. I mercati però rendono secondo la fiducia dei mercanti, che cala se li spremete: con poca fiducia il grano costa di più e si vende a meno, e da normale in giù qualcuno chiude bottega. Con fiducia ottima ne arrivano di nuovi. Vendere grano ai mercanti li rende più tolleranti verso la gabella.',
      'Nelle rendite, il "?" accanto a ogni gabella vi fa spiegare dal camerlengo il pro e il contro. Indovinare le gabelle giuste è un\'arte: qualche rivolta o qualche mercante in fuga è da mettere in conto.',
    ],
    quip: 'Tassare è come mungere: chi tira troppo resta senza latte, e con un calcio negli stinchi!',
    art: taxArt,
  },
  {
    title: 'Usurai e debiti',
    text: [
      'Gli usurai vi fanno credito quanto avete incassato l\'anno prima, ma a fine anno chiedono gli interessi. Negli anni di carestia l\'usura è più alta.',
      'Con il tesoro in debito i granai non si riparano: ogni anno fino a un decimo del grano va a male.',
      'Attenti a non sprofondare: chi chiude l\'anno con 20.000 scudi di debiti o più finisce in ceppi, e per lui la partita è finita.',
      'Ritoccare le gabelle invece non costa nulla: cambiatele quando le cose cambiano.',
    ],
    quip: 'Gli usurai sono come me: sorridenti all\'andata, spietati al ritorno.',
    art: () => frame(`<rect width="320" height="170" fill="#e8dcc0"/>
      <rect x="40" y="96" width="240" height="14" fill="#6b4a2c"/><path d="M56 110 v46 M264 110 v46" stroke="#5a3d26" stroke-width="6"/>
      <g transform="translate(84 96)"><path d="M0 0 l-30 -6 v-26 l30 6z" fill="#f6ecd2" stroke="#8a6b3e"/><path d="M0 0 l30 -6 v-26 l-30 6z" fill="#efe2c2" stroke="#8a6b3e"/>
        ${[0, 1, 2].map(i => `<path d="M-26 ${-24 + i * 6} l22 4 M4 ${-21 + i * 6} l22 -4" stroke="#8a6b3e" stroke-width=".8"/>`).join('')}</g>
      <g transform="translate(200 96)"><path d="M0 0 v-44 M-26 -40 h52" stroke="#5a3d26" stroke-width="2.5"/>
        <g class="a-swing" style="transform-origin:0 -40px"><path d="M-26 -40 l-8 18 h16z M26 -40 l-8 18 h16z" fill="#c99a2e" stroke="#6b4a2c"/>
        ${coin(-26, -26)}${coin(26, -27)}${coin(26, -31)}</g></g>
      ${[0, 1, 2, 3, 4].map(i => coin(130 + i * 9, 90 - (i % 2) * 4)).join('')}
      ${bubble(160, 14, 'Il 10% a fine anno...', 208, 40)}`, 'il banco del camerlengo con il registro e la bilancia'),
  },
  {
    title: 'Costruire e salire di rango',
    text: [
      `Terre, mercati, opifici e piani di palazzo valgono per il rango quanto li pagate: costruire non vi fa perdere terreno. In più, mercati e opifici rendono con la gabella sul commerzio, e ogni piano di palazzo attira da ${PALAZZO_SERVI[0]} a ${PALAZZO_SERVI[1].toLocaleString('it-IT')} servi nel feudo.`,
      `Superate le soglie di ricchezza e diventerete conte, duca, granduca, principe; i signori di rango inferiore vi pagheranno un tributo. Chi supera ${THRONE_THRESHOLD.toLocaleString('it-IT')} di ricchezza e ha completato il palazzo in tutti i suoi ${MAX_PALAZZO} piani sale al trono; se nello stesso anno ci riescono in più, vince il più ricco.`,
    ],
    quip: 'Un giorno racconterò nelle piazze di Genua del vostro trono. Se mi pagate bene, s\'intende!',
    art: () => {
      const sample = createPlayer({ name: 'esempio', gender: 1 }, 3);
      Object.assign(sample, { scudi: 20000, servi: 2200, grano: 15000, acri: 1200, mercato: 6, opificio: 4, palazzo: 9 });
      return `<div class="mini-art">${realmScene(sample, 'un feudo prospero con palazzo, mercati e mulini')}</div>`;
    },
  },
  {
    title: 'L\'anno in sei tempi',
    text: [
      'Ogni anno ciascun signore attraversa sei tempi: la delibera sul grano, l\'imprevisto (se capita), le rendite, i dispendimenti in terre e botteghe, la veduta del reame con quanto avete costruito, e infine la chiusura dell\'anno.',
      'A volte, prima della delibera, l\'araldo vi porta una notizia dal reame.',
      'Nei primi tre anni la sorte è mite: imprevisti, notizie del reame e tributi pretesi dalle fazioni non tolgono né danno più di 200 scudi. Le spese che scegliete voi e le imprese temerarie restano intere.',
      'Quando tutti i signori hanno giocato, cala il sipario e il cronista scrive nel libro delle cronache le gesta di ciascuno. Poi la ruota riparte.',
    ],
    quip: 'E ora basta chiacchiere: il mercato apre all\'alba!',
    art: wheelOfYear,
  },
];

export const TUTORIAL_PAGES = PAGES.length;

export function welcomeText(): string {
  return pick([
    'Salve, viandante! Sono Lapo, mercante di Genua: ho venduto stoffe a conti e granaglie a principi. Prima che vi mettiate a governare un feudo... abbisognate de insegnamento?',
    'Ben trovato! Messer Lapo, per servirvi: giro i feudi da trent\'anni e ne ho visti cadere tanti per ignoranza. Abbisognate de insegnamento, prima di cominciare?',
  ]);
}

export function renderWelcome(text: string): string {
  return `<h1>Alto Medioevo</h1>
    <p class="sub">Cronache di un feudo, anno 900 circa.</p>
    <p class="version">versione ${VERSION} del ${versionDateText()}</p>
    ${speechBox(LAPO, text)}
    <div class="action-cards two">
      <button class="action-card" data-act="tutorialStart"><span class="card-emblem" aria-hidden="true">📜</span><span class="card-title">Sì, insegnatemi</span><span class="card-sub">sei pagine illustrate</span></button>
      <button class="action-card" data-act="skipTutorial"><span class="card-emblem" aria-hidden="true">⚑</span><span class="card-title">No, conosco il mestiere</span><span class="card-sub">si va subito al feudo</span></button>
    </div>`;
}

export function renderTutorial(page: number, inGame: boolean): string {
  const p = PAGES[page];
  const last = page === PAGES.length - 1;
  return `
  <div class="codex" role="document">
    <div class="codex-head"><span>Libro dell'insegnamento</span><span>pagina ${page + 1} di ${PAGES.length}</span></div>
    <div class="miniature">${p.art()}</div>
    <h2 class="codex-title">${p.title}</h2>
    <div class="codex-text">${p.text.map(t => `<p>${t}</p>`).join('')}</div>
    ${speechBox(LAPO, p.quip)}
    <div class="codex-dots" aria-hidden="true">${PAGES.map((_, i) => `<span class="${i === page ? 'on' : ''}"></span>`).join('')}</div>
    <div class="btns codex-nav">
      ${page > 0 ? '<button data-act="tutPrev">Indietro</button>' : '<span></span>'}
      <button data-act="tutClose" class="ghost">${inGame ? 'Torna al gioco' : 'Salta'}</button>
      <button data-act="${last ? 'tutClose' : 'tutNext'}" class="primary">${last ? (inGame ? 'Torna al gioco' : 'Al feudo!') : 'Pagina seguente'}</button>
    </div>
  </div>`;
}
