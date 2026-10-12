// Fecha: 2026-10-12
// Ruta: /tests/exportar.test.js
// Pruebas de exportar: páginas como PNG y JPG a la resolución pedida, texto e imágenes sin repetir
// Uso: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as mupdf from 'mupdf';
import { crearModuloExportar } from '../src/motor/exportar.js';
import { crearModuloEditar } from '../src/motor/editar.js';

const leer = (nombre) => readFileSync(new URL(`./pdfs/${nombre}`, import.meta.url));
const abrir = (nombre) => mupdf.Document.openDocument(leer(nombre), 'application/pdf');
const esPng = (bytes) => bytes[0] === 0x89 && bytes[1] === 0x50;
const esJpg = (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8;

test('página como PNG y como JPG, al tamaño de los ppp pedidos', () => {
    const doc = abrir('texto.pdf');
    const motor = crearModuloExportar(() => doc);
    const [x0, y0, x1, y1] = doc.loadPage(0).getBounds();
    const png = motor.paginaImagen({ pagina: 0, ppp: 144, formato: 'png' }).bytes;
    assert.ok(esPng(png));
    const imagen = new mupdf.Image(png);
    assert.equal(imagen.getWidth(), Math.round((x1 - x0) * 2));
    assert.equal(imagen.getHeight(), Math.round((y1 - y0) * 2));
    const jpg = motor.paginaImagen({ pagina: 0, ppp: 72, formato: 'jpg' }).bytes;
    assert.ok(esJpg(jpg));
});

test('texto de la página', () => {
    const doc = abrir('texto.pdf');
    const { texto } = crearModuloExportar(() => doc).paginaTexto({ pagina: 0 });
    assert.match(texto, /Capítulo 1/);
    assert.match(texto, /editor de PDF libre/);
});

test('imágenes de dentro, sin repetir la misma en varias páginas', () => {
    const doc = abrir('texto.pdf');
    doc.enableJournal();
    const editar = crearModuloEditar(() => doc, () => {});
    const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 30, 20], false);
    pixmap.clear(120);
    const logo = pixmap.asPNG().slice();
    editar.anadirImagen({ pagina: 0, rect: [50, 50, 110, 90], bytes: logo });
    editar.anadirImagen({ pagina: 1, rect: [50, 50, 110, 90], bytes: logo });
    const motor = crearModuloExportar(() => doc);
    const primera = motor.paginaImagenes({ pagina: 0 });
    assert.equal(primera.imagenes.length, 1);
    assert.equal(primera.imagenes[0].ancho, 30);
    assert.ok(esPng(primera.imagenes[0].bytes));
    const segunda = motor.paginaImagenes({ pagina: 1, vistas: primera.vistas });
    assert.equal(segunda.imagenes.length, 0, 'el mismo logotipo no se repite');
});

test('escaneado: la imagen grande sale en JPG', () => {
    const doc = abrir('escaneado.pdf');
    const { imagenes } = crearModuloExportar(() => doc).paginaImagenes({ pagina: 0 });
    assert.ok(imagenes.length >= 1);
    assert.equal(imagenes[0].formato, 'jpg');
    assert.ok(esJpg(imagenes[0].bytes));
});
