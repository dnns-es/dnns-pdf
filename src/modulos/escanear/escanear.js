// Fecha: 2026-10-12
// Ruta: /src/modulos/escanear/escanear.js
// Módulo Escanear: fotografiar documentos con la cámara y convertirlos en PDF
// Vista de cámara (o foto de la galería), ajuste de esquinas y filtro por página, y PDF con todas las páginas
// Notas: se abre con 'escanear:abrir' { destino: 'nuevo' | 'insertar' }. Con 'nuevo' crea y abre un PDF;
//        con 'insertar' devuelve las páginas por 'escanear:paginas' para que Organizar las meta en el documento.
//        Todo el tratamiento es local: las fotos no salen del dispositivo.

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { mostrarAviso, abrirProgreso } from '../../ui/dialogos.js';
import { iniciarCamara, pararCamara, capturar, fotoAImagen } from './camara.js';
import { detectarEsquinas, esquinasPorDefecto, enderezar, filtrar, reducir, aImageData, FILTROS } from './procesar.js';
import { crearEditorEsquinas } from './esquinas.js';

const $ = (id) => document.getElementById(id);

const LADO_VISTA = 900;
const LADO_MINIATURA = 120;
const CALIDAD_JPEG = 0.85;

let destino = 'nuevo';
let paginas = [];
let actual = null;
let editor = null;

function mostrarVista(nombre) {
    for (const vista of document.querySelectorAll('[data-escanear-vista]')) {
        vista.hidden = vista.dataset.escanearVista !== nombre;
    }
}

async function encenderCamara() {
    const video = $('escanear-video');
    $('escanear-sin-camara').hidden = true;
    try {
        await iniciarCamara(video);
        $('escanear-capturar').disabled = false;
    } catch (error) {
        console.warn('Sin cámara:', error);
        $('escanear-sin-camara').hidden = false;
        $('escanear-capturar').disabled = true;
    }
}

function lienzoDe(imagen) {
    const lienzo = document.createElement('canvas');
    lienzo.width = imagen.ancho;
    lienzo.height = imagen.alto;
    lienzo.getContext('2d').putImageData(aImageData(imagen), 0, 0);
    return lienzo;
}

function aBytes(lienzo, tipo, calidad) {
    return new Promise((resolver, rechazar) => {
        lienzo.toBlob((blob) => (blob ? blob.arrayBuffer().then((b) => resolver(new Uint8Array(b))) : rechazar(new Error('IMAGEN'))), tipo, calidad);
    });
}

// Deja que la interfaz pinte antes de un cálculo largo
const respirar = () => new Promise((resolver) => setTimeout(resolver, 30));

// ---- Vista de ajuste

function pintarVista() {
    const lienzo = $('escanear-lienzo');
    const imagen = filtrar(actual.vista, actual.filtro);
    lienzo.width = imagen.ancho;
    lienzo.height = imagen.alto;
    lienzo.getContext('2d').putImageData(aImageData(imagen), 0, 0);
}

function elegirFiltro(nombre) {
    actual.filtro = nombre;
    for (const boton of document.querySelectorAll('[data-filtro]')) {
        boton.setAttribute('aria-pressed', String(boton.dataset.filtro === nombre));
    }
    pintarVista();
}

async function ajustar(imagen) {
    pararCamara($('escanear-video'));
    mostrarVista('ajuste');
    await respirar();
    actual = {
        imagen,
        vista: reducir(imagen, LADO_VISTA).imagen,
        esquinas: detectarEsquinas(imagen) ?? esquinasPorDefecto(imagen),
        filtro: actual?.filtro ?? FILTROS[0]
    };
    editor.poner(actual.esquinas, imagen.ancho, imagen.alto);
    elegirFiltro(actual.filtro);
}

function pintarPaginas() {
    $('escanear-lista').replaceChildren(...paginas.map((pagina, i) => {
        const fila = document.createElement('li');
        const imagen = document.createElement('img');
        imagen.src = pagina.miniatura;
        imagen.alt = '';
        const quitar = document.createElement('button');
        quitar.type = 'button';
        quitar.className = 'escanear__quitar';
        quitar.title = t('escanear.quitarPagina');
        quitar.textContent = '×';
        quitar.addEventListener('click', () => {
            paginas.splice(i, 1);
            pintarPaginas();
        });
        fila.append(imagen, quitar);
        return fila;
    }));
    $('escanear-cuenta').textContent = paginas.length ? t('escanear.paginas', { total: paginas.length }) : '';
    $('escanear-terminar').disabled = paginas.length === 0;
}

