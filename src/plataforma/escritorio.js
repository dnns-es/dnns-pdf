// Fecha: 2026-10-12
// Ruta: /src/plataforma/escritorio.js
// Implementación de plataforma para la app de escritorio (Tauri)
// Lee archivos por el comando nativo, recibe PDFs de la segunda instancia y maneja el actualizador
// Notas: solo se importa desde plataforma/index.js y solo cuando corre dentro de Tauri

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getCurrentWindow } from '@tauri-apps/api/window';

export async function ponerTituloVentana(titulo) {
    await getCurrentWindow().setTitle(titulo);
}

function nombreDeRuta(ruta) {
    return ruta.split(/[\\/]/).pop() || 'documento.pdf';
}

async function archivoDesdeRuta(ruta) {
    const bytes = await invoke('leer_archivo', { ruta });
    return new File([bytes], nombreDeRuta(ruta), { type: 'application/pdf' });
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
