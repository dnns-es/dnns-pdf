// Fecha: 2026-10-13
// Ruta: /src/motor/textoColocado.js
// PDF nuevo con texto colocado: cada trozo de línea en su sitio y con su tamaño (escáner «Solo texto»)
// Así la hoja sale como el papel fotografiado (cabecera, fecha a la derecha, firma abajo) pero con texto limpio
// Notas: Helvetica en WinAnsi (español e inglés, sin incrustar fuentes). Cada trozo se estrecha o ensancha un
//        poco (Tz) para ocupar el mismo ancho que en el papel. Las posiciones llegan con el origen arriba.

import * as mupdf from 'mupdf';
import { fuenteHelvetica, textoPdf, anchoTexto, num } from './contenido.js';

// Lo más que se deforma un trozo para igualar su ancho al del papel
const ESTIRAR_MINIMO = 0.7;
const ESTIRAR_MAXIMO = 1.3;

function contenidoDe(trozos, alto) {
    const operaciones = ['BT'];
    for (const { texto, x0, x1, base, tamano } of trozos) {
        const limpio = texto.trim();
        if (!limpio || !(tamano > 0)) {
            continue;
        }
        const natural = anchoTexto(limpio) * tamano;
        const estirar = natural > 0 ? Math.min(ESTIRAR_MAXIMO, Math.max(ESTIRAR_MINIMO, (x1 - x0) / natural)) : 1;
        operaciones.push(`/F1 ${num(tamano)} Tf ${num(estirar * 100)} Tz 1 0 0 1 ${num(x0)} ${num(alto - base)} Tm (${textoPdf(limpio)}) Tj`);
    }
    operaciones.push('ET');
    return operaciones.join('\n');
}

// paginas: [{ ancho, alto, trozos: [{ texto, x0, x1, base, tamano }] }] en puntos -> bytes del PDF
export function pdfDeTextoColocado({ paginas }) {
    const doc = new mupdf.PDFDocument();
    try {
        const fuente = doc.addSimpleFont(fuenteHelvetica(), 'Latin');
        for (const { ancho, alto, trozos } of paginas) {
            const recursos = doc.addObject({ Font: { F1: fuente } });
            doc.insertPage(-1, doc.addPage([0, 0, ancho, alto], 0, recursos, contenidoDe(trozos, alto)));
        }
        const buffer = doc.saveToBuffer('garbage=compact');
        const bytes = buffer.asUint8Array().slice();
        buffer.destroy();
        return { bytes, _transferir: [bytes.buffer] };
    } finally {
        doc.destroy();
    }
}
