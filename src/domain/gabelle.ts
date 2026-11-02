/**
 * Riforma delle gabelle: ogni tassa ha un guadagno immediato e un costo che
 * arriva negli anni seguenti.
 *
 * - Bevere: alza la rendita ma abbassa l'umore del popolo; con l'umore basso
 *   fra gli imprevisti compaiono le rivolte, e gli opifici rendono meno.
 * - Macina: resta legata al grano distribuito, ma il popolo si abitua: il
 *   grano dato oltre la domanda alza la domanda dell'anno seguente.
 * - Commerzio: i mercati rendono in proporzione alla fiducia dei mercanti,
 *   che cala con la gabella. Con poca fiducia il grano si compra più caro e
 *   si vende a meno; i mercanti scontenti chiudono bottega, quelli contenti
 *   ne aprono una nuova.
 *
 * Umore e fiducia restano nascosti: il signore ne vede solo il livello
 * (ottimo, buono, normale, infelice, rabbia). Ogni anno variano anche un poco
 * a caso, e il grano dato o venduto oltre il bisogno rende popolo e mercanti
 * più tolleranti verso le gabelle.
 *
 * Il grano non deperisce più a ogni ritocco delle gabelle: perde fino al 10%
 * l'anno solo se il tesoro è in debito (i granai non si riparano).
 */
import { INT } from './economy';
import type { EventOutcome, Player } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------- umore (bevere)

export const UMORE_START = 60;
/** frazione della distanza dall'obiettivo recuperata ogni anno */
export const UMORE_SPEED = 0.4;
/** sotto questa soglia fra gli imprevisti compaiono le rivolte */
export const RIOT_MOOD = 60;
/** caselle dell'estrazione (su 32) occupate dalla rivolta con l'umore a zero */
export const RIOT_MAX_SLOTS = 12;
export const RIOT_EVENT = 9;

export const umoreOf = (p: Player) => p.umore ?? UMORE_START;

// ---------------------------------------------------------------- livelli (umore e fiducia restano nascosti)

/**
 * Il signore non conosce i numeri di umore e fiducia: ne vede solo il livello.
 * Con "ottimo" e "buono" nessuno si ribella; dagli altri livelli in giù
 * rivolte e mercanti in fuga diventano via via più probabili.
 */
export type Livello = 'ottimo' | 'buono' | 'normale' | 'infelice' | 'rabbia';
export const LIVELLI: Livello[] = ['ottimo', 'buono', 'normale', 'infelice', 'rabbia'];
/** soglia minima di ciascun livello */
export const LIVELLO_MIN: Record<Livello, number> = { ottimo: 80, buono: 60, normale: 40, infelice: 20, rabbia: 0 };

export const livelloOf = (v: number): Livello => LIVELLI.find(l => v >= LIVELLO_MIN[l]) ?? 'rabbia';
/** il livello è tranquillo: nessuna rivolta, nessun mercante in fuga */
export const sereno = (l: Livello) => l === 'ottimo' || l === 'buono';
/** valore centrale del livello, per le stime di chi vede solo il livello */
export const livelloMid = (l: Livello) => (l === 'ottimo' ? 90 : LIVELLO_MIN[l] + 10);

/** deriva casuale annua di umore e fiducia: le gabelle non bastano a prevederli */
export const MOOD_DRIFT = 4;

/**
 * Capriccio: un umore di fondo di popolo e mercanti che nessuno vede e che
 * sposta l'obiettivo verso cui tendono umore e fiducia. All'inizio di ogni
 * anno cambia un poco a caso (passeggiata entro ±CAPRICCIO_MAX): chi conosce
 * le formule non può seguire umore e fiducia a tavolino per tutta la partita.
 * Il sensale di piazza lo sente; il signore no.
 */
export const CAPRICCIO_STEP = 5;
export const CAPRICCIO_MAX = 15;
export const stepCapriccio = (c: number | undefined, r: number) => clamp(Math.round((c ?? 0) + (r * 2 - 1) * CAPRICCIO_STEP), -CAPRICCIO_MAX, CAPRICCIO_MAX);

// ---------------------------------------------------------------- tolleranza

/**
 * Tolleranza alle gabelle, in percentuale: riduce il peso delle tasse su umore
 * e fiducia dell'anno. I servi tollerano di più se quest'anno avete dato grano
 * oltre la domanda (metà del surplus percentuale); i mercanti se gli avete
 * venduto grano (un terzo del venduto in percentuale della domanda).
 */
