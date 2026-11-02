/**
 * Fase "Delibera": il consigliere propone e il signore decide.
 * Solo presentazione: le regole restano in src/domain/economy.ts.
 */
import { INT, SELL_DEBT_LIMIT } from '../domain/economy';
import { FAMINE_MAX_DEATHS, HABIT_GAIN, HABIT_KEEP, HABIT_MAX, SETTLER_MEDIA_PRICE, settlersFor } from '../domain/gabelle';
import { maxBuyable } from '../domain/strategy';
import type { Game } from '../domain/turn';
import type { Player, Scalars } from '../domain/types';
import type { ExtCard } from '../expansions/types';
import { ANSELMO, question, ruleNote, type TradeMode } from './advisor';
import { cardArt } from './art';
import { renderSensale, sensaleCard } from './sensale';
import { speechBox } from './speaker';

export interface TradeUi {
  /** giocatore+anno a cui si riferisce lo stato, per azzerarlo al cambio turno */
  key: string;
  /** sensale: pannello del sensale di piazza (src/ui/sensale.ts) */
  mode: 'menu' | 'sensale' | TradeMode;
  advisor: string;
  qty: number;
}

const n = (v: number) => Math.floor(v).toLocaleString('it-IT');

/** Quantità massima ammessa dalle regole originali per ciascuna azione. */
export function maxQty(mode: TradeMode, p: Player, sc: Scalars): number {
  if (mode === 'sell') return p.scudi < SELL_DEBT_LIMIT ? 0 : p.grano;
  if (mode === 'feed') return p.grano;
  return maxBuyable(p, sc);
}

export interface Suggestion {
  label: string;
  qty: number;
}

export function suggestions(mode: TradeMode, p: Player, sc: Scalars): Suggestion[] {
  const max = maxQty(mode, p, sc);
  const clamp = (q: number) => Math.max(0, Math.min(max, Math.round(q)));
  const list: Suggestion[] =
    mode === 'buy'
      ? [
          { label: 'Quanto basta per la domanda', qty: clamp(sc.domanda - p.grano) },
          { label: 'Metà del raccolto', qty: clamp(sc.raccolto / 2) },
          { label: 'Tutto ciò che possiamo pagare', qty: max },
        ]
      : mode === 'sell'
        ? [
            { label: 'Un quarto del granaio', qty: clamp(p.grano / 4) },
            { label: 'Tutto tranne la domanda', qty: clamp(p.grano - sc.domanda) },
            { label: 'Svuotate i granai', qty: max },
          ]
        : [
            { label: 'Metà della domanda (crudele)', qty: clamp(sc.domanda / 2) },
            { label: 'Esattamente la domanda', qty: clamp(sc.domanda) },
            { label: 'Domanda e un decimo in più', qty: clamp(sc.domanda * 1.1) },
            { label: 'Tutto il granaio', qty: max },
          ];
  return list.filter((s, i, arr) => s.qty > 0 && arr.findIndex(o => o.qty === s.qty) === i);
}

/** Anteprima delle conseguenze, aggiornata mentre si sposta il cursore. */
export function preview(mode: TradeMode, qty: number, p: Player, sc: Scalars): string {
  if (mode === 'buy') {
    const cost = (qty * sc.prezzo) / 1000;
    return `Costo <b>${n(Math.ceil(cost))}</b> scudi · tesoro dopo l'acquisto <b>${n(Math.floor(p.scudi - cost))}</b> · granaio <b>${n(p.grano + qty)}</b>${granaryNote(sc, p.grano + qty - sc.domanda, 'se distribuite la sola domanda, ')}`;
  }
  if (mode === 'sell') {
    const gain = (qty * (sc.prezzoVendita ?? sc.prezzo)) / 1000;
    const left = p.grano - qty;
    const warn = left < sc.domanda ? ` · <span class="warn">resteranno meno misure della domanda (${n(sc.domanda)})</span>` : '';
    // commercio del grano: in carestia le scorte vendute attirano coloni
    const media = sc.annata === 'media' && (sc.prezzoBase ?? sc.prezzo) >= SETTLER_MEDIA_PRICE;
    const stock = sc.scorta === undefined ? 0 : Math.min(qty, sc.scorta);
    const coloni = sc.annata === 'carestia' || media ? settlersFor(p, media ? Math.floor(stock / 2) : stock, sc.coloni ?? 0) : 0;
    const settlers = coloni ? ` · arriveranno <b>${n(coloni)}</b> famiglie dai feudi affamati` : '';
    return `Ricavo <b>${n(gain)}</b> scudi · tesoro <b>${n(p.scudi + gain)}</b> · granaio <b>${n(left)}</b>${settlers}${warn}`;
  }
  // feed: f = INT(RND * servi/90*29*(qty-domanda)/10000), riga 670
  let x = ((p.servi / 90) * 29 * (qty - sc.domanda)) / 10000;
  if (p.abitudine !== undefined) x = Math.max(x, -p.servi * FAMINE_MAX_DEATHS);
  let effect: string;
  if (qty === sc.domanda) effect = 'il popolo resterà com\'è';
  else if (x > 0) effect = `nasceranno fino a <b>${n(x)}</b> servi`;
  else effect = `<span class="warn">potrebbero morire fino a <b>${n(-Math.floor(x))}</b> servi</span>`;
  const habit = p.abitudine !== undefined && qty > sc.domanda && p.servi > 0
    ? ` · <span class="warn">l'anno prossimo il popolo chiederà circa <b>${n(INT(Math.min(HABIT_MAX, p.abitudine * HABIT_KEEP + ((qty - sc.domanda) / p.servi) * HABIT_GAIN) * p.servi))}</b> misure in più</span>`
    : '';
  return `Domanda ${n(sc.domanda)} · ${effect} · nel granaio resteranno <b>${n(p.grano - qty)}</b> misure${habit}${granaryNote(sc, p.grano - qty)}`;
}

