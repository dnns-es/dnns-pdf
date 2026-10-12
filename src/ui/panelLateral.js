// Fecha: 2026-10-12
// Ruta: /src/ui/panelLateral.js
// Panel lateral con pestañas de miniaturas, índice y anotaciones
// Se abre solo al cargar un documento en pantallas anchas; en el móvil flota y se cierra al elegir
// Notas: emite 'panel:pestana' para que índice y miniaturas sepan cuándo se ven

import { escuchar, emitir } from '../nucleo/eventos.js';

const ANCHO_PANEL_FIJO = 900;

const panel = () => document.getElementById('panel-lateral');
const esPantallaEstrecha = () => window.innerWidth < ANCHO_PANEL_FIJO;

function mostrarPanel(visible) {
    panel().hidden = !visible;
    document.getElementById('boton-panel').setAttribute('aria-pressed', String(visible));
}

// Pestaña -> contenido que muestra
const PESTANAS = {
    miniaturas: 'lista-miniaturas',
    indice: 'lista-indice',
    anotaciones: 'lista-anotaciones-panel'
};

function elegirPestana(nombre) {
    for (const [pestana, contenido] of Object.entries(PESTANAS)) {
        document.getElementById(`pestana-${pestana}`).setAttribute('aria-selected', String(pestana === nombre));
        document.getElementById(contenido).hidden = pestana !== nombre;
    }
    emitir('panel:pestana', nombre);
}

export function iniciarPanelLateral() {
    document.getElementById('boton-panel').addEventListener('click', () => mostrarPanel(panel().hidden));
    for (const pestana of Object.keys(PESTANAS)) {
        document.getElementById(`pestana-${pestana}`).addEventListener('click', () => elegirPestana(pestana));
    }

    escuchar('estado:documento', (documento) => {
        elegirPestana('miniaturas');
        mostrarPanel(Boolean(documento) && !esPantallaEstrecha());
    });
    // En el móvil el panel tapa el visor: al elegir una página hay que quitarlo de en medio
    escuchar('panel:elegido', () => {
        if (esPantallaEstrecha()) {
            mostrarPanel(false);
        }
    });
}
