// Fecha: 2026-10-12
// Ruta: /tests/firmar.test.js
// Pruebas de la fase 5 (Firmar): firma manuscrita como sello con imagen
// Uso: npm test
// Notas: el motor se prueba fuera del worker, con MuPDF en Node.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as mupdf from 'mupdf';
import { crearModuloAnotaciones } from '../src/motor/anotaciones.js';

const leer = (nombre) => readFileSync(new URL(`./pdfs/${nombre}`, import.meta.url));

function abrir() {
    const doc = mupdf.Document.openDocument(leer('texto.pdf'), 'application/pdf');
    const motor = crearModuloAnotaciones(() => doc);
    motor.activarHistorial();
    return { doc, motor };
}

// PNG con transparencia: un trazo negro sobre fondo transparente
function pngFirma() {
    const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 60, 20], true);
    pixmap.clear();
    const datos = pixmap.getPixels();
    for (let x = 5; x < 55; x++) {
        const i = (10 * 60 + x) * 4;
        datos[i + 3] = 255;
    }
    return pixmap.asPNG();
}

// Píxel de la página renderizada en coordenadas PDF
function pixel(doc, x, y) {
    const pagina = doc.loadPage(0);
    const pixmap = pagina.toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false, true);
    const i = (y * pixmap.getWidth() + x) * 3;
    return Array.from(pixmap.getPixels().slice(i, i + 3));
}

test('la firma se crea como sello con la imagen dentro', () => {
    const { doc, motor } = abrir();
    const creada = motor.crear({ pagina: 0, herramienta: 'firma', datos: { rect: [300, 600, 450, 650], imagen: pngFirma() } });
    assert.equal(creada.tipo, 'Stamp');
    assert.equal(creada.firma, true);
    assert.equal(creada.movible, true);
    // La línea de la imagen cae en la mitad de alto del recuadro: y = 625
    assert.deepEqual(pixel(doc, 375, 625), [0, 0, 0]);
    // El fondo transparente deja ver la página
    assert.deepEqual(pixel(doc, 375, 605), [255, 255, 255]);
});

test('al moverla o cambiarle el tamaño se repinta la misma imagen', () => {
    const { doc, motor } = abrir();
    const { id } = motor.crear({ pagina: 0, herramienta: 'firma', datos: { rect: [300, 600, 450, 650], imagen: pngFirma() } });
    motor.modificar({ pagina: 0, id, datos: { rect: [100, 100, 400, 200] } });
    assert.deepEqual(pixel(doc, 250, 150), [0, 0, 0]);
    assert.deepEqual(pixel(doc, 375, 625), [255, 255, 255]);
});

test('la firma sobrevive a guardar y volver a abrir', () => {
    const { motor } = abrir();
    motor.crear({ pagina: 0, herramienta: 'firma', datos: { rect: [300, 600, 450, 650], imagen: pngFirma() } });
    const { bytes } = motor.exportar();
    const doc = mupdf.Document.openDocument(bytes, 'application/pdf');
    assert.deepEqual(pixel(doc, 375, 625), [0, 0, 0]);
    const otro = crearModuloAnotaciones(() => doc);
    assert.equal(otro.listar({ pagina: 0 }).find((a) => a.tipo === 'Stamp').firma, true);
});