/** Avviso quando il grano che resterà supera la capienza dei granai (marcirà a fine anno). */
function granaryNote(sc: Scalars, left: number, prefix = ''): string {
  const cap = sc.capienza;
  if (cap === undefined || left <= cap) return '';
  return ` · <span class="warn">${prefix}a fine anno marciranno <b>${n(left - cap)}</b> misure oltre la capienza dei granai (${n(cap)})</span>`;
}

const advisorBox = (text: string) => speechBox(ANSELMO, text);

/** Aggiunte di un'espansione alla Delibera. */
export interface TradeExtras {
  cards: ExtCard[];
  /** notizie per il signore di turno (HTML) */
  dispatches: string;
  hint: (mode: TradeMode) => string;
}

/** Carte di un'espansione ("Fra signori"), in Delibera e nei dispendimenti. */
export function renderExtCards(cards: ExtCard[], title = 'Fra signori'): string {
  if (!cards.length) return '';
  return `${title ? `<h3 class="ext-cards-title">${title}</h3>` : ''}<div class="action-cards ext-cards">${cards.map(c => `<button class="action-card" data-act="extOpen" data-panel="${c.panel}" ${c.disabled ? 'disabled' : ''}>
    ${c.art}<span class="card-title">${c.title}</span><span class="card-sub">${c.sub}</span></button>`).join('')}</div>`;
}

export function renderTrade(g: Game, t: TradeUi, extras?: TradeExtras): string {
  const p = g.player, sc = g.state.scalars;
  if (t.mode === 'sensale') return renderSensale(g, t.advisor);
  if (t.mode === 'menu') {
    const card = (mode: TradeMode, title: string, sub: string) => {
      const disabled = mode === 'buy' && maxQty('buy', p, sc) === 0 ? 'disabled' : '';
      return `<button class="action-card ${mode === 'feed' ? 'decisive' : ''}" data-act="tradeMode" data-mode="${mode}" ${disabled}>
        ${cardArt[mode]}<span class="card-title">${title}</span><span class="card-sub">${sub}</span></button>`;
    };
    const ext = renderExtCards(extras?.cards ?? []);
    return `${extras?.dispatches ?? ''}${advisorBox(t.advisor)}
      <div class="action-cards">
        ${card('buy', 'Comprare grano', `${sc.prezzo} scudi ogni mille`)}
        ${card('sell', 'Vendere grano', sc.prezzoVendita !== undefined ? `a ${sc.prezzoVendita} scudi · granaio ${n(p.grano)}` : `granaio: ${n(p.grano)}`)}
        ${card('feed', 'Nutrire il popolo', 'chiude il mercato')}
      </div>${sensaleCard(g)}${ext}`;
  }
  const mode = t.mode;
  const max = maxQty(mode, p, sc);
  const qty = Math.min(t.qty, max);
  const verb = { buy: 'Compra', sell: 'Vendi', feed: 'Distribuisci' }[mode];
  return `${advisorBox(t.advisor || question(mode, p, sc))}
    <div class="decide" data-mode="${mode}">
      <div class="qty-row">
        <input type="range" name="qty-range" min="0" max="${max}" step="1" value="${qty}" aria-label="quantità" ${max === 0 ? 'disabled' : ''}>
        <input type="number" name="qty" min="0" max="${max}" step="1" value="${qty}" inputmode="numeric" aria-label="quantità esatta">
      </div>
      <div class="chips">${suggestions(mode, p, sc).map(s => `<button class="chip" data-act="chip" data-qty="${s.qty}">${s.label} <small>${n(s.qty)}</small></button>`).join('')}</div>
      <p class="preview" id="trade-preview">${preview(mode, qty, p, sc)}</p>
      <p class="hint">${ruleNote(mode)}</p>${extras?.hint(mode) ? `<p class="hint ext-hint">${extras.hint(mode)}</p>` : ''}
      <div class="btns">
        <button data-act="tradeBack" class="ghost">Torna indietro</button>
        <button data-act="confirmTrade" class="primary">${verb}</button>
      </div>
    </div>`;
}

export function renderFeedingOutcome(text: string): string {
  return `${advisorBox(text)}<div class="btns"><button data-act="afterFeed" class="primary">Prosegui</button></div>`;
}
