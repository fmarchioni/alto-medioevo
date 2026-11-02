/**
 * Testi dei pignoramenti di fine anno (regole in src/domain/pignoramenti.ts):
 * la frase della cronaca, la pergamena al signore e l'avviso del consigliere.
 */
import { FORECLOSURE_SHARE, foreclosureLimit, overCredit, type Foreclosure } from '../domain/pignoramenti';
import type { Player, Scalars } from '../domain/types';
import type { Notice } from './notice';

const n = (v: number) => Math.abs(Math.floor(v)).toLocaleString('it-IT');
const and = (parts: string[]) => parts.join(', ').replace(/, ([^,]*)$/, ' e $1');

/** Elenco dei beni pignorati: "75 acri, un mercato e 2 piani di palazzo". */
export function seizedGoods(s: Foreclosure): string {
  const k = (v: number, one: string, many: string) => (v === 1 ? `un ${one}` : `${n(v)} ${many}`);
  return and([
    s.acri ? `${n(s.acri)} acri` : '',
    s.mercati ? k(s.mercati, 'mercato', 'mercati') : '',
    s.opifici ? k(s.opifici, 'opificio', 'opifici') : '',
    s.palazzo ? k(s.palazzo, 'piano del palazzo', 'piani del palazzo') : '',
  ].filter(Boolean));
}

/** Frase del libro delle cronache. */
export function seizedSentence(s: Foreclosure): string {
  return `Non potendo più ottenere credito, gli usurai gli pignorarono ${seizedGoods(s)}, pagandoli ${n(s.paid)} scudi, metà del loro valore${s.unpaid ? `; restò un debito di ${n(s.unpaid)} scudi` : ': il debito fu saldato'}.`;
}

/** Pergamena mostrata al signore all'inizio del turno dopo il pignoramento. */
export function seizedNotice(s: Foreclosure, p: Player): Notice {
  const rest = s.unpaid
    ? `Resta un debito di <b>${n(s.unpaid)} scudi</b>: se a fine anno supererà ancora il credito, i creditori torneranno.`
    : `Il debito è saldato${p.scudi > 0 ? ` e nel tesoro restano ${n(p.scudi)} scudi` : ''}.`;
  return {
    title: 'Pignoramento',
    body: `Il vostro debito di ${n(s.debt)} scudi superava il credito concesso dagli usurai. A fine anno i creditori si sono presi <b>${seizedGoods(s)}</b>, pagandoli ${n(s.paid)} scudi, la metà di quanto valevano. ${rest}`,
  };
}

/**
 * Avviso del consigliere durante l'anno: con il debito di adesso, più l'usura,
 * a fine anno si supererebbe il credito concesso (le rendite dell'anno).
 */
export function foreclosureWarning(p: Player, sc: Scalars): string {
  const after = p.scudi < 0 ? p.scudi + Math.floor((sc.usura / 100) * p.scudi) : p.scudi;
  if (!overCredit(p, after)) return '';
  return `<p class="warn"><b>Attenzione:</b> con l'usura il debito arriverà a circa ${n(after)} scudi, oltre il limite degli usurai (${n(foreclosureLimit(p))}). A fine anno scatteranno i pignoramenti: i creditori prenderanno terre, mercati, opifici e piani del palazzo pagandoli il ${Math.round(FORECLOSURE_SHARE * 100)}% del loro valore, fino a saldare il debito.</p>`;
}
