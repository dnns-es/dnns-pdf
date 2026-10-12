// Fecha: 2026-10-12
// Ruta: /src/nucleo/actualizacion.js
// Registro del service worker y aviso de versión nueva
// Muestra el banner "Nueva versión disponible" y recarga al pulsar "Actualizar"
// Notas: solo en producción; en desarrollo el service worker estorbaría a la recarga de Vite

import { emitir } from './eventos.js';
import { esEscritorio } from '../plataforma/index.js';

const UNA_HORA = 60 * 60 * 1000;

export async function registrarServiceWorker() {
    // En escritorio actualiza Tauri desde GitHub Releases; el service worker solo estorbaría
    if (!import.meta.env.PROD || !('serviceWorker' in navigator) || esEscritorio()) {
        return;
    }
    const registro = await navigator.serviceWorker.register('./sw.js');

    // Si ya había una versión esperando de una visita anterior, avisar ya
    if (registro.waiting && navigator.serviceWorker.controller) {
        mostrarBanner(registro.waiting);
    }
    registro.addEventListener('updatefound', () => vigilarInstalacion(registro.installing));

    let recargando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!recargando) {
            recargando = true;
            window.location.reload();
        }
    });

    // Una PWA puede quedarse abierta días: comprobar de vez en cuando y al volver a la pestaña
    setInterval(() => registro.update(), UNA_HORA);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            registro.update();
        }
    });
}

function vigilarInstalacion(nuevo) {
    if (!nuevo) {
        return;
    }
    nuevo.addEventListener('statechange', () => {
        // Sin controller es la primera instalación, no una actualización
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
            mostrarBanner(nuevo);
        }
    });
}

function mostrarBanner(trabajadorEnEspera) {
    const banner = document.getElementById('banner-actualizacion');
    const boton = document.getElementById('boton-actualizar');
    banner.hidden = false;
    boton.onclick = () => {
        boton.disabled = true;
        trabajadorEnEspera.postMessage('SKIP_WAITING');
    };
    emitir('actualizacion:disponible');
}
