// Fecha: 2026-10-12
// Ruta: /tests/ocr.test.js
// Pruebas del OCR: Tesseract reconoce escaneado.pdf y la capa invisible deja buscar el texto
// Uso: npm test
// Notas: usa los datos de español de node_modules (sin red). Tarda unos segundos.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as mupdf from 'mupdf';
import { createWorker } from 'tesseract.js';
import { crearModuloOcr } from '../src/motor/ocr.js';

const leer = (nombre) => readFileSync(new URL(`./pdfs/${nombre}`, import.meta.url));
const DATOS_ESPANOL = fileURLToPath(new URL('../node_modules/@tesseract.js-data/spa/4.0.0_best_int', import.meta.url));

test('el escaneado pasa a tener texto buscable, en su sitio, sin cambiar la imagen; se puede deshacer', async () => {
    const doc = mupdf.Document.openDocument(leer('escaneado.pdf'), 'application/pdf');
    doc.enableJournal();
    const pintar = () => Buffer.from(doc.loadPage(0).toPixmap(mupdf.Matrix.scale(0.5, 0.5), mupdf.ColorSpace.DeviceRGB, false, true).getPixels());
    const antes = pintar();
    assert.equal(doc.loadPage(0).toStructuredText().asText().trim(), '');

    const escala = 2;
    const png = Buffer.from(doc.loadPage(0).toPixmap(mupdf.Matrix.scale(escala, escala), mupdf.ColorSpace.DeviceRGB, false, true).asPNG());
    const motorOcr = await createWorker('spa', 1, { langPath: DATOS_ESPANOL, gzip: true, cacheMethod: 'none' });
    const { data } = await motorOcr.recognize(png, {}, { blocks: true });
    await motorOcr.terminate();
    const palabras = data.blocks.flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words.map((w) => ({
        texto: w.text, x0: w.bbox.x0 / escala, y0: w.bbox.y0 / escala, x1: w.bbox.x1 / escala, y1: w.bbox.y1 / escala
    })))));
    assert.ok(palabras.length > 100);

    const motor = crearModuloOcr(() => doc, () => {});
    motor.anadirTexto({ pagina: 0, palabras });
    const pagina = doc.loadPage(0);
    const texto = pagina.toStructuredText().asText();
    assert.ok(texto.includes('Documento escaneado'), texto.slice(0, 200));
    assert.ok(texto.includes('más adelante'), 'los acentos se conservan');
    // La palabra encontrada está donde Tesseract la vio
    const [quad] = pagina.search('escaneado')[0];
    const vista = palabras.find((p) => p.texto.includes('escaneado'));
    assert.ok(Math.abs(quad[0] - vista.x0) < 3 && Math.abs(quad[2] - vista.x1) < 3, `${quad} / ${JSON.stringify(vista)}`);
    assert.deepEqual(pintar(), antes, 'la imagen de la página no cambia');
    doc.undo();
    assert.equal(doc.loadPage(0).toStructuredText().asText().trim(), '');
});
