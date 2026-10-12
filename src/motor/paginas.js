// Fecha: 2026-10-12
// Ruta: /src/motor/paginas.js
// Operaciones con páginas dentro del worker de MuPDF
// Rotar, borrar, duplicar, mover, insertar (en blanco, de otro PDF o imágenes), recortar, extraer y unir
// Notas: las que cambian el documento abierto van en una operación del journal, así entran en
//        Deshacer/Rehacer igual que las anotaciones. Extraer y unir crean un PDF nuevo y devuelven sus bytes.
//        Las páginas se numeran desde 0 y los rectángulos van en puntos con origen arriba a la izquierda.

import * as mupdf from 'mupdf';

// A4 en puntos PDF: tamaño de las páginas en blanco y de las imágenes en modo «A4»
const A4 = [595.28, 841.89];
const MARGEN_IMAGEN_A4 = 28;

export function crearModuloPaginas(exigirDocumento, marcarCambio) {
    function exigirPdf() {
        const doc = exigirDocumento();
        if (!(doc instanceof mupdf.PDFDocument)) {
            throw new Error('Este documento no se puede modificar');
        }
        return doc;
    }

    // Ejecuta cambios dentro de una operación del journal (una sola entrada de Deshacer)
    function enOperacion(nombre, trabajo) {
        const doc = exigirPdf();
        doc.beginOperation(nombre);
        try {
            const resultado = trabajo(doc);
            marcarCambio();
            return resultado;
        } finally {
            doc.endOperation();
        }
    }

    // De mayor a menor: así borrar o insertar no desplaza los números que faltan por tratar
    const descendente = (paginas) => [...new Set(paginas)].sort((a, b) => b - a);

    function bytesDe(doc) {
        const buffer = doc.saveToBuffer('garbage=compact');
        const bytes = buffer.asUint8Array().slice();
        buffer.destroy();
        return { bytes, _transferir: [bytes.buffer] };
    }

    // Página con una imagen: ajustada a A4 con margen, o del tamaño exacto de la imagen (1 px = 1 punto a 72 ppp)
    function paginaDeImagen(doc, bytes, modo) {
        const imagen = new mupdf.Image(bytes);
        const anchoImg = imagen.getWidth() * (72 / (imagen.getXResolution() || 72));
        const altoImg = imagen.getHeight() * (72 / (imagen.getYResolution() || 72));
        let pagina = [anchoImg, altoImg];
        let caja = [0, 0, anchoImg, altoImg];
        if (modo === 'a4') {
            // Orientación de la hoja según la imagen
            pagina = anchoImg > altoImg ? [A4[1], A4[0]] : [...A4];
            const escala = Math.min((pagina[0] - MARGEN_IMAGEN_A4 * 2) / anchoImg, (pagina[1] - MARGEN_IMAGEN_A4 * 2) / altoImg, 1);
            const w = anchoImg * escala;
            const h = altoImg * escala;
            caja = [(pagina[0] - w) / 2, (pagina[1] - h) / 2, w, h];
        }
        const recursos = doc.addObject({ XObject: { Im0: doc.addImage(imagen) } });
        const [x, y, w, h] = caja;
        const contenido = `q ${w.toFixed(3)} 0 0 ${h.toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} cm /Im0 Do Q`;
        imagen.destroy?.();
        return doc.addPage([0, 0, pagina[0], pagina[1]], 0, recursos, contenido);
    }

    function abrirOtro(buffer) {
        const otro = mupdf.Document.openDocument(buffer, 'application/pdf');
        if (otro.needsPassword()) {
            otro.destroy();
            throw new Error('PROTEGIDO');
        }
        return otro;
    }

    return {
        rotar({ paginas, grados }) {
            return enOperacion('rotar', (doc) => {
                for (const n of paginas) {
                    const objeto = doc.findPage(n);
                    const actual = objeto.getInheritable('Rotate');
                    const previo = actual.isNull() ? 0 : actual.asNumber();
                    objeto.put('Rotate', (((previo + grados) % 360) + 360) % 360);
                }
            });
        },

        borrar({ paginas }) {
            const doc = exigirPdf();
            if (new Set(paginas).size >= doc.countPages()) {
                throw new Error('TODAS');
            }
            return enOperacion('borrar', () => {
                for (const n of descendente(paginas)) {
                    doc.deletePage(n);
                }
            });
        },

        // Cada copia queda justo después de su original
        duplicar({ paginas }) {
            return enOperacion('duplicar', (doc) => {
                for (const n of descendente(paginas)) {
                    doc.graftPage(n + 1, doc, n);
                }
            });
        },

        // orden: la lista completa de páginas en su orden nuevo (p. ej. [2, 0, 1])
        reordenar({ orden }) {
            return enOperacion('reordenar', (doc) => doc.rearrangePages(orden));
        },

        insertarBlanco({ en, tamano }) {
            return enOperacion('insertarBlanco', (doc) => {
                const [ancho, alto] = tamano ?? A4;
                doc.insertPage(en, doc.addPage([0, 0, ancho, alto], 0, {}, ''));
            });
        },

        insertarPdf({ en, buffer }) {
            const otro = abrirOtro(buffer);
            try {
                return enOperacion('insertarPdf', (doc) => {
                    const mapa = doc.newGraftMap();
                    const total = otro.countPages();
                    for (let i = 0; i < total; i++) {
                        mapa.graftPage(en < 0 ? -1 : en + i, otro, i);
                    }
                    return total;
                });
            } finally {
                otro.destroy();
            }
        },

        insertarImagenes({ en, imagenes, modo }) {
            return enOperacion('insertarImagenes', (doc) => {
                imagenes.forEach((bytes, i) => doc.insertPage(en < 0 ? -1 : en + i, paginaDeImagen(doc, bytes, modo)));
                return imagenes.length;
            });
        },

        // rect: [x0, y0, x1, y1] sobre la página tal como se ve; null quita el recorte
        recortar({ paginas, rect }) {
            return enOperacion('recortar', (doc) => {
                for (const n of paginas) {
                    if (!rect) {
                        doc.findPage(n).delete('CropBox');
                        continue;
                    }
                    const pagina = doc.loadPage(n);
                    try {
                        const [bx0, by0, bx1, by1] = pagina.getBounds();
                        // En otras páginas de distinto tamaño el recuadro se ajusta a lo que haya
                        const r = [Math.max(bx0, rect[0]), Math.max(by0, rect[1]), Math.min(bx1, rect[2]), Math.min(by1, rect[3])];
                        if (r[2] - r[0] > 1 && r[3] - r[1] > 1) {
                            pagina.setPageBox('CropBox', r);
                        }
                    } finally {
                        pagina.destroy();
                    }
                }
            });
        },

        // PDF nuevo con esas páginas (dividir y extraer); no toca el documento abierto
        extraer({ paginas }) {
            const origen = exigirPdf();
            const nuevo = new mupdf.PDFDocument();
            try {
                const mapa = nuevo.newGraftMap();
                for (const n of paginas) {
                    mapa.graftPage(-1, origen, n);
                }
                return bytesDe(nuevo);
            } finally {
                nuevo.destroy();
            }
        },

        // PDF nuevo con los documentos en ese orden; cada pieza es { pdf } o { imagen }
        unir({ piezas, modo }) {
            const nuevo = new mupdf.PDFDocument();
            try {
                for (const pieza of piezas) {
                    if (pieza.imagen) {
                        nuevo.insertPage(-1, paginaDeImagen(nuevo, pieza.imagen, modo));
                        continue;
                    }
                    const otro = abrirOtro(pieza.pdf);
                    try {
                        const mapa = nuevo.newGraftMap();
                        for (let i = 0; i < otro.countPages(); i++) {
                            mapa.graftPage(-1, otro, i);
                        }
                    } finally {
                        otro.destroy();
                    }
                }
                return bytesDe(nuevo);
            } finally {
                nuevo.destroy();
            }
        }
    };
}