export const TOLLERANZA_MAX = 30;
export function tolleranzaServi(fed: number, domanda: number): number {
  if (domanda <= 0) return 0;
  return Math.min(TOLLERANZA_MAX, Math.max(0, Math.round(((fed - domanda) / domanda) * 50)));
}
export function tolleranzaMercanti(sold: number, domanda: number): number {
  if (domanda <= 0) return 0;
  return Math.min(TOLLERANZA_MAX, Math.max(0, Math.round((sold / domanda) * 100 / 3)));
}

/** peso della macina nell'umore del popolo: metà del bevere */
export const MACINA_MOOD_WEIGHT = 0.5;

/**
 * L'umore tende a 100 − bevere − metà della macina: le due gabelle che il
 * popolo paga di tasca sua si sommano. Il bevere al 99% da solo lo porta a
 * terra; la macina al 99% da sola lo lascia a metà, ma insieme a un po' di
 * bevere lo spinge verso le rivolte.
 */
export const umoreTarget = (bevere: number, macina = 0, tolleranza = 0) => 100 - (bevere + MACINA_MOOD_WEIGHT * macina) * (1 - tolleranza / 100);

/** Umore dell'anno seguente: tolleranza in %, deriva casuale in punti. */
export function nextUmore(p: Player, tolleranza = 0, drift = 0): number {
  const u = umoreOf(p);
  return clamp(Math.round(u + (umoreTarget(p.rateBevere, p.rateMacina, tolleranza) + (p.capriccioU ?? 0) - u) * UMORE_SPEED + drift), 0, 100);
}

/** Caselle (su 32) dell'estrazione degli imprevisti che diventano rivolta, per livello dell'umore. */
export const RIOT_SLOTS: Record<Livello, number> = { ottimo: 0, buono: 0, normale: 2, infelice: 6, rabbia: RIOT_MAX_SLOTS };
export const riotSlots = (umore: number) => RIOT_SLOTS[livelloOf(umore)];

/** Gravità della rivolta, da 0 (umore appena sotto soglia) a 1 (umore a zero). */
export const riotSeverity = (umore: number) => clamp((RIOT_MOOD - umore) / RIOT_MOOD, 0, 1);

/** Quote perse in una rivolta: grano molto, servi abbastanza, scudi poco. */
export function riotLosses(umore: number): { grano: number; servi: number; scudi: number } {
  const s = riotSeverity(umore);
  return { grano: 0.25 + 0.25 * s, servi: 0.05 + 0.07 * s, scudi: 0.03 + 0.05 * s };
}

/** La rivolta: il popolo saccheggia i granai, alcuni muoiono negli scontri, una parte del tesoro sparisce. */
export function applyRiot(p: Player): EventOutcome {
  const q = riotLosses(umoreOf(p));
  const grano = INT(p.grano * q.grano);
  const servi = INT(p.servi * q.servi);
  const scudi = p.scudi > 0 ? INT(p.scudi * q.scudi) : 0;
  p.grano -= grano;
  p.servi -= servi;
  p.scudi -= scudi;
  return { scudi: -scudi, servi: -servi, grano: -grano };
}

/** Artigiani contenti lavorano meglio: resa degli opifici da 0,5 (umore 0) a 1,2 (umore 100). */
export const workFactor = (umore: number) => 0.5 + (0.7 * umore) / 100;
/**
 * Gli opifici rendono più che nell'originale (3), ma solo con gli artigiani contenti.
 * In condizioni ideali (popolo a 100, workFactor 1,2; mercanti a 100, MARKET_MULT 3)
 * un opificio rende 2,8 volte un mercato: costa 2,5 volte tanto, e il 12% in più per
 * scudo ripaga gli anni di attesa per mettere insieme 5000 scudi (7 × 1,2 = 2,8 × 3).
 */
export const OPIFICIO_MULT = 7;

// ---------------------------------------------------------------- fiducia dei mercanti (commerzio)

export const FIDUCIA_START = 60;
export const FIDUCIA_SPEED = 1 / 3;
/** i mercati rendono di più che nell'originale, ma solo con la fiducia dei mercanti */
export const MARKET_MULT = 3;
/** ricarico massimo sul grano con la fiducia a zero */
export const MAX_RICARICO = 0.25;
/** probabilità annua che un mercato chiuda, per livello della fiducia */
export const LEAVE_CHANCE: Record<Livello, number> = { ottimo: 0, buono: 0, normale: 0.08, infelice: 0.2, rabbia: 0.35 };
/** probabilità annua che un mercante forestiero apra un mercato, con la fiducia ottima */
export const MERCHANT_CHANCE = 0.2;

export const fiduciaOf = (p: Player) => p.fiducia ?? FIDUCIA_START;

/** La fiducia tende a 100 − commerzio, alleggerito dalla tolleranza. */
export const fiduciaTarget = (commerzio: number, tolleranza = 0) => 100 - commerzio * (1 - tolleranza / 100);

