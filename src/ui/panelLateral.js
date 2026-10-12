// Fecha: 2026-10-12
// Ruta: /src/ui/panelLateral.js
// Panel lateral con pestañas de miniaturas e índice
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

function elegirPestana(nombre) {
    const esMiniaturas = nombre === 'miniaturas';
    document.getElementById('pestana-miniaturas').setAttribute('aria-selected', String(esMiniaturas));
    document.getElementById('pestana-indice').setAttribute('aria-selected', String(!esMiniaturas));
    document.getElementById('lista-miniaturas').hidden = !esMiniaturas;
    document.getElementById('lista-indice').hidden = esMiniaturas;
    emitir('panel:pestana', nombre);
}

export function iniciarPanelLateral() {
    document.getElementById('boton-panel').addEventListener('click', () => mostrarPanel(panel().hidden));
    document.getElementById('pestana-miniaturas').addEventListener('click', () => elegirPestana('miniaturas'));
    document.getElementById('pestana-indice').addEventListener('click', () => elegirPestana('indice'));

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
