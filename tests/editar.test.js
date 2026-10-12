// Fecha: 2026-10-12
// Ruta: /tests/editar.test.js
// Pruebas de editar contenido: reescribir una línea, añadir texto e imágenes, mover y borrar imágenes, propiedades
// Uso: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as mupdf from 'mupdf';
import { crearModuloEditar } from '../src/motor/editar.js';

const leer = (nombre) => readFileSync(new URL(`./pdfs/${nombre}`, import.meta.url));

function abrir(nombre) {
    const doc = mupdf.Document.openDocument(leer(nombre), 'application/pdf');
    doc.enableJournal();
    return { doc, motor: crearModuloEditar(() => doc, () => {}) };
}

function reabrir(doc) {
    const buffer = doc.saveToBuffer('garbage=compact');
    return mupdf.Document.openDocument(buffer.asUint8Array().slice(), 'application/pdf');
}

const textoPagina = (doc, n = 0) => doc.loadPage(n).toStructuredText().asText();

// PNG de 2x2 rojo hecho a mano con MuPDF
function pngRojo() {
    const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 20, 10], false);
    pixmap.clear(200);
    return pixmap.asPNG();
}

test('líneas: devuelve texto, tamaño, línea base y tipo de letra', () => {
    const { motor } = abrir('texto.pdf');
    const lineas = motor.lineas({ pagina: 0 });
    assert.ok(lineas.length > 3);
    const primera = lineas[0];
    assert.ok(primera.texto.length > 0);
    assert.ok(primera.tamano > 4);
    assert.equal(primera.origen.length, 2);
    assert.ok(['sans', 'serif', 'mono'].includes(primera.familia));
    assert.equal(primera.color.length, 3);
});

test('reescribir: la línea cambia, las vecinas siguen y se puede deshacer', () => {
    const { doc, motor } = abrir('texto.pdf');
    const lineas = motor.lineas({ pagina: 0 });
    const elegida = lineas.find((linea) => linea.texto.length > 20);
    const veces = (texto) => texto.split(elegida.texto.trim()).length - 1;
    const antes = veces(textoPagina(doc));
    const vecinas = lineas.filter((linea) => linea !== elegida).map((linea) => linea.texto.trim()).filter((t) => t.length > 10);
    motor.reescribir({ ...elegida, pagina: 0, texto: 'Línea cambiada por DNNS 2026 €' });
    const guardado = reabrir(doc);
    const texto = textoPagina(guardado);
    assert.ok(texto.includes('Línea cambiada por DNNS 2026 €'));
    assert.equal(veces(texto), antes - 1, 'esa línea ya no está (el documento de prueba la repite)');
    const conservadas = vecinas.filter((v) => texto.includes(v)).length;
    assert.ok(conservadas >= vecinas.length - 1, 'las demás líneas siguen ahí');
    // Deshacer (en memoria, antes de guardar con limpieza)
    const otro = abrir('texto.pdf');
    otro.motor.reescribir({ ...elegida, pagina: 0, texto: 'Otra' });
    assert.equal(veces(textoPagina(otro.doc)), antes - 1);
    otro.doc.undo();
    assert.equal(veces(textoPagina(otro.doc)), antes);
});

test('reescribir: con zonas de «Ocultar» pendientes avisa en vez de aplicarlas', () => {
    const { doc, motor } = abrir('texto.pdf');
    const pagina = doc.loadPage(0);
    const zona = pagina.createAnnotation('Redact');
    zona.setRect([10, 10, 50, 50]);
    zona.update();
    const linea = motor.lineas({ pagina: 0 })[0];
    assert.throws(() => motor.reescribir({ ...linea, pagina: 0, texto: 'x' }), /OCULTAR_PENDIENTE/);
});

test('añadir texto en varias líneas con otra fuente y color', () => {
    const { doc, motor } = abrir('texto.pdf');
    const { ok, rect } = motor.anadirTexto({ pagina: 1, x: 72, y: 600, texto: 'Primera línea\nSegunda', tamano: 14, familia: 'serif', negrita: true, color: [0, 0, 1] });
    assert.ok(ok);
    assert.ok(rect[2] > rect[0]);
    const guardado = reabrir(doc);
    const texto = textoPagina(guardado, 1);
    assert.ok(texto.includes('Primera línea') && texto.includes('Segunda'));
    const fuentes = new Set();
    guardado.loadPage(1).toStructuredText().walk({ onChar: (c, o, fuente) => fuentes.add(fuente.getName()) });
    assert.ok([...fuentes].some((nombre) => /Times.*Bold/i.test(nombre)), [...fuentes].join(','));
});

test('imágenes: añadir, mover y borrar', () => {
    const { doc, motor } = abrir('texto.pdf');
    const antes = motor.imagenes({ pagina: 2 }).length;
    motor.anadirImagen({ pagina: 2, rect: [100, 100, 300, 200], bytes: pngRojo() });
    let imagenes = motor.imagenes({ pagina: 2 });
    assert.equal(imagenes.length, antes + 1);
    const indice = imagenes.findIndex((i) => Math.abs(i.rect[0] - 100) < 1 && Math.abs(i.rect[1] - 100) < 1);
    assert.ok(indice >= 0);
    motor.cambiarImagen({ pagina: 2, indice, rect: [200, 300, 300, 350] });
    imagenes = motor.imagenes({ pagina: 2 });
    assert.equal(imagenes.length, antes + 1);
    const movida = imagenes.findIndex((i) => Math.abs(i.rect[0] - 200) < 1 && Math.abs(i.rect[1] - 300) < 1);
    assert.ok(movida >= 0, JSON.stringify(imagenes));
    motor.cambiarImagen({ pagina: 2, indice: movida, rect: null });
    assert.equal(reabrir(doc).loadPage(2).toStructuredText('preserve-images').asJSON().includes('"type":"image"'), antes > 0);
});

test('propiedades del documento', () => {
    const { doc, motor } = abrir('texto.pdf');
    motor.ponerPropiedades({ titulo: 'Título nuevo', autor: 'Oberluss', asunto: 'Prueba', claves: 'pdf, dnns' });
    const guardado = reabrir(doc);
    const otro = crearModuloEditar(() => guardado, () => {});
    assert.deepEqual(otro.propiedades(), { titulo: 'Título nuevo', autor: 'Oberluss', asunto: 'Prueba', claves: 'pdf, dnns' });
});
