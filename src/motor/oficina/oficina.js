// Fecha: 2026-10-12
// Ruta: /src/motor/oficina/oficina.js
// Conversión de documentos (.docx, .xlsx, .pptx, .rtf, .txt y archivos de código) a PDF dentro del worker
// Detecta el formato por el contenido, lo pasa a HTML y MuPDF maqueta ese HTML en páginas PDF
// Notas: todo ocurre en el dispositivo; el documento no se envía a ningún sitio.
//        El tipo se mira en el contenido y no por la extensión: Android renombra a .pdf lo que abre con la app.

import * as mupdf from 'mupdf';
import { abrirZip, detectarTipo } from './comun.js';
import { wordAHtml } from './word.js';
import { excelAHtml } from './excel.js';
import { presentacionAHtml } from './presentacion.js';
import { rtfAHtml } from './rtf.js';
import { textoAHtml, esCodigo, pareceTexto } from './texto.js';

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

// 'zip' (Office), 'rtf', 'texto' o null según los primeros bytes
export function detectarFormato(bytes) {
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4) {
        return 'zip';
    }
    if (bytes[0] === 0x7b && bytes[1] === 0x5c && bytes[2] === 0x72 && bytes[3] === 0x74 && bytes[4] === 0x66) {
        return 'rtf';
    }
    return pareceTexto(bytes) ? 'texto' : null;
}

async function officeAHtml(bytes, { idioma, textos }) {
    const archivos = await abrirZip(bytes);
    const tipo = detectarTipo(archivos);
    if (!tipo) {
        throw new Error('TIPO');
    }
    const documentos = tipo === 'word' ? await wordAHtml(bytes, archivos)
        : tipo === 'excel' ? excelAHtml(archivos, { idioma, textos })
            : presentacionAHtml(archivos);
    return { tipo, documentos };
}

// nombre: solo para distinguir el código del texto corriente
// textos: cadenas ya traducidas que van dentro del PDF (hoja vacía, filas omitidas, verdadero/falso)
export async function convertirOficina({ buffer, nombre = '', idioma, textos }) {
    const bytes = new Uint8Array(buffer);
    const formato = detectarFormato(bytes);
    if (!formato) {
        throw new Error('TIPO');
    }
    const { tipo, documentos } = formato === 'zip' ? await officeAHtml(bytes, { idioma, textos })
        : formato === 'rtf' ? { tipo: 'rtf', documentos: rtfAHtml(bytes) }
            : { tipo: 'texto', documentos: textoAHtml(bytes, { codigo: esCodigo(nombre) }) };
    const { bytes: pdf, paginas } = htmlAPdf(documentos);
    return { bytes: pdf, tipo, paginas, _transferir: [pdf.buffer] };
}