export function nextFiducia(p: Player, tolleranza = 0, drift = 0): number {
  const f = fiduciaOf(p);
  return clamp(Math.round(f + (fiduciaTarget(p.rateCommerzio, tolleranza) + (p.capriccioF ?? 0) - f) * FIDUCIA_SPEED + drift), 0, 100);
}

/** Ricarico dei mercanti sul grano: nullo da fiducia 50 in su, fino al 25% a fiducia 0. */
export const ricarico = (fiducia: number) => (Math.max(0, 50 - fiducia) / 50) * MAX_RICARICO;

/** Prezzo d'acquisto e di vendita del grano con il ricarico dei mercanti. */
export function grainPrices(prezzo: number, fiducia: number): { compra: number; vendi: number } {
  const r = ricarico(fiducia);
  return { compra: Math.max(1, Math.round(prezzo * (1 + r))), vendi: Math.max(1, Math.round(prezzo * (1 - r))) };
}

// ---------------------------------------------------------------- abitudine (macina)

/** misure di domanda in più, per servo, per ogni misura per servo data oltre la domanda */
export const HABIT_GAIN = 0.6;
/** quota dell'abitudine che resta l'anno seguente */
export const HABIT_KEEP = 0.5;
/** tetto dell'abitudine: misure in più per servo */
export const HABIT_MAX = 6;

export const abitudineOf = (p: Player) => p.abitudine ?? 0;

/** Dopo il nutrimento: l'abitudine cala della metà e cresce con il grano dato oltre la domanda. */
export function nextAbitudine(p: Player, fed: number, domanda: number, serviBefore: number): number {
  const excess = serviBefore > 0 ? Math.max(0, fed - domanda) / serviBefore : 0;
  return Math.round(Math.min(HABIT_MAX, abitudineOf(p) * HABIT_KEEP + excess * HABIT_GAIN) * 100) / 100;
}

/**
 * Quota massima di servi che la fame uccide in un anno. La formula del listato
 * cresce con il quadrato dei servi: con la domanda gonfiata dall'abitudine una
 * sola carestia sterminerebbe un feudo popoloso.
 */
export const FAMINE_MAX_DEATHS = 0.2;

// ---------------------------------------------------------------- deperimento

/** quota massima del grano che marcisce in un anno di debito */
export const DEBT_SPOIL_MAX = 0.1;

// ---------------------------------------------------------------- granai

/** Capienza dei granai: misure per acro. A fine anno il grano oltre la capienza marcisce. */
export const GRANARY_PER_ACRE = 50;
/** Quota del grano conservato che ogni anno va comunque perduta (ratti e muffa). */
export const STORAGE_ROT = 0.02;

/** Misure in più per ogni granaio costruito. */
export const GRANAIO_CAPACITY = 20000;

export const granaryCapacity = (p: Player) => p.acri * GRANARY_PER_ACRE + (p.granai ?? 0) * GRANAIO_CAPACITY;

// ---------------------------------------------------------------- commercio del grano

/**
 * Chi vende grano dalle sue scorte negli anni di carestia sfama i feudi
 * vicini, e le famiglie affamate vengono a stabilirsi nelle sue terre:
 * un servo ogni SETTLER_GRAIN misure vendute (a metà ritmo nelle annate medie
 * con il grano caro). Contano solo le scorte, non il grano comprato nello
 * stesso anno; in un anno arrivano al più una volta e mezza i servi che già ci
 * sono (almeno SETTLER_FLOOR). Tarato perché la via del mercante porti al
 * trono in tempi simili a quella della macina.
 */
export const SETTLER_GRAIN = 3;
export const SETTLER_MAX = 1.5;
/** coloni che possono arrivare comunque in un anno, anche in un feudo piccolo */
export const SETTLER_FLOOR = 2000;
/** nelle annate medie con il grano almeno a questo prezzo arrivano coloni, a metà ritmo */
export const SETTLER_MEDIA_PRICE = 30;

/** Coloni attirati vendendo `qty` misure di scorta in carestia. */
export const settlersFor = (p: Player, qty: number, already: number) =>
  Math.max(0, Math.min(INT(qty / SETTLER_GRAIN), Math.max(INT(p.servi * SETTLER_MAX), SETTLER_FLOOR) - already));

/**
 * Fine anno: marcisce il grano oltre la capienza, poi il 2% di quello che resta.
 * Ritorna le misure perdute nei due modi.
 */
export function storeGrain(p: Player): { over: number; rot: number } {
  const over = Math.max(0, p.grano - granaryCapacity(p));
  p.grano -= over;
  const rot = INT(p.grano * STORAGE_ROT);
  p.grano -= rot;
  return { over, rot };
}
