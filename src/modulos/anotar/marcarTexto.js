// Fecha: 2026-10-12
// Ruta: /src/modulos/anotar/marcarTexto.js
// Resaltar, subrayar y tachar texto
// Al soltar una selección de texto con una de esas herramientas activas, se crea la anotación
// Notas: la selección la hace el navegador sobre la capa de texto del visor; de ella solo se toman
//        el punto inicial y el final en coordenadas de página, y MuPDF calcula los cuadriláteros
//        exactos del texto que hay entre ambos (así el resaltado sigue las líneas de verdad).

import { escuchar } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { pedir } from '../../motor/cliente.js';
import { getAjustes, colorAMupdf } from './anotar.js';
import { crearAnotacion } from './capaAnotaciones.js';
import { DE_TEXTO } from './herramientas.js';

function paginaDe(nodo) {
    const elemento = nodo.nodeType === Node.TEXT_NODE ? nodo.parentElement : nodo;
    return elemento?.closest('.pagina') ?? null;
}

function puntoEnPagina(pagina, x, y) {
    const caja = pagina.getBoundingClientRect();
    const [ancho, alto] = leer('documento').tamanos[Number(pagina.dataset.pagina)];
    return [((x - caja.left) / caja.width) * ancho, ((y - caja.top) / caja.height) * alto];
}

// Extremos de la selección como puntos de página: inicio = esquina superior izquierda del primer
// rectángulo; fin = un poco antes del borde derecho del último, en su centro vertical
function extremos(rango, pagina) {
    const rects = [...rango.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) {
        return null;
    }
    const primero = rects[0];
    const ultimo = rects.at(-1);
    return {
        a: puntoEnPagina(pagina, primero.left + 1, primero.top + primero.height / 2),
        b: puntoEnPagina(pagina, ultimo.right - 1, ultimo.top + ultimo.height / 2)
    };
}

async function marcar() {
    const ajustes = getAjustes();
    if (!ajustes.activo || !DE_TEXTO.has(ajustes.herramienta)) {
        return;
    }
    const seleccion = window.getSelection();
    if (!seleccion || seleccion.isCollapsed || seleccion.rangeCount === 0) {
        return;
    }
    const rango = seleccion.getRangeAt(0);
    const pagina = paginaDe(rango.startContainer);
    if (!pagina || pagina !== paginaDe(rango.endContainer)) {
        return;
    }
    const puntos = extremos(rango, pagina);
    seleccion.removeAllRanges();
    if (!puntos) {
        return;
    }
    const numero = Number(pagina.dataset.pagina);
    const quads = await pedir('anotaciones:quadsEntre', { pagina: numero, ...puntos });
    if (!quads.length) {
        return;
    }
    await crearAnotacion(numero, ajustes.herramienta, {
        quads,
        color: colorAMupdf(ajustes.color),
        opacidad: ajustes.opacidad
    });
}

export function iniciarMarcarTexto() {
    // pointerup llega antes de que el navegador cierre la selección: se espera un instante
    document.addEventListener('pointerup', () => setTimeout(marcar, 0));
    escuchar('anotar:herramienta', () => window.getSelection()?.removeAllRanges());
}
