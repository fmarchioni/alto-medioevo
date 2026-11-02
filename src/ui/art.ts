/** Grafica vettoriale originale: ritratto del consigliere e icone delle risorse. */

export const advisorPortrait = `
<svg viewBox="0 0 120 140" class="portrait" role="img" aria-label="Frate Anselmo, il siniscalco">
  <defs>
    <radialGradient id="pf-bg" cx="50%" cy="40%" r="70%">
      <stop offset="0" stop-color="#e9d7a8"/><stop offset="1" stop-color="#b8945a"/>
    </radialGradient>
  </defs>
  <rect width="120" height="140" rx="10" fill="url(#pf-bg)"/>
  <!-- tonaca -->
  <path d="M10 140 C14 104 34 92 60 92 C86 92 106 104 110 140 Z" fill="#5b3a24"/>
  <path d="M60 92 L52 140 M60 92 L68 140" stroke="#3e2617" stroke-width="2"/>
  <!-- cappuccio -->
  <path d="M26 78 C22 40 40 18 60 18 C80 18 98 40 94 78 C90 96 30 96 26 78 Z" fill="#6e4a2f"/>
  <!-- volto -->
  <ellipse cx="60" cy="64" rx="22" ry="26" fill="#f0c9a0"/>
  <path d="M38 58 C40 42 50 36 60 36 C70 36 80 42 82 58 C76 48 44 48 38 58 Z" fill="#6e4a2f"/>
  <!-- sopracciglia e occhi -->
  <path d="M46 58 q5 -4 10 0 M64 58 q5 -4 10 0" stroke="#7a5a3a" stroke-width="2" fill="none" stroke-linecap="round"/>
  <circle cx="51" cy="63" r="2.2" fill="#2b2118"/><circle cx="69" cy="63" r="2.2" fill="#2b2118"/>
  <!-- naso e barba -->
  <path d="M60 64 q-3 8 0 10" stroke="#c9976a" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M40 70 C40 102 80 102 80 70 C74 84 46 84 40 70 Z" fill="#9c9488"/>
  <path d="M50 92 q10 8 20 0" stroke="#7d756a" stroke-width="1.5" fill="none"/>
  <path d="M53 80 q7 4 14 0" stroke="#8b6b4b" stroke-width="2" fill="none" stroke-linecap="round"/>
  <!-- croce al collo -->
  <path d="M60 100 v14 M54 106 h12" stroke="#d6b25a" stroke-width="3" stroke-linecap="round"/>
</svg>`;

const icon = (body: string, label: string) =>
  `<svg viewBox="0 0 32 32" class="ico" role="img" aria-label="${label}">${body}</svg>`;

