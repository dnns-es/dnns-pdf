// Fecha: 2026-10-12
// Ruta: /tests/redactar.test.js
// Pruebas de ocultar datos (redacción): el texto marcado desaparece del archivo, no solo se tapa
// Uso: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as mupdf from 'mupdf';
import { crearModuloRedactar } from '../src/motor/redactar.js';

const leer = (nombre) => readFileSync(new URL(`./pdfs/${nombre}`, import.meta.url));

function abrir(nombre) {
    const doc = mupdf.Document.openDocument(leer(nombre), 'application/pdf');
    doc.enableJournal();
    return { doc, motor: crearModuloRedactar(() => doc, () => {}) };
}

const textoTodo = (doc) => Array.from({ length: doc.countPages() }, (_, n) => doc.loadPage(n).toStructuredText().asText()).join('\n');

test('buscar y ocultar: el texto desaparece del archivo guardado y queda un recuadro negro', () => {
    const { doc, motor } = abrir('texto.pdf');
    assert.ok(textoTodo(doc).includes('gratuito'));
    const { zonas } = motor.marcarBusqueda({ texto: 'gratuito' });
    assert.ok(zonas > 3);
    assert.deepEqual(motor.pendientes().zonas, zonas);
    // Marcado pero sin aplicar: el texto sigue ahí
    assert.ok(textoTodo(doc).includes('gratuito'));
    motor.aplicar();
    assert.equal(motor.pendientes().zonas, 0);
    const buffer = doc.saveToBuffer('garbage=compact');
    const guardado = mupdf.Document.openDocument(buffer.asUint8Array().slice(), 'application/pdf');
    const texto = textoTodo(guardado);
    assert.ok(!texto.includes('gratuito'), 'no queda ni rastro en el archivo');
    assert.ok(texto.includes('DNNS PDF es un editor de PDF libre y'), 'el resto del texto sigue');
    // Hay un recuadro negro donde estaba la palabra
    const pagina = guardado.loadPage(0);
    const pixmap = pagina.toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceGray, false, true);
    const oscuros = [...pixmap.getPixels()].filter((v) => v < 20).length;
    assert.ok(oscuros > 500, `píxeles negros: ${oscuros}`);
});

test('ocultar se puede deshacer antes de guardar, y sin marcas no hace nada', () => {
    const { doc, motor } = abrir('texto.pdf');
    assert.deepEqual(motor.aplicar(), { paginas: 0 });
    assert.deepEqual(motor.marcarBusqueda({ texto: '  ' }), { zonas: 0 });
    motor.marcarBusqueda({ texto: 'renderizado' });
    motor.aplicar();
    assert.ok(!textoTodo(doc).includes('renderizado'));
    doc.undo();
    assert.ok(textoTodo(doc).includes('renderizado'));
});
