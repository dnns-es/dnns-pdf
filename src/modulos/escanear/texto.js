// Fecha: 2026-10-13
// Ruta: /src/modulos/escanear/texto.js
// Escanear «solo texto»: reconoce las letras de las fotos (OCR) y monta una página HTML con lo leído
// Antes de leerla, la foto se endereza (mide la inclinación de las líneas), se pasa a blanco y negro adaptativo
// y se borran las manchas que no son letras (mesa, bordes, sombras): sin eso se perdía más de la mitad.
// Cada foto se coloca sobre una hoja A4; sus líneas se agrupan en párrafos (por huecos y tamaño de letra) y
// se respetan el tamaño de los títulos, el centrado, la sangría y la separación. El worker lo maqueta a PDF.
// En iPhone se lee con el lector de texto del sistema (Texto.swift), que ya endereza y limpia por su cuenta.
// Notas: todo en el dispositivo (Tesseract.js, el mismo motor del OCR de Herramientas). Las fotos, firmas y
//        sellos no pasan al documento: solo el texto. No se distinguen negritas (el OCR no lo dice bien).

import { crearMotor } from '../ocr/ocr.js';
import { filtrar, deImageData, aImageData } from './procesar.js';
import { soltarLienzo } from './camara.js';

const A4 = [595.28, 841.89];
// Con menos confianza que esto (0-100) una línea suele ser una mancha o un sello, no texto
const CONFIANZA_MINIMA = 45;
const CONFIANZA_PALABRA = 70;
// El lector del sistema (0-1) solo da poca confianza a lo que de verdad es ruido
const CONFIANZA_NATIVA = 0.3;
// Línea del lector del sistema que se descarta si es este número de veces más alta que lo normal y su
// confianza no llega a CONFIANZA_NATIVA_ALTA
const ALTO_DUDOSO = 1.6;
const CONFIANZA_NATIVA_ALTA = 0.6;
// Proporción entre el alto de la caja de una línea y el tamaño de su letra
const ALTO_POR_PUNTO = 1.25;
// Hueco entre dos líneas (en altos de línea) a partir del cual empieza otro párrafo; lo normal ronda 0,6
const HUECO_PARRAFO = 1.1;
// Hueco entre palabras (en altos de línea) que se respeta como separación grande, como en columnas
const HUECO_GRANDE = 1.6;
// Márgenes de la hoja (puntos): los del documento fotografiado, dentro de estos límites
const MARGEN_MINIMO = 28;
const MARGEN_MAXIMO = 110;
const SEPARACION_MAXIMA = 48;
// Margen de una hoja normal (2 cm) y lo más que se amplía un texto que ocupa poco ancho en la foto
const MARGEN_NORMAL = 57;
const AMPLIACION_MAXIMA = 1.6;
// Búsqueda de la inclinación: hasta ±6° cada 0,2°, sobre una copia de 1400 px (más pequeña, la letra se emborrona)
const LADO_INCLINACION = 1400;
const GIRO_MAXIMO = 6;
const PASO_GIRO = 0.2;
// Manchas que no son letras (fracciones del alto o del ancho de la foto, y de relleno de su caja)
const MANCHA_ALTA = 0.06;
const MANCHA_ANCHA = 0.08;
const MANCHA_MACIZA = 0.7;

const escapar = (texto) => String(texto).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const limitar = (valor, minimo, maximo) => Math.min(maximo, Math.max(minimo, valor));
const pt = (valor) => `${valor.toFixed(1)}pt`;

