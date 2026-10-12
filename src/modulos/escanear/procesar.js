// Fecha: 2026-10-12
// Ruta: /src/modulos/escanear/procesar.js
// Tratamiento de imagen del escáner: detectar el documento, enderezarlo y filtrarlo
// Funciones puras sobre { datos (RGBA), ancho, alto }, sin canvas, para poder probarlas en Node
// Notas: la detección busca la mancha clara más grande (el papel) y toma sus cuatro extremos; si no
//        parece un documento, devuelve null y la interfaz deja las esquinas en el borde para ajustarlas a mano.
//        El enderezado es una homografía con muestreo bilineal; con hojas grandes tarda unas décimas de segundo.

const LADO_ANALISIS = 400;
const AREA_MINIMA = 0.12;
const AREA_MAXIMA = 0.97;
const LADO_MAXIMO_SALIDA = 2200;
// Umbral adaptativo para texto: un píxel es tinta si es un 12 % más oscuro que su entorno
const CONTRASTE_TEXTO = 0.12;

export function crearImagen(ancho, alto) {
    return { datos: new Uint8ClampedArray(ancho * alto * 4), ancho, alto };
}

export const deImageData = (datos) => ({ datos: datos.data, ancho: datos.width, alto: datos.height });

export const aImageData = (imagen) => new ImageData(imagen.datos, imagen.ancho, imagen.alto);

export function aGris(imagen) {
    const { datos } = imagen;
    const gris = new Uint8ClampedArray(imagen.ancho * imagen.alto);
    for (let i = 0, j = 0; i < gris.length; i++, j += 4) {
        gris[i] = (datos[j] * 77 + datos[j + 1] * 151 + datos[j + 2] * 28) >> 8;
    }
    return gris;
}

// Copia reducida (vecino más cercano) con el lado mayor como mucho de 'ladoMaximo' píxeles
export function reducir(imagen, ladoMaximo) {
    const escala = Math.min(1, ladoMaximo / Math.max(imagen.ancho, imagen.alto));
    if (escala === 1) {
        return { imagen, escala };
    }
    const ancho = Math.max(1, Math.round(imagen.ancho * escala));
    const alto = Math.max(1, Math.round(imagen.alto * escala));
    const salida = crearImagen(ancho, alto);
    const origen = imagen.datos;
    let k = 0;
    for (let y = 0; y < alto; y++) {
        const fila = Math.min(imagen.alto - 1, Math.floor(y / escala)) * imagen.ancho;
        for (let x = 0; x < ancho; x++) {
            const i = (fila + Math.min(imagen.ancho - 1, Math.floor(x / escala))) * 4;
            salida.datos[k++] = origen[i];
            salida.datos[k++] = origen[i + 1];
            salida.datos[k++] = origen[i + 2];
            salida.datos[k++] = 255;
        }
    }
    return { imagen: salida, escala };
}

// Umbral de Otsu: separa lo claro (papel) de lo oscuro (fondo)
function umbralOtsu(gris) {
    const histograma = new Float64Array(256);
    for (const v of gris) {
        histograma[v]++;
    }
    const total = gris.length;
    let sumaTotal = 0;
    for (let v = 0; v < 256; v++) {
        sumaTotal += v * histograma[v];
    }
    let fondo = 0;
    let sumaFondo = 0;
    let mejor = 0;
    let umbral = 128;
    for (let v = 0; v < 256; v++) {
        fondo += histograma[v];
        if (!fondo) {
            continue;
        }
        const frente = total - fondo;
        if (!frente) {
            break;
        }
        sumaFondo += v * histograma[v];
        const mediaFondo = sumaFondo / fondo;
        const mediaFrente = (sumaTotal - sumaFondo) / frente;
        const varianza = fondo * frente * (mediaFondo - mediaFrente) ** 2;
        if (varianza > mejor) {
            mejor = varianza;
            umbral = v + 1;
        }
    }
    return umbral;
}

// Etiqueta las manchas claras (4-conectadas) y devuelve la etiqueta de la mayor y su tamaño
function manchaMayor(gris, umbral, ancho, alto) {
    const etiquetas = new Int32Array(ancho * alto);
    const pila = new Int32Array(ancho * alto);
    let etiqueta = 0;
    let mayor = { etiqueta: 0, tamano: 0 };
    for (let inicio = 0; inicio < etiquetas.length; inicio++) {
        if (gris[inicio] < umbral || etiquetas[inicio]) {
            continue;
        }
        etiqueta++;
        let tope = 0;
        let tamano = 0;
        pila[tope++] = inicio;
        etiquetas[inicio] = etiqueta;
        while (tope) {
            const p = pila[--tope];
            tamano++;
            const x = p % ancho;
            const vecinos = [x > 0 ? p - 1 : -1, x < ancho - 1 ? p + 1 : -1, p >= ancho ? p - ancho : -1, p + ancho < etiquetas.length ? p + ancho : -1];
            for (const q of vecinos) {
                if (q >= 0 && !etiquetas[q] && gris[q] >= umbral) {
                    etiquetas[q] = etiqueta;
                    pila[tope++] = q;
                }
            }
        }
        if (tamano > mayor.tamano) {
            mayor = { etiqueta, tamano };
        }
    }
    return { etiquetas, ...mayor };
}

