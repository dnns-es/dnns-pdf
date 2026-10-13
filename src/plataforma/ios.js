// Fecha: 2026-10-12
// Ruta: /src/plataforma/ios.js
// Implementación de plataforma para la app de iPhone y iPad (Capacitor)
// PDFs recibidos de «Abrir en» y «Compartir», guardar con el selector de Archivos e imprimir con AirPrint
// Notas: el plugin nativo Archivos.swift (ios/App/App/) tiene la misma interfaz que el de Android, así que
//        se reutiliza android.js. Las versiones nuevas llegan por la App Store: aquí no se busca nada.
//        El escáner «Solo texto» usa el lector de texto del sistema (Texto.swift), mucho mejor que Tesseract.

import { registerPlugin } from '@capacitor/core';

export { archivoInicial, alRecibirArchivo, guardarComo, guardarArchivo, imprimirPdf } from './android.js';

const Texto = registerPlugin('Texto');

// Lector de texto del sistema (Vision, Texto.swift): bytes de una foto -> { ancho, alto, lineas }
export async function reconocerTexto(bytes) {
    return Texto.reconocer({ datos: await aBase64(new Blob([bytes])) });
}

function aBase64(blob) {
    return new Promise((resolver, rechazar) => {
        const lector = new FileReader();
        lector.onload = () => resolver(String(lector.result).split(',')[1]);
        lector.onerror = () => rechazar(lector.error);
        lector.readAsDataURL(blob);
    });
}

export async function comprobarActualizacion() {
    return null;
}

export async function reiniciarApp() {}
