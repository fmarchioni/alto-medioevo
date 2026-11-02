/**
 * Vista delle imprese dei mercanti: vignette dell'imprevisto, riquadro
 * "Imprese" nella colonna a sinistra, dispacci, cronaca e arresto. Solo
 * presentazione: le regole sono in imprese.ts e fiera.ts.
 */
import type { Game } from '../../domain/turn';
import { bubble, COMICS, ground, hood, person, sky } from '../../ui/comics';
import { ANNACQUATO_SCOPERTO, CONSOLE_COSTO, CONSOLE_SCANDALO, fairOpen, visibleTo, type FieraState } from './fiera';
import { contractLine } from './fiera-view';
import { hasPort } from './geografia';
import {
  ANNACQUA_ANNI, ANNACQUA_MAX, ANNACQUA_QUOTA, CONTRABBANDO_ANNI, CONTRABBANDO_FERMATA, CONTRABBANDO_MAX, CONTRABBANDO_MIN, CONTRABBANDO_MULT, FALLITO_PREZZO,
  IMPRESA_DURATA, IMPRESA_MERC_EVENT, IMPRESE_MERC, impreseOf, scadenzaImpresa, smuggleArrest, type CartaMerc, type ImpresaDispatch, type ImpresaMercId, type ImpreseState,
} from './imprese';

const n = (v: number) => Math.floor(v).toLocaleString('it-IT');
const year = (q: number) => 900 + q;
const pct = (v: number) => `${Math.round(v * 100)}%`;

// ---------------------------------------------------------------- vignette

const lord = (x: number) => person(x, 142, '#2f5b3a', '<path d="M-8 -36 h16 l-3 -6 h-10z" fill="#8b2a1e"/>');
const barrel = (x: number, y: number) => `<ellipse cx="${x}" cy="${y}" rx="9" ry="10" fill="#8a5a34" stroke="#4a3424"/><path d="M${x - 8} ${y - 4} h16 M${x - 8} ${y + 4} h16" stroke="#4a3424" stroke-width="1.5"/>`;
const crate = (x: number, y: number) => `<rect x="${x - 9}" y="${y - 9}" width="18" height="18" fill="#c9a86a" stroke="#6b4a2c"/><path d="M${x - 9} ${y} h18 M${x} ${y - 9} v18" stroke="#6b4a2c"/>`;

COMICS[IMPRESA_MERC_EVENT.annacquato] = {
  sound: ['GLU GLU...', 'SPLASH!'],
  lines: ['Un secchio d\'acqua per botte, e nessuno se ne accorge...', 'Il vino si allunga, i guadagni pure.', 'Chi volete che lo assaggi?'],
  captions: h => [
    `Un oste senza scrupoli si offre di allungare il vostro vino con l'acqua del pozzo, ${h}. Le botti cresceranno della metà; ma per ${ANNACQUA_ANNI} anni ogni carico di vino per la fiera rischia di essere assaggiato da un mercante sospettoso.`,
    `"Nessuno distingue il vino buono da quello allungato", sussurra l'oste, ${h}. Ma i mercanti forestieri hanno il palato fino.`,
  ],
  scene: line => `${sky('#7a6a8a', '#d8c8a8', 'ska')}${ground('#6b5a3a')}
    <path d="M200 150 v-40 h50 v40z" fill="#5a3d26"/><path d="M196 110 h58 l-6 -14 h-46z" fill="#7a1f2b"/>
    ${barrel(170, 140)}${barrel(150, 140)}
    <path d="M118 100 v24 h18 v-24z" fill="#9aa6b0" stroke="#5a6670"/><path d="M127 124 q4 10 22 10" stroke="#7ab0d8" stroke-width="3" fill="none"/>
    ${person(110, 142, '#6b5a2a', '<path d="M-8 -34 h16 v-4 h-16z" fill="#4a3424"/>')}${lord(60)}
    ${bubble(10, 18, line, 110, 100)}`,
};

