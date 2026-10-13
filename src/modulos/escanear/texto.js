// Fecha: 2026-10-13
// Ruta: /src/modulos/escanear/texto.js
// Escanear «solo texto»: reconoce las letras de las fotos (OCR) y monta una página HTML con lo leído
// Cada foto se coloca sobre una hoja A4; sus líneas se agrupan en párrafos (por huecos y tamaño de letra) y
// se respetan el tamaño de los títulos, el centrado, la sangría y la separación. El worker lo maqueta a PDF.
// Notas: todo en el dispositivo (Tesseract.js, el mismo motor del OCR de Herramientas). Las fotos, firmas y
//        sellos no pasan al documento: solo el texto. No se distinguen negritas (el OCR no lo dice bien).

import { crearMotor } from '../ocr/ocr.js';

const A4 = [595.28, 841.89];
// Con menos confianza que esto (0-100) una línea suele ser una mancha o un sello, no texto
const CONFIANZA_MINIMA = 45;
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

const escapar = (texto) => String(texto).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const limitar = (valor, minimo, maximo) => Math.min(maximo, Math.max(minimo, valor));
const pt = (valor) => `${valor.toFixed(1)}pt`;

async function medidas(bytes) {
    const mapa = await createImageBitmap(new Blob([bytes]));
    const tam = [mapa.width, mapa.height];
    mapa.close();
    return tam;
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

function lineasDe(datos, aPagina) {
    const parrafos = [];
    for (const bloque of datos.blocks ?? []) {
        for (const parrafo of bloque.paragraphs ?? []) {
            const lineas = [];
            for (const linea of parrafo.lines ?? []) {
                const palabras = (linea.words ?? []).filter((p) => p.text?.trim());
                if (!palabras.length || linea.confidence < CONFIANZA_MINIMA) {
                    continue;
                }
                const caja = aPagina(linea.bbox);
                const alto = caja.y1 - caja.y0;
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
function paginaDe(datos, tamFoto) {
    const parrafos = lineasDe(datos, colocacion(tamFoto));
    const todas = parrafos.flat();
    if (!todas.length) {
        return null;
    }
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

// Fotos escaneadas -> hojas HTML con el texto reconocido (vacío si no se ha leído nada; null si se cancela)
// alProgresar(hechas, total); estaCancelado() para parar entre páginas
export async function paginasDeTexto(imagenes, { idiomas = 'spa+eng', alProgresar, estaCancelado } = {}) {
    const motor = await crearMotor(idiomas);
    try {
        const documentos = [];
        for (const [i, bytes] of imagenes.entries()) {
            if (estaCancelado?.()) {
                return null;
            }
            alProgresar?.(i, imagenes.length);
            const tamFoto = await medidas(bytes);
            const { data } = await motor.recognize(new Blob([bytes]), {}, { blocks: true, text: false });
            const pagina = paginaDe(data, tamFoto);
            if (pagina) {
                documentos.push(pagina);
            }
        }
        return documentos;
    } finally {
        await motor.terminate().catch(() => {});
    }
}
