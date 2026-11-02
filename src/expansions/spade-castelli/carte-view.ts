/**
 * Carte di guerra di "Spade e Castelli": vignette dell'imprevisto che le
 * porta, riquadro delle carte in mano e righe della cronaca. Solo
 * presentazione: le regole sono in carte.ts e rules.ts.
 */
import { FEUDI } from '../../domain/rank';
import type { Game } from '../../domain/turn';
import type { Player } from '../../domain/types';
import { bubble, castle, coin, COMICS, ground, helmet, hood, person, shield, sky, spear } from '../../ui/comics';
import {
  CARTA_DURATA, CARTA_EVENT, CARTE_ID, handOf, MERC_PAGA, mercsOf, playedThisYear, scadenzaCarta, TRADITORE_MURA, truceOn, type CartaGuerra, type CartaId,
} from './carte';
import { mercCost, ss, traitorTargets } from './rules';

const n = (v: number) => Math.floor(v).toLocaleString('it-IT');
const year = (q: number) => 900 + q;

// ---------------------------------------------------------------- vignette dell'imprevisto

const bishop = (x: number) => person(x, 142, '#e8e0d0', '<path d="M-7 -33 L0 -48 L7 -33z" fill="#e3bb4f" stroke="#a8844f"/><path d="M16 -44 v48" stroke="#a8844f" stroke-width="2.5"/><path d="M16 -44 q8 0 6 8" stroke="#a8844f" stroke-width="2.5" fill="none"/>');
const lord = (x: number) => person(x, 142, '#2f5b3a', '<path d="M-8 -36 h16 l-3 -6 h-10z" fill="#8b2a1e"/>');

COMICS[CARTA_EVENT.mercenari] = {
  sound: ['TUM TUM TUM!', 'CLANG CLANG!'],
  lines: ['Le nostre spade sono vostre... per il giusto prezzo.', 'Pagate, e combatteremo.', 'Oro prima, sangue dopo.'],
  captions: h => [
    `Un capitano di ventura si presenta alle porte con la sua compagnia, ${h}. Combatteranno per voi, nel fortino o in campagna, ma vogliono essere pagati quando li assoldate.`,
    `Lance, balestre e facce da forca, ${h}: una compagnia di mercenari cerca un signore che la paghi. Le spie dei vicini non sapranno nulla di loro.`,
  ],
  scene: line => `${sky('#8fb0c8', '#e8dcb8', 'skm')}${ground('#8a7a4e')}
    <g class="a-march-in">${[0, 1, 2, 3, 4].map(i => person(150 + i * 30, 142 + (i % 2) * 3, i % 2 ? '#6b5a2a' : '#5a3d26', helmet + spear + (i % 2 ? shield('#8b2a1e') : ''))).join('')}</g>
    ${lord(70)}${coin(96, 118, 'a-toss', 0)}${coin(104, 118, 'a-toss', 0.3)}
    ${bubble(130, 20, line, 170, 100)}`,
};

COMICS[CARTA_EVENT.traditore] = {
  sound: ['PSST...', 'SSST!'],
  lines: ['Conosco una porta che nessuno sorveglia...', 'A luna nuova, la postierla sarà aperta.', 'Fidatevi di me, signore.'],
  captions: h => [
    `Nella notte un uomo incappucciato chiede di vedervi, ${h}. Viene da un feudo nemico e giura di poter aprire una porta delle sue mura al vostro prossimo assalto. Possiamo fidarci di questo traditore?`,
    `Un soldato di un feudo nemico, stanco del suo signore, offre di spalancare una postierla quando i vostri attaccheranno, ${h}. Possiamo fidarci di questo traditore?`,
  ],
  scene: line => `${sky('#1c2238', '#3d4a6e', 'skt')}<circle cx="270" cy="28" r="11" fill="#f3ecc8"/>${ground('#3e3a2e')}
    ${castle(200, 150)}
    <g class="a-sneak">${person(150, 142, '#2b2118', hood('#1c1814'))}</g>
    ${lord(80)}
    ${bubble(10, 26, line, 140, 100)}`,
};

COMICS[CARTA_EVENT.tregua] = {
  sound: ['DONG! DONG!', 'DIN DON!'],
  lines: ['Pace, in nome di Dio!', 'Chi alza la spada sarà scomunicato.', 'Deponete le armi!'],
  captions: h => [
    `Il vescovo raduna i signori del regno attorno alle reliquie e proclama la pace di Dio, ${h}. Quando la invocherete, per un anno nessuno potrà portare le armi contro il vostro feudo.`,
    `Le campane suonano a festa: il concilio dei vescovi ha giurato la tregua di Dio, ${h}. Potrete invocarla quando un nemico vi minaccerà, e per un anno nessuno combatterà contro di voi.`,
  ],
  scene: line => `${sky('#a8c8e0', '#f2e8c8', 'skg')}${ground('#7a8a4e')}
    <path d="M150 150 v-60 l20 -22 l20 22 v60z" fill="#d8ccb0" stroke="#8a7a5a"/><path d="M170 60 v-14 M164 52 h12" stroke="#8a7a5a" stroke-width="3"/>
    <path d="M164 96 q6 -12 12 0z" fill="#c99a2e" stroke="#8a6a1e"/>
    ${bishop(120)}${person(220, 142, '#5b6b8a', helmet)}${person(250, 142, '#8b2a1e', helmet)}
    <path d="M232 150 l14 -6 M262 150 l14 -6" stroke="#6b4a2c" stroke-width="2.5"/>
    ${bubble(10, 22, line, 120, 100)}`,
};

