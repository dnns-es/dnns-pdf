// Fecha: 2026-10-12
// Ruta: /src/motor/comparar.js
// Comparar el documento abierto con otro PDF, dentro del worker de MuPDF
// Página a página: primero por líneas y, en las líneas que cambian, palabra a palabra. Devuelve lo quitado (con
// su sitio en el documento abierto) y lo añadido (con su sitio en el otro y un punto de referencia en el
// abierto). Las páginas sin texto (escaneados) se comparan por imagen a baja resolución.
// Notas: el otro PDF solo se lee; vive en el worker hasta cerrar la comparación.

import * as mupdf from 'mupdf';

const MAX_CELDAS = 4_000_000;
const ESCALA_IMAGEN = 0.5;
const UMBRAL_PIXEL = 48;
const MINIMO_PALABRAS = 3;

function errorCon(codigo) {
    const error = new Error(codigo);
    error.codigo = codigo;
    return error;
}

const unir = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

// Palabras de la página con su recuadro, agrupadas por líneas
function lineasConPalabras(pagina) {
    const texto = pagina.toStructuredText('preserve-whitespace');
    const lineas = [];
    let linea = null;
    let palabra = null;
    const cerrarPalabra = () => {
        if (palabra) {
            linea.palabras.push(palabra);
            palabra = null;
        }
    };
    try {
        texto.walk({
            beginLine() {
                linea = { palabras: [] };
            },
            onChar(c, origen, fuente, tamano, quad) {
                if (!linea) {
                    return;
                }
                if (/\s/.test(c)) {
                    cerrarPalabra();
                    return;
                }
                const xs = [quad[0], quad[2], quad[4], quad[6]];
                const ys = [quad[1], quad[3], quad[5], quad[7]];
                const rect = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
                if (palabra) {
                    palabra.texto += c;
                    palabra.rect = unir(palabra.rect, rect);
                } else {
                    palabra = { texto: c, rect };
                }
            },
            endLine() {
                cerrarPalabra();
                if (linea?.palabras.length) {
                    linea.texto = linea.palabras.map((p) => p.texto).join(' ');
                    lineas.push(linea);
                }
                linea = null;
            }
        });
    } finally {
        texto.destroy();
    }
    return lineas;
}

// Diferencias entre dos listas (LCS). Devuelve operaciones { tipo: 'igual'|'quitado'|'anadido', a, b }
function diferencias(a, b, igual = (x, y) => x === y) {
    let inicio = 0;
    while (inicio < a.length && inicio < b.length && igual(a[inicio], b[inicio])) {
        inicio++;
    }
    let finA = a.length;
    let finB = b.length;
    while (finA > inicio && finB > inicio && igual(a[finA - 1], b[finB - 1])) {
        finA--;
        finB--;
    }
    const n = finA - inicio;
    const m = finB - inicio;
    const ops = [];
    for (let i = 0; i < inicio; i++) {
        ops.push({ tipo: 'igual', a: i, b: i });
    }
    if (n * m > MAX_CELDAS) {
        // Demasiado grande para comparar fino: todo lo del medio cuenta como cambiado
        for (let i = 0; i < n; i++) {
            ops.push({ tipo: 'quitado', a: inicio + i });
        }
        for (let j = 0; j < m; j++) {
            ops.push({ tipo: 'anadido', b: inicio + j });
        }
    } else {
        const tabla = new Uint32Array((n + 1) * (m + 1));
        for (let i = n - 1; i >= 0; i--) {
            for (let j = m - 1; j >= 0; j--) {
                tabla[i * (m + 1) + j] = igual(a[inicio + i], b[inicio + j])
                    ? tabla[(i + 1) * (m + 1) + j + 1] + 1
                    : Math.max(tabla[(i + 1) * (m + 1) + j], tabla[i * (m + 1) + j + 1]);
            }
        }
        let i = 0;
        let j = 0;
        while (i < n || j < m) {
            if (i < n && j < m && igual(a[inicio + i], b[inicio + j])) {
                ops.push({ tipo: 'igual', a: inicio + i, b: inicio + j });
                i++;
                j++;
            } else if (j < m && (i === n || tabla[i * (m + 1) + j + 1] > tabla[(i + 1) * (m + 1) + j])) {
                ops.push({ tipo: 'anadido', b: inicio + j });
                j++;
            } else {
                ops.push({ tipo: 'quitado', a: inicio + i });
                i++;
            }
        }
    }
    for (let k = 0; k < a.length - finA; k++) {
        ops.push({ tipo: 'igual', a: finA + k, b: finB + k });
    }
    return ops;
}

