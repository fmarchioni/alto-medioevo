/**
 * Ser Gualtiero, notaio di corte: nella Dinastia spiega ogni regola importante
 * la prima volta che comincia a contare (una successione, le prime nozze, la
 * prima battaglia...). Ogni avviso compare una volta sola per casata.
 */
import {
  ANNO_FINE, CADETTI_SENZA_FIGLI, PRESTIGIO_RANGO, PRESTIGIO_RE, QUOTA_CADETTO, QUOTA_MAX, RISCHIO_BATTAGLIA, RISCHIO_CONGIURA, RISCHIO_RIVOLTA, type Avviso,
} from '../domain/dinastia';
import {
  CASUS_ANNI, ETA_MAGGIORE, ETA_NOZZE, NOZZE_FAZIONE, PRESTIGIO_NOZZE, PRESTIGIO_RIPUDIO, REGGENZA_QUOTA,
} from '../domain/famiglia';
import { RIVALI } from '../domain/fazioni';
import { THRONE_THRESHOLD } from '../domain/rank';
import type { Game } from '../domain/turn';
import { honorific } from './advisor';
import { INFO } from './fazioni';
import type { Notice } from './notice';
import { speechBox, type Speaker } from './speaker';

const notaryPortrait = `
<svg viewBox="0 0 120 140" class="portrait" role="img" aria-label="Ser Gualtiero, il notaio di corte">
  <defs>
    <radialGradient id="nt-bg" cx="50%" cy="40%" r="70%">
      <stop offset="0" stop-color="#e6dcc0"/><stop offset="1" stop-color="#8f7f55"/>
    </radialGradient>
  </defs>
  <rect width="120" height="140" rx="10" fill="url(#nt-bg)"/>
  <!-- toga nera con collo bianco -->
  <path d="M8 140 C12 104 32 92 60 92 C88 92 108 104 112 140 Z" fill="#2a2420"/>
  <path d="M46 94 L60 112 L74 94 Z" fill="#efe6d0"/>
  <!-- volto, barba grigia -->
  <ellipse cx="60" cy="64" rx="20" ry="24" fill="#eabf98"/>
  <path d="M42 70 C44 92 76 92 78 70 C72 80 48 80 42 70 Z" fill="#9b958c"/>
  <!-- berretto da notaio -->
  <path d="M38 48 C38 30 82 30 82 48 Z" fill="#3b2d4a"/>
  <rect x="36" y="44" width="48" height="6" rx="3" fill="#2a2036"/>
  <!-- occhiali, occhi, naso -->
  <circle cx="52" cy="63" r="5.5" fill="none" stroke="#6b5a47" stroke-width="1.6"/><circle cx="68" cy="63" r="5.5" fill="none" stroke="#6b5a47" stroke-width="1.6"/>
  <path d="M57.5 63 h5" stroke="#6b5a47" stroke-width="1.6"/>
  <circle cx="52" cy="63" r="1.8" fill="#2b2118"/><circle cx="68" cy="63" r="1.8" fill="#2b2118"/>
  <path d="M60 66 q-3 6 0 8" stroke="#c48d62" stroke-width="2" fill="none" stroke-linecap="round"/>
  <!-- pergamena e sigillo -->
  <rect x="78" y="104" width="26" height="30" rx="3" fill="#f3e7c4" stroke="#b8902e"/>
  <path d="M82 112 h18 M82 118 h18 M82 124 h12" stroke="#8a6b3e" stroke-width="1.2"/>
  <circle cx="98" cy="130" r="4" fill="#a82c22"/>
</svg>`;

export const GUALTIERO: Speaker = { name: 'Ser Gualtiero', role: 'notaio di corte', portrait: notaryPortrait };

const pct = (v: number) => `${Math.round(v * 100)}%`;
const fmt = (v: number) => Math.round(v).toLocaleString('it-IT');

