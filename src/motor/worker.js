// Fecha: 2026-10-12
// Ruta: /src/motor/worker.js
// Web Worker que aloja MuPDF.js
// Abre el documento, pinta páginas, extrae texto e índice y busca, todo fuera del hilo principal
// Notas: protocolo { id, accion, datos } -> { id, ok, resultado | error }.
//        Una acción puede devolver { _transferir: [...] } para ceder buffers/bitmaps sin copiarlos.
//        Solo hay un documento abierto a la vez.

import * as mupdf from 'mupdf';

const MAX_RESULTADOS_BUSQUEDA = 2000;

let documento = null;

function exigirDocumento() {
    if (!documento) {
        throw new Error('No hay ningún documento abierto');
    }
    return documento;
}

function cerrarDocumento() {
    documento?.destroy();
    documento = null;
}

// Usar la página y liberarla siempre: la memoria del .wasm no la recoge el recolector de JS
function conPagina(numero, trabajo) {
    const pagina = exigirDocumento().loadPage(numero);
    try {
        return trabajo(pagina);
    } finally {
        pagina.destroy();
    }
}

function datosDocumento() {
    const doc = exigirDocumento();
    const total = doc.countPages();
    const tamanos = [];
    for (let n = 0; n < total; n++) {
        const [x0, y0, x1, y1] = conPagina(n, (pagina) => pagina.getBounds());
        tamanos.push([x1 - x0, y1 - y0]);
    }
    return { paginas: total, tamanos, titulo: doc.getMetaData('info:Title') || '' };
}

// MuPDF da RGB sin alfa; ImageData necesita RGBA
function rgbARgba(pixmap) {
    const ancho = pixmap.getWidth();
    const alto = pixmap.getHeight();
    const origen = pixmap.getPixels();
    const paso = pixmap.getStride();
    const destino = new Uint8ClampedArray(ancho * alto * 4);
    let d = 0;
    for (let y = 0; y < alto; y++) {
        let o = y * paso;
        for (let x = 0; x < ancho; x++) {
            destino[d++] = origen[o++];
            destino[d++] = origen[o++];
            destino[d++] = origen[o++];
            destino[d++] = 255;
        }
    }
    return new ImageData(destino, ancho, alto);
}

async function pintarPagina(numero, escala) {
    const imagen = conPagina(numero, (pagina) => {
        const pixmap = pagina.toPixmap(mupdf.Matrix.scale(escala, escala), mupdf.ColorSpace.DeviceRGB, false, true);
        try {
            return rgbARgba(pixmap);
        } finally {
            pixmap.destroy();
        }
    });
    return createImageBitmap(imagen);
}

function lineasDeTexto(numero) {
    return conPagina(numero, (pagina) => {
        const texto = pagina.toStructuredText('preserve-whitespace');
        try {
            const datos = JSON.parse(texto.asJSON());
            const lineas = [];
            for (const bloque of datos.blocks) {
                for (const linea of bloque.lines ?? []) {
                    // Las líneas verticales (wmode 1) no se pueden seleccionar con este método simple
                    if (linea.wmode === 0 && linea.text.trim()) {
                        const { x, y, w, h } = linea.bbox;
                        lineas.push({ x, y, w, h, texto: linea.text });
                    }
                }
            }
            return lineas;
        } finally {
            texto.destroy();
        }
    });
}

function simplificarIndice(elementos) {
    return (elementos ?? []).map((elemento) => ({
        titulo: elemento.title ?? '',
        pagina: Number.isInteger(elemento.page) ? elemento.page : resolverDestino(elemento.uri),
        hijos: simplificarIndice(elemento.down)
    }));
}

function resolverDestino(uri) {
    if (!uri) {
        return -1;
    }
    try {
        return exigirDocumento().resolveLink(uri);
    } catch {
        return -1;
    }
}

// Un cuadrilátero de MuPDF son 4 esquinas; para resaltar basta su rectángulo envolvente
function quadARect(quad) {
    const xs = [quad[0], quad[2], quad[4], quad[6]];
    const ys = [quad[1], quad[3], quad[5], quad[7]];
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function buscarTexto(aguja) {
    const doc = exigirDocumento();
    const resultados = [];
    const total = doc.countPages();
    for (let n = 0; n < total && resultados.length < MAX_RESULTADOS_BUSQUEDA; n++) {
        const encontrados = conPagina(n, (pagina) => pagina.search(aguja, {}));
        for (const quads of encontrados) {
            resultados.push({ pagina: n, rects: quads.map(quadARect) });
        }
    }
    return { resultados: resultados.slice(0, MAX_RESULTADOS_BUSQUEDA), limitado: resultados.length >= MAX_RESULTADOS_BUSQUEDA };
}

async function imagenParaImprimir(numero, escala) {
    const bitmap = await pintarPagina(numero, escala);
    const lienzo = new OffscreenCanvas(bitmap.width, bitmap.height);
    lienzo.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close();
    return lienzo.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
}

const acciones = {
    comprobar() {
        const prueba = new mupdf.PDFDocument();
        const paginas = prueba.countPages();
        prueba.destroy();
        return { version: __VERSION_MUPDF__, paginas };
    },

    abrir({ buffer }) {
        cerrarDocumento();
        documento = mupdf.Document.openDocument(buffer, 'application/pdf');
        if (documento.needsPassword()) {
            return { necesitaClave: true };
        }
        return { necesitaClave: false, ...datosDocumento() };
    },

    autenticar({ clave }) {
        // authenticatePassword devuelve 0 si la clave no vale
        if (exigirDocumento().authenticatePassword(clave) === 0) {
            return { ok: false };
        }
        return { ok: true, ...datosDocumento() };
    },

    async renderizar({ pagina, escala }) {
        const bitmap = await pintarPagina(pagina, escala);
        return { bitmap, _transferir: [bitmap] };
    },

    texto({ pagina }) {
        return lineasDeTexto(pagina);
    },

    indice() {
        return simplificarIndice(exigirDocumento().loadOutline());
    },

    buscar({ texto }) {
        return buscarTexto(texto);
    },

    async imprimir({ pagina, escala }) {
        return { imagen: await imagenParaImprimir(pagina, escala) };
    },

    cerrar() {
        cerrarDocumento();
        return true;
    }
};

self.addEventListener('message', async (evento) => {
    const { id, accion, datos } = evento.data;
    const manejador = acciones[accion];
    if (!manejador) {
        self.postMessage({ id, ok: false, error: `Acción desconocida: ${accion}` });
        return;
    }
    try {
        const resultado = await manejador(datos ?? {});
        const transferir = resultado?._transferir ?? [];
        if (resultado?._transferir) {
            delete resultado._transferir;
        }
        self.postMessage({ id, ok: true, resultado }, transferir);
    } catch (error) {
        self.postMessage({ id, ok: false, error: error?.message ?? String(error) });
    }
});

// El import de mupdf ya resolvió su await, así que el motor está listo
self.postMessage({ tipo: 'listo' });
