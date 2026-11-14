/**
 * Vista moderna: gli sprite (public/sprites). Si caricano solo quando la città
 * viene mostrata la prima volta. L'ancoraggio è sempre in basso al centro
 * dell'immagine, quindi bastano larghezza e altezza naturali: il manifest
 * serve solo alla pipeline di ritaglio.
 */

export interface SpriteSpec {
  dir: string;
  /** correzione di scala rispetto all'impronta (i fogli non hanno scala coerente) */
  f?: number;
  /** punto dell'immagine (frazioni di larghezza e altezza) da mettere al centro della tessera, per i pezzi che non poggiano sul vertice */
  anchor?: [number, number];
  /** file da usare se diverso dal nome (lo stesso disegno con un'altra scala) */
  file?: string;
}

const t = (dir: string, f?: number, anchor?: [number, number], file?: string): SpriteSpec => ({ dir, ...(f ? { f } : {}), ...(anchor ? { anchor } : {}), ...(file ? { file } : {}) });

/** Ci sono i disegni delle tre caserme (edifici/caserma-1..3)? Finché no, la caserma si mostra con le tende. */
export const CASERME_DISEGNATE = true;

export const SPRITES: Record<string, SpriteSpec> = {
  erba: t('terreno'), 'erba-fiori': t('terreno'), 'grano-verde': t('terreno'), 'grano-maturo': t('terreno'), arato: t('terreno'),
  'riva-strada': t('terreno'), 'riva-erba': t('terreno'), lastricato: t('terreno'), sassoso: t('terreno'), allagato: t('terreno'), bruciato: t('terreno'),
  'cipresso-1': t('natura', 1.3), 'cipresso-2': t('natura', 1.3), 'cipresso-3': t('natura', 1.3), 'ulivo-1': t('natura', 1.2), 'ulivo-2': t('natura', 1.2),
  'quercia-1': t('natura', 1.3), 'quercia-2': t('natura', 1.3), sassi: t('natura', 0.8), covone: t('natura', 0.9), 'cespuglio-1': t('natura', 0.9), 'cespuglio-2': t('natura', 0.9),
  'palazzo-1': t('palazzo', 0.72), 'palazzo-2': t('palazzo', 0.84), 'palazzo-3': t('palazzo', 0.94), 'palazzo-4': t('palazzo', 1), 'palazzo-5': t('palazzo', 1.02), 'palazzo-6': t('palazzo', 1.1),
  'casa-paglia': t('edifici', 1.3), 'casa-orto': t('edifici', 1.4), 'casa-pozzo': t('edifici', 1.3),
  'mercato-1': t('edifici', 0.92), 'mercato-2': t('edifici', 0.95), 'opificio-1': t('edifici', 0.98), 'opificio-2': t('edifici', 0.98),
  mulino: t('edifici', 2), granaio: t('edifici', 0.82), chiesa: t('edifici', 0.98), cattedrale: t('edifici', 1.08), fondaco: t('edifici', 1), banco: t('edifici', 0.85),
  porto: t('edifici', 2), cava: t('edifici', 1),
  'mura-ne': t('difese', 0.9, [0.52, 0.72]), 'mura-no': t('difese', 0.9, [0.48, 0.72]), 'mura-angolo': t('difese', 1.05), torre: t('difese', 0.9),
  // torre di guardia (Spade e castelli): la stessa torre, più alta, isolata fuori dalle mura
  'torre-guardia': t('difese', 1.2, undefined, 'torre'),
  // la sentinella in cima alla torre di guardia: il soldato degli omini (si disegna a mezzo busto)
  sentinella: t('persone', undefined, undefined, 'soldato'),
  porta: t('difese', 1.45, [0.5, 0.8]),
  // caserma (Spade e castelli): finché non ci sono i disegni (CASERME_DISEGNATE), le tende dell'accampamento
  'caserma-tende': t('difese', 0.8, undefined, 'accampamento'),
  ...(CASERME_DISEGNATE ? { 'caserma-1': t('edifici', 1), 'caserma-2': t('edifici', 1), 'caserma-3': t('edifici', 1) } : {}),
  accampamento: t('difese', 1.6), assedio: t('difese', 1.2),
};

