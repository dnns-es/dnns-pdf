// Fecha: 2026-10-12
// Ruta: /src/plataforma/index.js
// Puente entre la interfaz y la plataforma donde corre (web, escritorio Tauri o Android)
// Expone las mismas funciones en todos los sitios; en la web, las propias de las apps no hacen nada
// Notas: el código de cada app se carga con import() solo dentro de esa app, así la web no lo descarga.
//        Un File abierto puede llevar de dónde salió: `ruta` (escritorio) o `manejador` (web, File System
//        Access API). Con eso «Guardar» escribe en el mismo sitio; sin eso, pregunta dónde o descarga.

import { descargarBlob } from '../nucleo/utilidades.js';

const TIPOS_ABRIR = [{
    description: 'PDF y documentos',
    accept: {
        'application/pdf': ['.pdf'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
        'application/rtf': ['.rtf'],
        'text/plain': ['.txt', '.py'],
        'image/bmp': ['.bmp'],
        'image/jpeg': ['.jpg', '.jpeg'],
        'image/png': ['.png']
    }
}];
const TIPOS_GUARDAR = [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }];

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

// File a partir de unos bytes, recordando de dónde salió
export function archivoDe(blob, nombre, origen = {}) {
    const archivo = new File([blob], nombre, { type: 'application/pdf' });
    return Object.assign(archivo, origen);
}

// Archivo con el que arrancó la app (doble clic, «Abrir con», «Compartir»), como File
export async function archivoInicial() {
    return (await app())?.archivoInicial() ?? null;
}

// Vuelve a leer un archivo por su ruta (archivos recientes del escritorio). null si no es el escritorio
export async function abrirRuta(ruta) {
    const leerRuta = (await app())?.archivoDesdeRuta;
    return leerRuta ? leerRuta(ruta) : null;
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

// Es una cancelación del usuario en un selector de archivos (no un error)
const cancelado = (error) => error?.name === 'AbortError';

// Selector de archivos para abrir. Devuelve el File (con su ruta o manejador si la plataforma lo sabe),
// null si el usuario cancela, o undefined si hay que usar el <input type="file"> de siempre
export async function elegirArchivo() {
    const propio = (await app())?.elegirArchivo;
    if (propio) {
        return propio();
    }
    if (typeof window.showOpenFilePicker !== 'function') {
        return undefined;
    }
    try {
        const [manejador] = await window.showOpenFilePicker({ types: TIPOS_ABRIR, multiple: false });
        const archivo = await manejador.getFile();
        archivo.manejador = manejador;
        return archivo;
    } catch (error) {
        if (cancelado(error)) {
            return null;
        }
        // Navegadores que tienen la función pero la bloquean (iframes, políticas): el input de siempre
        console.warn('No se pudo usar el selector del sistema:', error);
        return undefined;
    }
}

async function escribirEnManejador(manejador, blob) {
    const permiso = await manejador.requestPermission?.({ mode: 'readwrite' }) ?? 'granted';
    if (permiso !== 'granted') {
        return false;
    }
    const escritor = await manejador.createWritable();
    await escritor.write(blob);
    await escritor.close();
    return true;
}

// Guarda en el mismo sitio del que salió el archivo. false si no se sabe de dónde salió o no hay permiso
export async function guardarEnSitio(blob, archivo) {
    const propio = (await app())?.guardarEnSitio;
    if (propio) {
        return propio(blob, archivo);
    }
    return archivo?.manejador ? escribirEnManejador(archivo.manejador, blob) : false;
}

// Guarda eligiendo dónde (diálogo del sistema; en navegadores sin esa opción, descarga).
// Devuelve el File guardado, con su nuevo origen, o null si el usuario cancela
export async function guardarComo(blob, nombre, archivo) {
    const propio = (await app())?.guardarComo;
    if (propio) {
        return propio(blob, nombre, archivo);
    }
    if (typeof window.showSaveFilePicker === 'function') {
        try {
            const manejador = await window.showSaveFilePicker({ suggestedName: nombre, types: TIPOS_GUARDAR });
            await escribirEnManejador(manejador, blob);
            return archivoDe(blob, manejador.name, { manejador });
        } catch (error) {
            if (cancelado(error)) {
                return null;
            }
            console.warn('No se pudo usar el diálogo de guardar; se descarga:', error);
        }
    }
    descargarBlob(blob, nombre);
    return archivoDe(blob, nombre, { descargado: true });
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
