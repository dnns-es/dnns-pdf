// Fecha: 2026-10-12
// Ruta: /src/modulos/anotar/anotar.js
// Módulo Anotar: punto de arranque y estado de las herramientas
// Barra de anotación (herramienta, color, grosor, opacidad, sello), guardar y aviso de cambios sin guardar
// Notas: el estado de la herramienta se comparte por getAjustes(); los cambios se anuncian con
//        'anotar:herramienta'. Guardar baja el PDF con las anotaciones dentro (formato estándar).

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedirTexto, mostrarAviso } from '../../ui/dialogos.js';
import { iniciarCapas } from './capaAnotaciones.js';
import { iniciarMarcarTexto } from './marcarTexto.js';
import { iniciarPanelAnotaciones } from './panelAnotaciones.js';

const $ = (id) => document.getElementById(id);

// Color por defecto de cada herramienta (hexadecimal, como el <input type="color">)
const COLORES = {
    resaltar: '#ffff00',
    subrayar: '#e00000',
    tachar: '#e00000',
    nota: '#ffcc00',
    lapiz: '#e00000',
    rectangulo: '#1f6feb',
    circulo: '#1f6feb',
    linea: '#1f6feb',
    flecha: '#1f6feb',
    texto: '#000000',
    sello: '#cc0000'
};

const ajustes = {
    activo: false,
    herramienta: 'seleccionar',
    color: '#e00000',
    grosor: 3,
    opacidad: 1,
    tamanoFuente: 14,
    // El texto del sello es el que se ve en el selector: así sale en el idioma de la interfaz
    get sello() {
        return $('selector-sello').selectedOptions[0].textContent.trim();
    }
};

let selectorAnterior = 'APROBADO';

export function getAjustes() {
    return ajustes;
}

// '#rrggbb' -> [r, g, b] entre 0 y 1, que es lo que entiende MuPDF
export function colorAMupdf(hex) {
    const n = Number.parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function elegirHerramienta(nombre) {
    ajustes.herramienta = nombre;
    if (COLORES[nombre]) {
        ajustes.color = COLORES[nombre];
        $('color-anotar').value = ajustes.color;
    }
    for (const boton of document.querySelectorAll('[data-herramienta]')) {
        boton.setAttribute('aria-pressed', String(boton.dataset.herramienta === nombre));
    }
    emitir('anotar:herramienta', nombre);
}

function activarModo(activo) {
    ajustes.activo = activo;
    $('barra-anotar').hidden = !activo;
    $('boton-anotar').setAttribute('aria-pressed', String(activo));
    elegirHerramienta(activo ? ajustes.herramienta : 'seleccionar');
    emitir('anotar:modo', activo);
}

async function elegirSello(valor) {
    const selector = $('selector-sello');
    if (valor !== 'personalizado') {
        selectorAnterior = valor;
        return;
    }
    const texto = await pedirTexto('anotar.selloPersonalizado', '', false);
    if (texto) {
        const opcion = selector.querySelector('option[value="propio"]');
        opcion.hidden = false;
        opcion.textContent = texto.toUpperCase();
        selector.value = 'propio';
    } else {
        selector.value = selectorAnterior;
    }
    selectorAnterior = selector.value;
}

function prepararBarra() {
    $('boton-anotar').addEventListener('click', () => activarModo(!ajustes.activo));
    // Otra vista que no admite anotar (Organizar) pide cerrar las herramientas
    escuchar('anotar:salir', () => ajustes.activo && activarModo(false));
    // Firma hecha en el módulo Firmar: el siguiente toque en una página la coloca
    escuchar('anotar:colocarFirma', (firma) => {
        ajustes.firma = firma;
        if (!ajustes.activo) {
            activarModo(true);
        }
        elegirHerramienta('firma');
        mostrarAviso(t('firmar.tocaParaColocar'));
    });
    // Pedir un punto de una página (sin crear anotación): la respuesta llega en 'anotar:punto'
    escuchar('anotar:pedirPunto', (claveAviso) => {
        if (!ajustes.activo) {
            activarModo(true);
        }
        elegirHerramienta('punto');
        mostrarAviso(t(claveAviso));
    });
    for (const boton of document.querySelectorAll('[data-herramienta]')) {
        boton.addEventListener('click', () => elegirHerramienta(boton.dataset.herramienta));
    }
    $('color-anotar').addEventListener('input', (evento) => {
        ajustes.color = evento.target.value;
    });
    $('grosor-anotar').addEventListener('input', (evento) => {
        ajustes.grosor = Number(evento.target.value);
    });
    $('opacidad-anotar').addEventListener('input', (evento) => {
        ajustes.opacidad = Number(evento.target.value) / 100;
    });
    $('tamano-anotar').addEventListener('change', (evento) => {
        ajustes.tamanoFuente = Number(evento.target.value);
    });
    $('selector-sello').addEventListener('change', (evento) => elegirSello(evento.target.value));
    $('boton-deshacer').addEventListener('click', () => emitir('historial:deshacer'));
    $('boton-rehacer').addEventListener('click', () => emitir('historial:rehacer'));

    escuchar('historial:cambiado', ({ puedeDeshacer, puedeRehacer }) => {
        $('boton-deshacer').disabled = !puedeDeshacer;
        $('boton-rehacer').disabled = !puedeRehacer;
    });
}

function avisarAlSalir() {
    window.addEventListener('beforeunload', (evento) => {
        // No se puede esperar al worker aquí: se usa el último estado conocido
        if (ajustes.cambiosConocidos) {
            evento.preventDefault();
        }
    });
    escuchar('anotaciones:cambiadas', () => {
        ajustes.cambiosConocidos = true;
    });
    escuchar('historial:cambiado', ({ repintar }) => {
        if (repintar) {
            ajustes.cambiosConocidos = true;
        }
    });
    escuchar('documento:guardado', () => {
        ajustes.cambiosConocidos = false;
    });
    escuchar('estado:documento', () => {
        ajustes.cambiosConocidos = false;
        if (ajustes.activo && !leer('documento')) {
            activarModo(false);
        }
    });
}

export function iniciarAnotar() {
    prepararBarra();
    avisarAlSalir();
    iniciarCapas();
    iniciarMarcarTexto();
    iniciarPanelAnotaciones();
    document.addEventListener('keydown', (evento) => {
        if (evento.key === 'Escape' && ajustes.activo && ajustes.herramienta !== 'seleccionar') {
            elegirHerramienta('seleccionar');
        }
    });
}
