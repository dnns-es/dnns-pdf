// Fecha: 2026-10-12
// Ruta: /src/modulos/visor/zoom.js
// Zoom del visor
// Botones +/−, ajustar al ancho o a la página, Ctrl+rueda (y pellizco del touchpad) y pellizco táctil
// Notas: solo calcula la escala y la guarda en el estado; paginas.js aplica el cambio.
//        Con 'ancho' o 'pagina' la escala se recalcula sola si cambia el tamaño del visor.

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer, cambiar } from '../../nucleo/estado.js';
import { limitar, retrasar } from '../../nucleo/utilidades.js';

const ESCALAS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
const ESCALA_MINIMA = 0.1;
const ESCALA_MAXIMA = 5;
// Al abrir, "ajustar al ancho" en una pantalla grande deja la letra enorme; por encima de esto se usa 150 %
const ESCALA_INICIAL_MAXIMA = 1.5;
const RELLENO_VISOR = 32;
const INTERVALO_PELLIZCO = 40;

let visor = null;

function tamanoReferencia() {
    const { tamanos } = leer('documento');
    return tamanos[leer('paginaActual')] ?? tamanos[0];
}

function calcularAjuste(modo) {
    const [ancho, alto] = tamanoReferencia();
    const porAncho = (visor.clientWidth - RELLENO_VISOR) / ancho;
    if (modo === 'ancho') {
        return porAncho;
    }
    return Math.min(porAncho, (visor.clientHeight - RELLENO_VISOR) / alto);
}

// valor: 'ancho', 'pagina' o un número. ancla: punto del visor que debe quedarse quieto
function ponerZoom(valor, ancla = null) {
    if (!leer('documento')) {
        return;
    }
    const esAjuste = valor === 'ancho' || valor === 'pagina';
    const bruta = esAjuste ? calcularAjuste(valor) : valor;
    const escala = Math.round(limitar(bruta, ESCALA_MINIMA, ESCALA_MAXIMA) * 10000) / 10000;
    if (ancla && escala !== leer('escala')) {
        emitir('zoom:ancla', ancla);
    }
    cambiar('modoZoom', esAjuste ? valor : 'libre');
    cambiar('escala', escala);
}

function acercar() {
    const actual = leer('escala');
    ponerZoom(ESCALAS.find((escala) => escala > actual + 0.001) ?? ESCALA_MAXIMA);
}

function alejar() {
    const actual = leer('escala');
    ponerZoom([...ESCALAS].reverse().find((escala) => escala < actual - 0.001) ?? ESCALA_MINIMA);
}

function puntoEnVisor(clienteX, clienteY) {
    const caja = visor.getBoundingClientRect();
    return { x: clienteX - caja.left, y: clienteY - caja.top };
}

// El pellizco del touchpad llega como rueda con Ctrl pulsado
function alRueda(evento) {
    if (!evento.ctrlKey || !leer('documento')) {
        return;
    }
    evento.preventDefault();
    const delta = evento.deltaMode === 1 ? evento.deltaY * 16 : evento.deltaY;
    const factor = Math.exp(-delta * 0.0025);
    ponerZoom(leer('escala') * factor, puntoEnVisor(evento.clientX, evento.clientY));
}

function prepararPellizco() {
    let inicio = null;
    let ultimoAplicado = 0;
    const distancia = ([a, b]) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const centro = ([a, b]) => puntoEnVisor((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);

    visor.addEventListener('touchstart', (evento) => {
        if (evento.touches.length === 2 && leer('documento')) {
            inicio = { distancia: distancia(evento.touches), escala: leer('escala') };
        }
    }, { passive: true });

    visor.addEventListener('touchmove', (evento) => {
        if (!inicio || evento.touches.length !== 2) {
            return;
        }
        evento.preventDefault();
        // Los eventos táctiles llegan a 60-120 por segundo; aplicar cada uno sería repintar de más
        const ahora = performance.now();
        if (ahora - ultimoAplicado < INTERVALO_PELLIZCO) {
            return;
        }
        ultimoAplicado = ahora;
        const toques = [evento.touches[0], evento.touches[1]];
        ponerZoom(inicio.escala * distancia(toques) / inicio.distancia, centro(toques));
    }, { passive: false });

    visor.addEventListener('touchend', (evento) => {
        if (evento.touches.length < 2) {
            inicio = null;
        }
    });
}

function zoomInicial(documento) {
    if (!documento) {
        return;
    }
    if (calcularAjuste('ancho') <= ESCALA_INICIAL_MAXIMA) {
        ponerZoom('ancho');
    } else {
        ponerZoom(ESCALA_INICIAL_MAXIMA);
    }
}

export function iniciarZoom() {
    visor = document.getElementById('visor');
    visor.addEventListener('wheel', alRueda, { passive: false });
    prepararPellizco();

    const reajustar = retrasar(() => {
        const modo = leer('modoZoom');
        if (modo === 'ancho' || modo === 'pagina') {
            ponerZoom(modo);
        }
    }, 100);
    new ResizeObserver(reajustar).observe(visor);

    escuchar('estado:documento', zoomInicial);
    escuchar('zoom:acercar', acercar);
    escuchar('zoom:alejar', alejar);
    escuchar('zoom:poner', (valor) => ponerZoom(valor));
}
