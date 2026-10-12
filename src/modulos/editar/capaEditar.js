// Fecha: 2026-10-12
// Ruta: /src/modulos/editar/capaEditar.js
// Capa de edición sobre cada página: líneas de texto que se pueden reescribir, cuadros de texto nuevos,
// colocar una imagen y mover, cambiar de tamaño o borrar las imágenes que ya tiene la página
// Notas: todo se coloca en porcentajes del tamaño de la página (el zoom no obliga a recalcular) y la letra
//        sigue a --escala por CSS. El trabajo lo hace el worker (motor/editar.js); aquí solo se señala.

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { registrarCambio } from '../../nucleo/historial.js';
import { mostrarAviso } from '../../ui/dialogos.js';

const ARRASTRE_MINIMO = 6;
const ANCHO_IMAGEN = 150;
const LADO_MINIMO = 8;
const FAMILIAS_CSS = { sans: 'Helvetica, Arial, sans-serif', serif: '"Times New Roman", Times, serif', mono: '"Courier New", Courier, monospace' };
const ERRORES = { OCULTAR_PENDIENTE: 'editar.ocultarPendiente', IMAGEN_SOLAPADA: 'editar.solapada' };

let activo = false;
let herramienta = null;
let formato = null;
let imagenPendiente = null;
let arrastre = null;
let editor = null;
let seleccionada = null;

const tamanoPagina = (pagina) => leer('documento').tamanos[pagina];

function capaDe(pagina) {
    const elemento = document.querySelector(`.pagina[data-pagina="${pagina}"]`);
    if (!elemento) {
        return null;
    }
    let capa = elemento.querySelector('.capa-editar');
    if (!capa) {
        capa = document.createElement('div');
        capa.className = 'capa-editar';
        capa.addEventListener('pointerdown', alPulsar);
        capa.addEventListener('pointermove', alMover);
        capa.addEventListener('pointerup', alSoltar);
        capa.addEventListener('pointercancel', alSoltar);
        elemento.append(capa);
    }
    return capa;
}

const numeroDe = (capa) => Number(capa.closest('.pagina').dataset.pagina);

function puntoEnPagina(capa, evento) {
    const caja = capa.getBoundingClientRect();
    const [ancho, alto] = tamanoPagina(numeroDe(capa));
    return [((evento.clientX - caja.left) / caja.width) * ancho, ((evento.clientY - caja.top) / caja.height) * alto];
}

function colocar(elemento, [x0, y0, x1, y1], [ancho, alto]) {
    elemento.style.left = `${(x0 / ancho) * 100}%`;
    elemento.style.top = `${(y0 / alto) * 100}%`;
    elemento.style.width = `${((x1 - x0) / ancho) * 100}%`;
    elemento.style.height = `${((y1 - y0) / alto) * 100}%`;
}

function aplicarFormato(elemento, datos) {
    elemento.style.fontFamily = FAMILIAS_CSS[datos.familia] ?? FAMILIAS_CSS.sans;
    elemento.style.fontWeight = datos.negrita ? '700' : '400';
    elemento.style.fontStyle = datos.cursiva ? 'italic' : 'normal';
    elemento.style.setProperty('--tamano', datos.tamano);
    elemento.style.color = `rgb(${datos.color.map((v) => Math.round(v * 255)).join(' ')})`;
}

async function ejecutar(pagina, accion, datos) {
    try {
        const resultado = await pedir(accion, { pagina, ...datos });
        emitir('visor:repintar', pagina);
        await registrarCambio();
        emitir('anotaciones:cambiadas', { pagina });
        return resultado;
    } catch (error) {
        console.error(`No se pudo hacer ${accion}:`, error);
        mostrarAviso(t(ERRORES[error.message] ?? 'editar.error'));
        return null;
    }
}

// --- Editar una línea existente ---

function cerrarEditor({ guardar }) {
    if (!editor) {
        return;
    }
    const actual = editor;
    editor = null;
    const texto = actual.campo.value;
    actual.campo.remove();
    if (!guardar) {
        return;
    }
    const datos = { ...actual.formato };
    if (actual.linea) {
        const cambio = texto !== actual.linea.texto || ['tamano', 'familia', 'negrita', 'cursiva'].some((c) => datos[c] !== actual.linea[c])
            || datos.color.some((v, i) => Math.abs(v - actual.linea.color[i]) > 0.01);
        if (cambio) {
            ejecutar(actual.pagina, 'editar:reescribir', { rect: actual.linea.rect, origen: actual.linea.origen, texto, ...datos });
        }
    } else if (texto.trim()) {
        ejecutar(actual.pagina, 'editar:anadirTexto', { x: actual.punto[0], y: actual.punto[1], texto, ...datos });
    }
}

