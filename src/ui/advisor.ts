/**
 * Il consigliere: frasi di colore per la fase di commercio.
 */
import { advisorPortrait } from './art';
import { pick, type Speaker } from './speaker';
import type { Player, Scalars } from '../domain/types';

const n = (v: number) => Math.floor(v).toLocaleString('it-IT');

export const ANSELMO: Speaker = { name: 'Frate Anselmo', role: 'siniscalco del feudo', portrait: advisorPortrait };

/** "Messere" o "Madonna" a seconda del signore. */
export const honorific = (p: Player) => (p.gender === 1 ? 'Messere' : 'Madonna');

export type TradeMode = 'buy' | 'sell' | 'feed';

/** Saluto di inizio anno, scelto in base alla situazione del feudo. */
export function greeting(p: Player, sc: Scalars, year: number): string {
  const h = honorific(p);
  const lines: string[] = [];
  const opener = pick([
    `${h}, è giunto l'anno del Signore ${year}. I registri sono aperti davanti a voi.`,
    `Che Dio vi conservi, ${h}. L'anno ${year} comincia, e con esso le vostre decisioni.`,
    `${h}, ho fatto il giro dei granai all'alba. Ecco come stanno le cose.`,
    `Buongiorno, ${h}. I mercanti sono già in cortile e aspettano un vostro cenno.`,
  ]);
  lines.push(opener);

  // con le annate il siniscalco conosce il tipo d'anno; senza, lo deduce dal prezzo
  const annata = sc.annata ?? (sc.prezzo <= 12 ? 'buona' : sc.prezzo >= 40 ? 'carestia' : 'media');
  if (annata === 'buona') {
    lines.push(pick([
      `Il raccolto è stato generoso: ${n(sc.raccolto)} misure in vendita, e il grano costa appena ${sc.prezzo} scudi ogni mille. Un'occasione da non perdere.`,
      `I contadini non sanno più dove stipare le spighe! A ${sc.prezzo} scudi ogni mille, comprare ora è quasi un dovere.`,
    ]));
  } else if (annata === 'carestia') {
    lines.push(pick([
      `Annata magra: solo ${n(sc.raccolto)} misure sul mercato, e il prezzo è salito a ${sc.prezzo} scudi. Chi ha grano da vendere, quest'anno fa fortuna.`,
      `La carestia morde, ${h}. Il grano vale ${sc.prezzo} scudi ogni mille: forse è tempo di aprire i nostri granai ai mercanti.`,
    ]));
  } else {
    lines.push(pick([
      `Il raccolto è nella media: ${n(sc.raccolto)} misure a ${sc.prezzo} scudi ogni mille.`,
      `Prezzi onesti quest'anno, ${sc.prezzo} scudi ogni mille misure. Né affare né rovina.`,
    ]));
  }

  if (sc.ricarico) {
    lines.push(`I mercanti non si fidano di noi, ${h}: per la gabella sul commerzio ci fanno pagare il grano ${sc.prezzo} scudi invece di ${sc.prezzoBase}, e se vendiamo ce ne danno solo ${sc.prezzoVendita}.`);
  }
  if (p.abitudine && p.abitudine >= 1) {
    lines.push(`Il popolo si è abituato alle distribuzioni generose: quest'anno chiede ${n(sc.domanda)} misure.`);
  }

  if (sc.annata === 'carestia' && (sc.scorta ?? 0) > sc.domanda) {
    lines.push(`Nei feudi vicini c'è fame, ${h}: se vendiamo le nostre scorte, molte famiglie verranno a stabilirsi qui.`);
  } else if (sc.annata === 'buona' && p.granai !== undefined) {
    lines.push(`Con il grano a questo prezzo, riempire i granai per gli anni di carestia potrebbe essere un affare.`);
  }
  if (sc.capienza !== undefined && p.grano - sc.domanda > sc.capienza) {
    lines.push(`Badate, ${h}: i granai tengono ${n(sc.capienza)} misure. Quel che resterà oltre, a fine anno marcirà: meglio venderlo o distribuirlo.`);
  }

  if (p.grano < sc.domanda) {
    lines.push(pick([
      `Attenzione però: il popolo chiede ${n(sc.domanda)} misure e nei granai ne abbiamo solo ${n(p.grano)}.`,
      `Temo che il granaio non basti: la domanda è di ${n(sc.domanda)} misure. Se il popolo ha fame, muore.`,
    ]));
  } else if (p.scudi < 0) {
    lines.push(`E non dimenticate i debiti: gli usurai pretendono il ${sc.usura}% a fine anno.`);
  } else {
    lines.push(pick([
      `Il popolo chiede ${n(sc.domanda)} misure di grano: ricordatelo quando sarà il momento di sfamarlo.`,
      `I servi attendono la loro parte: ${n(sc.domanda)} misure basterebbero a tenerli contenti.`,
    ]));
  }
  lines.push(pick(['Cosa comandate?', 'Come intendete procedere?', 'Attendo i vostri ordini.']));
  return lines.join(' ');
}

