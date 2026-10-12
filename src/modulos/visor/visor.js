// Fecha: 2026-10-12
// Ruta: /src/modulos/visor/visor.js
// Módulo Visor: punto de arranque
// Inicia en orden todas las piezas del visor de PDF
// Notas: el orden importa: paginas.js debe construir las páginas antes de que zoom.js calcule
//        la escala inicial, porque ambos reaccionan al mismo evento 'estado:documento'

import { iniciarPaginas } from './paginas.js';
import { iniciarZoom } from './zoom.js';
import { iniciarNavegacion } from './navegacion.js';
import { iniciarAbrir } from './abrir.js';
import { iniciarBusqueda } from './busqueda.js';
import { iniciarMiniaturas } from './miniaturas.js';
import { iniciarIndice } from './indice.js';
import { iniciarImprimir } from './imprimir.js';
import { iniciarDescargar } from './descargar.js';

export function iniciarVisor() {
    iniciarPaginas();
    iniciarZoom();
    iniciarNavegacion();
    iniciarAbrir();
    iniciarBusqueda();
    iniciarMiniaturas();
    iniciarIndice();
    iniciarImprimir();
    iniciarDescargar();
}
