// Fecha: 2026-10-12
// Ruta: /src/motor/editar.js
// Editar el contenido de las páginas dentro del worker de MuPDF
// Líneas de texto (con su tamaño, tipo de letra y color), reescribir una línea (método «tapar y reescribir»:
// se borra el texto original de esa línea y se escribe el nuevo en su sitio, sin tocar el fondo), añadir
// texto e imágenes, mover, cambiar de tamaño o borrar imágenes existentes, y las propiedades del documento.
// Notas: el texto nuevo usa las fuentes estándar de PDF (Helvetica, Times, Courier): se parece al original
//        pero no es su tipo de letra exacto. Si lleva caracteres que esas no tienen (✓, griego, cirílico...),
//        se usa DejaVu, que se mete en el PDF (al guardar, recortada a las letras usadas: hayFuentesPropias).
//        Todo pasa por el journal y se puede deshacer.
//        Para borrar se usa la redacción de MuPDF, que aplica TODAS las zonas Redact de la página: si hay
//        zonas pendientes de «Ocultar datos» se avisa en vez de aplicarlas sin querer.

import * as mupdf from 'mupdf';
import { textoPdf, anchoTexto, cabeEnWinAnsi, num, matrizPagina, ponerRecurso, recursosPropios, anadirContenido, nombreFuenteEstandar, fuenteEstandar } from './contenido.js';

const INTERLINEADO = 1.2;
const PREFIJO_FUENTE = 'DNNSE';
const PREFIJO_UNICODE = 'DNNSU';
// Fuentes completas por familia y estilo: normal, negrita, cursiva, negrita cursiva
const UNICODE = {
    sans: ['DejaVuSans', 'DejaVuSans-Bold', 'DejaVuSans-Oblique', 'DejaVuSans-BoldOblique'],
    serif: ['DejaVuSerif', 'DejaVuSerif-Bold', 'DejaVuSerif-Italic', 'DejaVuSerif-BoldItalic'],
    mono: ['DejaVuSansMono', 'DejaVuSansMono-Bold', 'DejaVuSansMono-Oblique', 'DejaVuSansMono-BoldOblique']
};

const nombreUnicode = (familia, negrita, cursiva) => (UNICODE[familia] ?? UNICODE.sans)[(negrita ? 1 : 0) + (cursiva ? 2 : 0)];
const IMAGEN = 'DNNSImg';

function errorCon(codigo) {
    const error = new Error(codigo);
    error.codigo = codigo;
    return error;
}

// Color de MuPDF (gris, RGB o CMYK, de 0 a 1) a RGB
function aRgb(color) {
    if (!color || !color.length) {
        return [0, 0, 0];
    }
    if (color.length === 1) {
        return [color[0], color[0], color[0]];
    }
    if (color.length === 4) {
        const [c, m, y, k] = color;
        return [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)];
    }
    return color.slice(0, 3);
}

const colorPdf = (rgb) => aRgb(rgb).map((v) => num(Math.min(1, Math.max(0, v)))).join(' ');

function familiaDe(fuente) {
    if (fuente.isMono()) {
        return 'mono';
    }
    return fuente.isSerif() ? 'serif' : 'sans';
}

function lineasDePagina(pagina) {
    const texto = pagina.toStructuredText('preserve-whitespace');
    const lineas = [];
    let actual = null;
    try {
        texto.walk({
            beginLine(bbox, wmode) {
                actual = wmode === 0 ? { rect: bbox, texto: '', origen: null } : null;
            },
            onChar(c, origen, fuente, tamano, quad, color) {
                if (!actual) {
                    return;
                }
                if (!actual.origen) {
                    Object.assign(actual, {
                        origen,
                        tamano,
                        familia: familiaDe(fuente),
                        negrita: fuente.isBold(),
                        cursiva: fuente.isItalic(),
                        color: aRgb(color)
                    });
                }
                actual.texto += c;
            },
            endLine() {
                if (actual?.texto.trim()) {
                    lineas.push(actual);
                }
                actual = null;
            }
        });
    } finally {
        texto.destroy();
    }
    return lineas;
}

