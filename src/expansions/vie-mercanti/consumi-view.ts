/**
 * Vista dei consumi di prestigio: vignette delle richieste, pannello delle
 * feste, riga del palazzo e cronaca. Solo presentazione: le regole sono in
 * consumi.ts.
 */
import { titleName } from '../../domain/rank';
import type { Game } from '../../domain/turn';
import { bubble, castle, COMICS, ground, person, sky } from '../../ui/comics';
import {
  BANCHETTI, BANCHETTI_ID, banchettoFatto, festaDi, festaOf, FESTA_PRESTIGIO_MERCANTILE, manufattiPiano, palaceNeeds, PRESTIGIO_BANCHETTO, PRESTIGIO_FESTA, PREZZO_ARTIGIANI,
  RICHIESTA_DURATA, RICHIESTA_EVENT, RICHIESTE, RICHIESTE_ID, richiesteOf, scadenzaRichiesta, type ConsumiState, type RichiestaId,
} from './consumi';
import { committed, type FieraState } from './fiera';

const n = (v: number) => Math.floor(v).toLocaleString('it-IT');
const year = (q: number) => 900 + q;
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v * 10) / 10).toLocaleString('it-IT')}`;

// ---------------------------------------------------------------- vignette delle richieste

const lord = (x: number) => person(x, 142, '#2f5b3a', '<path d="M-8 -36 h16 l-3 -6 h-10z" fill="#8b2a1e"/>');
const barrel = (x: number, y: number) => `<ellipse cx="${x}" cy="${y}" rx="9" ry="10" fill="#8a5a34" stroke="#4a3424"/><path d="M${x - 8} ${y - 4} h16 M${x - 8} ${y + 4} h16" stroke="#4a3424" stroke-width="1.5"/>`;
const crate = (x: number, y: number) => `<rect x="${x - 9}" y="${y - 9}" width="18" height="18" fill="#c9a86a" stroke="#6b4a2c"/><path d="M${x - 9} ${y} h18 M${x} ${y - 9} v18" stroke="#6b4a2c"/>`;

COMICS[RICHIESTA_EVENT.nozze] = {
  sound: ['DIN DON!', 'EVVIVA!'],
  lines: ['Che vino scorrerà alle nozze?', 'Il banchetto sia degno del casato!', 'Viva gli sposi!'],
  captions: h => [
    `Un vostro congiunto va a nozze, ${h}, e tutto il feudo aspetta il banchetto. Servirà vino in abbondanza: offritelo entro ${RICHIESTA_DURATA} anni e il casato ne avrà onore.`,
    `Si celebrano nozze nella vostra famiglia, ${h}. Gli ospiti verranno da lontano: un banchetto ricco di vino farà parlare di voi per anni.`,
  ],
  scene: line => `${sky('#a8c8e0', '#f2e8c8', 'skn')}${ground('#7a8a4e')}
    ${person(170, 142, '#f3ecc8', '<path d="M-8 -34 q8 -10 16 0" fill="#f3ecc8" stroke="#c9b98a"/>')}${person(196, 142, '#2e5fa3')}
    ${lord(80)}${barrel(240, 140)}${barrel(262, 140)}
    ${bubble(10, 20, line, 150, 100)}`,
};

COMICS[RICHIESTA_EVENT.cattedrale] = {
  sound: ['TOC TOC TOC!', 'DONG!'],
  lines: ['La casa di Dio merita arredi degni.', 'Candelabri, panche, paramenti...', 'Il vescovo vi benedirà.'],
  captions: h => [
    `Il vescovo innalza una nuova cattedrale, ${h}, e chiede ai signori arredi, candelabri e paramenti. Donate i manufatti entro ${RICHIESTA_DURATA} anni: il vostro nome sarà inciso sul portale.`,
    `Le mura della cattedrale sono finite, ${h}, ma dentro è spoglia. Il vescovo spera nei vostri opifici.`,
  ],
  scene: line => `${sky('#b8c8d8', '#efe2c4', 'skc')}${ground('#8a7a5a')}
    <path d="M190 150 v-62 l26 -30 l26 30 v62z" fill="#d8ccb0" stroke="#8a7a5a"/><path d="M216 50 v-14 M209 43 h14" stroke="#8a7a5a" stroke-width="3"/>
    <circle cx="216" cy="98" r="9" fill="#2e5fa3" stroke="#8a7a5a"/>
    ${person(150, 142, '#e8e0d0', '<path d="M-7 -33 L0 -48 L7 -33z" fill="#e3bb4f" stroke="#a8844f"/>')}${lord(80)}${crate(110, 140)}
    ${bubble(10, 20, line, 140, 100)}`,
};

COMICS[RICHIESTA_EVENT.legato] = {
  sound: ['TA-TAAA!', 'FANFARA!'],
  lines: ["L'imperatore vuole vedere la vostra ricchezza.", 'Che il legato torni a corte ammirato!', 'Vino e doni, signore!'],
  captions: h => [
    `Un legato dell'imperatore visiterà il vostro feudo, ${h}. Accoglietelo con vino e doni dei vostri opifici entro ${RICHIESTA_DURATA} anni: alla corte e fra i mercanti si parlerà di voi.`,
    `Squillano le trombe: arriva un legato imperiale, ${h}. Se lo riceverete con splendore, la vostra fama correrà per tutte le piazze.`,
  ],
  scene: line => `${sky('#9fb8d0', '#f0e4c4', 'skl')}${ground('#8a8a4e')}
    ${castle(240, 150)}
    ${person(170, 142, '#7a1f2b', '<path d="M-7 -34 l3 -8 l4 5 l4 -5 l3 8z" fill="#e3bb4f"/>')}${lord(90)}${barrel(124, 140)}${crate(146, 140)}
    ${bubble(10, 20, line, 160, 100)}`,
};

