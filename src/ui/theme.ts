/** Tema grafico e adattamento del testo al font C64. */

export type Theme = 'c64' | 'pergamena';
const KEY = 'alto-medioevo/theme';

export function loadTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'pergamena' ? 'pergamena' : 'c64';
  } catch {
    return 'c64';
  }
}

export function saveTheme(t: Theme): void {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* storage non disponibile */
  }
}

/**
 * Il set di caratteri del C64 non ha lettere accentate né alcuni simboli
 * tipografici (che il font mappa su glifi grafici PETSCII). Come nel listato
 * originale ("sara'", "piu'", "e' re") si usa l'apostrofo.
 */
const MAP: Record<string, string> = {
  à: "a'", è: "e'", é: "e'", ì: "i'", ò: "o'", ù: "u'",
  À: "A'", È: "E'", É: "E'", Ì: "I'", Ò: "O'", Ù: "U'",
  '—': '-', '–': '-', '−': '-', '·': '-', '×': 'x', '…': '...', '≈': '~', '’': "'", '‘': "'", '«': '"', '»': '"',
};
const RE = new RegExp(`[${Object.keys(MAP).join('')}]`, 'g');

export function c64ify(html: string): string {
  return html.replace(RE, ch => MAP[ch]);
}

/** Vista: la classica (schede e vedute disegnate) o la moderna (città isometrica). Separata dal tema. */
export type Vista = 'classica' | 'moderna';
const VISTA_KEY = 'alto-medioevo/vista';

export function loadVista(): Vista {
  try {
    return localStorage.getItem(VISTA_KEY) === 'moderna' ? 'moderna' : 'classica';
  } catch {
    return 'classica';
  }
}

export function saveVista(v: Vista): void {
  try {
    localStorage.setItem(VISTA_KEY, v);
  } catch {
    /* storage non disponibile */
  }
}
