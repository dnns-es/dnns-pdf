// Fecha: 2026-10-12
// Ruta: /src/motor/fuentesUnicode.js
// Fuentes completas (DejaVu) para el texto que las estándar de PDF no saben escribir (✓, griego, cirílico...)
// Da los bytes de cada estilo; solo se descargan la primera vez que hacen falta.
// Notas: solo lo usa el worker. DejaVu: licencia libre de Bitstream Vera (se puede distribuir con la app).

import sans from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url';
import sansNegrita from 'dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url';
import sansCursiva from 'dejavu-fonts-ttf/ttf/DejaVuSans-Oblique.ttf?url';
import sansNegritaCursiva from 'dejavu-fonts-ttf/ttf/DejaVuSans-BoldOblique.ttf?url';
import serif from 'dejavu-fonts-ttf/ttf/DejaVuSerif.ttf?url';
import serifNegrita from 'dejavu-fonts-ttf/ttf/DejaVuSerif-Bold.ttf?url';
import serifCursiva from 'dejavu-fonts-ttf/ttf/DejaVuSerif-Italic.ttf?url';
import serifNegritaCursiva from 'dejavu-fonts-ttf/ttf/DejaVuSerif-BoldItalic.ttf?url';
import mono from 'dejavu-fonts-ttf/ttf/DejaVuSansMono.ttf?url';
import monoNegrita from 'dejavu-fonts-ttf/ttf/DejaVuSansMono-Bold.ttf?url';
import monoCursiva from 'dejavu-fonts-ttf/ttf/DejaVuSansMono-Oblique.ttf?url';
import monoNegritaCursiva from 'dejavu-fonts-ttf/ttf/DejaVuSansMono-BoldOblique.ttf?url';

const URLS = {
    'DejaVuSans': sans,
    'DejaVuSans-Bold': sansNegrita,
    'DejaVuSans-Oblique': sansCursiva,
    'DejaVuSans-BoldOblique': sansNegritaCursiva,
    'DejaVuSerif': serif,
    'DejaVuSerif-Bold': serifNegrita,
    'DejaVuSerif-Italic': serifCursiva,
    'DejaVuSerif-BoldItalic': serifNegritaCursiva,
    'DejaVuSansMono': mono,
    'DejaVuSansMono-Bold': monoNegrita,
    'DejaVuSansMono-Oblique': monoCursiva,
    'DejaVuSansMono-BoldOblique': monoNegritaCursiva
};

export async function bytesFuenteUnicode(nombre) {
    const url = URLS[nombre];
    if (!url) {
        throw new Error(`Fuente desconocida: ${nombre}`);
    }
    const respuesta = await fetch(url);
    if (!respuesta.ok) {
        throw new Error(`No se pudo descargar la fuente ${nombre}`);
    }
    return new Uint8Array(await respuesta.arrayBuffer());
}