function abrirEditor(capa, { linea = null, punto = null }) {
    cerrarEditor({ guardar: true });
    const pagina = numeroDe(capa);
    const tamano = tamanoPagina(pagina);
    const datos = linea
        ? { tamano: Math.round(linea.tamano * 10) / 10, familia: linea.familia, negrita: linea.negrita, cursiva: linea.cursiva, color: linea.color }
        : { ...formato };
    const campo = document.createElement(linea ? 'input' : 'textarea');
    campo.className = linea ? 'editar-campo' : 'editar-campo editar-campo--nuevo';
    campo.value = linea?.texto ?? '';
    campo.spellcheck = false;
    if (linea) {
        colocar(campo, [linea.rect[0], linea.rect[1], Math.max(linea.rect[2], linea.rect[0] + 60), linea.rect[3]], tamano);
    } else {
        campo.style.left = `${(punto[0] / tamano[0]) * 100}%`;
        campo.style.top = `${(punto[1] / tamano[1]) * 100}%`;
        campo.rows = 2;
        campo.placeholder = t('editar.escribeAqui');
    }
    aplicarFormato(campo, datos);
    editor = { campo, pagina, linea, punto, formato: datos };
    campo.addEventListener('keydown', (evento) => {
        evento.stopPropagation();
        if (evento.key === 'Escape') {
            evento.preventDefault();
            cerrarEditor({ guardar: false });
        } else if (evento.key === 'Enter' && (linea || evento.ctrlKey || evento.metaKey)) {
            evento.preventDefault();
            cerrarEditor({ guardar: true });
        }
    });
    // Al pulsar los controles de formato de la barra no se cierra
    campo.addEventListener('blur', (evento) => {
        if (!evento.relatedTarget?.closest('#barra-editar')) {
            cerrarEditor({ guardar: true });
        }
    });
    capa.append(campo);
    campo.focus();
    if (linea) {
        campo.select();
    }
    emitir('editar:formatoDe', datos);
}

// La barra cambia el formato del texto que se está escribiendo
export function cambiarFormato(datos) {
    formato = { ...datos };
    if (editor) {
        editor.formato = { ...datos };
        aplicarFormato(editor.campo, datos);
    }
}

// --- Imágenes ---

function seleccionar(caja) {
    seleccionada?.classList.remove('editar-imagen--elegida');
    seleccionada = caja;
    caja?.classList.add('editar-imagen--elegida');
}

function rectDeCaja(caja) {
    return caja.dataset.rect.split(',').map(Number);
}

function borrarSeleccionada() {
    if (seleccionada) {
        const caja = seleccionada;
        seleccionada = null;
        ejecutar(numeroDe(caja.parentElement), 'editar:cambiarImagen', { indice: Number(caja.dataset.indice), rect: null });
    }
}

function crearCajaImagen(capa, imagen, indice) {
    const caja = document.createElement('div');
    caja.className = 'editar-imagen';
    caja.dataset.indice = String(indice);
    caja.dataset.rect = imagen.rect.join(',');
    colocar(caja, imagen.rect, tamanoPagina(numeroDe(capa)));
    const asa = document.createElement('span');
    asa.className = 'editar-imagen__asa';
    const quitar = document.createElement('button');
    quitar.type = 'button';
    quitar.className = 'editar-imagen__borrar';
    quitar.title = t('editar.borrarImagen');
    quitar.setAttribute('aria-label', t('editar.borrarImagen'));
    quitar.textContent = '×';
    quitar.addEventListener('pointerdown', (evento) => evento.stopPropagation());
    quitar.addEventListener('click', () => {
        seleccionar(caja);
        borrarSeleccionada();
    });
    caja.append(asa, quitar);
    return caja;
}

// --- Puntero: mover/cambiar tamaño de imágenes, colocar imagen nueva, texto nuevo ---

function alPulsar(evento) {
    const capa = evento.currentTarget;
    if (evento.button !== 0 || evento.target.closest('.editar-campo')) {
        return;
    }
    const punto = puntoEnPagina(capa, evento);
    if (herramienta === 'imagenes') {
        const caja = evento.target.closest('.editar-imagen');
        seleccionar(caja);
        if (!caja) {
            return;
        }
        evento.preventDefault();
        capa.setPointerCapture(evento.pointerId);
        arrastre = { capa, caja, inicio: punto, original: rectDeCaja(caja), modo: evento.target.classList.contains('editar-imagen__asa') ? 'tamano' : 'mover', rect: null };
    } else if (herramienta === 'imagen' && imagenPendiente) {
        evento.preventDefault();
        capa.setPointerCapture(evento.pointerId);
        const marco = document.createElement('div');
        marco.className = 'editar-marco';
        capa.append(marco);
        arrastre = { capa, inicio: punto, marco, modo: 'colocar', rect: null };
    } else if (herramienta === 'nuevoTexto') {
        evento.preventDefault();
        abrirEditor(capa, { punto });
    } else if (herramienta === 'texto') {
        const caja = evento.target.closest('.editar-linea');
        if (caja) {
            evento.preventDefault();
            abrirEditor(capa, { linea: caja.linea });
        }
    }
}

