// Fecha: 2026-10-13
// Ruta: /src/modulos/escanear/texto.js
// Escanear «solo texto»: reconoce las letras de las fotos (OCR) y coloca lo leído como en el papel
// Antes de leerla, la foto se endereza (mide la inclinación de las líneas), se pasa a blanco y negro adaptativo
// y se borran las manchas que no son letras (mesa, bordes, sombras): sin eso se perdía más de la mitad.
// En iPhone se lee con el lector de texto del sistema (Texto.swift), mucho mejor, y aquí se enderezan sus palabras.
// Cada foto es una hoja A4 con cada trozo de línea en su sitio y con su tamaño; el worker escribe el PDF
// (motor/textoColocado.js).
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
// Tamaños de letra que se consideran el mismo (la arruga o la curva del papel cambian algo la medida);
// un título de verdad suele ser al menos un 50 % mayor
const TAMANO_PARECIDO = 0.4;
// Distancia de la línea base por debajo del centro de las letras, en tamaños de letra
const BASE_BAJO_CENTRO = 0.3;
// Línea del lector del sistema que se descarta si es este número de veces más alta que lo normal y su
// confianza no llega a CONFIANZA_NATIVA_ALTA
const ALTO_DUDOSO = 1.6;
const CONFIANZA_NATIVA_ALTA = 0.6;
// Proporción entre el alto de la caja de una línea y el tamaño de su letra
const ALTO_POR_PUNTO = 1.25;
// Hueco entre palabras (en altos de línea) a partir del cual la línea se parte en trozos (columnas)
const HUECO_GRANDE = 1.6;
// Búsqueda de la inclinación: hasta ±6° cada 0,2°, sobre una copia de 1400 px (más pequeña, la letra se emborrona)
const LADO_INCLINACION = 1400;
const GIRO_MAXIMO = 6;
const PASO_GIRO = 0.2;
// Manchas que no son letras (fracciones del alto o del ancho de la foto, y de relleno de su caja)
const MANCHA_ALTA = 0.06;
const MANCHA_ANCHA = 0.08;
const MANCHA_MACIZA = 0.7;

const limitar = (valor, minimo, maximo) => Math.min(maximo, Math.max(minimo, valor));

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
    const aPagina = (caja) => ({ x0: caja.x0 * escala + dx, y0: caja.y0 * escala + dy, x1: caja.x1 * escala + dx, y1: caja.y1 * escala + dy });
    return { escala, aPagina };
}

