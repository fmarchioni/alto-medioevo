/**
 * La voce del cronista: l'attacco di ogni articolo del giornale di fine anno e i suoi commenti, scelti
 * secondo il tono del fatto. Servono a dare a ogni articolo la lunghezza della sua miniatura: un fatto
 * di una riga accanto a una miniatura grande lascerebbe la pagina vuota.
 */

export type Tono =
  | 'sciagura' | 'fortuna' | 'ventura' | 'stranieri' | 'mistero' | 'guerra' | 'pace'
  | 'morte' | 'nozze' | 'nascita' | 'lutto' | 'casata' | 'corona' | 'sale' | 'scende' | 'rovina';

/** `luogo`: le città, "Ravenna" o "Ravenna e Verona". */
const ATTACCHI: Record<Tono, ((luogo: string) => string)[]> = {
  sciagura: [
    l => `Sciagura nel reame! Grande sventura colse la terra di ${l}, e il cronista ne scrive con mano tremante.`,
    l => `Anno di lacrime a ${l}: la mano di Dio si fece pesante sopra quelle terre.`,
    l => `Triste novella giunse da ${l}, dove il popolo pianse e i campanili suonarono a lungo.`,
  ],
  fortuna: [
    l => `Lieta novella da ${l}: la Provvidenza sorrise a quelle terre, e il popolo ne rese grazie.`,
    l => `Buona sorte a ${l}, e se ne parlò a lungo nelle piazze e nelle osterie del regno.`,
  ],
  ventura: [
    l => `Strani casi a ${l}, dove la sorte diede con una mano e tolse con l'altra.`,
    l => `Da ${l} giunsero notizie ora liete ora tristi, come spesso accade nelle cose del mondo.`,
  ],
  stranieri: [
    l => `Genti straniere ai confini! I messi corsero a briglia sciolta a portare la notizia da ${l}.`,
    l => `Gli stranieri bussarono alle porte di ${l}, e i signori dovettero scegliere fra la spada e la parola.`,
  ],
  mistero: [
    l => `Si mormorò a lungo, a bassa voce, di quanto accadde a ${l}, e non tutto si può scrivere.`,
    l => `Fatti oscuri a ${l}: uomini senza nome vennero di notte a parlare al signore.`,
  ],
  guerra: [
    l => `Guerra nel reame! Le trombe suonarono e le schiere si mossero sulle terre di ${l}.`,
    l => `Si udì il clangore delle armi a ${l}, e la terra bevve il sangue dei combattenti.`,
  ],
  pace: [
    l => `Pace fra i signori: tacquero le armi a ${l}, e i contadini tornarono ai campi.`,
    l => `Si firmò la pace a ${l}, e i notai suggellarono la pergamena con cera rossa.`,
  ],
  morte: [
    l => `Lutto nel reame! Le campane di ${l} suonarono a morto per tre giorni e tre notti.`,
    l => `Una grande ombra scese su ${l}: il signore rese l'anima a Dio.`,
  ],
  nozze: [
    l => `Grandi feste a ${l}! Si apparecchiarono le tavole, e i giullari suonarono fino all'alba.`,
    l => `Nozze a ${l}: la chiesa fu ornata di fiori, e il popolo ebbe pane e vino in abbondanza.`,
  ],
  nascita: [
    l => `Gioia a ${l}: una culla nuova nel palazzo, e la casata ha chi ne porterà il nome.`,
    l => `Le campane di ${l} suonarono a festa per la nascita di un erede.`,
  ],
  lutto: [
    l => `Dolore nella casa del signore di ${l}, e la corte vestì di nero.`,
  ],
  casata: [
    l => `Fatti della casata a ${l}, di cui si parlò a lungo nelle corti del regno.`,
    l => `Le corti del regno ebbero di che parlare per quanto accadde nella casata di ${l}.`,
  ],
  corona: [
    l => `Un re per l'Italia! I grandi del regno scelsero il loro signore, e ${l} fu in festa.`,
  ],
  sale: [
    l => `Onori a ${l}: il re premiò la ricchezza e il buon governo del suo signore.`,
    l => `Grande cerimonia a ${l}, dove il vescovo lesse davanti alla corte la carta del nuovo titolo.`,
  ],
  scende: [
    l => `Vergogna a ${l}: le fortune del signore calarono, e con esse il suo rango.`,
  ],
  rovina: [
    l => `Rovina a ${l}! Gli usurai vennero con gli sgherri a riscuotere il dovuto.`,
  ],
};

