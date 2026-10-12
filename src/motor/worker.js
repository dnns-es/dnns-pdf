// Fecha: 2026-10-12
// Ruta: /src/motor/worker.js
// Web Worker que aloja MuPDF.js
// Abre el documento, pinta páginas, extrae texto e índice y busca, todo fuera del hilo principal
// Notas: protocolo { id, accion, datos } -> { id, ok, resultado | error }.
//        Las anotaciones y el historial viven en anotaciones.js; las operaciones de páginas, en paginas.js;
//        los formularios, en formularios.js.
//        Una acción puede devolver { _transferir: [...] } para ceder buffers/bitmaps sin copiarlos.
//        Solo hay un documento abierto a la vez.

import * as mupdf from 'mupdf';
import { crearModuloAnotaciones } from './anotaciones.js';
import { crearModuloPaginas } from './paginas.js';
import { crearModuloFormularios } from './formularios.js';
import { crearModuloSeguridad } from './seguridad.js';
import { comprimir } from './comprimir.js';
import { crearModuloOcr } from './ocr.js';
import { crearModuloMarcas } from './marcas.js';
import { crearModuloRedactar } from './redactar.js';
import { crearModuloEditar } from './editar.js';
import { crearModuloComparar } from './comparar.js';
import * as firmaDigital from './firmaDigital.js';
import { convertirOficina } from './oficina/oficina.js';

const MAX_RESULTADOS_BUSQUEDA = 2000;

let documento = null;
const anotaciones = crearModuloAnotaciones(() => exigirDocumento());
const paginas = crearModuloPaginas(() => exigirDocumento(), () => anotaciones.marcarCambio());
const formularios = crearModuloFormularios(() => exigirDocumento(), () => anotaciones.marcarCambio());
const seguridad = crearModuloSeguridad(() => exigirDocumento());
const ocr = crearModuloOcr(() => exigirDocumento(), () => anotaciones.marcarCambio());
const marcas = crearModuloMarcas(() => exigirDocumento(), () => anotaciones.marcarCambio());
const redactar = crearModuloRedactar(() => exigirDocumento(), () => anotaciones.marcarCambio());
const editar = crearModuloEditar(() => exigirDocumento(), () => anotaciones.marcarCambio());
const comparar = crearModuloComparar(() => exigirDocumento());

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

// Número de páginas, tamaños y la identidad de cada página (su número de objeto PDF): con la
// identidad la interfaz sabe si un Deshacer cambió el orden aunque los tamaños sean iguales
function estructura() {
    const doc = exigirDocumento();
    const total = doc.countPages();
    const tamanos = [];
    const ids = [];
    for (let n = 0; n < total; n++) {
        const [x0, y0, x1, y1] = conPagina(n, (pagina) => pagina.getBounds());
        tamanos.push([x1 - x0, y1 - y0]);
        ids.push(doc instanceof mupdf.PDFDocument ? doc.findPage(n).asIndirect() : n);
    }
    return { paginas: total, tamanos, ids };
}

function datosDocumento() {
    return { ...estructura(), titulo: exigirDocumento().getMetaData('info:Title') || '' };
}