// Agrupa palabras seguidas del mismo tipo en un solo cambio. referenciaInicial: dónde señalar lo añadido
// antes de la primera palabra igual
function agrupar(ops, palabrasA, palabrasB, referenciaInicial) {
    const cambios = [];
    let ultimoA = referenciaInicial;
    let actual = null;
    const cerrar = () => {
        if (actual) {
            cambios.push(actual);
            actual = null;
        }
    };
    for (const op of ops) {
        if (op.tipo === 'igual') {
            cerrar();
            ultimoA = palabrasA[op.a].rect;
            continue;
        }
        const palabra = op.tipo === 'quitado' ? palabrasA[op.a] : palabrasB[op.b];
        if (actual?.tipo !== op.tipo) {
            cerrar();
            actual = { tipo: op.tipo, texto: '', rects: [], referencia: op.tipo === 'anadido' ? ultimoA : null };
        }
        actual.texto += (actual.texto ? ' ' : '') + palabra.texto;
        actual.rects.push(palabra.rect);
    }
    cerrar();
    return cambios;
}

// Parecido entre dos líneas: proporción de palabras en común
function parecido(a, b) {
    const pa = new Set(a.palabras.map((p) => p.texto));
    const pb = new Set(b.palabras.map((p) => p.texto));
    let comunes = 0;
    for (const palabra of pa) {
        comunes += pb.has(palabra) ? 1 : 0;
    }
    return comunes / Math.max(pa.size, pb.size, 1);
}

const PARECIDO_MINIMO = 0.5;

// Primero por líneas. Las líneas cambiadas se emparejan con la más parecida del otro aunque estén en otro
// orden (el texto reescrito suele ir al final del contenido) y se comparan palabra a palabra
function compararTexto(lineasA, lineasB) {
    const quitadas = [];
    const anadidas = [];
    let ultimaIgualA = null;
    for (const op of diferencias(lineasA, lineasB, (x, y) => x.texto === y.texto)) {
        if (op.tipo === 'igual') {
            ultimaIgualA = op.a;
        } else if (op.tipo === 'quitado') {
            quitadas.push(op.a);
        } else {
            anadidas.push({ b: op.b, despuesDe: ultimaIgualA });
        }
    }
    const cambios = [];
    const usadas = new Set();
    for (const a of quitadas) {
        let mejor = null;
        for (const [k, anadida] of anadidas.entries()) {
            const valor = usadas.has(k) ? 0 : parecido(lineasA[a], lineasB[anadida.b]);
            if (valor >= PARECIDO_MINIMO && (!mejor || valor > mejor.valor)) {
                mejor = { k, valor };
            }
        }
        const palabrasA = lineasA[a].palabras;
        if (mejor) {
            usadas.add(mejor.k);
            const palabrasB = lineasB[anadidas[mejor.k].b].palabras;
            const ops = diferencias(palabrasA.map((p) => p.texto), palabrasB.map((p) => p.texto));
            cambios.push(...agrupar(ops, palabrasA, palabrasB, palabrasA[0].rect).map((cambio) => ({ ...cambio, fila: palabrasA[0].rect[1] })));
        } else {
            cambios.push({ tipo: 'quitado', texto: lineasA[a].texto, rects: palabrasA.map((p) => p.rect), referencia: null, fila: palabrasA[0].rect[1] });
        }
    }
    for (const [k, anadida] of anadidas.entries()) {
        if (usadas.has(k)) {
            continue;
        }
        const linea = lineasB[anadida.b];
        const antes = anadida.despuesDe === null ? null : lineasA[anadida.despuesDe].palabras.at(-1).rect;
        const referencia = antes ?? lineasA[0]?.palabras[0].rect ?? null;
        cambios.push({ tipo: 'anadido', texto: linea.texto, rects: linea.palabras.map((p) => p.rect), referencia, fila: referencia?.[1] ?? 0 });
    }
    // De arriba abajo en la página abierta; dentro de una línea, en el orden de la comparación
    return cambios.sort((x, y) => x.fila - y.fila).map(({ fila, ...cambio }) => cambio);
}

