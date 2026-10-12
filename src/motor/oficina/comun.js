// Fecha: 2026-10-12
// Ruta: /src/motor/oficina/comun.js
// Utilidades comunes de los conversores de Office
// Abrir el ZIP, leer partes XML y relaciones, imágenes a data URI, escape de HTML y tamaños de página
// Notas: fflate se carga solo cuando hace falta, para no engordar el worker al arrancar.

import { leerXml, hijos } from './xml.js';

// A4 en puntos; márgenes de 1 cm
export const A4 = [595.28, 841.89];
export const MARGEN = 28;

const MIME_IMAGEN = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' };

export async function abrirZip(bytes) {
    const { unzipSync } = await import('fflate');
    return unzipSync(bytes);
}

export function detectarTipo(archivos) {
    if (archivos['word/document.xml']) {
        return 'word';
    }
    if (archivos['xl/workbook.xml']) {
        return 'excel';
    }
    if (archivos['ppt/presentation.xml']) {
        return 'presentacion';
    }
    return null;
}

export function leerTexto(archivos, ruta) {
    return archivos[ruta] ? new TextDecoder().decode(archivos[ruta]) : null;
}

export function xmlDe(archivos, ruta) {
    const texto = leerTexto(archivos, ruta);
    return texto ? leerXml(texto) : null;
}

// 'ppt/slides/' + '../media/x.png' -> 'ppt/media/x.png'; '/xl/a.xml' -> 'xl/a.xml'
export function resolverRuta(carpeta, destino) {
    if (destino.startsWith('/')) {
        return destino.slice(1);
    }
    const partes = [];
    for (const parte of `${carpeta}${destino}`.split('/')) {
        if (parte === '..') {
            partes.pop();
        } else if (parte && parte !== '.') {
            partes.push(parte);
        }
    }
    return partes.join('/');
}

// Relaciones de una parte (xl/workbook.xml -> xl/_rels/workbook.xml.rels): id -> ruta dentro del ZIP
export function relaciones(archivos, rutaParte) {
    const corte = rutaParte.lastIndexOf('/') + 1;
    const carpeta = rutaParte.slice(0, corte);
    const xml = xmlDe(archivos, `${carpeta}_rels/${rutaParte.slice(corte)}.rels`);
    const mapa = new Map();
    for (const rel of hijos(xml, 'Relationship')) {
        if (rel.atributos.TargetMode !== 'External' && rel.atributos.Target) {
            mapa.set(rel.atributos.Id, resolverRuta(carpeta, rel.atributos.Target));
        }
    }
    return mapa;
}

export function aBase64(bytes) {
    let binario = '';
    for (let i = 0; i < bytes.length; i += 8192) {
        binario += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(binario);
}

// Imagen del ZIP como data URI, o null si el formato no se puede pintar (emf, wmf, svg...)
export function imagenDataUri(archivos, ruta) {
    const datos = ruta && archivos[ruta];
    const mime = MIME_IMAGEN[ruta?.split('.').pop().toLowerCase()];
    return datos && mime ? `data:${mime};base64,${aBase64(datos)}` : null;
}

export function escapar(texto) {
    return String(texto).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

export function paginaHtml(css, cuerpo) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${cuerpo}</body></html>`;
}