function imagenesDePagina(pagina) {
    const texto = pagina.toStructuredText('preserve-images');
    const imagenes = [];
    try {
        texto.walk({
            onImageBlock(bbox, transformacion, imagen) {
                imagenes.push({ rect: bbox, imagen });
            }
        });
    } finally {
        texto.destroy();
    }
    return imagenes;
}

const solapan = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

// La fuente tiene glifo para todos los caracteres (el 0 es «no está»)
function cubre(fuente, texto) {
    return [...texto].every((c) => /\s/.test(c) || fuente.encodeCharacter(c.codePointAt(0)) !== 0);
}

// obtenerFuente(nombre): promesa con los bytes de una fuente DejaVu (en el worker se descarga; en las pruebas se lee)
export function crearModuloEditar(exigirDocumento, marcarCambio, obtenerFuente = null) {
    const fuentesUnicode = new Map();
    // Fuente ya metida en cada documento: no se repite en cada texto
    const metidas = new WeakMap();

    // Fuente que hace falta para estas líneas: estándar si basta; si no, DejaVu (ya cargada con prepararFuente)
    function fuenteParaTexto(lineas, familia, negrita, cursiva) {
        if (lineas.every(cabeEnWinAnsi)) {
            const nombre = nombreFuenteEstandar(familia, negrita, cursiva);
            return { nombre, fuente: fuenteEstandar(nombre), unicode: false };
        }
        // La de la familia si tiene todas las letras; si no, la sin serifa, que es la más completa
        for (const nombre of [nombreUnicode(familia, negrita, cursiva), nombreUnicode('sans', negrita, cursiva)]) {
            const fuente = fuentesUnicode.get(nombre);
            if (fuente && lineas.every((linea) => cubre(fuente, linea))) {
                return { nombre, fuente, unicode: true };
            }
        }
        // Ninguna tiene todas: lo que falte sale como hueco
        const nombre = nombreUnicode('sans', negrita, cursiva);
        if (!fuentesUnicode.has(nombre)) {
            throw errorCon('SINFUENTE');
        }
        return { nombre, fuente: fuentesUnicode.get(nombre), unicode: true };
    }

    function fuenteEnDocumento(doc, { nombre, fuente, unicode }) {
        if (!unicode) {
            return doc.addSimpleFont(fuente, 'Latin');
        }
        let delDoc = metidas.get(doc);
        if (!delDoc) {
            delDoc = new Map();
            metidas.set(doc, delDoc);
        }
        const guardada = delDoc.get(nombre);
        // Tras deshacer, el objeto puede haber desaparecido: entonces se vuelve a meter
        if (guardada && guardada.resolve().get('Subtype').asName?.() === 'Type0') {
            return guardada;
        }
        const nueva = doc.addFont(fuente);
        delDoc.set(nombre, nueva);
        return nueva;
    }

    // Cadena para Tj: WinAnsi con las estándar; con DejaVu, los glifos en hexadecimal (Identity-H)
    function cadena(linea, { fuente, unicode }) {
        if (!unicode) {
            return `(${textoPdf(linea)})`;
        }
        const glifos = [...linea].map((c) => fuente.encodeCharacter(c.codePointAt(0)).toString(16).padStart(4, '0'));
        return `<${glifos.join('')}>`;
    }

    function conPagina(numero, trabajo) {
        const pagina = exigirDocumento().loadPage(numero);
        try {
            return trabajo(pagina);
        } finally {
            pagina.destroy();
        }
    }

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

    function exigirSinOcultarPendiente(pagina) {
        if (pagina.getAnnotations().some((anotacion) => anotacion.getType() === 'Redact')) {
            throw errorCon('OCULTAR_PENDIENTE');
        }
    }

    // Borra lo que quede bajo el recuadro: solo texto, o solo imágenes; nunca el resto (fondo, dibujos)
    function borrarZona(pagina, rect, { texto = false, imagenes = false }) {
        const zona = pagina.createAnnotation('Redact');
        zona.setRect(rect);
        zona.update();
        pagina.applyRedactions(false,
            imagenes ? mupdf.PDFPage.REDACT_IMAGE_REMOVE : mupdf.PDFPage.REDACT_IMAGE_NONE,
            mupdf.PDFPage.REDACT_LINE_ART_NONE,
            texto ? mupdf.PDFPage.REDACT_TEXT_REMOVE : mupdf.PDFPage.REDACT_TEXT_NONE);
    }

    // Escribe líneas de texto con una fuente estándar; (x, y) es la línea base de la primera, en el espacio visible
    function escribir(doc, numero, { x, y, lineas, tamano, familia, negrita, cursiva, color }) {
        const elegida = fuenteParaTexto(lineas, familia, negrita, cursiva);
        const clave = `${elegida.unicode ? PREFIJO_UNICODE : PREFIJO_FUENTE}${elegida.nombre.replace(/-/g, '')}`;
        const objeto = doc.findPage(numero);
        const { matriz } = matrizPagina(doc, numero);
        ponerRecurso(doc, objeto, 'Font', clave, fuenteEnDocumento(doc, elegida));
        const partes = [`q ${matriz.map(num).join(' ')} cm ${colorPdf(color)} rg BT /${clave} 1 Tf`];
        lineas.forEach((linea, i) => {
            partes.push(`${num(tamano)} 0 0 ${num(-tamano)} ${num(x)} ${num(y + i * tamano * INTERLINEADO)} Tm ${cadena(linea, elegida)} Tj`);
        });
        partes.push('ET Q');
        anadirContenido(doc, objeto, partes.join('\n'));
    }

    function ponerImagen(doc, numero, imagenPdf, [x0, y0, x1, y1]) {
        const objeto = doc.findPage(numero);
        const { matriz } = matrizPagina(doc, numero);
        // Un nombre por imagen: en la misma página puede haber varias añadidas
        const recursos = recursosPropios(doc, objeto);
        let n = 1;
        while (!recursos.get('XObject').isNull() && !recursos.get('XObject').get(`${IMAGEN}${n}`).isNull()) {
            n++;
        }
        ponerRecurso(doc, objeto, 'XObject', `${IMAGEN}${n}`, imagenPdf);
        // La imagen ocupa el cuadrado unidad con la y hacia arriba: se da la vuelta
        anadirContenido(doc, objeto,
            `q ${matriz.map(num).join(' ')} cm ${num(x1 - x0)} 0 0 ${num(-(y1 - y0))} ${num(x0)} ${num(y1)} cm /${IMAGEN}${n} Do Q`);
    }

    return {
        // Carga DejaVu si el texto lo necesita; se llama antes de reescribir o añadir texto
        async prepararFuente({ texto = '', familia = 'sans', negrita = false, cursiva = false }) {
            if (cabeEnWinAnsi(String(texto).replace(/[\r\n]/g, ''))) {
                return { unicode: false };
            }
            const cargar = async (nombre) => {
                if (!fuentesUnicode.has(nombre)) {
                    if (!obtenerFuente) {
                        throw errorCon('SINFUENTE');
                    }
                    fuentesUnicode.set(nombre, new mupdf.Font(nombre, await obtenerFuente(nombre)));
                }
                return fuentesUnicode.get(nombre);
            };
            // Si a la de la familia le faltan letras, también la sin serifa (ver fuenteParaTexto)
            const propia = await cargar(nombreUnicode(familia, negrita, cursiva));
            if (!cubre(propia, String(texto).replace(/[\r\n]/g, ''))) {
                await cargar(nombreUnicode('sans', negrita, cursiva));
            }
            return { unicode: true };
        },

        // Se ha metido alguna DejaVu: al guardar conviene recortarla a las letras usadas
        hayFuentesPropias() {
            return (metidas.get(exigirDocumento())?.size ?? 0) > 0;
        },

        lineas({ pagina }) {
            return conPagina(pagina, lineasDePagina).map(({ rect, texto, origen, tamano, familia, negrita, cursiva, color }) => (
                { rect, texto: texto.replace(/\s+$/, ''), origen, tamano, familia, negrita, cursiva, color }));
        },

        imagenes({ pagina }) {
            return conPagina(pagina, (objeto) => imagenesDePagina(objeto).map(({ rect, imagen }) => (
                { rect, ancho: imagen.getWidth(), alto: imagen.getHeight() })));
        },

        // Sustituye una línea por otro texto. rect: la línea original; origen: su línea base
        reescribir({ pagina, rect, origen, texto, tamano, familia, negrita, cursiva, color }) {
            return enOperacion('editar texto', (doc) => {
                conPagina(pagina, (objeto) => {
                    exigirSinOcultarPendiente(objeto);
                    // Un poco más estrecho en vertical: así no se lleva letras de las líneas vecinas
                    const margen = (rect[3] - rect[1]) * 0.2;
                    borrarZona(objeto, [rect[0] - 0.5, rect[1] + margen, rect[2] + 0.5, rect[3] - margen], { texto: true });
                });
                const limpio = String(texto ?? '').replace(/\s+$/, '');
                if (limpio) {
                    escribir(doc, pagina, { x: origen[0], y: origen[1], lineas: [limpio], tamano, familia, negrita, cursiva, color });
                }
                return { ok: true };
            });
        },

        anadirTexto({ pagina, x, y, texto, tamano = 12, familia = 'sans', negrita = false, cursiva = false, color = [0, 0, 0] }) {
            const lineas = String(texto ?? '').replace(/\r/g, '').split('\n');
            if (!lineas.some((linea) => linea.trim())) {
                return { ok: false };
            }
            return enOperacion('añadir texto', (doc) => {
                // (x, y) es la esquina de arriba: la línea base va un cuerpo más abajo
                escribir(doc, pagina, { x, y: y + tamano * 0.8, lineas, tamano, familia, negrita, cursiva, color });
                const { fuente } = fuenteParaTexto(lineas, familia, negrita, cursiva);
                const ancho = Math.max(...lineas.map((linea) => anchoTexto(linea, negrita, fuente))) * tamano;
                return { ok: true, rect: [x, y, x + ancho, y + lineas.length * tamano * INTERLINEADO] };
            });
        },

        anadirImagen({ pagina, rect, bytes }) {
            return enOperacion('añadir imagen', (doc) => {
                ponerImagen(doc, pagina, doc.addImage(new mupdf.Image(bytes)), rect);
                return { ok: true };
            });
        },

        // Mueve o cambia de tamaño una imagen (rect nuevo) o la borra (rect null). indice: orden en imagenes()
        cambiarImagen({ pagina, indice, rect }) {
            return enOperacion(rect ? 'mover imagen' : 'borrar imagen', (doc) => {
                conPagina(pagina, (objeto) => {
                    exigirSinOcultarPendiente(objeto);
                    const imagenes = imagenesDePagina(objeto);
                    const elegida = imagenes[indice];
                    if (!elegida) {
                        throw errorCon('SINIMAGEN');
                    }
                    // La redacción quitaría también cualquier otra imagen que toque la zona (un fondo, por ejemplo)
                    if (imagenes.some((otra, i) => i !== indice && solapan(otra.rect, elegida.rect))) {
                        throw errorCon('IMAGEN_SOLAPADA');
                    }
                    const [x0, y0, x1, y1] = elegida.rect;
                    const dentro = Math.min(1, (x1 - x0) / 4, (y1 - y0) / 4);
                    borrarZona(objeto, [x0 + dentro, y0 + dentro, x1 - dentro, y1 - dentro], { imagenes: true });
                    if (rect) {
                        ponerImagen(doc, pagina, doc.addImage(elegida.imagen), rect);
                    }
                });
                return { ok: true };
            });
        },

        propiedades() {
            const doc = exigirDocumento();
            const leerDato = (clave) => doc.getMetaData(clave) ?? '';
            return {
                titulo: leerDato(mupdf.Document.META_INFO_TITLE),
                autor: leerDato(mupdf.Document.META_INFO_AUTHOR),
                asunto: leerDato(mupdf.Document.META_INFO_SUBJECT),
                claves: leerDato(mupdf.Document.META_INFO_KEYWORDS)
            };
        },

        ponerPropiedades({ titulo = '', autor = '', asunto = '', claves = '' }) {
            return enOperacion('propiedades', (doc) => {
                doc.setMetaData(mupdf.Document.META_INFO_TITLE, titulo);
                doc.setMetaData(mupdf.Document.META_INFO_AUTHOR, autor);
                doc.setMetaData(mupdf.Document.META_INFO_SUBJECT, asunto);
                doc.setMetaData(mupdf.Document.META_INFO_KEYWORDS, claves);
                return { ok: true };
            });
        }
    };
}