// Tamaños parecidos se igualan al más común: el OCR mide cada línea con algo de ruido
function igualarTamanos(trozos) {
    const tamanos = trozos.map((t) => t.tamano).sort((a, b) => a - b);
    const comun = tamanos[Math.floor(tamanos.length / 2)];
    for (const trozo of trozos) {
        const tamano = Math.abs(trozo.tamano - comun) / comun < TAMANO_PARECIDO ? comun : trozo.tamano;
        trozo.tamano = limitar(Math.round(tamano * 2) / 2, 5, 40);
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

// Líneas que se quedan, con sus palabras y el alto de la fila, en píxeles de la foto
function lineasDe(datos) {
    const lineas = [];
    for (const bloque of datos.blocks ?? []) {
        for (const parrafo of bloque.paragraphs ?? []) {
            for (const linea of parrafo.lines ?? []) {
                const palabras = (linea.words ?? []).filter((p) => p.text?.trim());
                if (!palabras.length || !esTexto(linea, palabras)) {
                    continue;
                }
                // La altura de la fila que mide el OCR no crece si la línea se curva o se tuerce; la caja sí
                const fila = linea.rowAttributes?.rowHeight;
                const alto = fila > 0 ? fila : linea.bbox.y1 - linea.bbox.y0;
                lineas.push({ alto, palabras: palabras.map((p) => ({ texto: p.text.trim(), ...p.bbox })) });
            }
        }
    }
    return lineas;
}

const centro = (p) => [(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2];
const mediana = (valores) => [...valores].sort((a, b) => a - b)[Math.floor(valores.length / 2)];

// Si la hoja estaba algo torcida (el lector del iPhone lee sin enderezar), se giran las palabras para que
// cada línea quede recta: la inclinación es la mediana de la pendiente de las líneas largas
function enderezarPalabras(lineas, [ancho, alto]) {
    const pendientes = lineas.filter((l) => l.palabras.length >= 3).map(({ palabras }) => {
        const [xa, ya] = centro(palabras[0]);
        const [xb, yb] = centro(palabras.at(-1));
        return Math.atan2(yb - ya, xb - xa);
    });
    const angulo = pendientes.length ? mediana(pendientes) : 0;
    if (Math.abs(angulo) < 0.002) {
        return;
    }
    const [cx, cy] = [ancho / 2, alto / 2];
    const [seno, coseno] = [Math.sin(-angulo), Math.cos(-angulo)];
    for (const palabra of lineas.flatMap((l) => l.palabras)) {
        const [x, y] = centro(palabra);
        const nx = cx + (x - cx) * coseno - (y - cy) * seno;
        const ny = cy + (x - cx) * seno + (y - cy) * coseno;
        // La caja girada de una palabra torcida es más alta de lo que es; se toma el alto de la fila
        const [medioAncho, medioAlto] = [(palabra.x1 - palabra.x0) / 2, (palabra.y1 - palabra.y0) / 2];
        Object.assign(palabra, { x0: nx - medioAncho, x1: nx + medioAncho, y0: ny - medioAlto, y1: ny + medioAlto });
    }
}

// Una línea en trozos: se parte donde hay un hueco grande (columnas, «Fdo.: ...      Fecha: ...»)
function trozosDe(linea, escala, aPagina) {
    const alto = linea.alto * escala;
    const trozos = [];
    for (const palabra of linea.palabras) {
        const caja = aPagina(palabra);
        const anterior = trozos.at(-1);
        if (!anterior || caja.x0 - anterior.x1 > alto * HUECO_GRANDE) {
            trozos.push({ palabras: [], centros: [], x0: caja.x0, x1: caja.x1, alto });
        }
        const trozo = trozos.at(-1);
        trozo.palabras.push(palabra.texto);
        trozo.centros.push((caja.y0 + caja.y1) / 2);
        trozo.x1 = Math.max(trozo.x1, caja.x1);
    }
    return trozos.map(({ palabras, centros, x0, x1 }) => ({
        texto: palabras.join(' '), x0, x1, centro: mediana(centros), tamano: alto / ALTO_POR_PUNTO
    }));
}

// Resultado del OCR de una foto -> hoja A4 con cada trozo de texto donde estaba (o null si no hay texto)
function paginaDe(datos, tamFoto) {
    const lineas = lineasDe(datos);
    if (!lineas.length) {
        return null;
    }
    enderezarPalabras(lineas, tamFoto);
    const { escala, aPagina } = colocacion(tamFoto);
    const trozos = lineas.flatMap((linea) => trozosDe(linea, escala, aPagina));
    igualarTamanos(trozos);
    return {
        ancho: A4[0],
        alto: A4[1],
        // La línea base queda por debajo del centro de las letras, más o menos un tercio del tamaño
        trozos: trozos.map(({ texto, x0, x1, centro: medio, tamano }) => ({ texto, x0, x1, base: medio + tamano * BASE_BAJO_CENTRO, tamano }))
    };
}

// Resultado del lector del sistema (Texto.swift) -> la misma forma que da Tesseract (bloques, párrafos,
// líneas y palabras)
function datosNativos({ lineas }) {
    const confianza = (c) => (c >= CONFIANZA_NATIVA ? 100 : 0);
    const altoDe = (l) => l.altoFila || l.caja.y1 - l.caja.y0;
    const altoComun = mediana(lineas.map(altoDe));
    // En una arruga el lector puede devolver un trozo dudoso que abarca dos líneas: mucho más alto y con poca
    // confianza. Un título también es alto, pero se lee con seguridad
    const dudosa = (l) => l.confianza < CONFIANZA_NATIVA_ALTA && altoDe(l) > ALTO_DUDOSO * altoComun;
    const lineasTesseract = lineas.filter((l) => l.texto.trim() && !dudosa(l)).map((l) => ({
        bbox: l.caja,
        confidence: confianza(l.confianza),
        rowAttributes: { rowHeight: altoDe(l) },
        words: (l.palabras.length ? l.palabras : [{ texto: l.texto, caja: l.caja }])
            .map((p) => ({ text: p.texto, bbox: p.caja, confidence: confianza(l.confianza) }))
    }));
    return { blocks: [{ paragraphs: [{ lines: lineasTesseract }] }] };
}

// Fotos escaneadas -> hojas con el texto reconocido colocado (vacío si no se ha leído nada; null si se cancela)
// alProgresar(hechas, total); estaCancelado() para parar entre páginas.
// lectorNativo: el del sistema si lo hay (iPhone); si no, Tesseract
export async function paginasDeTexto(imagenes, { idiomas = 'spa+eng', alProgresar, estaCancelado, lectorNativo = null } = {}) {
    const motor = lectorNativo ? null : await crearMotor(idiomas);
    try {
        const paginas = [];
        for (const [i, bytes] of imagenes.entries()) {
            if (estaCancelado?.()) {
                return null;
            }
            alProgresar?.(i, imagenes.length);
            const pagina = lectorNativo ? await paginaNativa(lectorNativo, bytes) : await paginaTesseract(motor, bytes);
            if (pagina) {
                paginas.push(pagina);
            }
        }
        return paginas;
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
