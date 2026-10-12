// Fecha: 2026-10-12
// Ruta: /src/modulos/formularios/formularios.js
// Módulo Formularios: rellenar los campos de un PDF, añadir campos nuevos y aplanar
// Botón «Rellenar» en la barra: muestra los campos encima de las páginas (capaFormularios.js) y una barra
// con «Añadir campo de texto», «Añadir casilla» y «Aplanar»
// Notas: no convive con Anotar ni con Organizar: al abrirse pide cerrar las herramientas ('anotar:salir') y se
//        cierra cuando ellas se abren. Al abrir un PDF con formulario avisa para que se vea el botón.

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { mostrarAviso, confirmar } from '../../ui/dialogos.js';
import { registrarCambio } from '../../nucleo/historial.js';
import { iniciarCapaFormularios, activarCapas, ponerHerramienta } from './capaFormularios.js';

const $ = (id) => document.getElementById(id);

const estado = { activo: false, herramienta: null };

function elegirHerramienta(nombre) {
    estado.herramienta = nombre;
    for (const boton of document.querySelectorAll('[data-campo-nuevo]')) {
        boton.setAttribute('aria-pressed', String(boton.dataset.campoNuevo === nombre));
    }
    document.body.classList.toggle('formularios--diseno', Boolean(nombre));
    $('formularios-pista').dataset.i18n = nombre ? `formularios.pista${nombre === 'casilla' ? 'Casilla' : 'Texto'}` : 'formularios.pista';
    $('formularios-pista').textContent = t($('formularios-pista').dataset.i18n);
    ponerHerramienta(nombre);
}

function activar(activo) {
    if (activo && !leer('documento')) {
        return;
    }
    if (activo) {
        emitir('anotar:salir');
    }
    estado.activo = activo;
    $('barra-formularios').hidden = !activo;
    $('boton-formularios').setAttribute('aria-pressed', String(activo));
    document.body.classList.toggle('rellenando', activo);
    elegirHerramienta(null);
    activarCapas(activo);
    emitir('formularios:modo', activo);
}

async function aplanar() {
    if (!(await confirmar('formularios.confirmarAplanar', 'formularios.aplanar'))) {
        return;
    }
    try {
        await pedir('formularios:aplanar');
        activar(false);
        emitir('visor:repintarTodo');
        await registrarCambio();
        emitir('anotaciones:cambiadas', { pagina: null });
        mostrarAviso(t('formularios.aplanado'));
    } catch (error) {
        console.error('No se pudo aplanar el formulario:', error);
        mostrarAviso(t('formularios.error'));
    }
}

async function avisarSiHayFormulario(documento) {
    if (!documento) {
        return;
    }
    try {
        if (await pedir('formularios:hay')) {
            mostrarAviso(t('formularios.aviso'));
        }
    } catch (error) {
        console.warn('No se pudo comprobar si hay formulario:', error);
    }
}

function prepararBarra() {
    $('boton-formularios').addEventListener('click', () => activar(!estado.activo));
    $('formularios-cerrar').addEventListener('click', () => activar(false));
    $('formularios-aplanar').addEventListener('click', aplanar);
    for (const boton of document.querySelectorAll('[data-campo-nuevo]')) {
        boton.addEventListener('click', () => elegirHerramienta(estado.herramienta === boton.dataset.campoNuevo ? null : boton.dataset.campoNuevo));
    }
    document.addEventListener('keydown', (evento) => {
        if (evento.key === 'Escape' && estado.activo) {
            if (estado.herramienta) {
                elegirHerramienta(null);
            } else {
                activar(false);
            }
        }
    });
}

export function iniciarFormularios() {
    prepararBarra();
    iniciarCapaFormularios();
    escuchar('estado:documento', (documento) => {
        if (estado.activo) {
            activar(false);
        }
        avisarSiHayFormulario(documento);
    });
    // Anotar u Organizar se abren: se cierra el relleno
    escuchar('anotar:modo', (activo) => activo && estado.activo && activar(false));
    escuchar('anotar:salir', () => estado.activo && activar(false));
}