/** I commenti del cronista, in ordine: se ne aggiungono finché l'articolo non è lungo abbastanza. */
const CHIUSE: Record<Tono, string[]> = {
  sciagura: [
    'Il cronista prega che Iddio abbia pietà di quelle terre, e che l\'anno venturo porti raccolti migliori.',
    'I vecchi dissero di non ricordare un male simile dai tempi dei loro padri.',
    'Si fecero processioni e si accesero ceri, ma il danno ormai era fatto.',
  ],
  fortuna: [
    'Si cantò il Te Deum nella chiesa maggiore, e le casse del signore ne ebbero sollievo.',
    'Ma il savio sa che la fortuna gira come la ruota del mulino.',
    'Chi ebbe la buona sorte la tenga cara, ammonisce il cronista.',
  ],
  ventura: [
    'Così va il mondo, annota il cronista: nulla è dato che non possa essere tolto.',
    'I savi della corte ne discussero a lungo, senza trovarsi d\'accordo.',
  ],
  stranieri: [
    'Le sentinelle sulle torri non dormirono per molte notti.',
    'Si sprangarono le porte della città, e le donne nascosero l\'argento nei pozzi.',
    'Il cronista prega che il regno resti saldo nelle mani dei suoi signori.',
  ],
  mistero: [
    'Il resto lo sanno soltanto Dio e chi c\'era.',
    'Il cronista non aggiunge altro, per prudenza.',
  ],
  guerra: [
    'Molte madri piansero i figli che non tornarono dal campo.',
    'Dopo la battaglia si contarono i morti, e i corvi ebbero il loro pasto.',
    'Il cronista prega che la pace torni presto fra i signori cristiani.',
  ],
  pace: [
    'Benedetti gli operatori di pace, dice il Vangelo, e il cronista lo ricorda.',
    'Ma i savi sanno che i patti durano quanto la buona volontà di chi li firma.',
  ],
  morte: [
    'Fu sepolto nella chiesa maggiore, con le insegne della casata.',
    'Il popolo lo pianse, e i poveri ebbero pane in suo ricordo.',
    'Requiem aeternam dona ei, Domine.',
  ],
  nozze: [
    'Che il Signore benedica gli sposi e dia loro figli numerosi.',
    'Le due casate si promisero amicizia, e il cronista spera che duri.',
    'Si danzò sulla piazza, e i poveri ebbero gli avanzi del banchetto.',
  ],
  nascita: [
    'La balia giurò di non aver mai visto un bambino più robusto.',
    'Fu battezzato nella chiesa maggiore, e il signore fece grazia ai prigionieri.',
  ],
  lutto: [
    'Si dissero messe per l\'anima del defunto, e il palazzo restò in silenzio a lungo.',
    'Il signore non volle feste né giullari per molti mesi.',
  ],
  casata: [
    'Il cronista si astiene dal giudicare le cose dei grandi.',
    'Si vedrà col tempo se fu saggia decisione.',
  ],
  corona: [
    'Viva il re! gridò la folla davanti alla basilica.',
    'Che Iddio lo guidi nel governo del regno.',
  ],
  sale: [
    'I signori vicini ne ebbero invidia, e qualcuno anche timore.',
    'Si fece festa a palazzo, e i servi ebbero un giorno di riposo.',
    'Il nuovo stemma fu dipinto sulle porte della città.',
  ],
  scende: [
    'I cortigiani se ne andarono uno dopo l\'altro, come le foglie in autunno.',
    'Così passa la gloria del mondo.',
  ],
  rovina: [
    'Il palazzo fu chiuso, e i servi dispersi per le campagne.',
    'Sic transit gloria mundi.',
  ],
};

const hash = (s: string) => {
  let h = 7;
  for (const ch of s) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return h;
};

/** "Ravenna", "Ravenna e Verona". */
export function luoghi(feudi: string[]): string {
  return [...new Set(feudi)].join(", ").replace(/, ([^,]*)$/, " e $1");
}

/** L'attacco dell'articolo (stessa scelta a ogni lettura: dipende dal titolo). */
export function attacco(tono: Tono, luogo: string, chiave: string): string {
  const pool = ATTACCHI[tono];
  return pool[hash(chiave) % pool.length](luogo);
}

/** I commenti da aggiungere perché il testo (`len` caratteri) arrivi a `target`. */
export function chiuse(tono: Tono, len: number, target: number, chiave: string): string[] {
  const pool = CHIUSE[tono], out: string[] = [];
  for (let k = 0, i = hash(chiave) % pool.length; k < pool.length && len < target; k++, i = (i + 1) % pool.length) {
    out.push(pool[i]);
    len += pool[i].length + 1;
  }
  return out;
}