// ---------------------------------------------------------------- carte in mano

const EMBLEM: Record<CartaId, string> = { mercenari: '⚔', traditore: '🗝', tregua: '✝' };
export const CARTA_TITLE: Record<CartaId, string> = { mercenari: 'Mercenari', traditore: 'Il traditore', tregua: 'Tregua di Dio' };

function cardBody(g: Game, c: CartaGuerra, can: boolean): string {
  const ps = g.state.players;
  switch (c.id) {
    case 'mercenari': {
      const cost = mercCost(g);
      return `<p>Una compagnia di <b>${n(c.n ?? 0)} mercenari</b>. Si pagano quando li assoldate (${MERC_PAGA} scudi a testa); poi difendono il fortino, o partono con l'esercito dal pannello Guerra. Le spie dei vicini non li vedono. Se ne vanno dopo la loro prima battaglia, o all'anno ${year(scadenzaCarta(c))}.</p>
        <button data-act="ext" data-op="mercHire" ${can ? 'class="primary"' : 'disabled'}>Assoldateli (${n(cost)} scudi)</button>`;
    }
    case 'traditore': {
      const targets = traitorTargets(g);
      const btns = targets.map(t => `<button data-act="ext" data-op="traitor" data-target="${t}" ${can ? '' : 'disabled'}>Mandatelo a ${FEUDI[ps[t].feudo]}</button>`).join('');
      return `<p>Al prossimo assalto di un vostro esercito aprirà una porta: il nemico combatterà con ${TRADITORE_MURA} cerchie di mura in meno. Possiamo fidarci di questo traditore?</p>
        ${btns || '<p class="hint">Si manda contro un feudo verso cui marcia, o che assedia, un vostro esercito.</p>'}`;
    }
    case 'tregua':
      return `<p>Invocata, per tutto quest'anno nessuno combatte contro il vostro feudo: gli eserciti in arrivo si fermano un anno, chi vi assedia non dà l'assalto.</p>
        <button data-act="ext" data-op="truce" ${can ? 'class="primary"' : 'disabled'}>Invocate la tregua</button>`;
  }
}

/** Riquadro "Carte di guerra" nella colonna a sinistra. */
export function cardsAside(g: Game): string {
  if (!g.state.options.mazzo) return '';
  const st = ss(g), me = g.state.current, q = g.state.q;
  const hand = handOf(st, me).filter(c => q <= scadenzaCarta(c));
  const phase = g.state.phase.kind === 'commercio' || g.state.phase.kind === 'investimenti';
  const once = playedThisYear(g, st, me);
  const can = phase && !once;
  const status = [
    mercsOf(g, st, me) ? `${n(mercsOf(g, st, me))} mercenari nel fortino` : '',
    truceOn(g, st, me) ? "Tregua di Dio per quest'anno" : '',
  ].filter(Boolean).map(s => `<p class="impresa-note">${s}.</p>`).join('');
  const cards = hand.map(c => `<div class="impresa-card">
      <div class="impresa-head"><span class="impresa-emblem" aria-hidden="true">${EMBLEM[c.id]}</span><b>${CARTA_TITLE[c.id]}</b></div>
      ${cardBody(g, c, can)}
      <p class="impresa-due">Si gioca fino all'anno ${year(scadenzaCarta(c))}${q === scadenzaCarta(c) ? ": è l'ultimo!" : '.'}</p>
    </div>`).join('');
  const hint = !hand.length ? '<p class="hint">Nessuna carta in mano. Arrivano fra gli imprevisti.</p>'
    : once ? "<p class=\"hint\">Quest'anno avete già giocato una carta.</p>"
    : !phase ? '<p class="hint">Si giocano nella Delibera o nei dispendimenti, una per anno.</p>' : '';
  return `<section class="imprese carte-guerra"><h3>Carte di guerra</h3>${status}${cards}${hint}</section>`;
}

// ---------------------------------------------------------------- cronaca

export function cardChronicle(kind: string, d: Record<string, number>, players: Player[]): string | null | undefined {
  const card = CARTE_ID[d.card];
  switch (kind) {
    case 'cardDrawn':
      return card === 'mercenari' ? `Una compagnia di ventura gli offrì le sue spade.`
        : card === 'traditore' ? 'Un uomo di un feudo nemico gli offrì di aprirgli una porta delle sue mura.'
        : 'Il vescovo gli promise la tregua di Dio.';
    case 'cardLost':
      return card === 'mercenari' ? 'La compagnia di ventura, stanca di aspettare, cercò un altro signore.'
        : card === 'traditore' ? 'Il traditore non si fece più vedere.'
        : `Lasciò passare ${CARTA_DURATA} anni senza invocare la tregua di Dio.`;
    case 'mercHired': return `Assoldò una compagnia di ${n(d.n)} mercenari per ${n(d.scudi)} scudi.`;
    case 'truce': return 'Invocò la tregua di Dio: per un anno nessuno portò le armi contro il suo feudo.';
  }
  void players;
  return undefined;
}