async function usarPagina() {
    $('escanear-usar').disabled = true;
    try {
        await respirar();
        const esquinas = editor.leer();
        const final = filtrar(enderezar(actual.imagen, esquinas), actual.filtro);
        const lienzo = lienzoDe(final);
        // El blanco y negro puro ocupa menos y queda más nítido en PNG
        const bytes = actual.filtro === 'texto' ? await aBytes(lienzo, 'image/png') : await aBytes(lienzo, 'image/jpeg', CALIDAD_JPEG);
        const miniatura = lienzoDe(reducir(final, LADO_MINIATURA).imagen).toDataURL('image/jpeg', 0.7);
        paginas.push({ bytes, miniatura });
        pintarPaginas();
        mostrarVista('camara');
        await encenderCamara();
    } catch (error) {
        console.error('No se pudo tratar la página:', error);
        mostrarAviso(t('escanear.error'));
    } finally {
        $('escanear-usar').disabled = false;
    }
}

async function repetir() {
    mostrarVista('camara');
    await encenderCamara();
}

// ---- Vista de cámara

function hacerFoto() {
    try {
        ajustar(capturar($('escanear-video')));
    } catch (error) {
        console.error('No se pudo hacer la foto:', error);
        mostrarAviso(t('escanear.error'));
    }
}

async function fotoDeGaleria(archivo) {
    try {
        await ajustar(await fotoAImagen(archivo));
    } catch (error) {
        console.error('No se pudo leer la foto:', error);
        mostrarAviso(t('escanear.errorFoto'));
    }
}

function cerrar() {
    pararCamara($('escanear-video'));
    $('dialogo-escanear').close();
}

async function terminar() {
    if (!paginas.length) {
        return;
    }
    const imagenes = paginas.map((p) => p.bytes);
    const modo = $('escanear-modo').value;
    cerrar();
    if (destino === 'insertar') {
        emitir('escanear:paginas', { imagenes, modo });
        return;
    }
    const progreso = abrirProgreso(() => {});
    progreso.actualizar(t('organizar.creando'), null);
    try {
        const { bytes } = await pedir('paginas:unir', { piezas: imagenes.map((imagen) => ({ imagen })), modo }, imagenes.map((i) => i.buffer));
        progreso.cerrar();
        emitir('archivo:abrir', new File([bytes], t('escanear.nombre'), { type: 'application/pdf' }));
    } catch (error) {
        progreso.cerrar();
        console.error('No se pudo crear el PDF escaneado:', error);
        mostrarAviso(t('escanear.error'));
    }
}

async function abrir({ destino: pedido = 'nuevo' } = {}) {
    destino = pedido;
    paginas = [];
    actual = null;
    pintarPaginas();
    $('escanear-terminar').textContent = t(destino === 'insertar' ? 'escanear.anadir' : 'escanear.crearPdf');
    $('dialogo-escanear').showModal();
    mostrarVista('camara');
    await encenderCamara();
}

export function iniciarEscanear() {
    editor = crearEditorEsquinas($('escanear-esquinas'));
    $('escanear-cerrar').addEventListener('click', cerrar);
    $('dialogo-escanear').addEventListener('cancel', (evento) => {
        evento.preventDefault();
        cerrar();
    });
    $('escanear-capturar').addEventListener('click', hacerFoto);
    $('escanear-foto').addEventListener('click', () => $('entrada-foto').click());
    $('entrada-foto').addEventListener('change', (evento) => {
        const [archivo] = evento.target.files;
        evento.target.value = '';
        if (archivo) {
            fotoDeGaleria(archivo);
        }
    });
    for (const boton of document.querySelectorAll('[data-filtro]')) {
        boton.addEventListener('click', () => elegirFiltro(boton.dataset.filtro));
    }
    $('escanear-usar').addEventListener('click', usarPagina);
    $('escanear-repetir').addEventListener('click', repetir);
    $('escanear-terminar').addEventListener('click', terminar);
    $('portada-escanear').addEventListener('click', () => abrir({ destino: 'nuevo' }));
    escuchar('escanear:abrir', abrir);
}
