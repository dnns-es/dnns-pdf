// Fecha: 2026-10-12
// Ruta: /tests/comprimir.test.js
// Pruebas de Comprimir: reduce las imágenes del escaneado y deja intacto un PDF de solo texto
// Uso: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as mupdf from 'mupdf';
import { comprimir } from '../src/motor/comprimir.js';

const leer = (nombre) => new Uint8Array(readFileSync(new URL(`./pdfs/${nombre}`, import.meta.url)));

test('un escaneado pesa bastante menos, conserva sus páginas y se sigue pintando', () => {
    const original = leer('escaneado.pdf');
    const { bytes, antes, despues, imagenes } = comprimir(original, 'medio');
    assert.equal(antes, original.length);
    assert.equal(imagenes, 2);
    assert.ok(despues < antes * 0.8, `${antes} -> ${despues}`);
    assert.ok(comprimir(original, 'fuerte').despues < antes * 0.5);
    const doc = mupdf.Document.openDocument(bytes, 'application/pdf');
    assert.equal(doc.countPages(), 2);
    const pixmap = doc.loadPage(0).toPixmap(mupdf.Matrix.scale(0.2, 0.2), mupdf.ColorSpace.DeviceRGB);
    assert.ok(pixmap.getWidth() > 0);
    // Fuerte da algo más pequeño que ligero
    assert.ok(comprimir(original, 'fuerte').despues < comprimir(original, 'ligero').despues);
});

test('un PDF de texto sin imágenes no se estropea', () => {
    const original = leer('texto.pdf');
    const { bytes, imagenes } = comprimir(original, 'fuerte');
    assert.equal(imagenes, 0);
    const antes = mupdf.Document.openDocument(original, 'application/pdf');
    const despues = mupdf.Document.openDocument(bytes, 'application/pdf');
    assert.equal(despues.countPages(), antes.countPages());
    assert.equal(despues.loadPage(0).toStructuredText().asText(), antes.loadPage(0).toStructuredText().asText());
});