COMICS[IMPRESA_MERC_EVENT.contrabbando] = {
  sound: ['SCIAFF...', 'PSST!'],
  lines: ['Niente dogane, niente domande.', 'A Costantinopoli pagano in oro.', 'La nave salpa a luna nuova.'],
  captions: h => [
    `Un capitano bizantino si offre di imbarcare i vostri manufatti per Costantinopoli, senza passare dalle dogane, ${h}. Se arrivano, li pagheranno da ${CONTRABBANDO_MULT[0]} a ${CONTRABBANDO_MULT[1]} volte il prezzo di fiera. Se le guardie fermano la nave, perdete tutto; e chi viene arrestato non torna più al suo feudo.`,
    `"Il Corno d'Oro è pieno di compratori che non fanno domande", dice il capitano, ${h}. Ma le guardie dell'imperatore sorvegliano il porto.`,
  ],
  scene: line => `${sky('#1c2238', '#3d4a6e', 'skz')}<circle cx="280" cy="26" r="9" fill="#f3ecc8"/>
    <path d="M0 140 Q80 132 160 140 T320 136 V180 H0z" fill="#2e4a6e"/>
    <path d="M170 132 h90 l-12 14 h-66z" fill="#5a3d26"/><path d="M214 132 v-50 M214 84 l30 40 h-30z" stroke="#3e2617" stroke-width="2" fill="#d8ccb0"/>
    ${crate(196, 124)}${crate(232, 124)}
    ${person(120, 136, '#2b2118', hood('#1c1814'))}${lord(70)}
    ${bubble(10, 20, line, 120, 96)}`,
};

COMICS[IMPRESA_MERC_EVENT.console] = {
  sound: ['TINTIN!', 'CLINK!'],
  lines: ['Un sacchetto d\'oro, e il contratto è vostro.', 'Le buste? Le apro io...', 'Discrezione, signore, discrezione.'],
  captions: h => [
    `Il console dei mercanti forestieri si lascia comprare, ${h}: per ${n(CONSOLE_COSTO)} scudi vi farà vincere un contratto della fiera al prezzo base, qualunque cosa offrano gli altri. Ma se si viene a sapere, i mercanti non vi vorranno più alle loro fiere.`,
    `"Le buste le apro io", sorride il console, ${h}. Un contratto a vostra scelta, a un prezzo onesto, per un piccolo dono.`,
  ],
  scene: line => `${sky('#a8b8c8', '#efe2c4', 'skk')}${ground('#8a7a5a')}
    <path d="M150 150 v-34 h80 v34z" fill="#8a5a34"/><path d="M146 116 h88 v-6 h-88z" fill="#6b4a2c"/>
    <rect x="166" y="98" width="14" height="10" fill="#efe2bf" stroke="#8a6a3a"/><rect x="186" y="98" width="14" height="10" fill="#efe2bf" stroke="#8a6a3a"/>
    ${person(250, 142, '#2e5fa3', '<path d="M-8 -35 h16 l-2 -7 h-12z" fill="#1c2238"/>')}${lord(110)}
    <circle cx="214" cy="104" r="5" fill="#c99a2e" stroke="#7a5a1a"/>
    ${bubble(10, 18, line, 120, 96)}`,
};

COMICS[IMPRESA_MERC_EVENT.fallito] = {
  sound: ['AHIMÈ!', 'TUTTO DEVE SPARIRE!'],
  lines: ['Prendete tutto, signore, a pochi denari!', 'I creditori mi inseguono...', 'Botti e casse, quasi regalate!'],
  captions: h => [
    `Un mercante di Pisa è fallito e svende il suo fondaco, ${h}: vino e manufatti a ${FALLITO_PREZZO} scudi l'unità. Arriveranno con una carovana da Pisa; ma qualcosa, in quel fondaco abbandonato, sarà guasto.`,
    `Il mercante pisano ha i creditori alle calcagna, ${h}, e vende tutto per pochi denari. Un affare, se la merce non è troppo rovinata.`,
  ],
  scene: line => `${sky('#a8c0d0', '#f0e4c4', 'skf')}${ground('#8a7a4e')}
    <path d="M190 150 v-50 h70 v50z" fill="#8a7a6a"/><path d="M184 100 l41 -24 l41 24z" fill="#5a4632"/><path d="M212 150 v-26 h22 v26z" fill="#2b2118"/>
    ${barrel(170, 140)}${crate(150, 140)}${barrel(130, 140)}
    ${person(110, 142, '#7a6a5a', '<path d="M-6 -36 q6 -4 12 0" stroke="#4a3424" fill="none"/>')}${lord(60)}
    ${bubble(10, 18, line, 110, 100)}`,
};

// ---------------------------------------------------------------- riquadro "Imprese"

const TITLE: Record<ImpresaMercId, string> = { annacquato: 'Il vino annacquato', contrabbando: "Il contrabbando del Corno d'Oro", console: 'Il console comprato', fallito: 'Il mercante fallito' };
const EMBLEM: Record<ImpresaMercId, string> = { annacquato: '♒', contrabbando: '⚓', console: '⚖', fallito: '⚱' };

