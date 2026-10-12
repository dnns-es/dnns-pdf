// Fecha: 2026-10-12
// Ruta: /src/modulos/firmar/imagen.js
// Tratamiento de la imagen de una firma manuscrita
// Quita el fondo blanco de una foto, recorta lo que sobra, limita el tamaño y la pasa a PNG
// Notas: todo se hace en un canvas del propio navegador; la imagen no sale del dispositivo.

const LADO_MAXIMO = 600;
const MARGEN = 4;
// Luminancia por encima de la que un píxel se considera papel, y por debajo de la que es tinta pura
const PAPEL = 200;
const TINTA = 120;

export function crearLienzo(ancho, alto) {
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.max(1, Math.round(ancho));
    lienzo.height = Math.max(1, Math.round(alto));
    return lienzo;
}

// Foto o escaneo de una firma en papel: lo claro se vuelve transparente, con un degradado
// entre papel y tinta para que los bordes del trazo no queden dentados
export function quitarFondo(lienzo) {
    const contexto = lienzo.getContext('2d');
    const datos = contexto.getImageData(0, 0, lienzo.width, lienzo.height);
    const p = datos.data;
    for (let i = 0; i < p.length; i += 4) {
        const luz = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
        const opacidad = luz >= PAPEL ? 0 : luz <= TINTA ? 1 : (PAPEL - luz) / (PAPEL - TINTA);
        p[i + 3] = Math.round(p[i + 3] * opacidad);
    }
    contexto.putImageData(datos, 0, 0);
    return lienzo;
}

// Caja de los píxeles visibles; null si la imagen está vacía
function cajaVisible(lienzo) {
    const { width: ancho, height: alto } = lienzo;
    const p = lienzo.getContext('2d').getImageData(0, 0, ancho, alto).data;
    let x0 = ancho;
    let y0 = alto;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < alto; y++) {
        for (let x = 0; x < ancho; x++) {
            if (p[(y * ancho + x) * 4 + 3] > 16) {
                x0 = Math.min(x0, x);
                x1 = Math.max(x1, x);
                y0 = Math.min(y0, y);
                y1 = Math.max(y1, y);
            }
        }
    }
    return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
}

// Recorta al trazo y lo reduce si hace falta. Devuelve null si no hay nada dibujado.
export function ajustarFirma(lienzo) {
    const caja = cajaVisible(lienzo);
    if (!caja) {
        return null;
    }
    const [x0, y0, x1, y1] = caja;
    const ancho = x1 - x0;
    const alto = y1 - y0;
    const escala = Math.min(1, LADO_MAXIMO / Math.max(ancho, alto));
    const salida = crearLienzo(ancho * escala + MARGEN * 2, alto * escala + MARGEN * 2);
    const contexto = salida.getContext('2d');
    contexto.imageSmoothingQuality = 'high';
    contexto.drawImage(lienzo, x0, y0, ancho, alto, MARGEN, MARGEN, ancho * escala, alto * escala);
    return salida;
}

// Un nombre escrito con una letra manuscrita
export function textoAFirma(texto, familia, color) {
    const tamano = 96;
    const medir = crearLienzo(1, 1).getContext('2d');
    medir.font = `${tamano}px "${familia}"`;
    const ancho = medir.measureText(texto).width;
    const lienzo = crearLienzo(ancho + tamano, tamano * 2);
    const contexto = lienzo.getContext('2d');
    contexto.font = `${tamano}px "${familia}"`;
    contexto.fillStyle = color;
    contexto.textBaseline = 'middle';
    contexto.fillText(texto, tamano / 2, tamano);
    return lienzo;
}

export async function lienzoDeArchivo(archivo) {
    const mapa = await createImageBitmap(archivo);
    // Las fotos del móvil pueden ser enormes: se reducen antes de tratarlas píxel a píxel
    const escala = Math.min(1, 1600 / Math.max(mapa.width, mapa.height));
    const lienzo = crearLienzo(mapa.width * escala, mapa.height * escala);
    lienzo.getContext('2d').drawImage(mapa, 0, 0, lienzo.width, lienzo.height);
    mapa.close();
    return lienzo;
}

export function aPng(lienzo) {
    return new Promise((resolver, rechazar) => {
        lienzo.toBlob((blob) => (blob ? blob.arrayBuffer().then((b) => resolver(new Uint8Array(b))) : rechazar(new Error('PNG'))), 'image/png');
    });
}
