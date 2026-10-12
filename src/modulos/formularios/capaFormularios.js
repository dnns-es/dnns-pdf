// Fecha: 2026-10-12
// Ruta: /src/modulos/formularios/capaFormularios.js
// Capa de campos sobre cada página: controles HTML colocados encima de cada campo del PDF
// Texto, casillas, opciones, desplegables y listas; cada cambio se escribe en el PDF (worker) y se repinta la
// página. Con una herramienta de diseño activa, un toque o un recuadro crea un campo nuevo; cada campo lleva
// un botón para borrarlo.
// Notas: los controles se colocan en porcentajes del tamaño de la página, así el zoom no obliga a recalcular;
//        el tamaño de letra sigue a --escala por CSS.

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { registrarCambio } from '../../nucleo/historial.js';
import { mostrarAviso } from '../../ui/dialogos.js';

const EDITABLES = new Set(['texto', 'casilla', 'opcion', 'desplegable', 'lista']);
const LETRA_MAXIMA = 12;
const LADO_CASILLA = 14;
const ANCHO_MINIMO = 20;
const ALTO_MINIMO = 10;
const CAMPO_POR_DEFECTO = [150, 20];
const FILAS_LISTA = 6;

let activo = false;
let herramienta = null;
let dibujo = null;

function capaDe(pagina) {
    const elemento = document.querySelector(`.pagina[data-pagina="${pagina}"]`);
    if (!elemento) {
        return null;
    }
    let capa = elemento.querySelector('.capa-formularios');
    if (!capa) {
        capa = document.createElement('div');
        capa.className = 'capa-formularios';
        capa.addEventListener('pointerdown', alPulsar);
        capa.addEventListener('pointermove', alMover);
        capa.addEventListener('pointerup', alSoltar);
        capa.addEventListener('pointercancel', alSoltar);
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
    const [ancho, alto] = leer('documento').tamanos[numeroDe(capa)];
    return [((evento.clientX - caja.left) / caja.width) * ancho, ((evento.clientY - caja.top) / caja.height) * alto];
}

function colocar(elemento, [x0, y0, x1, y1], [ancho, alto]) {
    elemento.style.left = `${(x0 / ancho) * 100}%`;
    elemento.style.top = `${(y0 / alto) * 100}%`;
    elemento.style.width = `${((x1 - x0) / ancho) * 100}%`;
    elemento.style.height = `${((y1 - y0) / alto) * 100}%`;
}

async function tomarCambio(pagina) {
    emitir('visor:repintar', pagina);
    await registrarCambio();
    emitir('anotaciones:cambiadas', { pagina });
}

async function cambiar(pagina, campo, valor) {
    try {
        await pedir('formularios:cambiar', { pagina, id: campo.id, valor });
        await tomarCambio(pagina);
        // Las opciones de un grupo cambian juntas: se vuelve a leer la página
        if (campo.tipo === 'opcion') {
            refrescarCapa(pagina);
        }
    } catch (error) {
        console.error('No se pudo cambiar el campo:', error);
        mostrarAviso(t('formularios.error'));
    }
}

async function borrar(pagina, campo) {
    try {
        await pedir('formularios:borrar', { pagina, id: campo.id });
        await tomarCambio(pagina);
        refrescarCapa(pagina);
    } catch (error) {
        console.error('No se pudo borrar el campo:', error);
        mostrarAviso(t('formularios.error'));
    }
}

async function crear(pagina, tipo, rect) {
    try {
        await pedir('formularios:crear', { pagina, tipo, rect });
        await tomarCambio(pagina);
        refrescarCapa(pagina);
    } catch (error) {
        console.error('No se pudo crear el campo:', error);
        mostrarAviso(t('formularios.error'));
    }
}

function controlDeTexto(campo, pagina) {
    const control = campo.multilinea ? document.createElement('textarea') : document.createElement('input');
    if (!campo.multilinea) {
        control.type = campo.password ? 'password' : 'text';
    }
    control.value = campo.valor;
    if (campo.maxLen > 0) {
        control.maxLength = campo.maxLen;
    }
    control.addEventListener('change', () => cambiar(pagina, campo, control.value));
    return control;
}

function controlDeMarca(campo, pagina) {
    const control = document.createElement('input');
    control.type = campo.tipo === 'casilla' ? 'checkbox' : 'radio';
    // Las opciones del mismo campo se excluyen entre sí, como en el PDF
    control.name = `campo-${pagina}-${campo.nombre}`;
    control.checked = campo.marcada;
    control.addEventListener('change', () => cambiar(pagina, campo, control.checked));
    return control;
}

function controlDeOpciones(campo, pagina) {
    const control = document.createElement('select');
    if (campo.tipo === 'lista') {
        control.size = Math.min(FILAS_LISTA, Math.max(2, campo.opciones.length));
    }
    for (const texto of campo.opciones) {
        const opcion = document.createElement('option');
        opcion.value = texto;
        opcion.textContent = texto;
        control.append(opcion);
    }
    control.value = campo.valor;
    control.addEventListener('change', () => cambiar(pagina, campo, control.value));
    return control;
}

function crearControl(campo, pagina, tamano) {
    const caja = document.createElement('div');
    caja.className = `campo campo--${campo.tipo}`;
    colocar(caja, campo.rect, tamano);
    const alto = campo.rect[3] - campo.rect[1];
    caja.style.setProperty('--letra', campo.multilinea ? 10 : Math.max(6, Math.min(LETRA_MAXIMA, alto * 0.6)));
    const control = campo.tipo === 'texto' ? controlDeTexto(campo, pagina)
        : campo.tipo === 'casilla' || campo.tipo === 'opcion' ? controlDeMarca(campo, pagina)
            : controlDeOpciones(campo, pagina);
    control.disabled = campo.soloLectura;
    // Nombres y etiquetas vienen del PDF: solo como texto
    control.title = campo.etiqueta || campo.nombre;
    const quitar = document.createElement('button');
    quitar.type = 'button';
    quitar.className = 'campo__borrar';
    quitar.textContent = '×';
    quitar.title = t('formularios.borrarCampo');
    quitar.addEventListener('click', () => borrar(pagina, campo));
    caja.append(control, quitar);
    return caja;
}

export async function refrescarCapa(pagina) {
    const documento = leer('documento');
    if (!documento || !activo) {
        return;
    }
    const capa = capaDe(pagina);
    if (!capa) {
        return;
    }
    let campos = [];
    try {
        campos = await pedir('formularios:listar', { pagina });
    } catch (error) {
        console.error('No se pudieron listar los campos:', error);
    }
    const tamano = documento.tamanos[pagina];
    capa.replaceChildren(...campos.filter((c) => EDITABLES.has(c.tipo)).map((c) => crearControl(c, pagina, tamano)));
}

// Las páginas a la vista (y las de alrededor); el resto se refresca cuando el visor las pinta
function refrescarVisibles() {
    const visor = document.getElementById('visor');
    const zona = visor.getBoundingClientRect();
    const margen = zona.height;
    for (const elemento of document.querySelectorAll('.pagina')) {
        const caja = elemento.getBoundingClientRect();
        if (caja.bottom >= zona.top - margen && caja.top <= zona.bottom + margen) {
            refrescarCapa(Number(elemento.dataset.pagina));
        }
    }
}

export function activarCapas(valor) {
    activo = valor;
    if (activo) {
        refrescarVisibles();
    } else {
        for (const capa of document.querySelectorAll('.capa-formularios')) {
            capa.replaceChildren();
        }
    }
}

export function ponerHerramienta(nombre) {
    herramienta = nombre;
    document.body.dataset.campoNuevo = nombre ?? '';
}

// ---- Diseño: un toque crea una casilla; un recuadro arrastrado, un campo de texto

function alPulsar(evento) {
    const capa = evento.currentTarget;
    if (!herramienta || evento.target !== capa || evento.button !== 0) {
        return;
    }
    evento.preventDefault();
    const pagina = numeroDe(capa);
    const [x, y] = puntoEnPagina(capa, evento);
    if (herramienta === 'casilla') {
        crear(pagina, 'casilla', [x - LADO_CASILLA / 2, y - LADO_CASILLA / 2]);
        return;
    }
    capa.setPointerCapture(evento.pointerId);
    const marco = document.createElement('div');
    marco.className = 'campo-dibujo';
    capa.append(marco);
    dibujo = { capa, pagina, inicio: [x, y], fin: [x, y], marco };
    pintarDibujo();
}

function rectDibujo() {
    const [x0, y0] = dibujo.inicio;
    const [x1, y1] = dibujo.fin;
    return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
}

function pintarDibujo() {
    colocar(dibujo.marco, rectDibujo(), leer('documento').tamanos[dibujo.pagina]);
}

function alMover(evento) {
    if (!dibujo || dibujo.capa !== evento.currentTarget) {
        return;
    }
    dibujo.fin = puntoEnPagina(dibujo.capa, evento);
    pintarDibujo();
}

function alSoltar(evento) {
    if (!dibujo || dibujo.capa !== evento.currentTarget) {
        return;
    }
    const { capa, pagina, marco } = dibujo;
    let rect = rectDibujo();
    dibujo = null;
    marco.remove();
    capa.releasePointerCapture?.(evento.pointerId);
    // Un toque sin arrastrar crea un campo de tamaño normal en ese punto
    if (rect[2] - rect[0] < ANCHO_MINIMO || rect[3] - rect[1] < ALTO_MINIMO) {
        rect = [rect[0], rect[1], rect[0] + CAMPO_POR_DEFECTO[0], rect[1] + CAMPO_POR_DEFECTO[1]];
    }
    crear(pagina, 'texto', rect);
}

export function iniciarCapaFormularios() {
    escuchar('pagina:pintada', (pagina) => refrescarCapa(pagina));
    escuchar('estado:documento', () => {
        dibujo = null;
    });
    // Deshacer y rehacer pueden cambiar valores o campos: se vuelven a leer las páginas a la vista
    escuchar('historial:cambiado', ({ repintar }) => repintar && activo && refrescarVisibles());
    escuchar('documento:estructura', () => activo && refrescarVisibles());
}
