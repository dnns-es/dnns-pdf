// Fecha: 2026-10-12
// Ruta: /src/motor/redactar.js
// Ocultar datos de verdad (redacción) dentro del worker de MuPDF
// Las zonas a ocultar son anotaciones Redact (se marcan a mano con la herramienta «Ocultar» o buscando un
// texto); al aplicar, MuPDF borra del archivo el texto, las imágenes y los dibujos que quedan debajo y deja
// un recuadro negro. Hasta guardar se puede deshacer.
// Notas: corre dentro del worker; pasa por el journal.

import * as mupdf from 'mupdf';

export function crearModuloRedactar(exigirDocumento, marcarCambio) {
    function enOperacion(nombre, trabajo) {
        const doc = exigirDocumento();
        doc.beginOperation(nombre);
        try {
            const resultado = trabajo(doc);
            marcarCambio();
            return resultado;
        } finally {
            doc.endOperation();
        }
    }

    function porPagina(trabajo) {
        const doc = exigirDocumento();
        const total = doc.countPages();
        for (let n = 0; n < total; n++) {
            const pagina = doc.loadPage(n);
            try {
                trabajo(pagina, n);
            } finally {
                pagina.destroy();
            }
        }
    }

    const esRedact = (anotacion) => anotacion.getType() === 'Redact';

    return {
        // Cuántas zonas hay marcadas para ocultar y en cuántas páginas
        pendientes() {
            let zonas = 0;
            let paginas = 0;
            porPagina((pagina) => {
                const enPagina = pagina.getAnnotations().filter(esRedact).length;
                zonas += enPagina;
                paginas += enPagina ? 1 : 0;
            });
            return { zonas, paginas };
        },

        // Marca para ocultar cada aparición del texto en todo el documento
        marcarBusqueda({ texto }) {
            const buscado = String(texto ?? '').trim();
            if (!buscado) {
                return { zonas: 0 };
            }
            return enOperacion('marcar para ocultar', () => {
                let zonas = 0;
                porPagina((pagina) => {
                    for (const quads of pagina.search(buscado)) {
                        const anotacion = pagina.createAnnotation('Redact');
                        anotacion.setQuadPoints(quads);
                        anotacion.update();
                        zonas++;
                    }
                });
                return { zonas };
            });
        },

        // Borra de verdad lo que hay bajo las zonas marcadas y pone recuadros negros
        aplicar() {
            return enOperacion('ocultar datos', () => {
                let paginas = 0;
                porPagina((pagina) => {
                    if (pagina.getAnnotations().some(esRedact)) {
                        pagina.applyRedactions(true, mupdf.PDFPage.REDACT_IMAGE_PIXELS,
                            mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED, mupdf.PDFPage.REDACT_TEXT_REMOVE);
                        paginas++;
                    }
                });
                return { paginas };
            });
        }
    };
}
