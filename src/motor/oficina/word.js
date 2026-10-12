// Fecha: 2026-10-12
// Ruta: /src/motor/oficina/word.js
// Documento de texto (.docx) a HTML para convertirlo a PDF
// mammoth saca el contenido (títulos, negritas, listas, tablas, imágenes); aquí se le pone el tamaño de página y el estilo
// Notas: mammoth se carga solo al usarlo. Mantiene el contenido, no la maquetación exacta:
//        las fuentes, los colores y la posición de las imágenes pueden cambiar.

import { leerTexto, paginaHtml, A4, MARGEN } from './comun.js';

const TWIPS_POR_PUNTO = 20;

// Saltos de página manuales y estilos propios de los documentos
const ESTILOS_MAMMOTH = [
    "br[type='page'] => hr.salto",
    "p[style-name='Title'] => h1.titulo:fresh",
    "p[style-name='Subtitle'] => p.subtitulo:fresh"
];

const CSS = `
html, body { margin: 0; }
body { font-family: sans-serif; font-size: 11pt; line-height: 1.35; }
h1 { font-size: 18pt; margin: 14pt 0 6pt; } h2 { font-size: 15pt; margin: 12pt 0 5pt; } h3 { font-size: 13pt; margin: 10pt 0 4pt; }
h4, h5, h6 { font-size: 11.5pt; margin: 8pt 0 3pt; }
.titulo { font-size: 24pt; } .subtitulo { font-size: 13pt; color: #555; }
p { margin: 0 0 7pt; } ul, ol { margin: 0 0 7pt; }
table { border-collapse: collapse; margin: 6pt 0; }
td, th { border: 0.5pt solid #999; padding: 2pt 5pt; vertical-align: top; }
img { max-width: 100%; }
hr.salto { page-break-after: always; border: 0; height: 0; margin: 0; }
`;

// Tamaño y márgenes de la última sección del documento (en twips); A4 si no vienen
function tamanoPagina(archivos) {
    const texto = leerTexto(archivos, 'word/document.xml') ?? '';
    const pgSz = [...texto.matchAll(/<w:pgSz\b([^>]*)>/g)].at(-1)?.[1] ?? '';
    const pgMar = [...texto.matchAll(/<w:pgMar\b([^>]*)>/g)].at(-1)?.[1] ?? '';
    const atributo = (cadena, nombre, defecto) => {
        const m = new RegExp(`w:${nombre}="(-?\\d+)"`).exec(cadena);
        return m ? Number(m[1]) / TWIPS_POR_PUNTO : defecto;
    };
    const ancho = atributo(pgSz, 'w', A4[0]);
    const alto = atributo(pgSz, 'h', A4[1]);
    const apaisado = /w:orient="landscape"/.test(pgSz) && ancho < alto;
    return {
        ancho: apaisado ? alto : ancho,
        alto: apaisado ? ancho : alto,
        margenes: ['top', 'right', 'bottom', 'left'].map((lado) => Math.max(0, atributo(pgMar, lado, MARGEN * 2)))
    };
}

export async function wordAHtml(bytes, archivos) {
    const mammoth = (await import('mammoth')).default;
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    // En Node (pruebas) mammoth lee de buffer; en el navegador, de arrayBuffer: cada uno coge el suyo
    const entrada = { arrayBuffer, buffer: typeof Buffer === 'function' ? Buffer.from(bytes) : undefined };
    const { value: cuerpo } = await mammoth.convertToHtml(entrada, { styleMap: ESTILOS_MAMMOTH });
    const { ancho, alto, margenes } = tamanoPagina(archivos);
    const css = `${CSS} body { padding: ${margenes.map((m) => `${m.toFixed(1)}pt`).join(' ')}; }`;
    return [{ html: paginaHtml(css, cuerpo), ancho, alto, em: 11 }];
}
