/**
 * Pergamene che fermano il gioco finché non si chiudono: la conferma di un
 * acquisto (arruolamento, catapulte), così un doppio clic non compra due
 * volte, e l'avviso prima di una spesa che manda il tesoro in debito.
 */

export interface Notice {
  title: string;
  body: string;
  /** il corpo è già impaginato (un personaggio che parla): non va in un paragrafo */
  html?: boolean;
}

/** Spesa da confermare: si esegue solo dopo "Confermo". */
export interface DebtConfirm {
  cost: number;
  /** tesoro dopo la spesa (negativo) */
  after: number;
  usura: number;
  run: () => void;
}

const n = (v: number) => Math.floor(Math.abs(v)).toLocaleString('it-IT');

function scroll(title: string, body: string, buttons: string, cls = '', html = false): string {
  return `<div class="notice-backdrop" role="dialog" aria-modal="true" aria-labelledby="notice-title">
    <div class="notice ${cls}">
      <div class="deed-roll top" aria-hidden="true"></div>
      <div class="deed-sheet">
        <div class="deed-head" id="notice-title">${title}</div>
        ${html ? `<div class="deed-body">${body}</div>` : `<p class="deed-body">${body}</p>`}
        <div class="btns">${buttons}</div>
      </div>
      <div class="deed-roll bottom" aria-hidden="true"></div>
    </div>
  </div>`;
}

export function renderNotice(x: Notice): string {
  return scroll(x.title, x.body, '<button data-act="noticeClose" class="primary">Bene</button>', x.html ? 'notice-notaio' : '', !!x.html);
}

/** Scelta che un'espansione chiede al signore di turno (es. una proposta di pace): i pulsanti eseguono un'azione dell'espansione. */
export interface Decision {
  title: string;
  body: string;
  options: { label: string; op: string; target?: number; primary?: boolean; /** azione del pulsante (assente: "ext", l'espansione) */ act?: string }[];
}

export function renderDecision(d: Decision): string {
  const buttons = d.options.map(o => `<button data-act="${o.act ?? 'ext'}" data-op="${o.op}"${o.target !== undefined ? ` data-target="${o.target}"` : ''}${o.primary ? ' class="primary"' : ''}>${o.label}</button>`).join('');
  return scroll(d.title, d.body, buttons, 'notice-choice');
}

export function renderConfirm(c: DebtConfirm): string {
  return scroll(
    'Attenzione!',
    `Questo richiede debito. La spesa è di ${n(c.cost)} scudi e il tesoro scenderà a <b>-${n(c.after)} scudi</b>, prestati dagli usurai all'usura del ${c.usura}%. Confermate?`,
    '<button data-act="confirmNo">Annulla</button><button data-act="confirmYes" class="primary">Confermo</button>',
    'notice-warn',
  );
}
