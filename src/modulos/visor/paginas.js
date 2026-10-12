// Fecha: 2026-10-12
// Ruta: /src/modulos/visor/paginas.js
// Páginas del documento en el área central
// Crea un hueco por página con su tamaño real y solo pinta las que están cerca de la vista
// Notas: con 300+ páginas no se puede tener todo pintado (cientos de MB). Se pintan las cercanas
//        (un alto de pantalla por arriba y por abajo) y se liberan las que quedan lejos.
//        El zoom cambia la variable CSS --escala; mientras se repinta, se ve la imagen anterior
//        estirada, así el cambio es inmediato.

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer, cambiar } from '../../nucleo/estado.js';
import { retrasar, limitar } from '../../nucleo/utilidades.js';
import { pedir } from '../../motor/cliente.js';
import { encolar, reiniciarCola, generacionActual } from './colaRender.js';
import { rellenarCapaTexto } from './capaTexto.js';

const MAX_PIXELES = 16_000_000;
const MAX_LADO = 8192;
const SEPARACION_SUPERIOR = 12;

let visor = null;
let contenedor = null;
let elementos = [];
let estados = [];
const cercanas = new Set();
let observadorPintar = null;
let observadorLiberar = null;
let anclaPendiente = null;

function crearPagina(numero, [ancho, alto]) {
    const pagina = document.createElement('div');
    pagina.className = 'pagina';
    pagina.dataset.pagina = String(numero);
    pagina.style.setProperty('--ancho', ancho);
    pagina.style.setProperty('--alto', alto);
    const lienzo = document.createElement('canvas');
    lienzo.className = 'pagina__lienzo';
    const resaltado = document.createElement('div');
    resaltado.className = 'capa-resaltado';
    const texto = document.createElement('div');
    texto.className = 'capa-texto';
    pagina.append(lienzo, resaltado, texto);
    return pagina;
}

function construir(documento) {
    observadorPintar.disconnect();
    observadorLiberar.disconnect();
    reiniciarCola();
    cercanas.clear();
    elementos = [];
    estados = [];
    contenedor.replaceChildren();
    document.getElementById('portada').hidden = Boolean(documento);
    contenedor.hidden = !documento;
    if (!documento) {
        return;
    }
    contenedor.style.setProperty('--escala', leer('escala'));
    const fragmento = document.createDocumentFragment();
    documento.tamanos.forEach((tamano, numero) => {
        const pagina = crearPagina(numero, tamano);
        elementos.push(pagina);
        estados.push({ escalaPintada: 0, conTexto: false });
        fragmento.append(pagina);
    });
    contenedor.append(fragmento);
    visor.scrollTo(0, 0);
    cambiar('paginaActual', 0);
    for (const pagina of elementos) {
        observadorPintar.observe(pagina);
        observadorLiberar.observe(pagina);
    }
    visor.focus({ preventScroll: true });
}

// Resolución de pintado: la del zoom por la densidad de la pantalla, con un tope de memoria
function escalaDePintado(numero) {
    const [ancho, alto] = leer('documento').tamanos[numero];
    const deseada = leer('escala') * (window.devicePixelRatio || 1);
    const topePixeles = Math.sqrt(MAX_PIXELES / (ancho * alto));
    const topeLado = MAX_LADO / Math.max(ancho, alto);
    return Math.min(deseada, topePixeles, topeLado);
}

async function pintar(numero, generacion) {
    const escala = escalaDePintado(numero);
    const { bitmap } = await pedir('renderizar', { pagina: numero, escala });
    if (generacion !== generacionActual() || !cercanas.has(numero)) {
        bitmap.close();
        return;
    }
    elementos[numero].querySelector('.pagina__lienzo').getContext('bitmaprenderer').transferFromImageBitmap(bitmap);
    estados[numero].escalaPintada = escala;
    emitir('pagina:pintada', numero);

    if (!estados[numero].conTexto) {
        estados[numero].conTexto = true;
        const lineas = await pedir('texto', { pagina: numero });
        if (generacion === generacionActual() && cercanas.has(numero)) {
            const [ancho, alto] = leer('documento').tamanos[numero];
            rellenarCapaTexto(elementos[numero].querySelector('.capa-texto'), lineas, ancho, alto);
        }
    }
}

function pintarCercanas() {
    const actual = leer('paginaActual');
    const generacion = generacionActual();
    for (const numero of cercanas) {
        if (Math.abs(estados[numero].escalaPintada - escalaDePintado(numero)) < 0.001) {
            continue;
        }
        encolar(`pagina-${numero}`, Math.abs(numero - actual), () => pintar(numero, generacion),
            () => cercanas.has(numero) && generacion === generacionActual());
    }
}

const programarPintado = retrasar(pintarCercanas, 60);

// Cambiar el canvas por uno nuevo es la forma segura de soltar la memoria de la imagen
function liberar(numero) {
    const estado = estados[numero];
    if (!estado || (estado.escalaPintada === 0 && !estado.conTexto)) {
        return;
    }
    const lienzo = elementos[numero].querySelector('.pagina__lienzo');
    const nuevo = document.createElement('canvas');
    nuevo.className = 'pagina__lienzo';
    lienzo.replaceWith(nuevo);
    elementos[numero].querySelector('.capa-texto').replaceChildren();
    estado.escalaPintada = 0;
    estado.conTexto = false;
}

