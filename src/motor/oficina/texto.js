// Fecha: 2026-10-12
// Ruta: /src/motor/oficina/texto.js
// Texto plano (.txt) y archivos de código (.py y similares) a HTML para convertirlos a PDF
// Detecta la codificación (UTF-8, UTF-16 con BOM o Windows-1252) y respeta saltos, espacios y tabulaciones
// Notas: el texto corriente va con letra normal; el código, con letra de ancho fijo y algo más pequeña.
//        Un salto de página (carácter 12, como en las impresoras) empieza página nueva.

import { escapar, paginaHtml, A4 } from './comun.js';

const MARGEN = 56;
const MUESTRA = 2048;
const ESPACIOS_TABULADOR = '    ';
const CODIGO = /\.(py|js|mjs|cjs|ts|json|xml|html?|css|java|c|h|cpp|hpp|cs|go|rs|php|rb|sh|bat|cmd|ps1|sql|ini|cfg|conf|yaml|yml|toml|csv|pas|lua|pl|kt|swift|r|m)$/i;

// Por la extensión: lo que no es .txt ni texto sin más se pinta como código
export function esCodigo(nombre = '') {
    return CODIGO.test(nombre);
}

// Sin bytes nulos ni apenas caracteres de control: lo que no es texto (imágenes, PDF, ejecutables) los tiene enseguida
export function pareceTexto(bytes) {
    const muestra = bytes.subarray(0, MUESTRA);
    if (!muestra.length) {
        return false;
    }
    if ((muestra[0] === 0xff && muestra[1] === 0xfe) || (muestra[0] === 0xfe && muestra[1] === 0xff)) {
        return true;
    }
    let raros = 0;
    for (const b of muestra) {
        if (b === 0) {
            return false;
        }
        if (b < 0x20 && b !== 9 && b !== 10 && b !== 12 && b !== 13 && b !== 27) {
            raros++;
        }
    }
    return raros / muestra.length < 0.02;
}

// UTF-16 con BOM, UTF-8 (con o sin BOM) y, si no es UTF-8 válido, Windows-1252 (el «ANSI» de siempre)
export function decodificarTexto(bytes) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    }
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        return new TextDecoder('windows-1252').decode(bytes);
    }
}

export function textoAHtml(bytes, { codigo = false } = {}) {
    const texto = decodificarTexto(bytes).replace(/\r\n?/g, '\n');
    const css = `html, body { margin: 0; } body { padding: ${MARGEN}pt; }
pre { margin: 0; white-space: pre-wrap; word-wrap: break-word; font-family: ${codigo ? 'monospace' : 'sans-serif'}; font-size: ${codigo ? 9.5 : 11}pt; line-height: 1.35; }
hr.salto { page-break-after: always; border: 0; height: 0; margin: 0; }`;
    const bloques = texto.split('\f').map((bloque) => `<pre>${escapar(bloque).replace(/\t/g, ESPACIOS_TABULADOR)}</pre>`);
    return [{ html: paginaHtml(css, bloques.join('<hr class="salto">')), ancho: A4[0], alto: A4[1], em: 11 }];
}
