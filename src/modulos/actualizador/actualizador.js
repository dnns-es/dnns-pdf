// Fecha: 2026-10-12
// Ruta: /src/modulos/actualizador/actualizador.js
// Actualizaciones de las apps (Windows y Android)
// Al arrancar busca versión nueva y la ofrece; Ajustes permite buscar a mano y silenciar el aviso
// Notas: solo actúa en las apps (en la web actualiza el service worker). La preferencia de avisar
//        se guarda en localStorage. Si falla la comprobación silenciosa no se molesta al usuario.

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { t, traducirPagina } from '../../nucleo/i18n.js';
import { esApp, comprobarActualizacion, reiniciarApp } from '../../plataforma/index.js';
import { mostrarAviso } from '../../ui/dialogos.js';

const CLAVE_AVISAR = 'dnns-pdf:avisarActualizaciones';
const RETARDO_ARRANQUE = 4000;

const $ = (id) => document.getElementById(id);

function avisarAlArrancar() {
    try {
        return localStorage.getItem(CLAVE_AVISAR) !== 'no';
    } catch {
        return true;
    }
}

function guardarAvisar(valor) {
    try {
        localStorage.setItem(CLAVE_AVISAR, valor ? 'si' : 'no');
    } catch {
        // Sin almacenamiento, se avisará siempre
    }
}

function mostrarNuevaVersion(actualizacion) {
    const dialogo = $('dialogo-actualizacion');
    const titulo = $('titulo-actualizacion');
    titulo.dataset.i18nParam = JSON.stringify({ version: actualizacion.version });
    // Las notas vienen de la Release de GitHub: texto plano, nunca HTML
    $('notas-actualizacion').textContent = actualizacion.notas;
    $('progreso-actualizacion').hidden = true;
    $('botones-actualizacion').hidden = false;
    traducirPagina(dialogo);

    $('actualizar-ahora').onclick = () => instalar(actualizacion);
    $('actualizar-luego').onclick = () => dialogo.close();
    dialogo.showModal();
}

async function instalar(actualizacion) {
    const barra = $('barra-actualizacion');
    $('botones-actualizacion').hidden = true;
    $('progreso-actualizacion').hidden = false;
    barra.value = 0;
    try {
        await actualizacion.instalar((fraccion) => {
            barra.value = fraccion;
        });
        await reiniciarApp();
        // En Android el instalador del sistema toma el relevo y la app sigue abierta detrás
        $('dialogo-actualizacion').close();
    } catch (error) {
        console.error('No se pudo instalar la actualización:', error);
        $('dialogo-actualizacion').close();
        mostrarAviso(t('actualizador.errorInstalar'));
    }
}

async function comprobar(silencioso) {
    try {
        const actualizacion = await comprobarActualizacion();
        if (actualizacion) {
            mostrarNuevaVersion(actualizacion);
        } else if (!silencioso) {
            mostrarAviso(t('actualizador.alDia'));
        }
    } catch (error) {
        console.error('No se pudo comprobar si hay actualización:', error);
        if (!silencioso) {
            mostrarAviso(t('actualizador.errorComprobar'));
        }
    }
}

// En las apps, Ajustes enseña además las opciones de actualización (la web se actualiza sola)
function prepararAjustes() {
    const casilla = $('ajuste-avisar');
    $('ajustes-actualizar').hidden = false;
    $('ajustes-buscar').hidden = false;
    escuchar('ajustes:abiertos', () => {
        casilla.checked = avisarAlArrancar();
    });
    casilla.addEventListener('change', () => guardarAvisar(casilla.checked));
    $('ajustes-buscar').addEventListener('click', () => {
        $('dialogo-ajustes').close();
        comprobar(false);
    });
}

export function iniciarActualizador() {
    if (!esApp()) {
        return;
    }
    prepararAjustes();
    escuchar('actualizador:comprobar', () => comprobar(false));
    if (avisarAlArrancar()) {
        // Dejar que la app arranque y pinte antes de salir a internet
        setTimeout(() => comprobar(true), RETARDO_ARRANQUE);
    }
    emitir('actualizador:listo');
}