function testo(a: Avviso, g: Game): { title: string; text: string[] } {
  const h = honorific(g.player), spade = g.state.expansion === 'spade-castelli';
  switch (a) {
    case 'inizio':
      return {
        title: 'Il notaio di corte',
        text: [
          `${h}, sono Ser Gualtiero, notaio della vostra casata. Vi parlerò quando una delle leggi del regno comincerà a toccarvi, e una volta sola per ciascuna.`,
          `Questa volta il trono non chiude la partita: si gioca fino al ${ANNO_FINE}, quando Ottone di Sassonia sarà incoronato imperatore. Voi invecchierete e morirete, e regneranno i vostri eredi.`,
          `Vincerà la casata più illustre: contano i titoli di ogni generazione (da ${PRESTIGIO_RANGO[1]} per un conte a ${PRESTIGIO_RANGO[4]} per un principe), ${PRESTIGIO_RE} per ogni corona d'Italia, i matrimoni illustri e la ricchezza dell'ultimo signore. Le nozze e i figli li trovate nel pulsante della casata, a sinistra.`,
        ],
      };
    case 'successione':
      return {
        title: 'La legge della successione',
        text: [
          `${h}, ecco come passa l'eredità. Regna il primogenito rimasto in casa, del vostro stesso genere se c'è, altrimenti dell'altro; senza figli, un nipote, e allora i parenti si contendono l'eredità come ${CADETTI_SENZA_FIGLI} fratelli.`,
          `Gli altri figli rimasti in casa sono i cadetti: ciascuno prende circa il ${pct(QUOTA_CADETTO)} del tesoro, del grano e delle terre oltre le 500, di più se la casata è più ricca delle altre, mai oltre il ${pct(QUOTA_MAX)} in tutto. La città, le botteghe, il palazzo e i debiti restano all'erede.`,
          'Prima di cominciare il regno potete dare all\'erede un altro nome: se è quello di un avo, prende il suo ordinale.',
        ],
      };
    case 'trasferimento':
      return {
        title: 'Restare o partire',
        text: [
          `${h}, c'è una città libera vicina: l'erede può lasciare questa città ai fratelli e fondare là la sua sede.`,
          'Se resta, tiene la città con le botteghe, il palazzo e i granai, e i fratelli prendono la loro parte del tesoro, del grano e delle terre.',
          `Se parte, i fratelli si tengono la città con tutto ciò che vi è costruito, e le terre oltre le 500 con i loro servi${spade ? ', le mura e le torri' : ''}; in cambio rinunciano alla loro parte: l'erede porta con sé tutto il tesoro e tutto il grano. I debiti lo seguono. Cambiano anche le fazioni che verranno ad attaccarvi${spade ? ' e i vicini con cui confinate (chi assediava la città vecchia torna a casa)' : ''}.`,
          'Conviene partire con molti fratelli e poche botteghe, o per sfuggire a un vicino pericoloso.',
        ],
      };
    case 'reggenza':
      return {
        title: 'La reggenza',
        text: [`${h}, l'erede ha meno di ${ETA_MAGGIORE} anni: fino ad allora governa in suo nome un consiglio di reggenza, che trattiene il ${pct(REGGENZA_QUOTA)} di ogni rendita. Voi giocate come sempre: il consiglio si contenta del suo compenso.`],
      };
    case 'nozze': {
      const facs = (Object.keys(NOZZE_FAZIONE) as (keyof typeof NOZZE_FAZIONE)[]).map(f => {
        const r = (RIVALI[f] ?? []).map(x => INFO[x].the).join(' e ');
        return `${INFO[f].the} (dal rango di ${NOZZE_FAZIONE[f]!.rango === 2 ? 'conte' : 'duca'}: non vi attaccheranno più, ma verranno più spesso ${r})`;
      });
      return {
        title: 'Le nozze',
        text: [
          `${h}, in casa c'è chi può sposarsi (si sposa dai ${ETA_NOZZE} anni). Le nozze si combinano nel pulsante della casata; la sposa va nella casa dello sposo, e la sua famiglia paga la dote.`,
          `Con un'altra casata della partita diventate parenti: fra voi niente tributi, all'elezione del re vi appoggiate${spade ? ', e non potete muovervi guerra' : ''}. Vale ${PRESTIGIO_NOZZE.casata} di prestigio a ciascuno. Il computer risponde subito alla proposta, un giocatore nel suo turno.`,
          `Con le fazioni: ${facs.join('; ')}. Con la nobiltà del luogo: una piccola dote e nessun legame.`,
          `Finché il signore è sposato nascono figli, ma qualche matrimonio resta senza figli. Il ripudio scioglie le nozze: la dote torna indietro, la casata perde ${PRESTIGIO_RIPUDIO} di prestigio, e l'offeso ha un casus belli per ${CASUS_ANNI} anni (una fazione si vendica con nuovi attacchi).`,
        ],
      };
    }
    case 'pericoli':
      return {
        title: 'Il signore in battaglia',
        text: [`${h}, ogni battaglia mette a rischio la vostra vita: circa il ${pct(RISCHIO_BATTAGLIA.vinta)} se vincete, l'${pct(RISCHIO_BATTAGLIA.persa)} se perdete; una rivolta del popolo il ${pct(RISCHIO_RIVOLTA)}. Il rischio si somma fino all'inizio del vostro prossimo turno, quando la sorte decide.`],
      };
    case 'congiura':
      return {
        title: 'Mormorii a palazzo',
        text: [`${h}, il popolo è scontento, e un popolo scontento trova sempre chi arma una mano. Finché resta così, ogni anno rischiate una congiura di palazzo: il ${pct(RISCHIO_CONGIURA.infelice)}, e il ${pct(RISCHIO_CONGIURA.rabbia)} se il popolo è furioso. Gabelle più miti sul bere, o più grano, lo rasserenano.`],
      };
    case 'elezione':
      return {
        title: "L'elezione del re",
        text: [
          `${h}, la corona d'Italia non si eredita. Chi ha oltre ${fmt(THRONE_THRESHOLD)} di ricchezza e il palazzo completo si candida, se il trono è vacante; alla fine dell'anno votano tutti i signori in gioco, ciascuno con tanti voti quanto il suo rango.`,
          'Ognuno vota per sé, se è candidato; altrimenti per la casata che appoggia (lo scegliete nel pulsante della casata), poi per un parente, poi per il più ricco. Nessuno vota per chi l\'ha offeso con un ripudio. Alla morte del re si vota di nuovo.',
          `Ogni corona vale ${PRESTIGIO_RE} di prestigio alla casata.`,
        ],
      };
    case 'ripudiato':
      return {
        title: "Un'offesa da ricordare",
        text: [`${h}, una casata ha ripudiato un vostro figlio o una vostra figlia, che torna a casa con la sua dote. Per ${CASUS_ANNI} anni avete un casus belli: non voterete per loro e non accetterete nozze da loro${spade ? ', e in guerra l\'offesa conta come un assalto da vendicare: per la pace vi dovranno una riparazione' : ''}.`],
      };
  }
}

/** L'avviso del notaio come pergamena. */
export function notaioNotice(a: Avviso, g: Game): Notice {
  const t = testo(a, g);
  return { title: t.title, body: speechBox(GUALTIERO, t.text.join('<br><br>')), html: true };
}
