// Fecha: 2026-10-12
// Ruta: /src/modulos/firmar/firmar.js
// Módulo Firmar: crear o elegir una firma manuscrita y mandarla a colocar en el documento
// Dibujar, escribir el nombre con letra manuscrita o subir una foto; las firmas se pueden guardar
// Notas: no conoce al módulo Anotar: emite 'anotar:colocarFirma' con el PNG y su tamaño, y Anotar
//        se encarga de colocarla con un toque y de moverla o cambiarle el tamaño.

import { emitir } from '../../nucleo/eventos.js';
import { t } from '../../nucleo/i18n.js';
import { mostrarAviso } from '../../ui/dialogos.js';
import { crearLienzoFirma } from './lienzo.js';
import { quitarFondo, ajustarFirma, textoAFirma, lienzoDeArchivo, aPng } from './imagen.js';
import { listarFirmas, guardarFirma, borrarFirma, pngDe } from './almacen.js';
import urlDancing from '../../fuentes/DancingScript.ttf?url';
import urlGreatVibes from '../../fuentes/GreatVibes.ttf?url';
import urlAllura from '../../fuentes/Allura.ttf?url';

const $ = (id) => document.getElementById(id);

const LETRAS = [
    ['DNNS Dancing', urlDancing],
    ['DNNS Great Vibes', urlGreatVibes],
    ['DNNS Allura', urlAllura]
];

let lienzo = null;
let modo = 'dibujar';
let tinta = '#000000';
let letra = LETRAS[0][0];
let subida = null;
let letrasCargadas = null;

function cargarLetras() {
    letrasCargadas ??= Promise.all(LETRAS.map(async ([familia, url]) => {
        const fuente = new FontFace(familia, `url(${url})`);
        document.fonts.add(await fuente.load());
    })).catch((error) => console.warn('No se cargaron las letras de firma:', error));
    return letrasCargadas;
}

function elegirModo(nuevo) {
    modo = nuevo;
    for (const boton of document.querySelectorAll('[data-firma-modo]')) {
        boton.setAttribute('aria-selected', String(boton.dataset.firmaModo === nuevo));
    }
    for (const panel of document.querySelectorAll('[data-firma-panel]')) {
        panel.hidden = panel.dataset.firmaPanel !== nuevo;
    }
    // La foto lleva su propio color de tinta
    document.querySelector('.firma__tintas').hidden = nuevo === 'subir';
    $('firma-borrar').hidden = nuevo !== 'dibujar';
    if (nuevo === 'dibujar') {
        lienzo.dimensionar();
    } else if (nuevo === 'escribir') {
        $('firma-nombre').focus();
    }
}

function elegirTinta(color) {
    tinta = color;
    lienzo.ponerTinta(color);
    for (const boton of document.querySelectorAll('[data-tinta]')) {
        boton.setAttribute('aria-pressed', String(boton.dataset.tinta === color));
    }
    pintarMuestras();
}

// Cada letra se enseña con el nombre que se está escribiendo
function pintarMuestras() {
    const nombre = $('firma-nombre').value.trim() || t('firmar.tuNombre');
    for (const boton of document.querySelectorAll('[data-letra]')) {
        boton.textContent = nombre;
        boton.style.fontFamily = `"${boton.dataset.letra}"`;
        boton.style.color = tinta;
        boton.setAttribute('aria-pressed', String(boton.dataset.letra === letra));
    }
}

function pintarGuardadas() {
    const lista = $('firma-lista');
    const firmas = listarFirmas();
    $('firma-guardadas').hidden = firmas.length === 0;
    lista.replaceChildren(...firmas.map((firma) => {
        const fila = document.createElement('li');
        fila.className = 'firma__guardada';
        const usar = document.createElement('button');
        usar.type = 'button';
        usar.className = 'firma__usar';
        usar.title = t('firmar.usarGuardada');
        const imagen = document.createElement('img');
        imagen.src = firma.datos;
        imagen.alt = '';
        usar.append(imagen);
        usar.addEventListener('click', () => colocar(pngDe(firma), firma.ancho, firma.alto));
        const quitar = document.createElement('button');
        quitar.type = 'button';
        quitar.className = 'firma__quitar';
        quitar.title = t('firmar.borrarGuardada');
        quitar.textContent = '×';
        quitar.addEventListener('click', () => {
            borrarFirma(firma.id);
            pintarGuardadas();
        });
        fila.append(usar, quitar);
        return fila;
    }));
}

async function subirFoto(archivo) {
    try {
        const tratada = ajustarFirma(quitarFondo(await lienzoDeArchivo(archivo)));
        if (!tratada) {
            mostrarAviso(t('firmar.fotoVacia'));
            return;
        }
        subida = tratada;
        $('firma-vista').src = tratada.toDataURL('image/png');
        $('firma-vista').hidden = false;
    } catch (error) {
        console.error('No se pudo leer la foto de la firma:', error);
        mostrarAviso(t('firmar.errorFoto'));
    }
}

// El lienzo final de la firma según la pestaña activa; null si está vacía
async function firmaActual() {
    if (modo === 'dibujar') {
        return lienzo.vacio() ? null : ajustarFirma($('firma-lienzo'));
    }
    if (modo === 'escribir') {
        const nombre = $('firma-nombre').value.trim();
        if (!nombre) {
            return null;
        }
        await cargarLetras();
        return ajustarFirma(textoAFirma(nombre, letra, tinta));
    }
    return subida;
}

function colocar(png, ancho, alto) {
    $('dialogo-firma').close();
    emitir('anotar:colocarFirma', { png, ancho, alto });
}

async function aceptar() {
    const final = await firmaActual();
    if (!final) {
        mostrarAviso(t('firmar.vacia'));
        return;
    }
    const png = await aPng(final);
    if ($('firma-recordar').checked) {
        guardarFirma(png, final.width, final.height);
    }
    colocar(png, final.width, final.height);
}

export function abrirFirma() {
    subida = null;
    $('firma-vista').hidden = true;
    pintarGuardadas();
    $('dialogo-firma').showModal();
    elegirModo(modo);
    lienzo.borrar();
    cargarLetras().then(pintarMuestras);
}

export function iniciarFirmar() {
    lienzo = crearLienzoFirma($('firma-lienzo'));
    $('boton-firmar').addEventListener('click', abrirFirma);
    for (const boton of document.querySelectorAll('[data-firma-modo]')) {
        boton.addEventListener('click', () => elegirModo(boton.dataset.firmaModo));
    }
    for (const boton of document.querySelectorAll('[data-tinta]')) {
        boton.addEventListener('click', () => elegirTinta(boton.dataset.tinta));
    }
    for (const boton of document.querySelectorAll('[data-letra]')) {
        boton.addEventListener('click', () => {
            letra = boton.dataset.letra;
            pintarMuestras();
        });
    }
    $('firma-nombre').addEventListener('input', pintarMuestras);
    $('firma-borrar').addEventListener('click', () => lienzo.borrar());
    $('firma-elegir').addEventListener('click', () => $('entrada-firma').click());
    $('entrada-firma').addEventListener('change', (evento) => {
        const [archivo] = evento.target.files;
        evento.target.value = '';
        if (archivo) {
            subirFoto(archivo);
        }
    });
    $('firma-cancelar').addEventListener('click', () => $('dialogo-firma').close());
    $('firma-aceptar').addEventListener('click', aceptar);
    elegirTinta(tinta);
}