export const icons = {
  grano: icon(
    `<path d="M16 29V9" stroke="#a8801f" stroke-width="2"/>
     <g fill="#d6b25a" stroke="#a8801f" stroke-width="1">
       <ellipse cx="16" cy="6" rx="2.4" ry="4"/>
       <ellipse cx="12.2" cy="11" rx="2.2" ry="3.6" transform="rotate(-30 12.2 11)"/>
       <ellipse cx="19.8" cy="11" rx="2.2" ry="3.6" transform="rotate(30 19.8 11)"/>
       <ellipse cx="12.2" cy="17" rx="2.2" ry="3.6" transform="rotate(-30 12.2 17)"/>
       <ellipse cx="19.8" cy="17" rx="2.2" ry="3.6" transform="rotate(30 19.8 17)"/>
     </g>`, 'grano'),
  scudi: icon(
    `<ellipse cx="16" cy="22" rx="11" ry="4" fill="#a8801f"/>
     <ellipse cx="16" cy="18" rx="11" ry="4" fill="#c99a2e"/>
     <ellipse cx="16" cy="14" rx="11" ry="4" fill="#e3bb4f" stroke="#a8801f"/>
     <path d="M12 14h8" stroke="#a8801f" stroke-width="1.5"/>`, 'scudi'),
  servi: icon(
    `<g fill="#8b5a3c"><circle cx="10" cy="10" r="4"/><path d="M3 27c0-7 3-11 7-11s7 4 7 11z"/></g>
     <g fill="#6e4a2f"><circle cx="21" cy="9" r="4.5"/><path d="M13 28c0-8 4-12 8-12s8 4 8 12z"/></g>`, 'servi'),
  acri: icon(
    `<path d="M2 24 L12 12 L18 18 L23 13 L30 24 Z" fill="#6f8f4e"/>
     <path d="M2 24 h28 v5 h-28z" fill="#8a6b3e"/>
     <path d="M5 27 h22" stroke="#c9a46a" stroke-dasharray="3 2"/>`, 'acri'),
  prezzo: icon(
    `<path d="M16 4v24M6 10h20" stroke="#6b5a47" stroke-width="2" stroke-linecap="round"/>
     <path d="M6 10 l-4 9 h8z M26 10 l-4 9 h8z" fill="#c99a2e" stroke="#6b5a47"/>`, 'prezzo'),
  domanda: icon(
    `<path d="M6 12h20l-2 14H8z" fill="#b07a4a" stroke="#6e4a2f"/>
     <ellipse cx="16" cy="12" rx="10" ry="3" fill="#d6b25a" stroke="#6e4a2f"/>`, 'domanda'),
  usura: icon(
    `<circle cx="16" cy="16" r="12" fill="none" stroke="#8b2a1e" stroke-width="2"/>
     <path d="M11 21 L21 11" stroke="#8b2a1e" stroke-width="2"/><circle cx="11.5" cy="11.5" r="2.2" fill="#8b2a1e"/><circle cx="20.5" cy="20.5" r="2.2" fill="#8b2a1e"/>`, 'usura'),
};

/** Illustrazioni grandi per le carte azione. */
export const cardArt = {
  buy: `<svg viewBox="0 0 64 48" class="card-art" aria-hidden="true">
    <rect x="6" y="18" width="40" height="18" rx="2" fill="#8a6b3e"/><path d="M6 18 l6 -8 h28 l6 8z" fill="#a8844f"/>
    <circle cx="16" cy="40" r="6" fill="#4a3424"/><circle cx="38" cy="40" r="6" fill="#4a3424"/>
    <path d="M46 26 h12 l-4 -4 M58 26 l-4 4" stroke="#6f8f4e" stroke-width="3" fill="none" stroke-linecap="round"/>
    <ellipse cx="20" cy="16" rx="6" ry="4" fill="#d6b25a"/><ellipse cx="32" cy="15" rx="6" ry="4" fill="#e3bb4f"/></svg>`,
  sell: `<svg viewBox="0 0 64 48" class="card-art" aria-hidden="true">
    <path d="M10 14 h22 l-3 28 h-16z" fill="#c9a46a" stroke="#8a6b3e" stroke-width="2"/>
    <path d="M14 14 q7 -8 14 0" fill="none" stroke="#8a6b3e" stroke-width="2"/>
    <ellipse cx="46" cy="36" rx="12" ry="4" fill="#a8801f"/><ellipse cx="46" cy="31" rx="12" ry="4" fill="#e3bb4f" stroke="#a8801f"/>
    <path d="M34 20 h12 l-4 -4 M46 20 l-4 4" stroke="#a8801f" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`,
  feed: `<svg viewBox="0 0 64 48" class="card-art" aria-hidden="true">
    <ellipse cx="32" cy="34" rx="20" ry="7" fill="#b07a4a"/><path d="M12 34 q20 -18 40 0" fill="#d6b25a"/>
    <g fill="#8b5a3c"><circle cx="10" cy="16" r="4"/><path d="M4 30c0-6 3-9 6-9s6 3 6 9z"/></g>
    <g fill="#6e4a2f"><circle cx="54" cy="16" r="4"/><path d="M48 30c0-6 3-9 6-9s6 3 6 9z"/></g>
    <path d="M24 10 q8 -6 16 0" stroke="#8b2a1e" stroke-width="2" fill="none"/></svg>`,
};

