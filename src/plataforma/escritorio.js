// Fecha: 2026-10-12
// Ruta: /src/plataforma/escritorio.js
// Implementación de plataforma para la app de escritorio (Tauri)
// Lee y escribe archivos por comandos nativos, diálogos de abrir y guardar del sistema, recibe PDFs
// de la segunda instancia y maneja el actualizador
// Notas: solo se importa desde plataforma/index.js y solo cuando corre dentro de Tauri.
//        Los File que salen de aquí llevan `ruta`: con ella «Guardar» sobrescribe el archivo abierto.

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getCurrentWindow } from '@tauri-apps/api/window';

const FILTROS_ABRIR = [
    { name: 'PDF y documentos', extensions: ['pdf', 'docx', 'xlsx', 'pptx', 'rtf', 'txt', 'py', 'bmp', 'jpg', 'jpeg', 'png'] },
    { name: 'Todos los archivos', extensions: ['*'] }
];
const FILTROS_GUARDAR = [{ name: 'PDF', extensions: ['pdf'] }];

export async function ponerTituloVentana(titulo) {
    await getCurrentWindow().setTitle(titulo);
}

function nombreDeRuta(ruta) {
    return ruta.split(/[\\/]/).pop() || 'documento.pdf';
}

function carpetaDeRuta(ruta) {
    const corte = Math.max(ruta.lastIndexOf('\\'), ruta.lastIndexOf('/'));
    return corte > 0 ? ruta.slice(0, corte + 1) : '';
}

async function archivoDesdeRuta(ruta) {
    const bytes = await invoke('leer_archivo', { ruta });
    const archivo = new File([bytes], nombreDeRuta(ruta), { type: 'application/pdf' });
    archivo.ruta = ruta;
    return archivo;
}

export async function archivoInicial() {
    const ruta = await invoke('archivo_inicial');
    return ruta ? archivoDesdeRuta(ruta) : null;
}

export function alRecibirArchivo(callback) {
    listen('archivo-recibido', async (evento) => {
        try {
            callback(await archivoDesdeRuta(evento.payload));
        } catch (error) {
            console.error('No se pudo abrir el archivo recibido:', error);
        }
    });
}

// Diálogo de abrir del sistema: así se sabe la ruta y «Guardar» puede sobrescribir
export async function elegirArchivo() {
    const ruta = await open({ multiple: false, directory: false, filters: FILTROS_ABRIR });
    return ruta ? archivoDesdeRuta(ruta) : null;
}

// Los bytes van en el cuerpo de la llamada (sin JSON) y la ruta, codificada, en una cabecera
async function escribirArchivo(ruta, blob) {
    await invoke('escribir_archivo', new Uint8Array(await blob.arrayBuffer()), { headers: { ruta: encodeURIComponent(ruta) } });
}

export async function guardarEnSitio(blob, archivo) {
    if (!archivo?.ruta) {
        return false;
    }
    await escribirArchivo(archivo.ruta, blob);
    return true;
}

export async function guardarComo(blob, nombre, archivo) {
    const ruta = await save({ defaultPath: `${carpetaDeRuta(archivo?.ruta ?? '')}${nombre}`, filters: FILTROS_GUARDAR });
    if (!ruta) {
        return null;
    }
    await escribirArchivo(ruta, blob);
    const guardado = new File([blob], nombreDeRuta(ruta), { type: 'application/pdf' });
    guardado.ruta = ruta;
    return guardado;
}

// Devuelve null si no hay versión nueva, o { version, notas, instalar(alProgresar) }
export async function comprobarActualizacion() {
    const actualizacion = await check();
    if (!actualizacion) {
        return null;
    }
    return {
        version: actualizacion.version,
        notas: actualizacion.body || '',
        async instalar(alProgresar) {
            let total = 0;
            let descargado = 0;
            await actualizacion.downloadAndInstall((evento) => {
                if (evento.event === 'Started') {
                    total = evento.data.contentLength || 0;
                } else if (evento.event === 'Progress') {
                    descargado += evento.data.chunkLength;
                    alProgresar?.(total ? descargado / total : 0);
                } else if (evento.event === 'Finished') {
                    alProgresar?.(1);
                }
            });
        }
    };
}

export async function reiniciarApp() {
    await relaunch();
}
