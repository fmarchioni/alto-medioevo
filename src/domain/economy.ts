/**
 * Economia: trascrizione letterale delle righe 120-690 e 860-1180 del listato.
 * Ogni funzione indica le righe BASIC di riferimento.
 */
import type { ActionResult, AnnataKind, Options, Player, RenditePreview, Scalars } from './types';
import type { Rng } from './rng';
import { PRICE_BAND } from './annate';
import { MARKET_MULT } from './gabelle';
import { tradeFactors } from './fazioni';
import { fattiIncomeFactor, fattiMacinaFactor } from './fatti';
import { bottegheAttive } from './citta';
import { fattoreMacinaOpere } from './ere';

/** INT() del BASIC: arrotonda verso -infinito anche per i negativi. */
export const INT = Math.floor;

/**
 * Righe 120 e 180: raccolto, prezzo, domanda e usura di inizio turno. Consuma 2 RND.
 * Con un'annata il primo RND sceglie il raccolto dentro la fascia di prezzo
 * dell'annata: più grano nasce, meno costa.
 */
export function startOfTurn(p: Player, sc: Scalars, rng: Rng, annata?: AnnataKind): void {
  let r: number;
  if (annata) {
    const { min, max } = PRICE_BAND[annata];
    // prezzo = INT(scarsità * 60) + 1: la fascia [min, max] corrisponde a scarsità in [(min-1)/60, max/60)
    const scarcity = (min - 1) / 60 + rng.next() * ((max - min + 1) / 60);
    r = INT((1 - scarcity) * p.acri * 75);
  } else {
    r = INT(rng.next() * p.acri * 75);
  }
  const ratio = 1 - r / p.acri / 75;
  sc.raccolto = r;
  sc.prezzo = INT(ratio * 60) + 1;
  if (annata) sc.prezzo = Math.min(PRICE_BAND[annata].max, Math.max(PRICE_BAND[annata].min, sc.prezzo));
  if (annata) sc.annata = annata;
  else delete sc.annata;
  sc.domanda = INT((rng.next() * 2 + 1) * p.servi);
  sc.usura = INT(ratio * 40);
}

/** Usura minima (con l'opzione `usuraMinima`): nessuno presta denaro gratis. */
export const USURA_MIN = 3;

/** Righe 475-500: acquisto di grano dal raccolto. */
export function buyGrain(p: Player, sc: Scalars, qty: number): ActionResult {
  if (p.scudi < -p.credito) return { ok: false, reason: 'debito oltre il credito concesso' };
  if (qty > sc.raccolto) return { ok: false, reason: 'non si può comprare più del raccolto' };
  const s = INT(p.scudi - (qty * sc.prezzo) / 1000);
  sc.s = s;
  if (s < -p.credito) return { ok: false, reason: 'spesa oltre il credito concesso' };
  p.grano += qty;
  p.scudi = s;
  sc.raccolto -= qty;
  return { ok: true };
}

/**
 * Soglia fissa della riga 580: la vendita è rifiutata se il tesoro *prima*
 * della vendita è sotto -2500 (ambiguità A3).
 */
export const SELL_DEBT_LIMIT = -2500;

/** Righe 560-600: vendita di grano. Il tesoro non viene troncato (può restare frazionario). */
export function sellGrain(p: Player, sc: Scalars, qty: number): ActionResult {
  if (p.grano - qty < 0) return { ok: false, reason: 'non possedete tanto grano' };
  const g = p.grano - qty;
  const s = p.scudi + (qty * (sc.prezzoVendita ?? sc.prezzo)) / 1000;
  sc.s = s;
  if (p.scudi < SELL_DEBT_LIMIT) return { ok: false, reason: 'tesoro troppo indebitato per vendere' };
  p.grano = g;
  p.scudi = s;
  return { ok: true };
}

/** Crescita certa (opzione `crescitaCerta`): quota del massimo sempre garantita; il resto è a sorte. */
export const CRESCITA_CERTA = 0.8;

/**
 * Crescita certa: il massimo dei nati del listato (riga 670) si riduce a questa quota, così in media nasce
 * quanto nel listato (fra CRESCITA_CERTA e 1 del massimo ridotto: 0,9 × 0,55 ≈ 0,5, la media del listato).
 * Il grano distribuito pesa meno, e la crescita dipende di più dal saldo dei cittadini di fine anno.
 */
export const NATI_MAX = 0.55;

/** Servi che nascono al più per ogni misura data oltre la domanda (riga 670); con la crescita certa, ridotti a NATI_MAX. */
export const natiPerMisura = (servi: number, certa = false) => ((servi / 90) * 29 / 10000) * (certa ? NATI_MAX : 1);

/**
 * Servi che nascono in media per misura con la crescita certa: il metro comune del grano distribuito e del
 * grano venduto in carestia (i coloni, src/domain/gabelle.ts), perché le due vie diano la stessa gente.
 */
export const natiMediPerMisura = (servi: number) => natiPerMisura(servi, true) * (1 + CRESCITA_CERTA) / 2;