export const treasurerPortrait = `
<svg viewBox="0 0 120 140" class="portrait" role="img" aria-label="Ser Bonifacio, il camerlengo">
  <defs>
    <radialGradient id="pt-bg" cx="50%" cy="40%" r="70%">
      <stop offset="0" stop-color="#e3d9b8"/><stop offset="1" stop-color="#9a8a5a"/>
    </radialGradient>
  </defs>
  <rect width="120" height="140" rx="10" fill="url(#pt-bg)"/>
  <!-- veste verde con bordo di pelliccia -->
  <path d="M8 140 C12 106 32 94 60 94 C88 94 108 106 112 140 Z" fill="#2f5b3a"/>
  <path d="M40 98 C46 112 74 112 80 98 C74 104 46 104 40 98 Z" fill="#c9b48a"/>
  <!-- volto -->
  <ellipse cx="60" cy="66" rx="21" ry="25" fill="#efc39a"/>
  <!-- cappuccio rosso (chaperon) -->
  <path d="M34 56 C30 30 48 20 62 20 C80 20 92 32 88 54 C80 44 44 44 34 56 Z" fill="#8b2a1e"/>
  <path d="M84 40 C100 44 104 62 96 76 C94 64 90 54 84 50 Z" fill="#a33a2b"/>
  <path d="M34 54 h54" stroke="#6b1f16" stroke-width="5" stroke-linecap="round"/>
  <!-- occhi, sopracciglia, baffi sottili -->
  <path d="M47 62 q5 -3 9 0 M64 62 q5 -3 9 0" stroke="#5a3d26" stroke-width="2" fill="none" stroke-linecap="round"/>
  <circle cx="52" cy="67" r="2.1" fill="#2b2118"/><circle cx="68" cy="67" r="2.1" fill="#2b2118"/>
  <path d="M60 68 q-3 7 0 9" stroke="#c48d62" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M51 81 q9 -4 18 0" stroke="#5a3d26" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M54 85 q6 3 12 0" stroke="#b0705a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <!-- borsa di monete -->
  <path d="M84 118 C78 118 76 134 90 134 C104 134 102 118 96 118 Z" fill="#a8844f" stroke="#5a3d26"/>
  <path d="M86 118 q4 -4 8 0" stroke="#5a3d26" stroke-width="2" fill="none"/>
  <circle cx="90" cy="127" r="3" fill="#e3bb4f"/>
</svg>`;

export const builderPortrait = `
<svg viewBox="0 0 120 140" class="portrait" role="img" aria-label="Mastro Ugolino, il capomastro">
  <defs>
    <radialGradient id="pb-bg" cx="50%" cy="40%" r="70%">
      <stop offset="0" stop-color="#d9d2c0"/><stop offset="1" stop-color="#8f8670"/>
    </radialGradient>
  </defs>
  <rect width="120" height="140" rx="10" fill="url(#pb-bg)"/>
  <!-- muro di mattoni sullo sfondo -->
  <g stroke="#7a705c" stroke-width="1" fill="none" opacity=".6">
    <path d="M0 30 h120 M0 50 h120 M0 70 h120 M20 30 v20 M60 30 v20 M100 30 v20 M40 50 v20 M80 50 v20"/>
  </g>
  <!-- grembiule e casacca -->
  <path d="M8 140 C12 104 32 94 60 94 C88 94 108 104 112 140 Z" fill="#6b4a2c"/>
  <path d="M42 100 h36 l4 40 h-44z" fill="#c9b48a"/>
  <!-- volto -->
  <ellipse cx="60" cy="66" rx="22" ry="25" fill="#e7b48a"/>
  <!-- berretto -->
  <path d="M36 56 C36 36 84 36 84 56 C76 50 44 50 36 56 Z" fill="#4f6b8a"/>
  <path d="M34 56 h52" stroke="#3a5070" stroke-width="5" stroke-linecap="round"/>
  <!-- occhi, sopracciglia folte, naso, barba corta -->
  <path d="M45 61 q6 -5 12 0 M63 61 q6 -5 12 0" stroke="#4a3424" stroke-width="3" fill="none" stroke-linecap="round"/>
  <circle cx="51" cy="66" r="2.2" fill="#2b2118"/><circle cx="69" cy="66" r="2.2" fill="#2b2118"/>
  <path d="M60 67 q-4 8 0 10" stroke="#b9845e" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M40 72 C40 98 80 98 80 72 C74 86 46 86 40 72 Z" fill="#6b5340"/>
  <path d="M53 82 q7 3 14 0" stroke="#3e2617" stroke-width="2" fill="none" stroke-linecap="round"/>
  <!-- squadra e compasso -->
  <path d="M86 104 v26 h22" stroke="#d6b25a" stroke-width="4" fill="none" stroke-linecap="square"/>
  <path d="M20 132 l8 -26 l8 26" stroke="#b8b8b8" stroke-width="3" fill="none"/><circle cx="28" cy="106" r="3" fill="#b8b8b8"/>
</svg>`;

