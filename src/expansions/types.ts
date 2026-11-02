/**
 * Contratto di un'espansione: regole (dominio, src/domain/expansion.ts) e
 * vista (interfaccia). Ogni espansione vive in una cartella propria,
 * src/expansions/<nome>/, con un index.ts che esporta per default un oggetto
 * Expansion: il registro (index.ts in questa cartella) la trova da solo.
 */
import type { ExpansionRules } from '../domain/expansion';
import type { Game } from '../domain/turn';
import type { GameState, Player } from '../domain/types';

/** Carta aggiunta al menu della Delibera: apre un pannello dell'espansione. */
export interface ExtCard {
  panel: string;
  title: string;
  sub: string;
  art: string;
  disabled?: boolean;
  /** nei dispendimenti: la carta sta nel menu Guerra, che segue il cantiere; 'signori': nella pagina "Fra signori" (Delibera e dispendimenti) */
  menu?: 'guerra' | 'signori';
}

/** Stato dell'interfaccia dell'espansione durante un turno. */
export interface ExtUi {
  /** turno a cui si riferisce, per azzerarlo al cambio */
  key: string;
  /** pannello aperto nella Delibera, null = menu */
  panel: string | null;
  /** nei dispendimenti: aperto il menu Guerra invece del cantiere */
  menu?: 'guerra';
  /** pagina "Fra signori" aperta, nella fase indicata (si chiude da sola al cambio di fase) */
  signori?: string;
  /** frase del personaggio dell'espansione */
  say: string;
  /** i dispacci sono già comparsi (non si srotolano di nuovo) */
  seen?: boolean;
  /** i dispacci sono stati archiviati per questo turno */
  archived?: boolean;
}

export interface ExtActionResult {
  say: string;
  /** pannello dopo l'azione (undefined: resta quello aperto) */
  panel?: string | null;
  /** pergamena da chiudere prima di continuare (conferma di un acquisto: evita i doppi clic) */
  notice?: { title: string; body: string };
}

export interface ExpansionView {
  title: string;
  motto: string;
  /** miniatura della tessera di scelta all'avvio (SVG) */
  miniature: string;
  /** regole in breve, mostrate all'avvio */
  summary: string[];
  cards(g: Game): ExtCard[];
  /** notizie per il signore di turno, in cima alla Delibera ('' se nessuna); animate: solo alla prima apparizione */
  dispatches(g: Game, animate: boolean): string;
  /** riquadro dopo l'esito di un imprevisto: finché non è null sostituisce il pulsante Prosegui */
  eventPanel?(g: Game): string | null;
  /** carta del mazzo dell'espansione appena pescata: dove va e come si gioca (assente: testo generico) */
  cardNote?(g: Game, eventId: number): string;
  /** schermata dell'arresto deciso dall'espansione all'inizio del turno (HTML, senza pulsante) */
  arrestText?(g: Game): string;
  /** riquadro delle imprese dell'espansione, nella colonna a sinistra (al posto di quelle del gioco base) */
  imprese?(g: Game): string;
  /** riga sotto l'etichetta dell'espansione, nella colonna a sinistra */
  aside?(g: Game): string;
  /** seconda riga della barra delle risorse in alto: icona (SVG), valore, etichetta; low: in rosso */
  resourceBar?(g: Game): { ico: string; value: string; label: string; low?: boolean }[];
  /** avviso urgente in cima alla Delibera, ai Dispendimenti o al menu Guerra ('' se nessuno) */
  alert?(g: Game, where: 'delibera' | 'dispendimenti' | 'guerra'): string;
  /** scene mostrate a tutti alla chiusura dell'anno `year`, prima del riepilogo (es. le battaglie) */
  yearEndScenes?(state: GameState, year: number): { title: string; html: string }[];
  /** SVG sopra la carta del regno di fine anno (coordinate della carta) */
  mapMarkers?(state: GameState): string;
  /** nota aggiunta ai consigli del siniscalco nella Delibera */
  tradeHint?(g: Game, mode: 'buy' | 'sell' | 'feed'): string;
  /** rendite: nota accanto a ciascuna gabella per la bozza `r` (null: nessuna) */
  rateBadges?(g: Game, r: { bevere: number; macina: number; commerzio: number }): Partial<Record<'bevere' | 'macina' | 'commerzio', string>> | null;
  /** frase del personaggio quando si apre un pannello */
  open(g: Game, panel: string): string;
  panel(g: Game, ui: ExtUi): string;
  /** pulsante data-act="ext": op e dataset del pulsante, field legge un campo numerico del pannello */
  act(g: Game, op: string, data: DOMStringMap, field: (name: string) => number): ExtActionResult;
  /**
   * scelta che il signore di turno deve fare prima di continuare (es. una proposta di pace),
   * mostrata come pergamena come gli imprevisti; ogni opzione è un pulsante data-act="ext" (null: nessuna)
   */
  decision?(g: Game): { title: string; body: string; options: { label: string; op: string; target?: number; primary?: boolean }[] } | null;
  /** scudi che l'azione spende (o promette, come un'offerta) prima di eseguirla: serve all'avviso di debito; 0 se non costa */
  cost?(g: Game, op: string, data: DOMStringMap, field: (name: string) => number): number;
  /** frase della cronaca per un fatto dell'espansione (null: non si racconta) */
  chronicle(f: { kind: string; data: Record<string, number> }, players: Player[]): string | null;
  /** notizie del regno dell'anno */
  news?(state: GameState, year: number): string[];
}

export interface Expansion {
  /** ordine delle tessere all'avvio */
  order: number;
  rules: ExpansionRules;
  view: ExpansionView;
}