// Páginas sin texto: se pintan pequeñas en gris y se busca el recuadro donde cambian
function compararImagen(paginaA, paginaB) {
    const gris = (pagina) => pagina.toPixmap(mupdf.Matrix.scale(ESCALA_IMAGEN, ESCALA_IMAGEN), mupdf.ColorSpace.DeviceGray, false, true);
    const a = gris(paginaA);
    const b = gris(paginaB);
    try {
        const ancho = Math.min(a.getWidth(), b.getWidth());
        const alto = Math.min(a.getHeight(), b.getHeight());
        const pa = a.getPixels();
        const pb = b.getPixels();
        const sa = a.getStride();
        const sb = b.getStride();
        let caja = null;
        for (let y = 0; y < alto; y++) {
            for (let x = 0; x < ancho; x++) {
                if (Math.abs(pa[y * sa + x] - pb[y * sb + x]) > UMBRAL_PIXEL) {
                    caja = caja ? unir(caja, [x, y, x + 1, y + 1]) : [x, y, x + 1, y + 1];
                }
            }
        }
        const tamanoDistinto = a.getWidth() !== b.getWidth() || a.getHeight() !== b.getHeight();
        if (!caja && !tamanoDistinto) {
            return [];
        }
        const rect = caja ? caja.map((v) => v / ESCALA_IMAGEN) : [0, 0, ancho / ESCALA_IMAGEN, alto / ESCALA_IMAGEN];
        return [{ tipo: 'imagen', texto: '', rects: [rect], referencia: null }];
    } finally {
        a.destroy();
        b.destroy();
    }
}

export function crearModuloComparar(exigirDocumento) {
    let otro = null;

    function cerrar() {
        otro?.destroy();
        otro = null;
    }

    return {
        cargar({ buffer, nombre }) {
            cerrar();
            const doc = mupdf.Document.openDocument(new Uint8Array(buffer), 'application/pdf');
            if (doc.needsPassword()) {
                doc.destroy();
                throw errorCon('PROTEGIDO');
            }
            otro = doc;
            return { paginas: doc.countPages(), nombre };
        },

        comparar() {
            if (!otro) {
                throw errorCon('SINOTRO');
            }
            const doc = exigirDocumento();
            const totalA = doc.countPages();
            const totalB = otro.countPages();
            const paginas = [];
            for (let n = 0; n < Math.max(totalA, totalB); n++) {
                if (n >= totalA || n >= totalB) {
                    paginas.push({ pagina: n, soloEn: n >= totalA ? 'otro' : 'abierto', cambios: [] });
                    continue;
                }
                const paginaA = doc.loadPage(n);
                const paginaB = otro.loadPage(n);
                try {
                    const lineasA = lineasConPalabras(paginaA);
                    const lineasB = lineasConPalabras(paginaB);
                    const palabras = (lineas) => lineas.reduce((suma, l) => suma + l.palabras.length, 0);
                    const sinTexto = palabras(lineasA) < MINIMO_PALABRAS && palabras(lineasB) < MINIMO_PALABRAS;
                    const cambios = sinTexto ? compararImagen(paginaA, paginaB) : compararTexto(lineasA, lineasB);
                    if (cambios.length) {
                        paginas.push({ pagina: n, cambios });
                    }
                } finally {
                    paginaA.destroy();
                    paginaB.destroy();
                }
            }
            return { paginasAbierto: totalA, paginasOtro: totalB, paginas };
        },

        cerrar() {
            cerrar();
            return { ok: true };
        }
    };
}