// Operación de páginas: devuelve la estructura nueva junto con el estado del historial
function cambiarPaginas(trabajo) {
    return (datos) => {
        const resultado = trabajo(datos);
        return { resultado, estructura: estructura(), ...anotaciones.historial() };
    };
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
        seguridad.registrarApertura(null, 0);
        if (documento.needsPassword()) {
            return { necesitaClave: true };
        }
        anotaciones.activarHistorial();
        return { necesitaClave: false, ...datosDocumento() };
    },

    autenticar({ clave }) {
        // authenticatePassword devuelve 0 si la clave no vale; 2 si es la de usuario, 4 si es la de propietario
        const nivel = exigirDocumento().authenticatePassword(clave);
        if (nivel === 0) {
            return { ok: false };
        }
        seguridad.registrarApertura(clave, nivel);
        anotaciones.activarHistorial();
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

    // Anotaciones e historial (ver anotaciones.js)
    'anotaciones:listar': (datos) => anotaciones.listar(datos),
    'anotaciones:listarTodas': () => anotaciones.listarTodas(),
    'anotaciones:crear': (datos) => anotaciones.crear(datos),
    'anotaciones:modificar': (datos) => anotaciones.modificar(datos),
    'anotaciones:borrar': (datos) => anotaciones.borrar(datos),
    'anotaciones:quadsEntre': (datos) => anotaciones.quadsEntre(datos),
    'historial:estado': () => anotaciones.historial(),
    // Deshacer puede afectar a páginas: siempre se manda la estructura para que la interfaz compare
    'historial:deshacer': () => ({ ...anotaciones.deshacer(), estructura: estructura() }),
    'historial:rehacer': () => ({ ...anotaciones.rehacer(), estructura: estructura() }),

    // Páginas (ver paginas.js)
    'paginas:rotar': cambiarPaginas((datos) => paginas.rotar(datos)),
    'paginas:borrar': cambiarPaginas((datos) => paginas.borrar(datos)),
    'paginas:duplicar': cambiarPaginas((datos) => paginas.duplicar(datos)),
    'paginas:reordenar': cambiarPaginas((datos) => paginas.reordenar(datos)),
    'paginas:insertarBlanco': cambiarPaginas((datos) => paginas.insertarBlanco(datos)),
    'paginas:insertarPdf': cambiarPaginas((datos) => paginas.insertarPdf(datos)),
    'paginas:insertarImagenes': cambiarPaginas((datos) => paginas.insertarImagenes(datos)),
    'paginas:recortar': cambiarPaginas((datos) => paginas.recortar(datos)),
    'paginas:extraer': (datos) => paginas.extraer(datos),
    'paginas:unir': (datos) => paginas.unir(datos),
    hayCambios: () => anotaciones.hayCambios(),
    modificado: () => anotaciones.modificado(),
    exportar: () => anotaciones.exportar(),
    marcarGuardado: () => anotaciones.marcarGuardado(),

    // Formularios (ver formularios.js)
    'formularios:hay': () => formularios.hay(),
    'formularios:listar': (datos) => formularios.listar(datos),
    'formularios:cambiar': (datos) => formularios.cambiar(datos),
    'formularios:crear': (datos) => formularios.crear(datos),
    'formularios:borrar': (datos) => formularios.borrar(datos),
    'formularios:aplanar': () => formularios.aplanar(),

    // Seguridad: contraseña y permisos (ver seguridad.js)
    'seguridad:estado': () => seguridad.estado(),
    'seguridad:proteger': (datos) => seguridad.proteger(datos),
    'seguridad:quitar': (datos) => seguridad.quitarProteccion(datos),

    // OCR: imagen de la página para reconocer, y capa de texto invisible con el resultado (ver ocr.js)
    async 'ocr:imagen'({ pagina, escala }) {
        const pixmap = conPagina(pagina, (p) => p.toPixmap(mupdf.Matrix.scale(escala, escala), mupdf.ColorSpace.DeviceRGB, false, true));
        try {
            const png = pixmap.asPNG().slice();
            return { png, _transferir: [png.buffer] };
        } finally {
            pixmap.destroy();
        }
    },
    'ocr:tieneTexto': ({ pagina }) => lineasDeTexto(pagina).length > 0,
    'ocr:anadirTexto': (datos) => ocr.anadirTexto(datos),

    // Números de página, encabezados y marcas de agua (ver marcas.js)
    'marcas:numerar': (datos) => marcas.numerar(datos),
    'marcas:marcaAgua': (datos) => marcas.marcaAgua(datos),

    // Ocultar datos de verdad (ver redactar.js)
    'redactar:pendientes': () => redactar.pendientes(),
    'redactar:marcarBusqueda': (datos) => redactar.marcarBusqueda(datos),
    'redactar:aplicar': () => redactar.aplicar(),

    // Editar contenido (ver editar.js)
    'editar:lineas': (datos) => editar.lineas(datos),
    'editar:imagenes': (datos) => editar.imagenes(datos),
    'editar:reescribir': (datos) => editar.reescribir(datos),
    'editar:anadirTexto': (datos) => editar.anadirTexto(datos),
    'editar:anadirImagen': (datos) => editar.anadirImagen(datos),
    'editar:cambiarImagen': (datos) => editar.cambiarImagen(datos),
    'editar:propiedades': () => editar.propiedades(),
    'editar:ponerPropiedades': (datos) => editar.ponerPropiedades(datos),

    // Comparar con otro PDF (ver comparar.js)
    'comparar:cargar': (datos) => comparar.cargar(datos),
    'comparar:comparar': () => comparar.comparar(),
    'comparar:cerrar': () => comparar.cerrar(),

    // Comprimir: sobre una copia con los cambios actuales (ver comprimir.js)
    'comprimir': ({ nivel }) => comprimir(anotaciones.exportar().bytes, nivel),

    // Firma digital con certificado (ver firmaDigital.js)
    'firma:leerCertificado': (datos) => firmaDigital.leerCertificado(datos),
    // Se firma una copia con los cambios actuales: si el usuario no guarda, el documento abierto sigue igual
    async 'firma:firmar'(datos) {
        const copia = mupdf.Document.openDocument(anotaciones.exportar().bytes, 'application/pdf');
        try {
            return await firmaDigital.firmar(copia, datos);
        } finally {
            copia.destroy();
        }
    },
    'firma:verificar': (datos) => firmaDigital.verificar(datos),

    // Documentos de Office a PDF (ver oficina/oficina.js)
    'oficina:convertir': (datos) => convertirOficina(datos),

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