const REQ_TITLE: Record<RichiestaId, string> = { nozze: 'Nozze in famiglia', cattedrale: 'La cattedrale', legato: "Il legato dell'imperatore" };
const REQ_EMBLEM: Record<RichiestaId, string> = { nozze: '♥', cattedrale: '✝', legato: '♛' };

const needText = (x: { vino: number; manufatti: number }) => [x.vino ? `${n(x.vino)} botti di vino` : '', x.manufatti ? `${n(x.manufatti)} pezzi di manufatti` : ''].filter(Boolean).join(' e ');

// ---------------------------------------------------------------- pannello delle feste

export function festePanel(g: Game, st: ConsumiState): string {
  const me = g.state.current, p = g.player, c = st.cantine[me], q = g.state.q;
  const done = banchettoFatto(g, st, me);
  const banq = BANCHETTI_ID.map(k => {
    const b = BANCHETTI[k];
    return `<button data-act="ext" data-op="banquet" data-kind="${k}" ${!done && c.vino >= b.vino ? '' : 'disabled'}>Banchetto ${k}: ${n(b.vino)} botti, prestigio ${signed(b.vino * PRESTIGIO_BANCHETTO)}${p.umore !== undefined ? `, popolo ${signed(b.umore)}` : ''}</button>`;
  }).join('');
  const f = festaDi(g, st, me);
  const festa = f ? (() => {
    const need = festaOf(f.rango);
    const ok = c.vino >= need.vino && c.manufatti >= need.manufatti;
    return `<h3>Il nuovo titolo</h3><p>Siete ${titleName(p.title)}: celebratelo entro la fine del ${year(q)} con ${needText(need)}. Prestigio ${signed((need.vino + need.manufatti) * PRESTIGIO_FESTA)} e prestigio mercantile ${signed(FESTA_PRESTIGIO_MERCANTILE)}.</p>
      <div class="btns"><button data-act="ext" data-op="feast" ${ok ? 'class="primary"' : 'disabled'}>Celebrate il titolo</button></div>`;
  })() : '';
  const reqs = richiesteOf(st, me).filter(r => q <= scadenzaRichiesta(r)).map(r => {
    const x = RICHIESTE[r.id], ok = c.vino >= x.vino && c.manufatti >= x.manufatti;
    return `<li><b>${REQ_EMBLEM[r.id]} ${REQ_TITLE[r.id]}</b>: ${needText(x)} entro il ${year(scadenzaRichiesta(r))}. Prestigio ${signed(x.prestigio)}${x.umore && p.umore !== undefined ? `, popolo ${signed(x.umore)}` : ''}${x.mercantile ? `, prestigio mercantile ${signed(x.mercantile)}` : ''}.
      <button data-act="ext" data-op="fulfil" data-req="${r.id}" ${ok ? '' : 'disabled'}>Offrite</button></li>`;
  }).join('');
  const next = palaceNeeds(p, c, committed(st as FieraState, me, 'manufatti'));
  return `<p>In magazzino: ${n(c.vino)} botti di vino e ${n(c.manufatti)} pezzi di manufatti. Ciò che consumate non si vende più, ma il prestigio conta nella ricchezza, come la visita del re.</p>
    <h3>Banchetto</h3>${done ? "<p class=\"hint\">Quest'anno avete già dato un banchetto.</p>" : ''}<div class="btns">${banq}</div>
    ${festa}
    ${reqs ? `<h3>Richieste</h3><ul class="ext-ledger">${reqs}</ul>` : ''}
    <h3>Il palazzo</h3><p>${p.palazzo >= 11 ? 'Il palazzo è completo.' : `Il piano ${p.palazzo + 1} chiede ${n(next.manufatti)} manufatti per arredi e decori${next.comprati ? `: ne mancano ${n(next.comprati)}, che gli artigiani vendono a ${PREZZO_ARTIGIANI} scudi l'uno (${n(next.scudi)} scudi oltre al prezzo del piano)` : ', e li avete'}. Quelli promessi od offerti ai mercanti forestieri non si toccano.`}</p>
    <p class="hint">Un banchetto l'anno. Chi sale di rango può celebrare il titolo nell'anno seguente. Le richieste arrivano fra gli imprevisti e attendono ${RICHIESTA_DURATA} anni. Ogni piano di palazzo chiede ${manufattiPiano(1)} manufatti in più del precedente.</p>`;
}

