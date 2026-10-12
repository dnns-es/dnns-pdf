// Fecha: 2026-10-12
// Ruta: /src/motor/ocr.js
// OCR dentro del worker de MuPDF: añade el texto reconocido como capa invisible sobre la página
// La imagen de la página no cambia; el texto queda debajo, sin verse, para buscar, seleccionar y copiar
// Notas: el reconocimiento (Tesseract) se hace fuera, en el hilo de la interfaz; aquí solo llegan las palabras
//        con su caja en puntos de página (origen arriba a la izquierda). Se escribe con Helvetica en WinAnsi
//        y modo de texto 3 (invisible), ajustando cada palabra a su caja. Pasa por el journal: se puede deshacer.

import { fuenteHelvetica, textoPdf, anchoTexto, num, matrizPagina, ponerRecurso, anadirContenido } from './contenido.js';

const NOMBRE_FUENTE = 'FOCR';
// Parte de la caja de una palabra que queda bajo la línea base (aprox.: descendentes)
const BAJO_LINEA = 0.2;

function contenidoDe(palabras, deFitzAPdf) {
    const lineas = [`q ${deFitzAPdf.map(num).join(' ')} cm BT 3 Tr /${NOMBRE_FUENTE} 1 Tf`];
    for (const { texto, x0, y0, x1, y1 } of palabras) {
        const limpio = texto.trim();
        const alto = y1 - y0;
        if (!limpio || alto <= 0 || x1 <= x0) {
            continue;
        }
        const estirar = (x1 - x0) / ((anchoTexto(limpio) || 0.5) * alto);
        const base = y1 - alto * BAJO_LINEA;
        // En el espacio de la página la y crece hacia abajo: la matriz de texto la da la vuelta
        lineas.push(`${num(alto * estirar)} 0 0 ${num(-alto)} ${num(x0)} ${num(base)} Tm (${textoPdf(limpio)}) Tj`);
    }
    lineas.push('ET Q');
    return lineas.join('\n');
}

export function crearModuloOcr(exigirDocumento, marcarCambio) {
    return {
        // palabras: [{ texto, x0, y0, x1, y1 }] en puntos de página
        anadirTexto({ pagina, palabras }) {
            const doc = exigirDocumento();
            if (!palabras?.length) {
                return { palabras: 0 };
            }
            doc.beginOperation('OCR');
            try {
                const objetoPagina = doc.findPage(pagina);
                const { matriz } = matrizPagina(doc, pagina);
                ponerRecurso(doc, objetoPagina, 'Font', NOMBRE_FUENTE, doc.addSimpleFont(fuenteHelvetica(), 'Latin'));
                anadirContenido(doc, objetoPagina, contenidoDe(palabras, matriz));
                marcarCambio();
                return { palabras: palabras.length };
            } finally {
                doc.endOperation();
            }
        }
    };
}