const areaPoligono = (puntos) => Math.abs(puntos.reduce((suma, [x, y], i) => {
    const [x2, y2] = puntos[(i + 1) % puntos.length];
    return suma + x * y2 - x2 * y;
}, 0)) / 2;

// Esquinas del documento [arriba-izq, arriba-der, abajo-der, abajo-izq] o null si no se ve claro
export function detectarEsquinas(original) {
    const { imagen, escala } = reducir(original, LADO_ANALISIS);
    const { ancho, alto } = imagen;
    const gris = aGris(imagen);
    const { etiquetas, etiqueta, tamano } = manchaMayor(gris, umbralOtsu(gris), ancho, alto);
    if (!etiqueta || tamano < ancho * alto * AREA_MINIMA) {
        return null;
    }
    // Los cuatro extremos de la mancha en las diagonales: x+y mínimo es la esquina superior izquierda, etc.
    const extremos = [[Infinity, null], [-Infinity, null], [-Infinity, null], [Infinity, null]];
    for (let p = 0; p < etiquetas.length; p++) {
        if (etiquetas[p] !== etiqueta) {
            continue;
        }
        const x = p % ancho;
        const y = (p - x) / ancho;
        const valores = [x + y, x - y, x + y, x - y];
        const mejora = [valores[0] < extremos[0][0], valores[1] > extremos[1][0], valores[2] > extremos[2][0], valores[3] < extremos[3][0]];
        for (let i = 0; i < 4; i++) {
            if (mejora[i]) {
                extremos[i] = [valores[i], [x, y]];
            }
        }
    }
    const esquinas = extremos.map(([, punto]) => punto);
    const area = areaPoligono(esquinas) / (ancho * alto);
    if (area < AREA_MINIMA || area > AREA_MAXIMA) {
        return null;
    }
    // Centro del píxel y vuelta a la escala original
    return esquinas.map(([x, y]) => [(x + 0.5) / escala, (y + 0.5) / escala]);
}

export function esquinasPorDefecto(imagen, margen = 0.04) {
    const mx = imagen.ancho * margen;
    const my = imagen.alto * margen;
    return [[mx, my], [imagen.ancho - mx, my], [imagen.ancho - mx, imagen.alto - my], [mx, imagen.alto - my]];
}

// Resuelve A·h = b (8 ecuaciones) por eliminación de Gauss con pivote
function resolver(A, b) {
    const n = b.length;
    for (let col = 0; col < n; col++) {
        let pivote = col;
        for (let fila = col + 1; fila < n; fila++) {
            if (Math.abs(A[fila][col]) > Math.abs(A[pivote][col])) {
                pivote = fila;
            }
        }
        [A[col], A[pivote]] = [A[pivote], A[col]];
        [b[col], b[pivote]] = [b[pivote], b[col]];
        const divisor = A[col][col] || 1e-12;
        for (let fila = col + 1; fila < n; fila++) {
            const factor = A[fila][col] / divisor;
            for (let k = col; k < n; k++) {
                A[fila][k] -= factor * A[col][k];
            }
            b[fila] -= factor * b[col];
        }
    }
    const h = new Array(n).fill(0);
    for (let fila = n - 1; fila >= 0; fila--) {
        let suma = b[fila];
        for (let k = fila + 1; k < n; k++) {
            suma -= A[fila][k] * h[k];
        }
        h[fila] = suma / (A[fila][fila] || 1e-12);
    }
    return h;
}

// Homografía (3x3, h[8] = 1) que lleva cada punto de 'origen' a su pareja de 'destino'
export function homografia(origen, destino) {
    const A = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
        const [u, v] = origen[i];
        const [x, y] = destino[i];
        A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
        b.push(x);
        A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
        b.push(y);
    }
    return [...resolver(A, b), 1];
}

export function aplicarHomografia(h, [u, v]) {
    const w = h[6] * u + h[7] * v + h[8];
    return [(h[0] * u + h[1] * v + h[2]) / w, (h[3] * u + h[4] * v + h[5]) / w];
}

