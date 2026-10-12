// Fecha: 2026-10-12
// Ruta: /tests/comparar.test.js
// Pruebas de comparar dos PDF: palabras quitadas y añadidas, páginas de más y páginas escaneadas
// Uso: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as mupdf from 'mupdf';
import { crearModuloComparar } from '../src/motor/comparar.js';
import { crearModuloEditar } from '../src/motor/editar.js';
import { crearModuloPaginas } from '../src/motor/paginas.js';

const leer = (nombre) => readFileSync(new URL(`./pdfs/${nombre}`, import.meta.url));
const abrir = (bytes) => {
    const doc = mupdf.Document.openDocument(bytes, 'application/pdf');
    doc.enableJournal();
    return doc;
};
const bytesDe = (doc) => doc.saveToBuffer('').asUint8Array().slice();

test('mismo documento: sin diferencias', () => {
    const doc = abrir(leer('texto.pdf'));
    const motor = crearModuloComparar(() => doc);
    motor.cargar({ buffer: leer('texto.pdf').buffer.slice(0), nombre: 'otro.pdf' });
    const { paginas } = motor.comparar();
    assert.equal(paginas.length, 0);
});

test('una línea cambiada: lo quitado y lo añadido, con su sitio', () => {
    const original = abrir(leer('texto.pdf'));
    const cambiado = abrir(leer('texto.pdf'));
    const editar = crearModuloEditar(() => cambiado, () => {});
    const linea = editar.lineas({ pagina: 1 }).find((l) => l.texto.startsWith('DNNS PDF es un editor'));
    editar.reescribir({ ...linea, pagina: 1, texto: 'DNNS PDF es un editor de PDF libre y sin coste. Todo se procesa en el dispositivo del' });
    const motor = crearModuloComparar(() => original);
    motor.cargar({ buffer: bytesDe(cambiado).buffer, nombre: 'cambiado.pdf' });
    const { paginas } = motor.comparar();
    assert.equal(paginas.length, 1);
    assert.equal(paginas[0].pagina, 1);
    const quitado = paginas[0].cambios.filter((c) => c.tipo === 'quitado').map((c) => c.texto).join(' ');
    const anadido = paginas[0].cambios.filter((c) => c.tipo === 'anadido').map((c) => c.texto).join(' ');
    // Palabra a palabra: solo lo que cambia, no la línea entera
    assert.equal(quitado, 'gratuito.');
    assert.equal(anadido, 'sin coste.');
    assert.ok(paginas[0].cambios.every((c) => c.rects.length > 0));
    assert.ok(paginas[0].cambios.filter((c) => c.tipo === 'anadido').every((c) => c.referencia));
});

test('el otro tiene menos páginas', () => {
    const doc = abrir(leer('texto.pdf'));
    const recortado = abrir(leer('texto.pdf'));
    crearModuloPaginas(() => recortado, () => {}).borrar({ paginas: [2] });
    const motor = crearModuloComparar(() => doc);
    motor.cargar({ buffer: bytesDe(recortado).buffer, nombre: 'corto.pdf' });
    const { paginas, paginasOtro } = motor.comparar();
    assert.equal(paginasOtro, 2);
    assert.deepEqual(paginas.map((p) => [p.pagina, p.soloEn]), [[2, 'abierto']]);
});

test('escaneados: se compara la imagen y se marca la zona cambiada', () => {
    const doc = abrir(leer('escaneado.pdf'));
    const tapado = abrir(leer('escaneado.pdf'));
    const pagina = tapado.loadPage(0);
    const marca = pagina.createAnnotation('Square');
    marca.setRect([100, 100, 200, 160]);
    marca.setInteriorColor([0, 0, 0]);
    marca.update();
    tapado.bake();
    const motor = crearModuloComparar(() => doc);
    motor.cargar({ buffer: bytesDe(tapado).buffer, nombre: 'tapado.pdf' });
    const { paginas } = motor.comparar();
    assert.equal(paginas.length, 1);
    const [cambio] = paginas[0].cambios;
    assert.equal(cambio.tipo, 'imagen');
    const [x0, y0, x1, y1] = cambio.rects[0];
    assert.ok(x0 >= 90 && y0 >= 90 && x1 <= 210 && y1 <= 170, JSON.stringify(cambio.rects[0]));
});
