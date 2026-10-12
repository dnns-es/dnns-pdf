// Fecha: 2026-10-12
// Ruta: /src/modulos/visor/posicion.js
// Recordar en qué página y con qué zoom se dejó cada documento, y volver ahí al abrirlo otra vez
// Notas: el documento se reconoce por nombre, número de páginas y tamaño del archivo (no se lee el
//        contenido). Se guardan los 100 últimos en localStorage. Debe iniciarse después de paginas.js y
//        zoom.js: los tres escuchan 'estado:documento' y este tiene que ir el último.

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { retrasar } from '../../nucleo/utilidades.js';

const CLAVE = 'dnns-pdf:posiciones';
const MAXIMO = 100;

let restaurando = false;

function claveDe(documento) {
    return documento ? `${documento.nombre}|${documento.paginas}|${documento.archivo?.size ?? 0}` : null;
}

function leerTodas() {
    try {
        return JSON.parse(localStorage.getItem(CLAVE) ?? '{}') ?? {};
    } catch {
        return {};
    }
}

function guardar() {
    const clave = claveDe(leer('documento'));
    if (!clave || restaurando) {
        return;
    }
    const todas = leerTodas();
    const modo = leer('modoZoom');
    todas[clave] = { pagina: leer('paginaActual'), zoom: modo === 'libre' ? leer('escala') : modo, fecha: Date.now() };
    // Se quedan las más recientes
    const ordenadas = Object.entries(todas).sort((a, b) => b[1].fecha - a[1].fecha).slice(0, MAXIMO);
    try {
        localStorage.setItem(CLAVE, JSON.stringify(Object.fromEntries(ordenadas)));
    } catch {
        // Sin almacenamiento solo se pierde recordar la posición
    }
}

function restaurar(documento) {
    const guardada = documento && leerTodas()[claveDe(documento)];
    if (!guardada) {
        return;
    }
    restaurando = true;
    // Justo después: el panel lateral y el zoom inicial ya han colocado todo. Temporizador y no
    // requestAnimationFrame, que no corre con la ventana en segundo plano
    setTimeout(() => {
        if (leer('documento') === documento) {
            emitir('zoom:poner', guardada.zoom);
            if (guardada.pagina > 0 && guardada.pagina < documento.paginas) {
                emitir('pagina:ir', guardada.pagina);
            }
        }
        restaurando = false;
    }, 0);
}

export function iniciarPosicion() {
    const programar = retrasar(guardar, 500);
    escuchar('estado:documento', restaurar);
    escuchar('estado:paginaActual', programar);
    escuchar('estado:escala', programar);
    // Al cerrar o recargar la ventana puede no dar tiempo al retraso
    window.addEventListener('pagehide', guardar);
}