/** Illustrazioni dei beni acquistabili. */
export const buildingArt: Record<'terre' | 'mercato' | 'opificio' | 'palazzo' | 'granaio', string> = {
  granaio: '',
  terre: `<svg viewBox="0 0 64 48" class="card-art" aria-hidden="true">
    <path d="M0 30 Q16 20 32 28 T64 24 V48 H0z" fill="#7aa35a"/><path d="M0 38 Q20 32 40 38 T64 36 V48 H0z" fill="#6f8f4e"/>
    <path d="M6 44 l10 -8 M18 46 l10 -8 M30 46 l10 -8 M42 46 l10 -8" stroke="#d6b25a" stroke-width="2"/>
    <path d="M48 26 v-14" stroke="#5a3d26" stroke-width="2"/><path d="M48 12 h10 l-3 4 3 4 h-10z" fill="#8b2a1e"/></svg>`,
  mercato: `<svg viewBox="0 0 64 48" class="card-art" aria-hidden="true">
    <path d="M8 18 h48 l-4 -10 h-40z" fill="#8b2a1e"/><path d="M8 18 q6 6 12 0 q6 6 12 0 q6 6 12 0 q6 6 12 0" fill="#d6b25a"/>
    <path d="M12 18 v24 M52 18 v24" stroke="#6b4a2c" stroke-width="3"/><rect x="14" y="30" width="36" height="10" fill="#a8844f"/>
    <circle cx="22" cy="28" r="3.5" fill="#c94a2e"/><circle cx="30" cy="28" r="3.5" fill="#e3bb4f"/><circle cx="38" cy="28" r="3.5" fill="#6f8f4e"/></svg>`,
  opificio: `<svg viewBox="0 0 64 48" class="card-art" aria-hidden="true">
    <rect x="8" y="20" width="34" height="24" fill="#c9b48a" stroke="#6b5a47"/><path d="M4 20 l21 -14 l21 14z" fill="#6b4a2c"/>
    <rect x="20" y="30" width="10" height="14" fill="#4a3424"/>
    <g transform="translate(50 32)"><g class="wheel"><circle r="11" fill="none" stroke="#6b4a2c" stroke-width="3"/>
      <path d="M0 -11 v22 M-11 0 h22 M-8 -8 l16 16 M-8 8 l16 -16" stroke="#6b4a2c" stroke-width="2"/></g></g>
    <path d="M40 44 q12 -4 24 0 v4 h-24z" fill="#4f7fa8"/></svg>`,
  palazzo: `<svg viewBox="0 0 64 48" class="card-art" aria-hidden="true">
    <rect x="10" y="18" width="44" height="28" fill="#d9c49a" stroke="#6b5a47"/>
    <rect x="4" y="10" width="12" height="36" fill="#c9b48a" stroke="#6b5a47"/><rect x="48" y="10" width="12" height="36" fill="#c9b48a" stroke="#6b5a47"/>
    <path d="M4 10 h3 v-4 h3 v4 h3 v-4 h3 v4 M48 10 h3 v-4 h3 v4 h3 v-4 h3 v4" stroke="#6b5a47" fill="none"/>
    <path d="M26 46 v-14 a6 6 0 0 1 12 0 v14z" fill="#4a3424"/><path d="M32 18 v-12 l8 3 -8 3" fill="#8b2a1e" stroke="#5a3d26"/></svg>`,
};