// Tras anotar, deshacer o rehacer: la imagen anterior sigue a la vista hasta que llega la nueva
function repintar(numero) {
    if (estados[numero]) {
        estados[numero].escalaPintada = -1;
        programarPintado();
    }
}

function repintarTodo() {
    for (const estado of estados) {
        if (estado.escalaPintada > 0) {
            estado.escalaPintada = -1;
        }
    }
    programarPintado();
}

// Búsqueda binaria: con cientos de páginas recorrerlas todas en cada scroll se notaría
function paginaEnAltura(y) {
    let bajo = 0;
    let alto = elementos.length - 1;
    while (bajo < alto) {
        const medio = Math.ceil((bajo + alto) / 2);
        if (elementos[medio].offsetTop <= y) {
            bajo = medio;
        } else {
            alto = medio - 1;
        }
    }
    return bajo;
}

function actualizarPaginaActual() {
    if (elementos.length) {
        cambiar('paginaActual', paginaEnAltura(visor.scrollTop + visor.clientHeight * 0.3));
    }
}

function irAPagina(numero) {
    if (!elementos.length) {
        return;
    }
    const destino = limitar(numero, 0, elementos.length - 1);
    visor.scrollTop = elementos[destino].offsetTop - SEPARACION_SUPERIOR;
    cambiar('paginaActual', destino);
}

function mostrarRect({ pagina, rect }) {
    const elemento = elementos[pagina];
    if (!elemento) {
        return;
    }
    const escala = leer('escala');
    const y = elemento.offsetTop + rect.y * escala;
    const x = elemento.offsetLeft + rect.x * escala;
    visor.scrollTop = y - visor.clientHeight / 3;
    if (x < visor.scrollLeft || x + rect.w * escala > visor.scrollLeft + visor.clientWidth) {
        visor.scrollLeft = x - visor.clientWidth / 3;
    }
}

// Mantiene bajo el punto de anclaje (cursor, dedos o centro) el mismo trozo de página tras el zoom
function aplicarEscala(escala) {
    if (!elementos.length) {
        anclaPendiente = null;
        return;
    }
    // Arriba del todo (recién abierto) se sigue arriba del todo, sin anclar
    if (!anclaPendiente && visor.scrollTop === 0) {
        contenedor.style.setProperty('--escala', escala);
        programarPintado();
        return;
    }
    const ancla = anclaPendiente ?? { x: visor.clientWidth / 2, y: visor.clientHeight / 2 };
    anclaPendiente = null;
    const contenidoY = visor.scrollTop + ancla.y;
    const contenidoX = visor.scrollLeft + ancla.x;
    const pagina = elementos[paginaEnAltura(contenidoY)];
    const fraccionY = (contenidoY - pagina.offsetTop) / pagina.offsetHeight;
    const fraccionX = (contenidoX - pagina.offsetLeft) / pagina.offsetWidth;

    contenedor.style.setProperty('--escala', escala);

    visor.scrollTop = pagina.offsetTop + fraccionY * pagina.offsetHeight - ancla.y;
    visor.scrollLeft = pagina.offsetLeft + fraccionX * pagina.offsetWidth - ancla.x;
    programarPintado();
}

function crearObservadores() {
    observadorPintar = new IntersectionObserver((entradas) => {
        for (const entrada of entradas) {
            const numero = Number(entrada.target.dataset.pagina);
            if (entrada.isIntersecting) {
                cercanas.add(numero);
            } else {
                cercanas.delete(numero);
            }
        }
        programarPintado();
    }, { root: visor, rootMargin: '100% 100%' });

    // Margen mayor que el de pintar: así una página no se libera y repinta al mover un poco
    observadorLiberar = new IntersectionObserver((entradas) => {
        for (const entrada of entradas) {
            if (!entrada.isIntersecting) {
                liberar(Number(entrada.target.dataset.pagina));
            }
        }
    }, { root: visor, rootMargin: '300% 300%' });
}

export function iniciarPaginas() {
    visor = document.getElementById('visor');
    contenedor = document.getElementById('paginas');
    crearObservadores();

    let esperandoFotograma = false;
    visor.addEventListener('scroll', () => {
        if (esperandoFotograma) {
            return;
        }
        esperandoFotograma = true;
        requestAnimationFrame(() => {
            esperandoFotograma = false;
            actualizarPaginaActual();
        });
    }, { passive: true });

    escuchar('estado:documento', construir);
    escuchar('estado:escala', aplicarEscala);
    escuchar('zoom:ancla', (ancla) => {
        anclaPendiente = ancla;
    });
    escuchar('pagina:ir', irAPagina);
    escuchar('visor:mostrarRect', mostrarRect);
    escuchar('visor:repintar', repintar);
    escuchar('visor:repintarTodo', repintarTodo);
}