function cardBody(g: Game, st: ImpreseState & FieraState, c: CartaMerc, can: boolean): string {
  const p = g.player, cant = st.cantine[g.state.current];
  switch (c.id) {
    case 'annacquato': {
      const add = Math.min(ANNACQUA_MAX, Math.floor(cant.vino * ANNACQUA_QUOTA));
      return `<p>Le botti crescono della metà (ora: +${n(add)}). Per ${ANNACQUA_ANNI} anni ogni consegna di vino alla fiera può essere scoperta (una volta su ${Math.round(1 / ANNACQUATO_SCOPERTO)}): niente pagamento, una multa, prestigio perduto e fuori dalla fiera seguente. Nei banchetti nessuno se ne accorge.</p>
        <button data-act="ext" data-op="water" ${can && add > 0 ? '' : 'disabled'}>Annacquate il vino</button>`;
    }
    case 'contrabbando': {
      const max = Math.min(CONTRABBANDO_MAX, cant.manufatti);
      return `<p>Da ${CONTRABBANDO_MIN} a ${CONTRABBANDO_MAX} manufatti per Costantinopoli: fra ${CONTRABBANDO_ANNI} anni rendono da ${CONTRABBANDO_MULT[0]} a ${CONTRABBANDO_MULT[1]} volte il prezzo di fiera. Una nave su ${Math.round(1 / CONTRABBANDO_FERMATA)} è fermata: si perde tutto, e nel ${pct(smuggleArrest(p.feudo))} dei casi si viene arrestati${hasPort(p.feudo) ? ' (il vostro porto dimezza il rischio)' : ''}.</p>
        <span class="ext-form"><input type="number" name="smuggle-qty" min="${CONTRABBANDO_MIN}" max="${Math.max(CONTRABBANDO_MIN, max)}" value="${Math.max(CONTRABBANDO_MIN, max)}" inputmode="numeric" aria-label="manufatti da imbarcare">
        <button data-act="ext" data-op="smuggle" ${can && max >= CONTRABBANDO_MIN ? '' : 'disabled'}>Imbarcate</button></span>`;
    }
    case 'console': {
      const f = fairOpen(st, g.state.q), vis = f ? visibleTo(f, g.state.current) : [];
      const opts = vis.map(k => `<option value="${k.id}">${contractLine(k)}</option>`).join('');
      return `<p>Per ${n(CONSOLE_COSTO)} scudi un contratto della fiera è vostro al prezzo base, qualunque cosa offrano gli altri. Una volta su ${Math.round(1 / CONSOLE_SCANDALO)} si viene a sapere: niente contratto, prestigio perduto e fuori dalle due fiere seguenti.</p>
        ${vis.length ? `<span class="ext-form"><select name="console-k" aria-label="contratto">${opts}</select>
        <button data-act="ext" data-op="console" ${can ? '' : 'disabled'}>Comprate il console</button></span>` : '<p class="hint">Si gioca nell\'anno della fiera, dopo aver preso una quota.</p>'}`;
    }
    case 'fallito': {
      const cost = ((c.vino ?? 0) + (c.manufatti ?? 0)) * FALLITO_PREZZO;
      return `<p>${n(c.vino ?? 0)} botti di vino e ${n(c.manufatti ?? 0)} pezzi di manufatti a ${FALLITO_PREZZO} scudi l'unità. Arrivano con una carovana da Pisa; una parte si scoprirà guasta.</p>
        <button data-act="ext" data-op="bankrupt" ${can && p.scudi - cost >= -p.credito ? '' : 'disabled'}>Comprate tutto (${n(cost)} scudi)</button>`;
    }
  }
}

/** Riquadro "Imprese" nella colonna a sinistra. */
export function impreseAside(g: Game, st: ImpreseState & FieraState): string {
  const q = g.state.q, k = g.state.phase.kind;
  const can = k === 'signori' || k === 'investimenti';
  const hand = impreseOf(st, g.state.current).filter(c => q <= scadenzaImpresa(c));
  const cards = hand.map(c => `<div class="impresa-card">
      <div class="impresa-head"><span class="impresa-emblem" aria-hidden="true">${EMBLEM[c.id]}</span><b>${TITLE[c.id]}</b></div>
      ${cardBody(g, st, c, can)}
      <p class="impresa-due">Si gioca fino all'anno ${year(scadenzaImpresa(c))}${q === scadenzaImpresa(c) ? ": è l'ultimo!" : '.'}</p>
    </div>`).join('');
  const hint = !hand.length ? '<p class="hint">Nessuna impresa in serbo. Le occasioni arrivano fra gli imprevisti.</p>'
    : !can ? '<p class="hint">Si giocano fra signori (dopo il mercato del grano) o nei dispendimenti.</p>' : '';
  return `<section class="imprese"><h3>Imprese</h3>${cards}${hint}</section>`;
}

