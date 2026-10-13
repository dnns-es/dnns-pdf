// Fecha: 2026-10-12
// Ruta: /src/modulos/escanear/camara.js
// Cámara del escáner: encender la trasera, parar, hacer la foto y leer fotos de la galería
// Notas: la cámara solo funciona en páginas seguras (https, localhost o la app); si no hay cámara
//        o no se da permiso, iniciarCamara falla y la interfaz deja elegir una foto.

import { deImageData } from './procesar.js';

// La foto se guarda como mucho con este lado: de sobra para un A4 legible y no se come la memoria del móvil
const LADO_MAXIMO = 2600;

let flujo = null;

export const hayCamara = () => Boolean(navigator.mediaDevices?.getUserMedia);

export async function iniciarCamara(video) {
    if (!hayCamara()) {
        throw new Error('SINCAMARA');
    }
    pararCamara(video);
    flujo = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } }
    });
    video.srcObject = flujo;
    await video.play();
}

export function pararCamara(video) {
    flujo?.getTracks().forEach((pista) => pista.stop());
    flujo = null;
    video.srcObject = null;
}

function lienzoDe(fuente, ancho, alto) {
    const escala = Math.min(1, LADO_MAXIMO / Math.max(ancho, alto));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.max(1, Math.round(ancho * escala));
    lienzo.height = Math.max(1, Math.round(alto * escala));
    const contexto = lienzo.getContext('2d', { willReadFrequently: true });
    if (!contexto) {
        throw new Error('SINLIENZO');
    }
    contexto.drawImage(fuente, 0, 0, lienzo.width, lienzo.height);
    const imagen = deImageData(contexto.getImageData(0, 0, lienzo.width, lienzo.height));
    soltarLienzo(lienzo);
    return imagen;
}

// En iPhone la memoria de los lienzos tiene un tope y se libera tarde: se vacían en cuanto se dejan de usar
export function soltarLienzo(lienzo) {
    lienzo.width = 0;
    lienzo.height = 0;
}

// Fotograma actual del vídeo como imagen
export function capturar(video) {
    if (!video.videoWidth) {
        throw new Error('SINIMAGEN');
    }
    return lienzoDe(video, video.videoWidth, video.videoHeight);
}

// Foto de la galería (se respeta la orientación que guarda la cámara del móvil)
export async function fotoAImagen(archivo) {
    const mapa = await createImageBitmap(archivo);
    try {
        return lienzoDe(mapa, mapa.width, mapa.height);
    } finally {
        mapa.close();
    }
}