/** Domanda del consigliere quando si sceglie un'azione. */
export function question(mode: TradeMode, p: Player, sc: Scalars): string {
  const h = honorific(p);
  switch (mode) {
    case 'buy':
      return pick([
        `Quante misure di grano devo far comprare, ${h}? I contadini ne offrono ${n(sc.raccolto)}.`,
        `Il mercante del borgo si sfrega le mani. Quanto grano gli prendiamo, ${h}?`,
        `Dite una cifra, ${h}, e manderò i carri. Ogni mille misure costano ${sc.prezzo} scudi.`,
      ]);
    case 'sell':
      return pick([
        `Quanto grano volete cedere ai mercanti, ${h}? Ne abbiamo ${n(p.grano)} misure.`,
        `I mercanti genovesi offrono ${sc.prezzoVendita ?? sc.prezzo} scudi ogni mille misure. Quanto vendiamo?`,
        `Badate, ${h}: il grano venduto non si ricompra se non dal raccolto. Quante misure?`,
      ]);
    case 'feed':
      return pick([
        `Quanto grano distribuiamo al popolo, ${h}? Ne chiedono ${n(sc.domanda)} misure.`,
        `I servi si sono radunati davanti al granaio. Quanto diamo loro?`,
        `Un popolo sazio cresce, uno affamato si spegne. Quante misure distribuiamo, ${h}?`,
      ]);
  }
}

/** Avvertimento fisso sull'azione (regole del listato originale). */
export function ruleNote(mode: TradeMode): string {
  switch (mode) {
    case 'buy': return 'Si può comprare solo dal raccolto di quest\'anno.';
    case 'sell': return 'Se il tesoro scende sotto i -2500 scudi, i mercanti non comprano più.';
    case 'feed': return 'Dopo la distribuzione il mercato chiude fino all\'anno prossimo.';
  }
}

/** Commento dopo un'azione riuscita. */
export function reaction(mode: TradeMode, qty: number, p: Player, sc: Scalars): string {
  const h = honorific(p);
  if (qty === 0) return pick([`Come volete, ${h}: per ora nulla.`, `Saggio aspettare, forse. Nessun ordine dato.`]);
  switch (mode) {
    case 'buy':
      return pick([
        `Fatto! ${n(qty)} misure entrano nei granai. Il tesoro ora conta ${n(p.scudi)} scudi.`,
        `I carri sono partiti, ${h}. ${n(qty)} misure acquistate: ne restano ${n(sc.raccolto)} sul mercato.`,
        `Ottimo affare. Il granaio è più pieno di ${n(qty)} misure.`,
      ]);
    case 'sell':
      return pick([
        `Venduto! I mercanti hanno pagato in buona moneta: il tesoro sale a ${n(p.scudi)} scudi.`,
        `${n(qty)} misure caricate sui carri dei mercanti. Speriamo che non ci servano in inverno.`,
        `Affare concluso, ${h}. Nel granaio restano ${n(p.grano)} misure.`,
      ]);
    case 'feed':
      return '';
  }
}

/** Il consigliere riformula un rifiuto del motore di gioco. */
export function refusal(reason: string, p: Player): string {
  return pick([
    `Perdonate, ${honorific(p)}, non si può: ${reason}.`,
    `Ahimè, ${honorific(p)}: ${reason}. Proviamo con un'altra cifra?`,
    `Il tesoriere scuote la testa: ${reason}.`,
  ]);
}

/** Commento all'esito della distribuzione di grano. */
export function feedingOutcome(natiMorti: number, p: Player): string {
  const h = honorific(p);
  if (natiMorti > 0) {
    return pick([
      `Il popolo vi benedice, ${h}! Quest'anno sono nati ${n(natiMorti)} servi.`,
      `Pance piene, culle piene: ${n(natiMorti)} nuove anime nel feudo.`,
      `Si fa festa nei villaggi. ${n(natiMorti)} bambini sono venuti al mondo.`,
    ]);
  }
  if (natiMorti < 0) {
    return pick([
      `Una triste notizia, ${h}: la fame si è portata via ${n(-natiMorti)} servi.`,
      `Le campane suonano a morto. ${n(-natiMorti)} servi non hanno visto la primavera.`,
      `Il popolo mormora, ${h}. Abbiamo perso ${n(-natiMorti)} anime per la scarsità di pane.`,
    ]);
  }
  return pick([`Né nascite né morti quest'anno: il popolo è rimasto come era.`, `Tutto tranquillo nei villaggi, ${h}.`]);
}
