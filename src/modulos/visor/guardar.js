// Fecha: 2026-10-12
// Ruta: /src/modulos/visor/guardar.js
// Guardar el documento abierto, con las opciones de siempre
// Guardar (Ctrl+S): en el mismo archivo si se sabe de dónde salió (app de escritorio, o web con permiso
// del navegador); si no, pregunta dónde. Guardar como (Ctrl+Mayús+S): siempre pregunta dónde.
// En navegadores sin diálogo de guardar, se descarga. Si no se ha tocado, se guarda el original tal cual
// Notas: el menú sale del botón de la barra o del de la barra de anotar. Emite 'documento:guardado'
//        para que el aviso de cambios sin guardar se quite; el documento adopta el nombre y sitio nuevos.

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { guardarEnSitio, guardarComo, archivoDe, ponerTitulo } from '../../plataforma/index.js';
import { mostrarAviso } from '../../ui/dialogos.js';

const $ = (id) => document.getElementById(id);

let guardando = false;

async function blobActual(documento) {
    if (!(await pedir('modificado'))) {
        return documento.archivo;
    }
    return new Blob([(await pedir('exportar')).bytes], { type: 'application/pdf' });
}

// Lo guardado pasa a ser el documento: mismo nombre y sitio que el archivo escrito
function adoptar(documento, archivo) {
    documento.archivo = archivo;
    documento.nombre = archivo.name;
    ponerTitulo(`${documento.titulo || documento.nombre} · DNNS PDF`);
}

async function guardar({ como = false } = {}) {
    const documento = leer('documento');
    if (!documento || guardando) {
        return;
    }
    guardando = true;
    try {
        const blob = await blobActual(documento);
        const origen = documento.archivo;
        let guardado = null;
        if (!como && (await guardarEnSitio(blob, origen))) {
            guardado = archivoDe(blob, documento.nombre, { ruta: origen.ruta, manejador: origen.manejador });
        } else {
            // El usuario puede cancelar el diálogo: entonces sigue habiendo cambios sin guardar
            guardado = await guardarComo(blob, documento.nombre, origen);
        }
        if (!guardado) {
            return;
        }
        adoptar(documento, guardado);
        await pedir('marcarGuardado');
        emitir('documento:guardado');
        mostrarAviso(t(guardado.descargado ? 'guardar.descargado' : 'guardar.hecho', { nombre: guardado.name }));
    } catch (error) {
        console.error('No se pudo guardar:', error);
        mostrarAviso(t('anotar.errorGuardar'));
    } finally {
        guardando = false;
    }
}

// El menú se coloca bajo el botón que lo abrió
function mostrarMenu(visible, boton) {
    const menu = $('menu-guardar');
    menu.hidden = !visible;
    if (visible && boton) {
        const caja = boton.getBoundingClientRect();
        menu.style.top = `${caja.bottom + 4}px`;
        menu.style.left = `${Math.max(8, Math.min(caja.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    }
    for (const abridor of document.querySelectorAll('[data-abre-menu="guardar"]')) {
        abridor.setAttribute('aria-expanded', String(visible && abridor === boton));
    }
}

function prepararMenu() {
    for (const boton of document.querySelectorAll('[data-abre-menu="guardar"]')) {
        boton.addEventListener('click', (evento) => {
            evento.stopPropagation();
            mostrarMenu($('menu-guardar').hidden, boton);
        });
    }
    for (const opcion of document.querySelectorAll('[data-guardar]')) {
        opcion.addEventListener('click', () => {
            mostrarMenu(false);
            guardar({ como: opcion.dataset.guardar === 'como' });
        });
    }
    document.addEventListener('click', (evento) => {
        if (!$('menu-guardar').hidden && !evento.target.closest('#menu-guardar')) {
            mostrarMenu(false);
        }
    });
    document.addEventListener('keydown', (evento) => evento.key === 'Escape' && mostrarMenu(false));
}

export function iniciarGuardar() {
    prepararMenu();
    escuchar('guardar:pedir', () => guardar());
    escuchar('guardar:como', () => guardar({ como: true }));
}
