// Fecha: 2026-10-12
// Ruta: /src/modulos/exportar/exportar.js
// Módulo Exportar: páginas como imagen (PNG o JPG), todo el texto en un .txt, o las imágenes que lleva el PDF
// Opción del menú Herramientas. Un solo archivo se guarda tal cual; varios van juntos en un .zip.
// Notas: todo en el dispositivo. Se pide página a página al worker para enseñar el avance y poder cancelar.

import { zipSync } from 'fflate';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { leerRangos } from '../../nucleo/rangos.js';
import { mostrarAviso, abrirProgreso } from '../../ui/dialogos.js';
import { guardarArchivo } from '../../plataforma/index.js';
import { registrarUtilidad } from '../herramientas/herramientas.js';

const $ = (id) => document.getElementById(id);
const TIPOS = { png: 'image/png', jpg: 'image/jpeg', txt: 'text/plain', zip: 'application/zip' };

class Cancelado extends Error {}

function baseDelNombre() {
    return (leer('documento')?.nombre ?? 'documento').replace(/\.[^.]+$/, '') || 'documento';
}

const relleno = (n, total) => String(n).padStart(String(total).length, '0');

function paginasElegidas() {
    const total = leer('documento').paginas;
    const texto = $('exportar-rango').value.trim();
    if (!texto) {
        return Array.from({ length: total }, (_, i) => i);
    }
    return [...new Set(leerRangos(texto, total).flat())].sort((a, b) => a - b);
}

async function porPaginas(paginas, trabajo) {
    let cancelado = false;
    const progreso = abrirProgreso(() => {
        cancelado = true;
    });
    try {
        for (const [i, pagina] of paginas.entries()) {
            if (cancelado) {
                throw new Cancelado();
            }
            progreso.actualizar(t('exportar.progreso', { n: i + 1, total: paginas.length }), i / paginas.length);
            await trabajo(pagina);
        }
    } finally {
        progreso.cerrar();
    }
}

async function exportarPaginas(paginas, formato, ppp) {
    const base = baseDelNombre();
    const total = leer('documento').paginas;
    const archivos = [];
    await porPaginas(paginas, async (pagina) => {
        const { bytes } = await pedir('exportar:paginaImagen', { pagina, ppp, formato });
        archivos.push({ nombre: `${base}-${relleno(pagina + 1, total)}.${formato}`, bytes });
    });
    return archivos;
}

async function exportarTexto(paginas) {
    const partes = [];
    await porPaginas(paginas, async (pagina) => {
        const { texto } = await pedir('exportar:paginaTexto', { pagina });
        partes.push(`${t('exportar.pagina', { n: pagina + 1 })}\n\n${texto.trim()}\n`);
    });
    if (!partes.some((parte) => parte.split('\n').slice(2).join('').trim())) {
        mostrarAviso(t('exportar.sinTexto'));
        return [];
    }
    // Con BOM: así el Bloc de notas antiguo reconoce las tildes
    const contenido = new TextEncoder().encode(`﻿${partes.join('\n\f\n')}`);
    return [{ nombre: `${baseDelNombre()}.txt`, bytes: contenido }];
}

async function exportarImagenes(paginas) {
    const base = baseDelNombre();
    const archivos = [];
    let vistas = [];
    await porPaginas(paginas, async (pagina) => {
        const resultado = await pedir('exportar:paginaImagenes', { pagina, vistas });
        vistas = resultado.vistas;
        for (const imagen of resultado.imagenes) {
            archivos.push({ nombre: `${base}-imagen-${relleno(archivos.length + 1, 999)}.${imagen.formato}`, bytes: imagen.bytes });
        }
    });
    if (!archivos.length) {
        mostrarAviso(t('exportar.sinImagenes'));
    }
    return archivos;
}

async function entregar(archivos, sufijoZip) {
    if (!archivos.length) {
        return;
    }
    let nombre;
    let blob;
    if (archivos.length === 1) {
        nombre = archivos[0].nombre;
        blob = new Blob([archivos[0].bytes], { type: TIPOS[nombre.split('.').pop()] });
    } else {
        // Las imágenes ya van comprimidas: en el zip se guardan sin volver a comprimir
        nombre = `${baseDelNombre()}-${sufijoZip}.zip`;
        const contenido = Object.fromEntries(archivos.map((archivo) => [archivo.nombre, [archivo.bytes, { level: 0 }]]));
        blob = new Blob([zipSync(contenido)], { type: TIPOS.zip });
    }
    if (await guardarArchivo(blob, nombre, leer('documento').archivo)) {
        mostrarAviso(t('exportar.hecho', { nombre }));
    }
}

async function exportar() {
    const que = document.querySelector('input[name="que-exportar"]:checked').value;
    let paginas;
    try {
        paginas = paginasElegidas();
    } catch (error) {
        $('exportar-error').textContent = t(error.message, { total: leer('documento').paginas });
        return;
    }
    $('dialogo-exportar').close();
    try {
        if (que === 'paginas') {
            await entregar(await exportarPaginas(paginas, $('exportar-formato').value, Number($('exportar-ppp').value)), 'paginas');
        } else if (que === 'texto') {
            await entregar(await exportarTexto(paginas), 'texto');
        } else {
            await entregar(await exportarImagenes(paginas), 'imagenes');
        }
    } catch (error) {
        if (!(error instanceof Cancelado)) {
            console.error('No se pudo exportar:', error);
            mostrarAviso(t('exportar.error'));
        }
    }
}

function mostrarOpciones() {
    const que = document.querySelector('input[name="que-exportar"]:checked').value;
    $('exportar-opciones-imagen').hidden = que !== 'paginas';
}

function abrir() {
    $('exportar-error').textContent = '';
    mostrarOpciones();
    $('dialogo-exportar').showModal();
}

export function iniciarExportar() {
    registrarUtilidad('exportar', abrir);
    for (const opcion of document.querySelectorAll('input[name="que-exportar"]')) {
        opcion.addEventListener('change', mostrarOpciones);
    }
    $('exportar-cancelar').addEventListener('click', () => $('dialogo-exportar').close());
    $('formulario-exportar').addEventListener('submit', (evento) => {
        evento.preventDefault();
        exportar();
    });
}
