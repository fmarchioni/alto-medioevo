/**
 * La città (opzione `citta`, docs/vocazioni.md): la rendita non cresce più senza freni.
 *
 * - Addetti: ogni mercato impiega CITTA.addettiMercato servi, ogni opificio CITTA.addettiOpificio.
 *   Senza abbastanza servi liberi non si costruisce; se i servi calano, le botteghe senza
 *   addetti si fermano (prima gli opifici, poi i mercati) e non rendono.
 * - Contadini: i servi non addetti alle botteghe lavorano i campi. Il raccolto pieno ne vuole
 *   CITTA.contadiniPerAcro per acro; con meno braccia il raccolto cala in proporzione.
 * - Spesa annua della città, pagata a fine anno:
 *   - manutenzione degli edifici, fissa per edificio;
 *   - servizi cittadini (guardie, acquedotti, fogne): una quota della rendita dell'anno che si
 *     paga fin dal villaggio (CITTA.serviziQuota con CITTA.abitantiRiferimento abitanti) e cresce
 *     con la grandezza della città, ma meno che in proporzione (abitanti alla CITTA.grandezza),
 *     fino a CITTA.quotaMassima. Le città grandi rendono un po' meno per abitante, ma la spesa non
 *     esplode: i servizi restano una piccola parte della rendita, così nessuno va in rovina per
 *     loro (nemmeno una città popolosa e povera, piena di coloni).
 *
 * I numeri stanno in CITTA (modificabile solo dalla taratura, tools/taratura).
 */
import { fattoreContadini, fattoreManutenzione, fattoreServizi } from './ere';
import type { Player } from './types';

const INT = Math.floor;

export const CITTA = {
  /** servi che lavorano in ogni mercato e in ogni opificio */
  addettiMercato: 300,
  addettiOpificio: 500,
  /** contadini per acro che servono per il raccolto pieno */
  contadiniPerAcro: 0.5,
  /** manutenzione annua per edificio (scudi) */
  manutenzioneMercato: 20,
  manutenzioneOpificio: 50,
  manutenzioneGranaio: 30,
  manutenzionePalazzo: 200,
  /** quota della rendita che va ai servizi con abitantiRiferimento abitanti */
  serviziQuota: 0.05,
  /** abitanti di riferimento per la quota dei servizi */
  abitantiRiferimento: 3000,
  /** la quota cresce come (abitanti / abitantiRiferimento) ^ grandezza: meno che in proporzione; il tetto arriva verso i 20.000 abitanti */
  grandezza: 0.85,
  /** i servizi non superano questa quota della rendita dell'anno */
  quotaMassima: 0.25,
  /** signori del computer: quanto pesa la spesa in più quando decidono se crescere (0: crescono sempre) */
  prudenza: 1,
};

const mercati = (p: Player) => Math.max(0, p.mercato - 1);
const opifici = (p: Player) => Math.max(0, p.opificio - 1);

/** Servi che lavorano in una bottega del tipo dato. */
export const addettiDi = (kind: 'mercato' | 'opificio') => (kind === 'mercato' ? CITTA.addettiMercato : CITTA.addettiOpificio);

/** Servi che servono per tenere aperte tutte le botteghe. */
export const addettiNecessari = (p: Player) => mercati(p) * CITTA.addettiMercato + opifici(p) * CITTA.addettiOpificio;

/** Botteghe aperte con i servi di oggi: prima i mercati, poi gli opifici con i servi che restano. */
export function bottegheAttive(p: Player): { mercati: number; opifici: number } {
  const servi = Math.max(0, p.servi);
  const m = Math.min(mercati(p), Math.floor(servi / CITTA.addettiMercato));
  const o = Math.min(opifici(p), Math.floor((servi - m * CITTA.addettiMercato) / CITTA.addettiOpificio));
  return { mercati: m, opifici: o };
}

/** Servi al lavoro nelle botteghe aperte. */
export function addetti(p: Player): number {
  const a = bottegheAttive(p);
  return a.mercati * CITTA.addettiMercato + a.opifici * CITTA.addettiOpificio;
}

/** Contadini che servono per il raccolto pieno. */
export const contadiniNecessari = (p: Player) => Math.ceil(Math.max(0, p.acri) * contadiniPerAcro(p));

/** Contadini per acro del signore (la rotazione delle colture ne vuole meno). */
const contadiniPerAcro = (p: Player) => CITTA.contadiniPerAcro * fattoreContadini(p);

/**
 * Servi liberi per una bottega nuova: non servono né nelle botteghe né nei campi (può essere
 * negativo se i servi sono calati). Una bottega nuova non lascia i campi senza braccia.
 */
export const serviLiberi = (p: Player) => p.servi - addettiNecessari(p) - contadiniNecessari(p);

/** Contadini: i servi non addetti alle botteghe. */
export const contadini = (p: Player) => Math.max(0, p.servi - addetti(p));

/** Quota del raccolto pieno che i contadini riescono a portare a casa (0..1). */
export const fattoreRaccolto = (p: Player) => (p.acri > 0 && contadiniPerAcro(p) > 0 ? Math.min(1, contadini(p) / (p.acri * contadiniPerAcro(p))) : 1);

/** Grandezza della città: 1 con abitantiRiferimento abitanti, poi cresce meno che in proporzione (0 senza abitanti). */
export const grandezza = (p: Player) => (Math.max(0, p.servi) / CITTA.abitantiRiferimento) ** CITTA.grandezza;

export interface SpesaCitta {
  manutenzione: number;
  servizi: number;
  totale: number;
}

/** Spesa annua della città. `rendita` è la rendita dell'anno (assente: quella calcolata alle rendite, `credito`). */
export function spesaCitta(p: Player, rendita = p.credito): SpesaCitta {
  const manutenzione = INT((mercati(p) * CITTA.manutenzioneMercato + opifici(p) * CITTA.manutenzioneOpificio
    + (p.granai ?? 0) * CITTA.manutenzioneGranaio + p.palazzo * CITTA.manutenzionePalazzo) * fattoreManutenzione(p));
  const servizi = INT(Math.max(0, rendita) * quotaServizi(p));
  return { manutenzione, servizi, totale: manutenzione + servizi };
}

/** Quota della rendita che va ai servizi della città (al più quotaMassima; lo scriptorium la riduce). */
export const quotaServizi = (p: Player) => Math.min(CITTA.quotaMassima, CITTA.serviziQuota * grandezza(p)) * fattoreServizi(p);

/** Spesa della città con `servi` abitanti, a parità di rendita (per valutare se crescere conviene). */
export const spesaCon = (p: Player, servi: number, rendita = p.credito) => spesaCitta({ ...p, servi }, rendita).totale;

/**
 * Conviene far crescere la popolazione di un decimo? La rendita cresce più o meno come i servi
 * (un decimo di `rendita`), e un poco di più se i servi in più aprono una bottega nuova; la spesa
 * della città cresce secondo l'affollamento. Serve ai signori del computer.
 */
export function crescitaConviene(p: Player, rendita: number): boolean {
  const s = Math.max(1, p.servi), piu = Math.ceil(s * 0.1);
  const bottega = serviLiberi(p) < CITTA.addettiOpificio ? 1.5 : 1;
  const r = Math.max(0, rendita);
  return (spesaCon(p, s + piu, r * 1.1) - spesaCon(p, s, r)) * CITTA.prudenza <= r * 0.1 * bottega;
}