const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

export const spriteUrl = (path: string): string => `${BASE}sprites/${path}.png`;

/** Ritratti dipinti dei consiglieri (public/sprites/ritratti). */
export const portraitUrl = (name: string): string => spriteUrl(`ritratti/${name}`);

/** Pezzi dell'interfaccia dipinta (public/sprites/ui): cornici, fondi, pulsanti. */
export const UI_PIECES = ['cornice', 'cornice-piccola', 'cornice-ritratto', 'cornice-ritratto-2', 'pergamena', 'legno', 'fumetto', 'fumetto-2',
  'pulsante', 'pulsante-su', 'pulsante-no', 'sigillo', 'filetto', 'giglio', 'nastro'] as const;
export const uiUrl = (name: string): string => spriteUrl(`ui/${name}`);

/** Illustrazioni degli imprevisti (public/sprites/fatti), per numero dell'evento. */
const ILLUSTRAZIONI: Record<number, string> = {
  1: 'longobardi', 2: 'doni-saraceni', 3: 'peste', 4: 'campagna', 5: 'alluvione', 6: 'cloaca', 7: 'briganti', 8: 'ciambellano', 9: 'rivolta',
  10: 'franchi', 11: 'ungari', 12: 'longobardi', 13: 'bizantini', 14: 'saraceni', 15: 'decime-abate', 16: 'commercio-segreto',
  101: 'mercenari', 102: 'traditore', 103: 'tregua',
};
export const illustrationUrl = (name: string): string => `${BASE}sprites/fatti/${name}.jpg`;
export const eventIllustration = (eventId: number): string | undefined => (ILLUSTRAZIONI[eventId] ? illustrationUrl(ILLUSTRAZIONI[eventId]) : undefined);

/** Illustrazioni dei fatti del reame (le "Notizie dal reame"), per fatto; il ciambellano è lo stesso dell'imprevisto. */
const ILLUSTRAZIONI_FATTI: Record<string, string> = {
  piogge: 'piogge', mulino: 'mulino', immigrati: 'immigrati', eredita: 'eredita', reliquia: 'reliquia', visitaRe: 'visita-re',
  incendio: 'incendio', cavallette: 'cavallette', ciambellano: 'ciambellano', mulinoGuasto: 'mulino-guasto', muffa: 'muffa', decima: 'decima',
};
export const fattoIllustration = (id: string): string | undefined => (ILLUSTRAZIONI_FATTI[id] ? illustrationUrl(ILLUSTRAZIONI_FATTI[id]) : undefined);
/** Nome del dipinto di un imprevisto o di un fatto (lo stesso della sua miniatura nel giornale). */
export const eventArt = (eventId: number): string | undefined => ILLUSTRAZIONI[eventId];
export const fattoArt = (id: string): string | undefined => ILLUSTRAZIONI_FATTI[id];
/** Miniatura duecentesca del giornale di fine anno (public/sprites/miniature). */
export const miniatureUrl = (name: string): string => `${BASE}sprites/miniature/${name}.png`;

export class Assets {
  private images = new Map<string, HTMLImageElement>();
  private started = false;

  /** Avvia il caricamento di tutti gli sprite della città e delle persone (`people`); `onLoad` a ogni immagine arrivata. */
  load(onLoad: () => void, people: readonly string[] = []): void {
    if (this.started || typeof Image === 'undefined') return;
    this.started = true;
    for (const [name, spec] of Object.entries(SPRITES)) {
      const img = new Image();
      img.onload = () => {
        this.images.set(name, img);
        onLoad();
      };
      img.src = spriteUrl(`${spec.dir}/${spec.file ?? name}`);
    }
    // le persone non cambiano lo strato statico: non serve ridisegnarlo al loro arrivo
    for (const name of people) {
      const img = new Image();
      img.onload = () => this.images.set(name, img);
      img.src = spriteUrl(`persone/${name}`);
    }
  }

  /** L'immagine, se è già arrivata. */
  get(name: string): HTMLImageElement | undefined {
    return this.images.get(name);
  }
}
