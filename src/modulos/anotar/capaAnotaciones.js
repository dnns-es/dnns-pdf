// Fecha: 2026-10-12
// Ruta: /src/modulos/anotar/capaAnotaciones.js
// Capa SVG sobre cada página para anotar
// Dibuja en vivo con la herramienta activa, y permite seleccionar, mover y borrar anotaciones existentes
// Notas: el SVG usa viewBox = tamaño de la página en puntos PDF, así las coordenadas del dibujo son
//        directamente las del PDF y el zoom no obliga a recalcular nada. Tras cada cambio se pide al
//        visor que repinte la página (MuPDF dibuja la anotación definitiva) y se refrescan los
//        rectángulos de selección.

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { escribiendoEnCampo } from '../../nucleo/utilidades.js';
import { pedir } from '../../motor/cliente.js';
import { registrarCambio } from '../../nucleo/historial.js';
import { pedirTexto, mostrarAviso } from '../../ui/dialogos.js';
import { t } from '../../nucleo/i18n.js';
import { getAjustes } from './anotar.js';
import { DE_ARRASTRE, DE_CLIC, DE_TEXTO } from './herramientas.js';

const SVG = 'http://www.w3.org/2000/svg';
const DISTANCIA_ARRASTRE = 3;

let seleccion = null;
let dibujo = null;

// La capa se crea la primera vez que el visor pinta la página (el visor no conoce este módulo)
function capaDe(pagina) {
    const elemento = document.querySelector(`.pagina[data-pagina="${pagina}"]`);
    if (!elemento) {
        return null;
    }
    let capa = elemento.querySelector('.capa-anotar');
    if (!capa) {
        capa = crearCapaAnotar(leer('documento').tamanos[pagina]);
        elemento.append(capa);
    }
    return capa;
}

function numeroDe(capa) {
    return Number(capa.closest('.pagina').dataset.pagina);
}

// Coordenadas del puntero -> puntos PDF de la página
function puntoEnPagina(capa, evento) {
    const caja = capa.getBoundingClientRect();
    const [, , ancho, alto] = capa.getAttribute('viewBox').split(' ').map(Number);
    return [((evento.clientX - caja.left) / caja.width) * ancho, ((evento.clientY - caja.top) / caja.height) * alto];
}

function elementoSvg(nombre, atributos) {
    const elemento = document.createElementNS(SVG, nombre);
    for (const [clave, valor] of Object.entries(atributos)) {
        elemento.setAttribute(clave, valor);
    }
    return elemento;
}

