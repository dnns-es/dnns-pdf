// Fecha: 2026-10-12
// Ruta: /src/modulos/organizar/organizar.js
// Módulo Organizar: vista de páginas en cuadrícula y sus operaciones
// Rotar, borrar, duplicar, mover, insertar, extraer, dividir, recortar; unir PDF e imágenes a PDF
// Notas: cada operación la hace el worker dentro del historial, así Deshacer funciona igual que al anotar.
//        Tras cada una se avisa a todas las vistas con registrarCambioDePaginas (nucleo/historial.js).

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { escribiendoEnCampo } from '../../nucleo/utilidades.js';
import { registrarCambioDePaginas } from '../../nucleo/historial.js';
import { pedir } from '../../motor/cliente.js';
import { mostrarAviso, confirmar } from '../../ui/dialogos.js';
import { guardarArchivo } from '../../plataforma/index.js';
import { iniciarCuadricula, construir, seleccionadas, seleccionar, seleccionarTodo } from './cuadricula.js';
import { elegirArchivos, esImagen, bytesDe, nombreBase } from './archivos.js';
import { iniciarCrearPdf, abrirCrearPdf } from './crearPdf.js';
import { pedirDivision } from './dividir.js';
import { pedirRecorte } from './recortar.js';

const $ = (id) => document.getElementById(id);

let abierta = false;

function mostrarVista(visible) {
    abierta = visible;
    $('vista-organizar').hidden = !visible;
    $('visor').hidden = visible;
    $('boton-organizar').setAttribute('aria-pressed', String(visible));
    document.body.classList.toggle('organizando', visible);
    if (visible) {
        // Si se estaba anotando, se deja de anotar: la vista de páginas no tiene capa de dibujo
        emitir('anotar:salir');
        construir();
        const actual = leer('paginaActual');
        seleccionar([actual]);
        $('organizar-cuadricula').querySelector(`.tarjeta[data-pagina="${actual}"]`)?.scrollIntoView({ block: 'center' });
    }
}

// Ejecuta una operación de páginas del worker y recoloca todas las vistas
async function operar(accion, datos, transferibles) {
    try {
        const respuesta = await pedir(accion, datos, transferibles);
        registrarCambioDePaginas(respuesta);
        return respuesta.resultado;
    } catch (error) {
        console.error(`No se pudo hacer ${accion}:`, error);
        mostrarAviso(t(error.message === 'TODAS' ? 'organizar.errorTodas'
            : error.message === 'PROTEGIDO' ? 'organizar.errorProtegido' : 'organizar.error'));
        return null;
    }
}

// Las páginas nuevas van detrás de la última seleccionada, o al final si no hay selección
function posicionInsertar() {
    const sel = seleccionadas();
    return sel.length ? sel.at(-1) + 1 : leer('documento').paginas;
}

async function insertarBlanco() {
    const en = posicionInsertar();
    // Del mismo tamaño que la página de al lado, para que no desentone
    const referencia = leer('documento').tamanos[Math.max(0, en - 1)];
    await operar('paginas:insertarBlanco', { en, tamano: referencia });
    seleccionar([en]);
}

async function insertarArchivo() {
    const archivos = await elegirArchivos();
    if (!archivos.length) {
        return;
    }
    let en = posicionInsertar();
    const desde = en;
    const imagenes = archivos.filter(esImagen);
    const pdfs = archivos.filter((a) => !esImagen(a));
    for (const archivo of pdfs) {
        const buffer = (await bytesDe(archivo)).buffer;
        const total = await operar('paginas:insertarPdf', { en, buffer }, [buffer]);
        if (total === null) {
            return;
        }
        en += total;
    }
    if (imagenes.length) {
        const bytes = await Promise.all(imagenes.map(bytesDe));
        const total = await operar('paginas:insertarImagenes', { en, imagenes: bytes, modo: 'a4' }, bytes.map((b) => b.buffer));
        if (total !== null) {
            en += total;
        }
    }
    seleccionar(Array.from({ length: en - desde }, (_, i) => desde + i));
}

async function borrar() {
    const sel = seleccionadas();
    // Se avisa antes de preguntar: confirmar algo que luego no se puede hacer despista
    if (sel.length >= leer('documento').paginas) {
        mostrarAviso(t('organizar.errorTodas'));
        return;
    }
    if (sel.length > 1 && !(await confirmar('organizar.confirmarBorrar', 'organizar.borrar'))) {
        return;
    }
    await operar('paginas:borrar', { paginas: sel });
    seleccionar([Math.min(sel[0], leer('documento').paginas - 1)]);
}

async function duplicar() {
    const sel = seleccionadas();
    await operar('paginas:duplicar', { paginas: sel });
    // Las copias quedan detrás de cada original: se seleccionan las copias
    seleccionar(sel.map((n, i) => n + i + 1));
}