/** Riga del palazzo nella colonna, nei dispendimenti. */
export function palaceLine(g: Game, st: ConsumiState): string {
  const p = g.player;
  if (g.state.phase.kind !== 'investimenti' || p.palazzo >= 11) return '';
  const me = g.state.current;
  const need = palaceNeeds(p, st.cantine[me], committed(st as FieraState, me, 'manufatti'));
  return `<br>Prossimo piano di palazzo: ${n(need.manufatti)} manufatti${need.comprati ? ` (+${n(need.scudi)} scudi agli artigiani)` : ''}.`;
}

export function festeCardSub(g: Game, st: ConsumiState): string {
  const me = g.state.current;
  const k = richiesteOf(st, me).length + (festaDi(g, st, me) ? 1 : 0);
  if (k) return `${k} ${k === 1 ? 'richiesta' : 'richieste'} in attesa`;
  return banchettoFatto(g, st, me) ? 'banchetto già dato' : 'banchetti e doni';
}

// ---------------------------------------------------------------- cronaca e dispacci

export function consumiChronicle(kind: string, d: Record<string, number>): string | null {
  const req = RICHIESTE_ID[d.req];
  switch (kind) {
    case 'banquet': return `Diede un banchetto ${BANCHETTI_ID[d.kind]}: ${n(d.vino)} botti di vino, e la sua fama crebbe.`;
    case 'feast': return `Celebrò il titolo con una festa: ${needText({ vino: d.vino, manufatti: d.manufatti })}.`;
    case 'palaceGoods': return `Arredò il piano ${d.piano} del palazzo con ${n(d.manufatti)} manufatti${d.comprati ? `, ${n(d.comprati)} dei quali comprati dagli artigiani per ${n(d.scudi)} scudi` : ''}.`;
    case 'requestDrawn': return req === 'nozze' ? 'Un suo congiunto annunciò le nozze.' : req === 'cattedrale' ? 'Il vescovo gli chiese arredi per la nuova cattedrale.' : "Un legato dell'imperatore annunciò la sua visita.";
    case 'request': return req === 'nozze' ? 'Offrì il vino per il banchetto nuziale.' : req === 'cattedrale' ? 'Donò gli arredi della nuova cattedrale.' : "Ricevette il legato dell'imperatore con vino e doni.";
    case 'requestLost': return req === 'nozze' ? 'Le nozze si fecero senza il suo vino.' : req === 'cattedrale' ? 'La cattedrale fu arredata da altri.' : 'Il legato ripartì senza i suoi doni.';
  }
  return null;
}

export const festaTitoloText = (rango: number) =>
  `Il vostro rango è salito! Quest'anno potete celebrare il nuovo titolo con una festa: servono ${needText(festaOf(rango))}. La trovate nel pannello Feste.`;

export const requestNote = (id: number) => {
  const r = RICHIESTE_ID.find(x => RICHIESTA_EVENT[x] === id);
  if (!r) return undefined;
  return `Non dovete decidere ora: la richiesta resta nel pannello <b>Feste</b> per ${RICHIESTA_DURATA} anni. Servono ${needText(RICHIESTE[r])}.`;
};