function crearCapaAnotar([ancho, alto]) {
    const capa = elementoSvg('svg', { class: 'capa-anotar', viewBox: `0 0 ${ancho} ${alto}`, preserveAspectRatio: 'none' });
    const defs = elementoSvg('defs', {});
    const marcador = elementoSvg('marker', { id: 'punta-flecha', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 4, markerHeight: 4, orient: 'auto-start-reverse' });
    marcador.append(elementoSvg('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'context-stroke' }));
    defs.append(marcador);
    const existentes = elementoSvg('g', { class: 'capa-anotar__existentes' });
    const dibujoVivo = elementoSvg('g', { class: 'capa-anotar__dibujo' });
    capa.append(defs, existentes, dibujoVivo);
    capa.addEventListener('pointerdown', alPulsar);
    capa.addEventListener('dblclick', alDobleClic);
    return capa;
}

// ---- Anotaciones existentes: un rectángulo invisible por anotación para poder seleccionarla

export async function refrescarCapa(pagina) {
    if (!leer('documento')) {
        return;
    }
    const capa = capaDe(pagina);
    if (!capa) {
        return;
    }
    let lista = [];
    try {
        lista = await pedir('anotaciones:listar', { pagina });
    } catch (error) {
        console.error('No se pudieron listar las anotaciones:', error);
    }
    const grupo = capa.querySelector('.capa-anotar__existentes');
    grupo.replaceChildren(...lista.map((anotacion) => {
        const [x0, y0, x1, y1] = anotacion.limites;
        const rect = elementoSvg('rect', { class: 'anotacion-hit', x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) });
        rect.dataset.id = String(anotacion.id);
        rect.dataset.movible = String(anotacion.movible);
        rect.dataset.tipo = anotacion.tipo;
        if (seleccion && seleccion.pagina === pagina && seleccion.id === anotacion.id) {
            rect.classList.add('anotacion-hit--seleccionada');
        }
        return rect;
    }));
}

function seleccionar(pagina, id) {
    document.querySelector('.anotacion-hit--seleccionada')?.classList.remove('anotacion-hit--seleccionada');
    seleccion = id === null ? null : { pagina, id };
    if (seleccion) {
        capaDe(pagina)?.querySelector(`.anotacion-hit[data-id="${id}"]`)?.classList.add('anotacion-hit--seleccionada');
    }
    emitir('anotar:seleccion', seleccion);
}

async function tomarCambio(pagina) {
    emitir('visor:repintar', pagina);
    await refrescarCapa(pagina);
    await registrarCambio();
    emitir('anotaciones:cambiadas', { pagina });
}

export async function crearAnotacion(pagina, herramienta, datos) {
    try {
        const creada = await pedir('anotaciones:crear', { pagina, herramienta, datos: { autor: '', ...datos } });
        await tomarCambio(pagina);
        return creada;
    } catch (error) {
        console.error('No se pudo crear la anotación:', error);
        mostrarAviso(t('anotar.error'));
        return null;
    }
}

export async function borrarAnotacion(pagina, id) {
    try {
        await pedir('anotaciones:borrar', { pagina, id });
        if (seleccion?.id === id) {
            seleccion = null;
            emitir('anotar:seleccion', null);
        }
        await tomarCambio(pagina);
    } catch (error) {
        console.error('No se pudo borrar la anotación:', error);
        mostrarAviso(t('anotar.error'));
    }
}

async function moverAnotacion(pagina, rectHit, dx, dy) {
    const x = Number(rectHit.getAttribute('x')) + dx;
    const y = Number(rectHit.getAttribute('y')) + dy;
    const ancho = Number(rectHit.getAttribute('width'));
    const alto = Number(rectHit.getAttribute('height'));
    try {
        await pedir('anotaciones:modificar', { pagina, id: Number(rectHit.dataset.id), datos: { rect: [x, y, x + ancho, y + alto] } });
        await tomarCambio(pagina);
    } catch (error) {
        console.error('No se pudo mover la anotación:', error);
    }
}

export async function editarContenido(pagina, id, tipo) {
    if (tipo !== 'Text' && tipo !== 'FreeText') {
        return;
    }
    const lista = await pedir('anotaciones:listar', { pagina });
    const actual = lista.find((a) => a.id === id);
    const nuevo = await pedirTexto(tipo === 'Text' ? 'anotar.pedirNota' : 'anotar.pedirTexto', actual?.contenido ?? '');
    if (nuevo === null || nuevo === actual?.contenido) {
        return;
    }
    try {
        await pedir('anotaciones:modificar', { pagina, id, datos: { contenido: nuevo } });
        await tomarCambio(pagina);
    } catch (error) {
        console.error('No se pudo editar la anotación:', error);
    }
}

// ---- Puntero

function alPulsar(evento) {
    const ajustes = getAjustes();
    if (!ajustes.activo || evento.button !== 0) {
        return;
    }
    const capa = evento.currentTarget;
    const pagina = numeroDe(capa);
    const punto = puntoEnPagina(capa, evento);

    if (ajustes.herramienta === 'seleccionar') {
        empezarSeleccion(evento, capa, pagina, punto);
        return;
    }
    if (DE_CLIC[ajustes.herramienta]) {
        evento.preventDefault();
        colocar(ajustes.herramienta, pagina, punto, ajustes);
        return;
    }
    const herramienta = DE_ARRASTRE[ajustes.herramienta];
    if (!herramienta) {
        return;
    }
    evento.preventDefault();
    capa.setPointerCapture(evento.pointerId);
    dibujo = { herramienta, pagina, capa, estado: herramienta.empezar(punto, capa.querySelector('.capa-anotar__dibujo'), ajustes) };
    capa.addEventListener('pointermove', alMover);
    capa.addEventListener('pointerup', alSoltar);
    capa.addEventListener('pointercancel', alSoltar);
}

function alMover(evento) {
    if (dibujo) {
        dibujo.herramienta.mover(puntoEnPagina(dibujo.capa, evento), dibujo.estado);
    }
}

async function alSoltar(evento) {
    if (!dibujo) {
        return;
    }
    const { herramienta, pagina, capa, estado } = dibujo;
    dibujo = null;
    capa.removeEventListener('pointermove', alMover);
    capa.removeEventListener('pointerup', alSoltar);
    capa.removeEventListener('pointercancel', alSoltar);
    const datos = herramienta.terminar(puntoEnPagina(capa, evento), estado, getAjustes());
    if (datos) {
        await crearAnotacion(pagina, getAjustes().herramienta, datos);
    }
}

async function colocar(nombre, pagina, punto, ajustes) {
    const datos = await DE_CLIC[nombre].colocar(punto, ajustes);
    if (datos) {
        await crearAnotacion(pagina, nombre, datos);
    }
}

function empezarSeleccion(evento, capa, pagina, punto) {
    const hit = evento.target.closest?.('.anotacion-hit');
    if (!hit) {
        seleccionar(pagina, null);
        return;
    }
    evento.preventDefault();
    seleccionar(pagina, Number(hit.dataset.id));
    if (hit.dataset.movible !== 'true') {
        return;
    }
    // Arrastre: mover una copia visual y, al soltar, pedir el cambio al motor
    capa.setPointerCapture(evento.pointerId);
    const origen = punto;
    let desplazamiento = [0, 0];
    const mover = (ev) => {
        const actual = puntoEnPagina(capa, ev);
        desplazamiento = [actual[0] - origen[0], actual[1] - origen[1]];
        hit.setAttribute('transform', `translate(${desplazamiento[0]} ${desplazamiento[1]})`);
    };
    const soltar = () => {
        capa.removeEventListener('pointermove', mover);
        capa.removeEventListener('pointerup', soltar);
        capa.removeEventListener('pointercancel', soltar);
        hit.removeAttribute('transform');
        if (Math.hypot(desplazamiento[0], desplazamiento[1]) >= DISTANCIA_ARRASTRE) {
            moverAnotacion(pagina, hit, desplazamiento[0], desplazamiento[1]);
        }
    };
    capa.addEventListener('pointermove', mover);
    capa.addEventListener('pointerup', soltar);
    capa.addEventListener('pointercancel', soltar);
}

function alDobleClic(evento) {
    const hit = evento.target.closest?.('.anotacion-hit');
    if (hit && getAjustes().activo) {
        editarContenido(numeroDe(evento.currentTarget), Number(hit.dataset.id), hit.dataset.tipo);
    }
}

function alTecla(evento) {
    if (!seleccion || escribiendoEnCampo(evento) || document.querySelector('dialog[open]')) {
        return;
    }
    if (evento.key === 'Delete' || evento.key === 'Backspace') {
        evento.preventDefault();
        borrarAnotacion(seleccion.pagina, seleccion.id);
    } else if (evento.key === 'Escape') {
        seleccionar(seleccion.pagina, null);
    }
}

function aplicarModo() {
    const ajustes = getAjustes();
    // Con las herramientas de texto la capa se aparta para que se pueda seleccionar texto debajo
    const recibe = ajustes.activo && !DE_TEXTO.has(ajustes.herramienta);
    document.body.classList.toggle('anotando', ajustes.activo);
    document.body.classList.toggle('anotando--capa', recibe);
    document.body.dataset.herramienta = ajustes.activo ? ajustes.herramienta : '';
    if (!ajustes.activo && seleccion) {
        seleccionar(seleccion.pagina, null);
    }
}

export function iniciarCapas() {
    document.addEventListener('keydown', alTecla);
    escuchar('anotar:modo', aplicarModo);
    escuchar('anotar:herramienta', aplicarModo);
    escuchar('estado:documento', () => {
        seleccion = null;
        emitir('anotar:seleccion', null);
    });
    escuchar('pagina:pintada', (pagina) => refrescarCapa(pagina));
    escuchar('historial:cambiado', ({ repintar }) => {
        if (repintar) {
            seleccion = null;
            emitir('anotar:seleccion', null);
            emitir('visor:repintarTodo');
            emitir('anotaciones:cambiadas', { pagina: null });
        }
    });
}
