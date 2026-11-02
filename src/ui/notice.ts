/**
 * Pergamene che fermano il gioco finché non si chiudono: la conferma di un
 * acquisto (arruolamento, catapulte), così un doppio clic non compra due
 * volte, e l'avviso prima di una spesa che manda il tesoro in debito.
 */

export interface Notice {
  title: string;
  body: string;
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

function scroll(title: string, body: string, buttons: string, cls = ''): string {
  return `<div class="notice-backdrop" role="dialog" aria-modal="true" aria-labelledby="notice-title">
    <div class="notice ${cls}">
      <div class="deed-roll top" aria-hidden="true"></div>
      <div class="deed-sheet">
        <div class="deed-head" id="notice-title">${title}</div>
        <p class="deed-body">${body}</p>
        <div class="btns">${buttons}</div>
      </div>
      <div class="deed-roll bottom" aria-hidden="true"></div>
    </div>
  </div>`;
}

export function renderNotice(x: Notice): string {
  return scroll(x.title, x.body, '<button data-act="noticeClose" class="primary">Bene</button>');
}

/** Scelta che un'espansione chiede al signore di turno (es. una proposta di pace): i pulsanti eseguono un'azione dell'espansione. */
export interface Decision {
  title: string;
  body: string;
  options: { label: string; op: string; target?: number; primary?: boolean }[];
}

export function renderDecision(d: Decision): string {
  const buttons = d.options.map(o => `<button data-act="ext" data-op="${o.op}"${o.target !== undefined ? ` data-target="${o.target}"` : ''}${o.primary ? ' class="primary"' : ''}>${o.label}</button>`).join('');
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