export const impresaCardNote = (id: number) =>
  IMPRESE_MERC.some(x => IMPRESA_MERC_EVENT[x] === id)
    ? `Non dovete decidere ora: la carta resta fra le vostre <b>Imprese</b>, nel pannello a sinistra, e potete giocarla entro ${IMPRESA_DURATA} anni.`
    : undefined;

// ---------------------------------------------------------------- dispacci, cronaca, arresto

export function impresaDispatchText(d: ImpresaDispatch): string {
  switch (d.k) {
    case 'contrabbandoOk': return `La nave è arrivata a Costantinopoli senza incontrare le guardie: i vostri ${n(d.qty)} manufatti sono stati pagati <b>${n(d.gain)} scudi</b>.`;
    case 'contrabbandoPreso': return `Le guardie dell'imperatore hanno fermato la nave del contrabbando: ${n(d.qty)} manufatti perduti. Il capitano non ha fatto il vostro nome, ma le voci corrono: prestigio mercantile ${Math.round(d.prestigio)}.`;
    case 'fallitoArrivo': return `È arrivata da Pisa la merce del mercante fallito: ${n(d.vino - d.guastoVino)} botti di vino e ${n(d.manufatti - d.guastoManufatti)} pezzi di manufatti. Erano guasti ${n(d.guastoVino)} botti e ${n(d.guastoManufatti)} pezzi.`;
  }
}

export function impresaDispatchHead(d: ImpresaDispatch): { from: string; title: string } {
  switch (d.k) {
    case 'contrabbandoOk': return { from: 'da Costantinopoli', title: 'Contrabbando riuscito' };
    case 'contrabbandoPreso': return { from: 'dal porto', title: 'Nave sequestrata' };
    case 'fallitoArrivo': return { from: 'da Pisa', title: 'Il fondaco del fallito' };
  }
}

export function impresaChronicle(kind: string, d: Record<string, number>): string | null {
  const card = IMPRESE_MERC[d.card];
  switch (kind) {
    case 'impresaDrawn': return card === 'annacquato' ? "Un oste gli propose di allungare il vino con l'acqua." : card === 'contrabbando' ? 'Un capitano bizantino gli offrì di imbarcare merci di contrabbando.' : card === 'console' ? 'Il console dei mercanti forestieri gli fece capire di essere in vendita.' : 'Un mercante di Pisa fallito gli offrì il suo fondaco.';
    case 'impresaLost': return card === 'annacquato' ? "Non volle annacquare il vino." : card === 'contrabbando' ? 'Il capitano bizantino salpò senza le sue merci.' : card === 'console' ? 'Non comprò il console.' : 'Il fondaco del fallito andò ad altri.';
    case 'wineWatered': return `Fece allungare il vino: ${n(d.added)} botti in più.`;
    case 'wineCaught': return `Un mercante scoprì che il suo vino era annacquato: ${n(d.multa)} scudi di multa, e fuori dalla fiera fino al ${d.fino}.`;
    case 'smuggleOut': return `Imbarcò di nascosto ${n(d.qty)} manufatti per Costantinopoli.`;
    case 'smuggleOk': return `Il contrabbando gli fruttò ${n(d.gain)} scudi.`;
    case 'smuggleSeized': return `Le guardie sequestrarono la sua nave di contrabbando, con ${n(d.qty)} manufatti.`;
    case 'smuggleArrest': return `Fu arrestato al porto, fra le casse di contrabbando: ${n(d.qty)} manufatti senza dogana.`;
    case 'consoleBought': return 'Comprò in segreto il console dei mercanti forestieri.';
    case 'consoleCaught': return `Si seppe che aveva comprato il console: fuori dalle fiere fino al ${d.fino}.`;
    case 'bankruptBuy': return `Comprò il fondaco di un mercante fallito: ${n(d.vino)} botti e ${n(d.manufatti)} manufatti per ${n(d.cost)} scudi.`;
    case 'bankruptIn': return `Gli giunsero da Pisa ${n(d.vino)} botti e ${n(d.manufatti)} manufatti del mercante fallito.`;
  }
  return null;
}

export function smuggleArrestText(st: ImpreseState, g: Game): string | undefined {
  const a = st.arresto;
  if (!a || a.player !== g.state.current || a.q !== g.state.q) return undefined;
  return `<p class="big">Le guardie dell'imperatore aspettavano la nave al porto. Fra le casse di contrabbando, ${n(a.qty)} manufatti senza dogana, c'era il vostro sigillo. Siete in ceppi: il feudo non vi rivedrà più.</p>`;
}