buildingArt.granaio = `<svg viewBox="0 0 64 48" class="card-art" aria-hidden="true">
    <rect x="12" y="20" width="40" height="26" fill="#a8844f" stroke="#5a3d26"/><path d="M12 28 h40 M12 36 h40" stroke="#8a6b3e"/>
    <path d="M6 20 L32 4 L58 20z" fill="#8b2a1e"/><rect x="27" y="30" width="10" height="16" fill="#4a3424"/>
    ${[0, 1, 2].map(i => `<ellipse cx="${8 + i * 8}" cy="45" rx="4.5" ry="3.5" fill="#d6b25a" stroke="#8a6b3e"/>`).join('')}</svg>`;

/** Torretta del riquadro a castello, come nella cornice dello schermo originale. */
export const turret = `<svg viewBox="0 0 40 34" class="turret" aria-hidden="true">
  <path d="M20 2 v8" stroke="currentColor" stroke-width="2"/><path d="M20 2 l9 3 -9 3z" fill="currentColor"/>
  <path d="M8 34 V16 h4 v-4 h4 v4 h8 v-4 h4 v4 h4 V34" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="miter"/>
</svg>`;

export const merchantPortrait = `
<svg viewBox="0 0 120 140" class="portrait" role="img" aria-label="Messer Lapo, mercante girovago">
  <defs>
    <radialGradient id="pm-bg" cx="50%" cy="40%" r="70%">
      <stop offset="0" stop-color="#f0dcae"/><stop offset="1" stop-color="#b0884e"/>
    </radialGradient>
  </defs>
  <rect width="120" height="140" rx="10" fill="url(#pm-bg)"/>
  <!-- fagotto sulla spalla -->
  <ellipse cx="96" cy="100" rx="18" ry="14" fill="#8a6b3e" stroke="#5a3d26"/>
  <path d="M84 92 q12 -8 24 2" stroke="#5a3d26" stroke-width="2" fill="none"/>
  <!-- mantello da viaggio -->
  <path d="M8 140 C12 104 32 94 60 94 C88 94 108 104 112 140 Z" fill="#4f3a6b"/>
  <path d="M60 94 L50 140 M60 94 L70 140" stroke="#3a2a52" stroke-width="2"/>
  <circle cx="60" cy="100" r="3.5" fill="#d6b25a"/>
  <!-- volto -->
  <ellipse cx="60" cy="68" rx="21" ry="24" fill="#e8b48a"/>
  <!-- cappello a tesa larga con piuma -->
  <ellipse cx="60" cy="50" rx="38" ry="8" fill="#2f5b3a"/>
  <path d="M40 50 C40 30 80 30 80 50z" fill="#3a6e47"/>
  <path d="M42 46 h36" stroke="#d6b25a" stroke-width="3"/>
  <path d="M78 42 C96 22 108 26 112 18 C104 34 94 38 80 46z" fill="#c94a2e"/>
  <!-- occhi furbi, sopracciglia, naso, baffi e pizzetto -->
  <path d="M47 63 q5 -3 9 1 M64 64 q5 -4 9 -1" stroke="#4a3424" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M49 68 q3 -2 6 0 M65 68 q3 -2 6 0" stroke="#2b2118" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M60 70 q-4 8 1 10" stroke="#b9845e" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M48 82 q12 -6 24 0" stroke="#4a3424" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M55 86 q5 4 10 0" stroke="#a04a3a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M56 90 l4 8 l4 -8z" fill="#4a3424"/>
</svg>`;
