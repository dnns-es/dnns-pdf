// Fecha: 2026-10-12
// Ruta: /src/motor/anotaciones.js
// Anotaciones dentro del worker de MuPDF
// Crea, lista, modifica y borra anotaciones estándar PDF, con deshacer/rehacer por el journal de MuPDF
// Notas: corre dentro del worker; recibe la función que da el documento abierto.
//        Las coordenadas son puntos PDF con origen arriba a la izquierda, como las de la capa de texto.
//        El id de una anotación es el número de objeto PDF (estable aunque se borren otras).

import * as mupdf from 'mupdf';

const FUENTE_TEXTO = 'Helv';
const NOMBRE_FUENTE_PDF = 'Helvetica-Bold';
const MARGEN_SELLO = 8;

// Los tipos que crea la UI y la etiqueta que llevan en el historial
const TIPOS = {
    resaltar: 'Highlight',
    subrayar: 'Underline',
    tachar: 'StrikeOut',
    nota: 'Text',
    lapiz: 'Ink',
    rectangulo: 'Square',
    circulo: 'Circle',
    linea: 'Line',
    flecha: 'Line',
    texto: 'FreeText',
    sello: 'Stamp'
};

const MOVIBLES = new Set(['Text', 'FreeText', 'Stamp', 'Square', 'Circle']);

