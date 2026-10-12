// Fecha: 2026-10-12
// Ruta: /src/plataforma/ios.js
// Implementación de plataforma para la app de iPhone y iPad (Capacitor)
// PDFs recibidos de «Abrir en» y «Compartir», guardar con el selector de Archivos e imprimir con AirPrint
// Notas: el plugin nativo Archivos.swift (ios/App/App/) tiene la misma interfaz que el de Android, así que
//        se reutiliza android.js. Las versiones nuevas llegan por la App Store: aquí no se busca nada.

export { archivoInicial, alRecibirArchivo, guardarComo, guardarArchivo, imprimirPdf } from './android.js';

export async function comprobarActualizacion() {
    return null;
}

export async function reiniciarApp() {}
