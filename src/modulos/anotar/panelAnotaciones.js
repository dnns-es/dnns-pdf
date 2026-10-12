// Fecha: 2026-10-12
// Ruta: /src/modulos/anotar/panelAnotaciones.js
// Pestaña «Anotaciones» del panel lateral
// Lista todas las anotaciones del documento: ir a la página, editar el comentario y borrar
// Notas: se reconstruye entera tras cada cambio (son pocas decenas de elementos como mucho).
//        Los textos vienen del PDF, así que solo se usa textContent.

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { borrarAnotacion, editarContenido } from './capaAnotaciones.js';

const $ = (id) => document.getElementById(id);

const CLAVES_TIPO = {
    Highlight: 'resaltar',
    Underline: 'subrayar',
    StrikeOut: 'tachar',
    Text: 'nota',
    Ink: 'lapiz',
    Square: 'rectangulo',
    Circle: 'circulo',
    Line: 'linea',
    FreeText: 'texto',
    Stamp: 'sello'
};

let visible = false;
let pendiente = false;

function nombreTipo(anotacion) {
    if (anotacion.tipo === 'Line' && anotacion.flecha) {
        return t('anotar.herramientas.flecha');
    }
    const clave = CLAVES_TIPO[anotacion.tipo];
    return clave ? t(`anotar.herramientas.${clave}`) : anotacion.tipo;
}

function crearFila(anotacion) {
    const fila = document.createElement('li');
    fila.className = 'anotacion-fila';

    const ir = document.createElement('button');
    ir.type = 'button';
    ir.className = 'anotacion-fila__ir';
    const cabecera = document.createElement('span');
    cabecera.className = 'anotacion-fila__tipo';
    cabecera.textContent = `${t('panel.pagina', { numero: anotacion.pagina + 1 })} · ${nombreTipo(anotacion)}`;
    const contenido = document.createElement('span');
    contenido.className = 'anotacion-fila__texto';
    contenido.textContent = anotacion.contenido;
    ir.append(cabecera, contenido);
    ir.addEventListener('click', () => {
        emitir('visor:mostrarRect', { pagina: anotacion.pagina, rect: limitesARect(anotacion.limites) });
        emitir('panel:elegido');
    });
    ir.addEventListener('dblclick', () => editarContenido(anotacion.pagina, anotacion.id, anotacion.tipo));

    const borrar = document.createElement('button');
    borrar.type = 'button';
    borrar.className = 'anotacion-fila__borrar';
    borrar.textContent = '×';
    borrar.title = t('anotar.borrar');
    borrar.setAttribute('aria-label', t('anotar.borrar'));
    borrar.addEventListener('click', () => borrarAnotacion(anotacion.pagina, anotacion.id));

    fila.append(ir, borrar);
    return fila;
}

function limitesARect([x0, y0, x1, y1]) {
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

async function reconstruir() {
    const lista = $('lista-anotaciones');
    const vacio = $('anotaciones-vacio');
    if (!leer('documento')) {
        lista.replaceChildren();
        vacio.hidden = true;
        return;
    }
    if (!visible) {
        pendiente = true;
        return;
    }
    pendiente = false;
    let anotaciones = [];
    try {
        anotaciones = await pedir('anotaciones:listarTodas');
    } catch (error) {
        console.error('No se pudo listar las anotaciones:', error);
    }
    vacio.hidden = anotaciones.length > 0;
    lista.replaceChildren(...anotaciones.map(crearFila));
}

export function iniciarPanelAnotaciones() {
    escuchar('panel:pestana', (nombre) => {
        visible = nombre === 'anotaciones';
        if (visible && pendiente) {
            reconstruir();
        }
    });
    escuchar('estado:documento', () => {
        pendiente = true;
        reconstruir();
    });
    escuchar('anotaciones:cambiadas', reconstruir);
    escuchar('estado:idioma', reconstruir);
}
