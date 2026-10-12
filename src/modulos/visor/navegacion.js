// Fecha: 2026-10-12
// Ruta: /src/modulos/visor/navegacion.js
// Atajos de teclado del visor
// Ctrl+O/F/P/S (Ctrl+Mayús+S = guardar como), zoom con Ctrl +/−/0 y cambio de página con flechas, Inicio y Fin
// Notas: Ctrl+P se intercepta porque imprimir la página tal cual sacaría la interfaz, no el PDF

import { emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { escribiendoEnCampo } from '../../nucleo/utilidades.js';

const ATAJOS_CTRL = {
    o: 'archivo:elegir',
    f: 'busqueda:abrir',
    p: 'imprimir:pedir',
    s: 'guardar:pedir',
    S: 'guardar:como',
    '+': 'zoom:acercar',
    '=': 'zoom:acercar',
    '-': 'zoom:alejar'
};

function atajoConCtrl(evento) {
    // Con Mayús la tecla va en mayúscula: así Ctrl+Mayús+S se distingue de Ctrl+S
    const tecla = evento.shiftKey && evento.key.length === 1 ? evento.key.toUpperCase() : evento.key.toLowerCase();
    const hayDocumento = Boolean(leer('documento'));
    if (tecla === '0' && hayDocumento) {
        evento.preventDefault();
        emitir('zoom:poner', 1);
        return;
    }
    const nombre = ATAJOS_CTRL[tecla];
    // Sin documento solo tiene sentido abrir; el resto se deja al navegador
    if (!nombre || (!hayDocumento && tecla !== 'o')) {
        return;
    }
    evento.preventDefault();
    emitir(nombre);
}

function teclaDePagina(evento) {
    const visor = document.getElementById('visor');
    // Si la página no cabe a lo ancho, las flechas laterales deben desplazar, no cambiar de página
    const desbordaAncho = visor.scrollWidth > visor.clientWidth;
    const actual = leer('paginaActual');
    const destinos = {
        ArrowLeft: desbordaAncho ? null : actual - 1,
        ArrowRight: desbordaAncho ? null : actual + 1,
        Home: 0,
        End: leer('documento').paginas - 1
    };
    const destino = destinos[evento.key];
    if (destino === null || destino === undefined) {
        return;
    }
    evento.preventDefault();
    emitir('pagina:ir', destino);
}

export function iniciarNavegacion() {
    document.addEventListener('keydown', (evento) => {
        if (evento.ctrlKey || evento.metaKey) {
            atajoConCtrl(evento);
            return;
        }
        if (leer('documento') && !evento.altKey && !escribiendoEnCampo(evento)) {
            teclaDePagina(evento);
        }
    });
}