/** Da 0 a `max` a sorte (come nel listato), o con la crescita certa da CRESCITA_CERTA × max a max. */
export const conSorte = (max: number, r: number, certa = false) => INT(max * (certa ? CRESCITA_CERTA + (1 - CRESCITA_CERTA) * r : r));

/**
 * Righe 660-680: grano distribuito ai servi. Consuma 1 RND.
 * Ritorna nati (+) o morti (-). Chiude la fase di commercio.
 * `certa` (opzione `crescitaCerta`): il massimo dei nati si riduce a NATI_MAX, e i nati ne sono almeno
 * CRESCITA_CERTA; i morti restano quelli del listato, a sorte.
 */
export function feedServants(p: Player, sc: Scalars, qty: number, rng: Rng, certa = false): ActionResult & { natiMorti?: number } {
  sc.s = qty;
  if (qty > p.grano) return { ok: false, reason: 'non possedete tanto grano' };
  // l'espressione del listato, invariata (la fedeltà conta l'ordine delle operazioni)
  let max = ((p.servi / 90) * 29 * (qty - sc.domanda)) / 10000;
  if (certa && max > 0) max *= NATI_MAX;
  let f = conSorte(max, rng.next(), certa && max > 0);
  p.grano -= qty;
  sc.s1 = p.servi;
  p.servi += f;
  if (p.servi < 0) {
    f = -sc.s1;
    p.servi = 0;
  }
  sc.natiMorti = f;
  return { ok: true, natiMorti: f };
}

/** Riga 865: deperimento del grano (fra 1/10 e 1/2). Consuma 1 RND. */
export function spoilGrain(p: Player, rng: Rng): void {
  p.grano = INT(p.grano - p.grano / (rng.next() * 8 + 2));
}

/** Con la riforma delle gabelle i mercati rendono secondo la fiducia dei mercanti (assente: come nel listato). */
export const trustFactor = (p: Player) => (p.fiducia === undefined ? 1 : (MARKET_MULT * p.fiducia) / 100);

/** Righe 880-1120: calcolo delle rendite con le percentuali correnti. Aggiorna `credito` [tt]. */
export function computeRendite(p: Player, sc: Scalars): RenditePreview {
  // i patti con le fazioni (protettorato bizantino, accordi saraceni) arricchiscono il commercio
  const tf = p.patti ? tradeFactors(p) : { mercati: 1, opifici: 1 };
  let l1 = INT(((p.baseMercati * p.rateCommerzio) / 500) * trustFactor(p) * tf.mercati);
  if (l1 < 0) l1 = 0;
  let l2 = INT(((p.baseOpifici * p.rateCommerzio) / 500) * tf.opifici);
  if (l2 < 0) l2 = 0;
  // la città: le botteghe senza addetti sono chiuse e non rendono
  if (p.citta) {
    const a = bottegheAttive(p);
    if (p.mercato > 1) l1 = INT((l1 * a.mercati) / (p.mercato - 1));
    if (p.opificio > 1) l2 = INT((l2 * a.opifici) / (p.opificio - 1));
  }
  let c = p.rateBevere + p.rateMacina + p.rateCommerzio;
  c = 180 - c < 0 ? 180 / c : 1;
  const ac = INT((p.servi * p.rateBevere) / 100 / 5);
  const da = l1 + l2;
  // righe 990-991: se servi < 0 nessuna delle due righe scatta e resta il valore precedente
  if (p.servi > 0) sc.macina = INT((sc.s * 2 * p.rateMacina) / p.servi);
  if (p.servi === 0) sc.macina = 0;
  // fatti del reame: mulino guasto, ciambellano abile, sdegno del re
  let pa = p.effetti ? INT(sc.macina * fattiMacinaFactor(p)) : sc.macina;
  // le ere: il mulino ad acqua fa rendere di più la macina
  if (p.era) pa = INT(pa * fattoreMacinaOpere(p));
  const l = p.effetti ? INT((ac + da + pa) * c * fattiIncomeFactor(p)) : INT((ac + da + pa) * c);
  p.credito = l + p.vassalli;
  return { mercati: l1, opifici: l2, bevere: ac, macina: pa, commerzio: da, correttivo: c, totale: l, conVassalli: p.credito };
}

export type RateKind = 'bevere' | 'macina' | 'commerzio';

/** Righe 1220-1320: le percentuali accettano 0..99. */
export function setRate(p: Player, kind: RateKind, value: number): ActionResult {
  if (!Number.isFinite(value) || value < 0) return { ok: false, reason: 'valore non valido' };
  if (value > 99) return { ok: false, reason: 'massimo 99%' };
  const v = INT(value);
  if (kind === 'bevere') p.rateBevere = v;
  else if (kind === 'macina') p.rateMacina = v;
  else p.rateCommerzio = v;
  return { ok: true };
}

/**
 * Riga 1180 ("bastante"): incassa la rendita. Nel listato originale si somma
 * solo `l`; la riga 1335 che sommerebbe anche i vassalli non è raggiungibile.
 */
export function collectRendite(p: Player, preview: RenditePreview, options: Options): void {
  if (options.vassalTributeCredited) {
    p.scudi += p.credito;
    p.vassalli = 0;
  } else {
    p.scudi += preview.totale;
  }
}