function rectArrastrado(punto) {
    const [dx, dy] = [punto[0] - arrastre.inicio[0], punto[1] - arrastre.inicio[1]];
    if (arrastre.modo === 'colocar') {
        return [Math.min(arrastre.inicio[0], punto[0]), Math.min(arrastre.inicio[1], punto[1]), Math.max(arrastre.inicio[0], punto[0]), Math.max(arrastre.inicio[1], punto[1])];
    }
    const [x0, y0, x1, y1] = arrastre.original;
    if (arrastre.modo === 'mover') {
        return [x0 + dx, y0 + dy, x1 + dx, y1 + dy];
    }
    // Cambiar de tamaño desde la esquina de abajo a la derecha, sin deformar
    const ancho = Math.max(LADO_MINIMO, x1 - x0 + dx);
    return [x0, y0, x0 + ancho, y0 + ancho * ((y1 - y0) / (x1 - x0))];
}

function alMover(evento) {
    if (!arrastre) {
        return;
    }
    const punto = puntoEnPagina(arrastre.capa, evento);
    if (!arrastre.rect && Math.hypot(punto[0] - arrastre.inicio[0], punto[1] - arrastre.inicio[1]) < ARRASTRE_MINIMO) {
        return;
    }
    arrastre.rect = rectArrastrado(punto);
    colocar(arrastre.marco ?? arrastre.caja, arrastre.rect, tamanoPagina(numeroDe(arrastre.capa)));
}

async function colocarImagen(capa, rect, punto) {
    const pagina = numeroDe(capa);
    const [anchoPagina] = tamanoPagina(pagina);
    let destino = rect;
    if (!destino || destino[2] - destino[0] < LADO_MINIMO || destino[3] - destino[1] < LADO_MINIMO) {
        // Un toque: la imagen a un tamaño razonable, centrada donde se tocó y sin deformar
        const ancho = Math.min(ANCHO_IMAGEN, anchoPagina * 0.5);
        const alto = ancho * (imagenPendiente.alto / imagenPendiente.ancho);
        destino = [punto[0] - ancho / 2, punto[1] - alto / 2, punto[0] + ancho / 2, punto[1] + alto / 2];
    }
    const bytes = imagenPendiente.bytes;
    imagenPendiente = null;
    emitir('editar:imagenColocada');
    await ejecutar(pagina, 'editar:anadirImagen', { rect: destino, bytes });
}

function alSoltar(evento) {
    if (!arrastre) {
        return;
    }
    const { capa, caja, marco, modo, rect, inicio } = arrastre;
    arrastre = null;
    if (capa.hasPointerCapture(evento.pointerId)) {
        capa.releasePointerCapture(evento.pointerId);
    }
    if (modo === 'colocar') {
        marco.remove();
        colocarImagen(capa, rect, inicio);
    } else if (rect) {
        ejecutar(numeroDe(capa), 'editar:cambiarImagen', { indice: Number(caja.dataset.indice), rect });
    }
}

// --- Contenido de la capa según la herramienta ---

async function refrescar(pagina) {
    const capa = activo ? capaDe(pagina) : null;
    if (!capa || editor?.pagina === pagina) {
        return;
    }
    const pedida = herramienta;
    let elementos = [];
    try {
        if (pedida === 'texto') {
            const lineas = await pedir('editar:lineas', { pagina });
            elementos = lineas.map((linea) => {
                const caja = document.createElement('div');
                caja.className = 'editar-linea';
                caja.title = t('editar.pistaLinea');
                caja.linea = linea;
                colocar(caja, linea.rect, tamanoPagina(pagina));
                return caja;
            });
        } else if (pedida === 'imagenes') {
            const imagenes = await pedir('editar:imagenes', { pagina });
            elementos = imagenes.map((imagen, indice) => crearCajaImagen(capa, imagen, indice));
        }
    } catch (error) {
        console.warn('No se pudo preparar la capa de edición:', error);
    }
    if (activo && herramienta === pedida && editor?.pagina !== pagina) {
        if (seleccionada?.parentElement === capa) {
            seleccionada = null;
        }
        capa.replaceChildren(...elementos);
    }
}

function refrescarVisibles() {
    for (const elemento of document.querySelectorAll('.pagina')) {
        if (elemento.querySelector('.pagina__lienzo')?.width > 0) {
            refrescar(Number(elemento.dataset.pagina));
        }
    }
}

export function ponerHerramienta(nombre, formatoActual) {
    cerrarEditor({ guardar: true });
    seleccionar(null);
    herramienta = nombre;
    formato = { ...formatoActual };
    document.body.dataset.editar = nombre ?? '';
    refrescarVisibles();
}

export function prepararImagen(datos) {
    imagenPendiente = datos;
}

export function activarCapas(valor) {
    activo = valor;
    if (!valor) {
        cerrarEditor({ guardar: true });
        imagenPendiente = null;
        seleccionar(null);
        for (const capa of document.querySelectorAll('.capa-editar')) {
            capa.replaceChildren();
        }
    }
}

export function iniciarCapaEditar() {
    escuchar('pagina:pintada', (pagina) => activo && refrescar(pagina));
    document.addEventListener('keydown', (evento) => {
        if (activo && seleccionada && (evento.key === 'Delete' || evento.key === 'Backspace') && !evento.target?.closest?.('input, textarea, select')) {
            evento.preventDefault();
            borrarSeleccionada();
        }
    });
}