export function crearModuloAnotaciones(exigirDocumento) {
    // hayCambios: hay algo sin descargar. modificado: el documento ya no es el archivo original.
    let hayCambios = false;
    let modificado = false;
    const marcarCambio = () => {
        hayCambios = true;
        modificado = true;
    };

    function conPagina(numero, trabajo) {
        const pagina = exigirDocumento().loadPage(numero);
        try {
            return trabajo(pagina);
        } finally {
            pagina.destroy();
        }
    }

    function buscarAnotacion(pagina, id) {
        const anotacion = pagina.getAnnotations().find((a) => a.getObject().asIndirect() === id);
        if (!anotacion) {
            throw new Error(`No existe la anotación ${id}`);
        }
        return anotacion;
    }

    function resumen(anotacion) {
        const tipo = anotacion.getType();
        const datos = {
            id: anotacion.getObject().asIndirect(),
            tipo,
            limites: anotacion.getBounds(),
            contenido: anotacion.getContents() || '',
            autor: anotacion.getAuthor?.() || '',
            color: anotacion.getColor(),
            opacidad: anotacion.getOpacity(),
            grosor: anotacion.hasBorder() ? anotacion.getBorderWidth() : 0,
            // Lápiz, líneas y marcas de texto llevan sus propios puntos: mover el Rect no las movería
            movible: MOVIBLES.has(tipo)
        };
        if (tipo === 'Line') {
            // MuPDF.js devuelve { start, end }
            const { end } = anotacion.getLineEndingStyles();
            datos.flecha = Boolean(end) && end !== 'None';
        }
        return datos;
    }

    function aplicarDatos(anotacion, datos, tipo) {
        if (datos.quads) {
            anotacion.setQuadPoints(datos.quads);
        }
        if (datos.trazos) {
            anotacion.setInkList(datos.trazos);
        }
        if (datos.rect) {
            anotacion.setRect(datos.rect);
        }
        if (datos.linea) {
            anotacion.setLine(datos.linea[0], datos.linea[1]);
        }
        if (datos.flecha !== undefined && tipo === 'Line') {
            anotacion.setLineEndingStyles('None', datos.flecha ? 'ClosedArrow' : 'None');
        }
        // En un cuadro de texto /C es el fondo: el color elegido va a las letras (DA)
        if (datos.color && tipo !== 'FreeText') {
            anotacion.setColor(datos.color);
        }
        if (datos.colorInterior !== undefined) {
            anotacion.setInteriorColor(datos.colorInterior ?? []);
        }
        if (datos.grosor !== undefined && anotacion.hasBorder()) {
            anotacion.setBorderWidth(datos.grosor);
        }
        if (datos.opacidad !== undefined) {
            anotacion.setOpacity(datos.opacidad);
        }
        if (datos.icono) {
            anotacion.setIcon(datos.icono);
        }
        if (datos.tamanoFuente !== undefined && tipo === 'FreeText') {
            anotacion.setDefaultAppearance(FUENTE_TEXTO, datos.tamanoFuente, datos.color ?? [0, 0, 0]);
        }
        if (datos.contenido !== undefined) {
            anotacion.setContents(datos.contenido);
        }
        if (datos.autor) {
            anotacion.setAuthor(datos.autor);
        }
        anotacion.setModificationDate(new Date());
        anotacion.update();
        // La apariencia propia del sello va después de update(): si no, MuPDF la cambia por la suya
        if (datos.sello) {
            dibujarSello(anotacion, datos.sello, datos.color ?? [0.8, 0, 0]);
        } else if (datos.rect && tipo === 'Stamp' && anotacion.getContents()) {
            // Al mover un sello propio hay que rehacer su apariencia en el sitio nuevo
            dibujarSello(anotacion, anotacion.getContents(), anotacion.getColor());
        }
    }

    // Los sellos de MuPDF vienen en inglés; dibujamos el texto en un recuadro como apariencia propia
    function dibujarSello(anotacion, texto, color) {
        const [x0, y0, x1, y1] = anotacion.getRect();
        const ancho = Math.max(1, x1 - x0);
        const alto = Math.max(1, y1 - y0);
        const fuenteMupdf = new mupdf.Font(NOMBRE_FUENTE_PDF);
        // Ancho real del texto con tamaño 1, para que quepa centrado dentro del recuadro
        let anchoUnidad = 0;
        for (const caracter of texto) {
            anchoUnidad += fuenteMupdf.advanceGlyph(fuenteMupdf.encodeCharacter(caracter.codePointAt(0)), 0);
        }
        const tamano = Math.min(alto * 0.6, (ancho - MARGEN_SELLO * 2) / Math.max(0.1, anchoUnidad));
        const textoPdf = texto.replace(/[\\()]/g, '\\$&');
        const [r, g, b] = color;
        const contenido = [
            'q',
            `${r} ${g} ${b} RG ${r} ${g} ${b} rg`,
            `3 w 1.5 1.5 ${ancho - 3} ${alto - 3} re S`,
            `BT /F1 ${tamano.toFixed(2)} Tf`,
            `${((ancho - anchoUnidad * tamano) / 2).toFixed(2)} ${((alto - tamano * 0.7) / 2).toFixed(2)} Td`,
            `(${textoPdf}) Tj ET Q`
        ].join('\n');
        const doc = exigirDocumento();
        const fuente = doc.addSimpleFont(fuenteMupdf, 'Latin');
        const recursos = doc.newDictionary();
        const fuentes = doc.newDictionary();
        fuentes.put('F1', fuente);
        recursos.put('Font', fuentes);
        anotacion.setAppearance(null, null, mupdf.Matrix.identity, [0, 0, ancho, alto], recursos, contenido);
    }

    return {
        hayCambios: () => hayCambios,
        modificado: () => modificado,

        activarHistorial() {
            const doc = exigirDocumento();
            if (doc.isPDF?.() !== false && typeof doc.enableJournal === 'function') {
                doc.enableJournal();
            }
            hayCambios = false;
            modificado = false;
        },

        listar({ pagina }) {
            return conPagina(pagina, (p) => p.getAnnotations().map(resumen));
        },

        listarTodas() {
            const doc = exigirDocumento();
            const total = doc.countPages();
            const todas = [];
            for (let n = 0; n < total; n++) {
                for (const datos of conPagina(n, (p) => p.getAnnotations().map(resumen))) {
                    todas.push({ pagina: n, ...datos });
                }
            }
            return todas;
        },

        crear({ pagina, herramienta, datos }) {
            const tipo = TIPOS[herramienta];
            if (!tipo) {
                throw new Error(`Herramienta desconocida: ${herramienta}`);
            }
            const doc = exigirDocumento();
            doc.beginOperation(herramienta);
            try {
                return conPagina(pagina, (p) => {
                    const anotacion = p.createAnnotation(tipo);
                    anotacion.setCreationDate(new Date());
                    aplicarDatos(anotacion, { flecha: herramienta === 'flecha', ...datos }, tipo);
                    marcarCambio();
                    return resumen(anotacion);
                });
            } finally {
                doc.endOperation();
            }
        },

        modificar({ pagina, id, datos }) {
            const doc = exigirDocumento();
            doc.beginOperation('modificar');
            try {
                return conPagina(pagina, (p) => {
                    const anotacion = buscarAnotacion(p, id);
                    aplicarDatos(anotacion, datos, anotacion.getType());
                    marcarCambio();
                    return resumen(anotacion);
                });
            } finally {
                doc.endOperation();
            }
        },

        borrar({ pagina, id }) {
            const doc = exigirDocumento();
            doc.beginOperation('borrar');
            try {
                conPagina(pagina, (p) => p.deleteAnnotation(buscarAnotacion(p, id)));
                marcarCambio();
                return true;
            } finally {
                doc.endOperation();
            }
        },

        // Puntos a y b en coordenadas de página: devuelve los cuadriláteros del texto entre ambos
        quadsEntre({ pagina, a, b }) {
            return conPagina(pagina, (p) => {
                const texto = p.toStructuredText('preserve-whitespace');
                try {
                    return texto.highlight(a, b);
                } finally {
                    texto.destroy();
                }
            });
        },

        historial() {
            const doc = exigirDocumento();
            return { puedeDeshacer: doc.canUndo(), puedeRehacer: doc.canRedo() };
        },

        deshacer() {
            const doc = exigirDocumento();
            if (doc.canUndo()) {
                doc.undo();
                marcarCambio();
            }
            return { puedeDeshacer: doc.canUndo(), puedeRehacer: doc.canRedo() };
        },

        rehacer() {
            const doc = exigirDocumento();
            if (doc.canRedo()) {
                doc.redo();
                marcarCambio();
            }
            return { puedeDeshacer: doc.canUndo(), puedeRehacer: doc.canRedo() };
        },

        // Guardado incremental: añade los cambios al final del PDF original, rápido y compatible
        guardar() {
            const doc = exigirDocumento();
            let buffer;
            try {
                buffer = doc.saveToBuffer('incremental');
            } catch {
                buffer = doc.saveToBuffer('');
            }
            const bytes = buffer.asUint8Array().slice();
            buffer.destroy();
            hayCambios = false;
            return { bytes, _transferir: [bytes.buffer] };
        }
    };
}
