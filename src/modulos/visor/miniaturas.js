// Fecha: 2026-10-12
// Ruta: /src/modulos/visor/miniaturas.js
// Miniaturas de las páginas en el panel lateral
// Se pintan solo las que se ven en el panel; un clic lleva a esa página
// Notas: van a la cola con prioridad baja para no retrasar las páginas del visor

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { encolar, cancelar, generacionActual } from './colaRender.js';

const ANCHO_MINIATURA = 132;
const PRIORIDAD_BASE = 100000;

let lista = null;
let botones = [];
const pintadas = new Set();
let observador = null;

function crearMiniatura(numero, [ancho, alto]) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'miniatura';
    boton.dataset.pagina = String(numero);
    boton.setAttribute('aria-label', t('panel.pagina', { numero: numero + 1 }));
    const hoja = document.createElement('div');
    hoja.className = 'miniatura__hoja';
    hoja.style.aspectRatio = `${ancho} / ${alto}`;
    hoja.append(document.createElement('canvas'));
    const etiqueta = document.createElement('span');
    etiqueta.className = 'miniatura__numero';
    etiqueta.textContent = String(numero + 1);
    boton.append(hoja, etiqueta);
    boton.addEventListener('click', () => {
        emitir('pagina:ir', numero);
        emitir('panel:elegido');
    });
    return boton;
}

async function pintarMiniatura(numero, generacion) {
    const [ancho] = leer('documento').tamanos[numero];
    const escala = (ANCHO_MINIATURA * (window.devicePixelRatio || 1)) / ancho;
    const { bitmap } = await pedir('renderizar', { pagina: numero, escala });
    if (generacion !== generacionActual()) {
        bitmap.close();
        return;
    }
    botones[numero].querySelector('canvas').getContext('bitmaprenderer').transferFromImageBitmap(bitmap);
    pintadas.add(numero);
}

function alVerse(entradas) {
    const generacion = generacionActual();
    for (const entrada of entradas) {
        const numero = Number(entrada.target.dataset.pagina);
        const clave = `miniatura-${numero}`;
        if (!entrada.isIntersecting) {
            cancelar(clave);
        } else if (!pintadas.has(numero)) {
            encolar(clave, PRIORIDAD_BASE + numero, () => pintarMiniatura(numero, generacion),
                () => generacion === generacionActual());
        }
    }
}

function construir(documento) {
    observador.disconnect();
    pintadas.clear();
    botones = documento ? documento.tamanos.map((tamano, numero) => crearMiniatura(numero, tamano)) : [];
    lista.replaceChildren(...botones);
    botones.forEach((boton) => observador.observe(boton));
    marcarActual(leer('paginaActual') ?? 0);
}

function marcarActual(numero) {
    lista.querySelector('.miniatura--actual')?.classList.remove('miniatura--actual');
    const boton = botones[numero];
    if (!boton) {
        return;
    }
    boton.classList.add('miniatura--actual');
    if (!lista.hidden && !document.getElementById('panel-lateral').hidden) {
        boton.scrollIntoView({ block: 'nearest' });
    }
}

export function iniciarMiniaturas() {
    lista = document.getElementById('lista-miniaturas');
    observador = new IntersectionObserver(alVerse, { root: lista, rootMargin: '300px 0px' });
    escuchar('estado:documento', construir);
    escuchar('documento:estructura', construir);
    // Tras deshacer o rehacer el contenido de cualquier página puede haber cambiado
    escuchar('historial:cambiado', ({ repintar }) => repintar && construir(leer('documento')));
    escuchar('estado:paginaActual', marcarActual);
}