// Inclinación de las líneas de texto (radianes): el giro con el que la tinta, sumada por filas, forma las
// franjas más marcadas (líneas y huecos). Se mide en una copia pequeña en blanco y negro.
function inclinacion(mapa) {
    const escala = Math.min(1, LADO_INCLINACION / Math.max(mapa.width, mapa.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(mapa.width * escala);
    lienzo.height = Math.round(mapa.height * escala);
    const contexto = lienzo.getContext('2d', { willReadFrequently: true });
    contexto.drawImage(mapa, 0, 0, lienzo.width, lienzo.height);
    const bn = limpiarManchas(filtrar(deImageData(contexto.getImageData(0, 0, lienzo.width, lienzo.height)), 'texto'));
    soltarLienzo(lienzo);
    const xs = [];
    const ys = [];
    for (let y = 0, i = 0; y < bn.alto; y++) {
        for (let x = 0; x < bn.ancho; x++, i += 4) {
            if (bn.datos[i] === 0) {
                xs.push(x);
                ys.push(y);
            }
        }
    }
    const filas = new Float64Array(bn.alto * 2);
    let mejor = { angulo: 0, nitidez: -1 };
    for (let grados = -GIRO_MAXIMO; grados <= GIRO_MAXIMO; grados += PASO_GIRO) {
        const angulo = (grados * Math.PI) / 180;
        const [seno, coseno] = [Math.sin(angulo), Math.cos(angulo)];
        filas.fill(0);
        for (let k = 0; k < xs.length; k++) {
            filas[Math.round(ys[k] * coseno - xs[k] * seno + bn.alto * 0.5)] += 1;
        }
        let nitidez = 0;
        for (let f = 1; f < filas.length; f++) {
            nitidez += (filas[f] - filas[f - 1]) ** 2;
        }
        if (nitidez > mejor.nitidez) {
            mejor = { angulo, nitidez };
        }
    }
    return mejor.angulo;
}

// Borra de la imagen en blanco y negro las manchas que no son letras: los bordes de la hoja y la mesa dejan
// franjas negras gruesas que el OCR junta con las líneas. Una mancha sobra si es muy alta o si es ancha y
// casi maciza (un subrayado es ancho pero fino y se queda, con las letras que lo toquen).
function limpiarManchas(bn) {
    const { ancho, alto, datos } = bn;
    const visto = new Uint8Array(ancho * alto);
    const pila = new Int32Array(ancho * alto);
    const esTinta = (p) => datos[p * 4] === 0;
    for (let inicio = 0; inicio < ancho * alto; inicio++) {
        if (visto[inicio] || !esTinta(inicio)) {
            continue;
        }
        let tope = 0;
        let x0 = ancho;
        let x1 = 0;
        let y0 = alto;
        let y1 = 0;
        const mancha = [];
        pila[tope++] = inicio;
        visto[inicio] = 1;
        while (tope) {
            const p = pila[--tope];
            mancha.push(p);
            const x = p % ancho;
            const y = (p - x) / ancho;
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
            for (const q of [x > 0 ? p - 1 : -1, x < ancho - 1 ? p + 1 : -1, y > 0 ? p - ancho : -1, y < alto - 1 ? p + ancho : -1]) {
                if (q >= 0 && !visto[q] && esTinta(q)) {
                    visto[q] = 1;
                    pila[tope++] = q;
                }
            }
        }
        const anchoMancha = x1 - x0 + 1;
        const altoMancha = y1 - y0 + 1;
        const maciza = mancha.length / (anchoMancha * altoMancha) > MANCHA_MACIZA;
        if (altoMancha > alto * MANCHA_ALTA || (maciza && anchoMancha > ancho * MANCHA_ANCHA)) {
            for (const p of mancha) {
                datos[p * 4] = datos[p * 4 + 1] = datos[p * 4 + 2] = 255;
            }
        }
    }
    return bn;
}

// Foto -> PNG enderezado para el OCR, y su tamaño
async function prepararFoto(bytes) {
    const mapa = await createImageBitmap(new Blob([bytes]));
    try {
        const angulo = inclinacion(mapa);
        const lienzo = document.createElement('canvas');
        lienzo.width = mapa.width;
        lienzo.height = mapa.height;
        const contexto = lienzo.getContext('2d', { willReadFrequently: true });
        contexto.fillStyle = '#ffffff';
        contexto.fillRect(0, 0, lienzo.width, lienzo.height);
        contexto.save();
        contexto.translate(lienzo.width / 2, lienzo.height / 2);
        contexto.rotate(-angulo);
        contexto.drawImage(mapa, -mapa.width / 2, -mapa.height / 2);
        contexto.restore();
        // Blanco y negro adaptativo: borra la mesa u otro fondo oscuro alrededor de la hoja (si no, el OCR
        // toma la página por una imagen y no lee nada) y aguanta sombras y luz desigual
        const bn = limpiarManchas(filtrar(deImageData(contexto.getImageData(0, 0, lienzo.width, lienzo.height)), 'texto'));
        contexto.putImageData(aImageData(bn), 0, 0);
        const png = await new Promise((resolver) => lienzo.toBlob(resolver, 'image/png'));
        soltarLienzo(lienzo);
        return { imagen: png, tam: [mapa.width, mapa.height] };
    } finally {
        mapa.close();
    }
}

// La foto (ya enderezada, es la hoja) ocupa la página A4 entera, centrada y sin deformar
function colocacion([ancho, alto]) {
    const escala = Math.min(A4[0] / ancho, A4[1] / alto);
    const dx = (A4[0] - ancho * escala) / 2;
    const dy = (A4[1] - alto * escala) / 2;
    return (caja) => ({ x0: caja.x0 * escala + dx, y0: caja.y0 * escala + dy, x1: caja.x1 * escala + dx, y1: caja.y1 * escala + dy });
}

// Texto de la línea; los huecos muy grandes entre palabras se dejan como varios espacios
function textoDeLinea(palabras, alto, aPagina) {
    let texto = '';
    let finAnterior = null;
    for (const palabra of palabras) {
        const caja = aPagina(palabra.bbox);
        if (finAnterior !== null) {
            texto += caja.x0 - finAnterior > alto * HUECO_GRANDE ? '  ' : ' ';
        }
        texto += palabra.text.trim();
        finAnterior = caja.x1;
    }
    return texto;
}

// Tamaños parecidos se igualan al más común: el OCR mide cada línea con algo de ruido
function igualarTamanos(lineas) {
    const tamanos = lineas.map((l) => l.tamano).sort((a, b) => a - b);
    const comun = tamanos[Math.floor(tamanos.length / 2)];
    for (const linea of lineas) {
        const tamano = Math.abs(linea.tamano - comun) / comun < 0.22 ? comun : linea.tamano;
        linea.tamano = limitar(Math.round(tamano * 2) / 2, 6, 40);
    }
}

// Una línea dudosa se queda si al menos la mitad de sus palabras se leen con claridad (papel arrugado)
function esTexto(linea, palabras) {
    if (linea.confidence >= CONFIANZA_MINIMA) {
        return true;
    }
    const claras = palabras.filter((p) => p.confidence >= CONFIANZA_PALABRA && /[a-záéíóúñü0-9]{2}/i.test(p.text));
    return claras.length * 2 >= palabras.length;
}

function lineasDe(datos, aPagina) {
    const parrafos = [];
    for (const bloque of datos.blocks ?? []) {
        for (const parrafo of bloque.paragraphs ?? []) {
            const lineas = [];
            for (const linea of parrafo.lines ?? []) {
                const palabras = (linea.words ?? []).filter((p) => p.text?.trim());
                if (!palabras.length || !esTexto(linea, palabras)) {
                    continue;
                }
                const caja = aPagina(linea.bbox);
                // La altura de la fila que mide el OCR no crece si la línea se curva (papel arrugado); la caja sí
                const fila = linea.rowAttributes?.rowHeight;
                const alto = fila > 0 ? aPagina({ x0: 0, y0: fila, x1: 0, y1: 0 }).y0 - aPagina({ x0: 0, y0: 0, x1: 0, y1: 0 }).y0 : caja.y1 - caja.y0;
                lineas.push({ ...caja, alto, tamano: alto / ALTO_POR_PUNTO, texto: textoDeLinea(palabras, alto, aPagina) });
            }
            if (lineas.length) {
                parrafos.push(lineas);
            }
        }
    }
    return parrafos;
}

// El OCR a menudo junta varios párrafos en uno: se parte donde hay un hueco vertical mayor que el normal
// entre líneas o donde cambia el tamaño de letra (un título)
function partirParrafo(lineas) {
    const grupos = [];
    lineas.forEach((linea, i) => {
        const anterior = lineas[i - 1];
        if (!anterior || linea.tamano !== anterior.tamano || linea.y0 - anterior.y1 > HUECO_PARRAFO * Math.min(linea.alto, anterior.alto)) {
            grupos.push([]);
        }
        grupos.at(-1).push(linea);
    });
    return grupos;
}

// Une las líneas de un párrafo; una palabra cortada con guion al final de línea se vuelve a juntar
function unirLineas(lineas) {
    return lineas.reduce((texto, linea) => {
        if (!texto) {
            return linea.texto;
        }
        return /[a-záéíóúñü]-$/i.test(texto) ? texto.slice(0, -1) + linea.texto : `${texto} ${linea.texto}`;
    }, '');
}

function estiloParrafo(grupo, margenes, fondoAnterior) {
    const x0 = Math.min(...grupo.map((l) => l.x0));
    const x1 = Math.max(...grupo.map((l) => l.x1));
    const izquierda = margenes[3];
    const derecha = A4[0] - margenes[1];
    const centro = (x0 + x1) / 2;
    const centrado = Math.abs(centro - (izquierda + derecha) / 2) < 12 && x0 - izquierda > 30;
    const estilo = [`font-size:${pt(grupo[0].tamano)}`, `margin-top:${pt(fondoAnterior === null ? 0 : limitar(grupo[0].y0 - fondoAnterior, 0, SEPARACION_MAXIMA))}`];
    if (centrado) {
        estilo.push('text-align:center');
    } else {
        const sangria = x0 - izquierda;
        if (sangria > 6) {
            estilo.push(`margin-left:${pt(sangria)}`);
        }
        // Primera línea más metida que las demás: sangría de párrafo
        const primera = grupo[0].x0 - x0;
        if (grupo.length > 1 && primera > 6) {
            estilo.push(`text-indent:${pt(primera)}`);
        }
    }
    return estilo.join(';');
}

// Resultado de Tesseract de una foto -> { html, ancho, alto } de una hoja A4 (o null si no hay texto)
// Si la hoja no llenaba la foto (se ve la mesa alrededor) el texto queda pequeño: se amplía, desde la
// esquina del texto, hasta el ancho útil de un A4, sin pasar de AMPLIACION_MAXIMA
function ampliarAlAncho(lineas) {
    const x0 = Math.min(...lineas.map((l) => l.x0));
    const y0 = Math.min(...lineas.map((l) => l.y0));
    const anchoTexto = Math.max(...lineas.map((l) => l.x1)) - x0;
    const factor = Math.min(AMPLIACION_MAXIMA, (A4[0] - 2 * MARGEN_NORMAL) / anchoTexto);
    if (!(factor > 1)) {
        return;
    }
    for (const linea of lineas) {
        linea.x0 = MARGEN_NORMAL + (linea.x0 - x0) * factor;
        linea.x1 = MARGEN_NORMAL + (linea.x1 - x0) * factor;
        linea.y0 = MARGEN_NORMAL + (linea.y0 - y0) * factor;
        linea.y1 = MARGEN_NORMAL + (linea.y1 - y0) * factor;
        linea.alto *= factor;
        linea.tamano *= factor;
    }
}

function paginaDe(datos, tamFoto) {
    const parrafos = lineasDe(datos, colocacion(tamFoto));
    const todas = parrafos.flat();
    if (!todas.length) {
        return null;
    }
    ampliarAlAncho(todas);
    igualarTamanos(todas);
    const margenes = [
        limitar(Math.min(...todas.map((l) => l.y0)), MARGEN_MINIMO, MARGEN_MAXIMO),
        limitar(A4[0] - Math.max(...todas.map((l) => l.x1)), MARGEN_MINIMO, MARGEN_MAXIMO),
        MARGEN_MINIMO * 2,
        limitar(Math.min(...todas.map((l) => l.x0)), MARGEN_MINIMO, MARGEN_MAXIMO)
    ];
    let fondo = null;
    const cuerpo = parrafos.flatMap(partirParrafo).map((grupo) => {
        const p = `<p style="${estiloParrafo(grupo, margenes, fondo)}">${escapar(unirLineas(grupo))}</p>`;
        fondo = grupo.at(-1).y1;
        return p;
    }).join('\n');
    const css = `html,body{margin:0}body{font-family:sans-serif;line-height:1.3;padding:${margenes.map(pt).join(' ')}}p{margin:0}`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${cuerpo}</body></html>`;
    return { html, ancho: A4[0], alto: A4[1] };
}

// Resultado del lector del sistema (Texto.swift) -> la misma forma que da Tesseract (bloques, párrafos,
// líneas y palabras). Las líneas que comparten altura (columnas, «Firma ... Fecha») se juntan en una.
function datosNativos({ lineas }) {
    const confianza = (c) => (c >= CONFIANZA_NATIVA ? 100 : 0);
    const altoDe = (l) => l.altoFila || l.caja.y1 - l.caja.y0;
    const altos = lineas.map(altoDe).sort((a, b) => a - b);
    const altoComun = altos[Math.floor(altos.length / 2)];
    // En una arruga el lector puede devolver un trozo dudoso que abarca dos líneas: mucho más alto y con poca
    // confianza. Un título también es alto, pero se lee con seguridad
    const dudosa = (l) => l.confianza < CONFIANZA_NATIVA_ALTA && altoDe(l) > ALTO_DUDOSO * altoComun;
    const ordenadas = lineas.filter((l) => l.texto.trim() && !dudosa(l)).sort((a, b) => a.caja.y0 - b.caja.y0 || a.caja.x0 - b.caja.x0);
    const filas = [];
    const pisan = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0;
    for (const linea of ordenadas) {
        // Solo se juntan trozos uno al lado del otro: en una hoja torcida, las cajas de dos líneas seguidas
        // se solapan en altura pero se pisan en horizontal
        const fila = filas.find((f) => !f.partes.some((p) => pisan(p.caja, linea.caja))
            && Math.min(f.caja.y1, linea.caja.y1) - Math.max(f.caja.y0, linea.caja.y0) > 0.5 * Math.min(f.caja.y1 - f.caja.y0, linea.caja.y1 - linea.caja.y0));
        if (fila) {
            fila.partes.push(linea);
            fila.caja = { x0: Math.min(fila.caja.x0, linea.caja.x0), y0: Math.min(fila.caja.y0, linea.caja.y0), x1: Math.max(fila.caja.x1, linea.caja.x1), y1: Math.max(fila.caja.y1, linea.caja.y1) };
        } else {
            filas.push({ caja: { ...linea.caja }, partes: [linea] });
        }
    }
    const lineasTesseract = filas.map(({ caja, partes }) => {
        partes.sort((a, b) => a.caja.x0 - b.caja.x0);
        const palabras = partes.flatMap((p) => (p.palabras.length ? p.palabras : [{ texto: p.texto, caja: p.caja }])
            .map((w) => ({ text: w.texto, bbox: w.caja, confidence: confianza(p.confianza) })));
        return {
            bbox: caja,
            confidence: Math.max(...partes.map((p) => confianza(p.confianza))),
            rowAttributes: { rowHeight: Math.max(...partes.map((p) => p.altoFila || p.caja.y1 - p.caja.y0)) },
            words: palabras
        };
    });
    return { blocks: [{ paragraphs: [{ lines: lineasTesseract }] }] };
}

// Fotos escaneadas -> hojas HTML con el texto reconocido (vacío si no se ha leído nada; null si se cancela)
// alProgresar(hechas, total); estaCancelado() para parar entre páginas.
// lectorNativo: el del sistema si lo hay (iPhone); si no, Tesseract
export async function paginasDeTexto(imagenes, { idiomas = 'spa+eng', alProgresar, estaCancelado, lectorNativo = null } = {}) {
    const motor = lectorNativo ? null : await crearMotor(idiomas);
    try {
        const documentos = [];
        for (const [i, bytes] of imagenes.entries()) {
            if (estaCancelado?.()) {
                return null;
            }
            alProgresar?.(i, imagenes.length);
            const pagina = lectorNativo ? await paginaNativa(lectorNativo, bytes) : await paginaTesseract(motor, bytes);
            if (pagina) {
                documentos.push(pagina);
            }
        }
        return documentos;
    } finally {
        await motor?.terminate().catch(() => {});
    }
}

async function paginaNativa(lectorNativo, bytes) {
    const resultado = await lectorNativo(bytes);
    return paginaDe(datosNativos(resultado), [resultado.ancho, resultado.alto]);
}

async function paginaTesseract(motor, bytes) {
    // Con solo 2° de giro el OCR pierde más de la mitad del texto: se endereza antes
    const { imagen, tam } = await prepararFoto(bytes);
    const { data } = await motor.recognize(imagen, {}, { blocks: true, text: false });
    return paginaDe(data, tam);
}