// Guarda varios PDF resultantes uno detrás de otro (en Android, un selector por archivo)
async function guardarPartes(partes) {
    const base = nombreBase(leer('documento').nombre);
    for (const [i, paginas] of partes.entries()) {
        const { bytes } = await pedir('paginas:extraer', { paginas });
        const nombre = partes.length === 1 ? `${base}-extracto.pdf` : `${base}-parte-${i + 1}.pdf`;
        const guardado = await guardarArchivo(new Blob([bytes], { type: 'application/pdf' }), nombre);
        if (!guardado) {
            return;
        }
    }
    mostrarAviso(t('organizar.partesGuardadas', { total: partes.length }));
}

async function extraer() {
    try {
        await guardarPartes([seleccionadas()]);
    } catch (error) {
        console.error('No se pudo extraer:', error);
        mostrarAviso(t('organizar.error'));
    }
}

async function dividir() {
    const partes = await pedirDivision(leer('documento').paginas);
    if (partes) {
        try {
            await guardarPartes(partes);
        } catch (error) {
            console.error('No se pudo dividir:', error);
            mostrarAviso(t('organizar.error'));
        }
    }
}

async function recortar() {
    const sel = seleccionadas();
    const recorte = await pedirRecorte(sel[0]);
    if (!recorte) {
        return;
    }
    const paginas = recorte.todas ? leer('documento').tamanos.map((_, n) => n) : sel;
    await operar('paginas:recortar', { paginas, rect: recorte.rect });
    seleccionar(sel);
}

const ACCIONES = {
    girarIzquierda: () => operar('paginas:rotar', { paginas: seleccionadas(), grados: -90 }),
    girarDerecha: () => operar('paginas:rotar', { paginas: seleccionadas(), grados: 90 }),
    duplicar,
    borrar,
    recortar,
    insertarBlanco,
    insertarArchivo,
    escanear: () => emitir('escanear:abrir', { destino: 'insertar' }),
    extraer,
    dividir,
    deshacer: () => emitir('historial:deshacer'),
    rehacer: () => emitir('historial:rehacer')
};

function actualizarBarra(sel) {
    const ninguna = sel.length === 0;
    for (const boton of document.querySelectorAll('[data-requiere-seleccion]')) {
        boton.disabled = ninguna;
    }
    $('organizar-seleccion').textContent = ninguna ? '' : (sel.length === 1 ? t('organizar.seleccionada') : t('organizar.seleccionadas', { total: sel.length }));
}

function alTecla(evento) {
    if (!abierta || escribiendoEnCampo(evento) || document.querySelector('dialog[open]')) {
        return;
    }
    const sel = seleccionadas();
    if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'a') {
        evento.preventDefault();
        seleccionarTodo();
    } else if ((evento.key === 'Delete' || evento.key === 'Backspace') && sel.length) {
        evento.preventDefault();
        borrar();
    } else if (evento.key === 'Escape') {
        mostrarVista(false);
    }
}

function prepararBarra() {
    $('boton-organizar').addEventListener('click', () => mostrarVista(!abierta));
    $('organizar-cerrar').addEventListener('click', () => mostrarVista(false));
    for (const boton of document.querySelectorAll('[data-organizar]')) {
        boton.addEventListener('click', () => ACCIONES[boton.dataset.organizar]());
    }
    escuchar('historial:cambiado', ({ puedeDeshacer, puedeRehacer }) => {
        document.querySelector('[data-organizar="deshacer"]').disabled = !puedeDeshacer;
        document.querySelector('[data-organizar="rehacer"]').disabled = !puedeRehacer;
    });
}

export function iniciarOrganizar() {
    iniciarCuadricula();
    iniciarCrearPdf();
    prepararBarra();
    actualizarBarra([]);
    document.addEventListener('keydown', alTecla);

    escuchar('organizar:seleccion', actualizarBarra);
    // Al empezar a anotar (o a colocar una firma) se vuelve al visor
    escuchar('anotar:modo', (activo) => activo && abierta && mostrarVista(false));
    escuchar('organizar:reordenar', (orden) => operar('paginas:reordenar', { orden }));
    // Páginas escaneadas con la cámara: van detrás de la selección
    escuchar('escanear:paginas', async ({ imagenes, modo }) => {
        const en = posicionInsertar();
        const total = await operar('paginas:insertarImagenes', { en, imagenes, modo }, imagenes.map((i) => i.buffer));
        if (total) {
            seleccionar(Array.from({ length: total }, (_, i) => en + i));
        }
    });
    // Doble clic en una página: volver al visor en esa página
    escuchar('organizar:abrirPagina', (numero) => {
        mostrarVista(false);
        emitir('pagina:ir', numero);
    });
    escuchar('documento:estructura', () => abierta && construir());
    escuchar('historial:cambiado', ({ repintar }) => repintar && abierta && construir());
    escuchar('estado:documento', (documento) => {
        if (!documento && abierta) {
            mostrarVista(false);
        } else if (abierta) {
            construir();
        }
    });
    escuchar('estado:idioma', () => actualizarBarra(seleccionadas()));

    $('portada-unir').addEventListener('click', () => abrirCrearPdf({ soloImagenes: false }));
    $('portada-imagenes').addEventListener('click', () => abrirCrearPdf({ soloImagenes: true }));
    // Varios archivos o imágenes soltados en la ventana
    escuchar('organizar:crearCon', (archivos) => abrirCrearPdf({ archivos }));
}
