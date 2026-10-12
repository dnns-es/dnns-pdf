// Fecha: 2026-10-12
// Ruta: /src/motor/oficina/oficina.js
// Conversión de documentos de Office (.docx, .xlsx, .pptx) a PDF dentro del worker
// Detecta el tipo por el contenido del ZIP, lo pasa a HTML y MuPDF maqueta ese HTML en páginas PDF
// Notas: todo ocurre en el dispositivo; el documento no se envía a ningún sitio.
//        El tipo se mira dentro del ZIP y no por la extensión: Android renombra a .pdf lo que abre con la app.

import * as mupdf from 'mupdf';
import { abrirZip, detectarTipo } from './comun.js';
import { wordAHtml } from './word.js';
import { excelAHtml } from './excel.js';
import { presentacionAHtml } from './presentacion.js';

// documentos: [{ html, ancho, alto, em }] -> bytes de un PDF con todas sus páginas seguidas
export function htmlAPdf(documentos) {
    const salida = new mupdf.Buffer();
    const escritor = new mupdf.DocumentWriter(salida, 'pdf', '');
    const codificador = new TextEncoder();
    let paginas = 0;
    for (const { html, ancho, alto, em = 11 } of documentos) {
        const doc = mupdf.Document.openDocument(codificador.encode(html), 'text/html');
        try {
            doc.layout(ancho, alto, em);
            const total = doc.countPages();
            for (let n = 0; n < total; n++) {
                const pagina = doc.loadPage(n);
                try {
                    const dispositivo = escritor.beginPage(pagina.getBounds());
                    pagina.run(dispositivo, mupdf.Matrix.identity);
                    escritor.endPage();
                    paginas++;
                } finally {
                    pagina.destroy();
                }
            }
        } finally {
            doc.destroy();
        }
    }
    escritor.close();
    const bytes = salida.asUint8Array().slice();
    salida.destroy();
    return { bytes, paginas };
}

// textos: cadenas ya traducidas que van dentro del PDF (hoja vacía, filas omitidas, verdadero/falso)
export async function convertirOficina({ buffer, idioma, textos }) {
    const bytes = new Uint8Array(buffer);
    const archivos = await abrirZip(bytes);
    const tipo = detectarTipo(archivos);
    if (!tipo) {
        throw new Error('TIPO');
    }
    const documentos = tipo === 'word' ? await wordAHtml(bytes, archivos)
        : tipo === 'excel' ? excelAHtml(archivos, { idioma, textos })
            : presentacionAHtml(archivos);
    const { bytes: pdf, paginas } = htmlAPdf(documentos);
    return { bytes: pdf, tipo, paginas, _transferir: [pdf.buffer] };
}
