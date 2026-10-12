// Fecha: 2026-10-12
// Ruta: /src/plataforma/index.js
// Puente entre la interfaz y la plataforma donde corre (web, escritorio Tauri o Android)
// Expone las mismas funciones en todos los sitios; en la web, las propias de las apps no hacen nada
// Notas: el código de cada app se carga con import() solo dentro de esa app, así la web no lo descarga

import { descargarBlob } from '../nucleo/utilidades.js';

export function esEscritorio() {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// Capacitor inyecta window.Capacitor en el WebView de la app
export function esAndroid() {
    return typeof window !== 'undefined' && window.Capacitor?.getPlatform?.() === 'android';
}

// Apps instaladas: se actualizan solas por su canal, no por el service worker
export function esApp() {
    return esEscritorio() || esAndroid();
}

async function app() {
    if (esEscritorio()) {
        return import('./escritorio.js');
    }
    if (esAndroid()) {
        return import('./android.js');
    }
    return null;
}

// Archivo con el que arrancó la app (doble clic, «Abrir con», «Compartir»), como File
export async function archivoInicial() {
    return (await app())?.archivoInicial() ?? null;
}

// Llama a callback(File) cada vez que el sistema manda otro PDF a la app ya abierta
export async function alRecibirArchivo(callback) {
    (await app())?.alRecibirArchivo(callback);
}

// Título de la pestaña y, en escritorio, también de la ventana nativa
export async function ponerTitulo(titulo) {
    document.title = titulo;
    await (await app())?.ponerTituloVentana?.(titulo);
}

// Guarda el PDF: en la web y en Windows se descarga; en Android, el usuario elige dónde.
// Devuelve false si el usuario cancela.
export async function guardarArchivo(blob, nombre) {
    const guardar = (await app())?.guardarArchivo;
    if (guardar) {
        return guardar(blob, nombre);
    }
    descargarBlob(blob, nombre);
    return true;
}

// Imprime el PDF directamente con el sistema si la plataforma lo permite (Android).
// Devuelve false si no: entonces se imprime desde el navegador.
export async function imprimirPdf(blob, nombre) {
    const imprimir = (await app())?.imprimirPdf;
    if (!imprimir) {
        return false;
    }
    await imprimir(blob, nombre);
    return true;
}

export async function comprobarActualizacion() {
    return (await app())?.comprobarActualizacion() ?? null;
}

export async function reiniciarApp() {
    await (await app())?.reiniciarApp();
}