// Recorta y endereza el cuadrilátero 'esquinas' a un rectángulo del tamaño real del documento
export function enderezar(imagen, esquinas, ladoMaximo = LADO_MAXIMO_SALIDA) {
    const [ai, ad, bd, bi] = esquinas;
    const distancia = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const anchoReal = Math.max(distancia(ai, ad), distancia(bi, bd));
    const altoReal = Math.max(distancia(ai, bi), distancia(ad, bd));
    const escala = Math.min(1, ladoMaximo / Math.max(anchoReal, altoReal));
    const ancho = Math.max(1, Math.round(anchoReal * escala));
    const alto = Math.max(1, Math.round(altoReal * escala));
    const h = homografia([[0, 0], [ancho, 0], [ancho, alto], [0, alto]], esquinas);
    const salida = crearImagen(ancho, alto);
    const origen = imagen.datos;
    const maxX = imagen.ancho - 1;
    const maxY = imagen.alto - 1;
    let k = 0;
    for (let v = 0; v < alto; v++) {
        for (let u = 0; u < ancho; u++) {
            const [x, y] = aplicarHomografia(h, [u + 0.5, v + 0.5]);
            const xs = Math.min(Math.max(x - 0.5, 0), maxX);
            const ys = Math.min(Math.max(y - 0.5, 0), maxY);
            const x0 = Math.floor(xs);
            const y0 = Math.floor(ys);
            const x1 = Math.min(x0 + 1, maxX);
            const y1 = Math.min(y0 + 1, maxY);
            const fx = xs - x0;
            const fy = ys - y0;
            const p00 = (y0 * imagen.ancho + x0) * 4;
            const p10 = (y0 * imagen.ancho + x1) * 4;
            const p01 = (y1 * imagen.ancho + x0) * 4;
            const p11 = (y1 * imagen.ancho + x1) * 4;
            for (let c = 0; c < 3; c++) {
                salida.datos[k + c] = (origen[p00 + c] * (1 - fx) + origen[p10 + c] * fx) * (1 - fy)
                    + (origen[p01 + c] * (1 - fx) + origen[p11 + c] * fx) * fy;
            }
            salida.datos[k + 3] = 255;
            k += 4;
        }
    }
    return salida;
}

function filtroGris(imagen) {
    const gris = aGris(imagen);
    const salida = crearImagen(imagen.ancho, imagen.alto);
    for (let i = 0, j = 0; i < gris.length; i++, j += 4) {
        salida.datos[j] = salida.datos[j + 1] = salida.datos[j + 2] = gris[i];
        salida.datos[j + 3] = 255;
    }
    return salida;
}

// Percentil de un canal sobre una muestra de píxeles
function percentil(datos, canal, fraccion) {
    const histograma = new Uint32Array(256);
    let total = 0;
    for (let i = canal; i < datos.length; i += 4 * 7) {
        histograma[datos[i]]++;
        total++;
    }
    let acumulado = 0;
    for (let v = 0; v < 256; v++) {
        acumulado += histograma[v];
        if (acumulado >= total * fraccion) {
            return v;
        }
    }
    return 255;
}

// Papel blanco y tinta más negra: estira los niveles de cada canal (de paso corrige el tono de la luz)
function filtroMejorado(imagen) {
    const { datos } = imagen;
    const salida = crearImagen(imagen.ancho, imagen.alto);
    const negro = Math.min(percentil(datos, 0, 0.02), percentil(datos, 1, 0.02), percentil(datos, 2, 0.02));
    const blancos = [0, 1, 2].map((c) => Math.max(negro + 1, percentil(datos, c, 0.97)));
    for (let i = 0; i < datos.length; i += 4) {
        for (let c = 0; c < 3; c++) {
            salida.datos[i + c] = ((datos[i + c] - negro) * 255) / (blancos[c] - negro);
        }
        salida.datos[i + 3] = 255;
    }
    return salida;
}

// Blanco y negro puro con umbral adaptativo (método de Bradley): aguanta sombras y luz desigual
function filtroTexto(imagen) {
    const { ancho, alto } = imagen;
    const gris = aGris(imagen);
    const integral = new Float64Array((ancho + 1) * (alto + 1));
    for (let y = 1; y <= alto; y++) {
        let fila = 0;
        for (let x = 1; x <= ancho; x++) {
            fila += gris[(y - 1) * ancho + (x - 1)];
            integral[y * (ancho + 1) + x] = integral[(y - 1) * (ancho + 1) + x] + fila;
        }
    }
    const radio = Math.max(8, Math.floor(Math.min(ancho, alto) / 60));
    const salida = crearImagen(ancho, alto);
    for (let y = 0; y < alto; y++) {
        const y0 = Math.max(0, y - radio);
        const y1 = Math.min(alto, y + radio + 1);
        for (let x = 0; x < ancho; x++) {
            const x0 = Math.max(0, x - radio);
            const x1 = Math.min(ancho, x + radio + 1);
            const suma = integral[y1 * (ancho + 1) + x1] - integral[y0 * (ancho + 1) + x1] - integral[y1 * (ancho + 1) + x0] + integral[y0 * (ancho + 1) + x0];
            const area = (x1 - x0) * (y1 - y0);
            const valor = gris[y * ancho + x] * area < suma * (1 - CONTRASTE_TEXTO) ? 0 : 255;
            const j = (y * ancho + x) * 4;
            salida.datos[j] = salida.datos[j + 1] = salida.datos[j + 2] = valor;
            salida.datos[j + 3] = 255;
        }
    }
    return salida;
}

export const FILTROS = ['mejorado', 'color', 'gris', 'texto'];

export function filtrar(imagen, modo) {
    switch (modo) {
        case 'gris':
            return filtroGris(imagen);
        case 'texto':
            return filtroTexto(imagen);
        case 'mejorado':
            return filtroMejorado(imagen);
        default:
            return imagen;
    }
}
