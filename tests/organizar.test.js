// Fecha: 2026-10-12
// Ruta: /tests/organizar.test.js
// Pruebas de la fase 4 (Organizar): operaciones del motor de páginas sobre PDF reales y cálculo de rangos
// Uso: npm test
// Notas: el motor se prueba fuera del worker, con MuPDF en Node; cada prueba abre su propia copia del PDF.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as mupdf from 'mupdf';
import { crearModuloPaginas } from '../src/motor/paginas.js';
import { leerRangos, cadaN } from '../src/modulos/organizar/rangos.js';

const leer = (nombre) => readFileSync(new URL(`./pdfs/${nombre}`, import.meta.url));

// Documento abierto + motor de páginas, como en el worker
function abrir(nombre = 'texto.pdf') {
    const doc = mupdf.Document.openDocument(leer(nombre), 'application/pdf');
    let cambios = 0;
    const motor = crearModuloPaginas(() => doc, () => cambios++);
    return { doc, motor, cambios: () => cambios };
}

// Texto de cada página: sirve para saber qué página quedó en cada sitio
function textos(doc) {
    const salida = [];
    for (let i = 0; i < doc.countPages(); i++) {
        const pagina = doc.loadPage(i);
        salida.push(pagina.toStructuredText().asText().trim().split('\n')[0]);
        pagina.destroy();
    }
    return salida;
}

const rotacion = (doc, n) => {
    const r = doc.findPage(n).getInheritable('Rotate');
    return r.isNull() ? 0 : r.asNumber();
};

// PNG pequeño hecho con la propia MuPDF (una página renderizada)
function png() {
    const doc = mupdf.Document.openDocument(leer('texto.pdf'), 'application/pdf');
    const pagina = doc.loadPage(0);
    const pixmap = pagina.toPixmap(mupdf.Matrix.scale(0.2, 0.2), mupdf.ColorSpace.DeviceRGB, false);
    const bytes = pixmap.asPNG();
    pixmap.destroy();
    pagina.destroy();
    doc.destroy();
    return bytes;
}

const abrirBytes = (bytes) => mupdf.Document.openDocument(bytes, 'application/pdf');

test('rotar suma grados y vuelve a 0 al dar la vuelta completa', () => {
    const { doc, motor } = abrir();
    motor.rotar({ paginas: [0], grados: 90 });
    assert.equal(rotacion(doc, 0), 90);
    motor.rotar({ paginas: [0], grados: -90 });
    motor.rotar({ paginas: [0], grados: -90 });
    assert.equal(rotacion(doc, 0), 270);
    motor.rotar({ paginas: [0], grados: 90 });
    assert.equal(rotacion(doc, 0), 0);
});

test('borrar quita las páginas elegidas y no deja borrarlas todas', () => {
    const { doc, motor } = abrir();
    const antes = textos(doc);
    motor.borrar({ paginas: [0, 2] });
    assert.deepEqual(textos(doc), antes.filter((_, i) => i !== 0 && i !== 2));
    assert.throws(() => motor.borrar({ paginas: [...Array(doc.countPages()).keys()] }), /TODAS/);
});

test('duplicar deja cada copia justo detrás de su original', () => {
    const { doc, motor } = abrir();
    const antes = textos(doc);
    motor.duplicar({ paginas: [0, 1] });
    assert.deepEqual(textos(doc), [antes[0], antes[0], antes[1], antes[1], ...antes.slice(2)]);
});

test('reordenar coloca las páginas en el orden pedido', () => {
    const { doc, motor } = abrir();
    const antes = textos(doc);
    const orden = [...antes.keys()].reverse();
    motor.reordenar({ orden });
    assert.deepEqual(textos(doc), orden.map((i) => antes[i]));
});

test('insertar en blanco mete una página A4 en la posición pedida', () => {
    const { doc, motor } = abrir();
    const total = doc.countPages();
    motor.insertarBlanco({ en: 1 });
    assert.equal(doc.countPages(), total + 1);
    const [, , ancho, alto] = doc.loadPage(1).getBounds();
    assert.equal(Math.round(ancho), 595);
    assert.equal(Math.round(alto), 842);
    assert.equal(textos(doc)[1], '');
});

test('insertar otro PDF añade todas sus páginas en orden', () => {
    const { doc, motor } = abrir();
    const otro = textos(abrirBytes(leer('texto.pdf')));
    const total = doc.countPages();
    assert.equal(motor.insertarPdf({ en: 1, buffer: leer('texto.pdf') }), otro.length);
    assert.equal(doc.countPages(), total + otro.length);
    assert.deepEqual(textos(doc).slice(1, 1 + otro.length), otro);
});

test('insertar un PDF protegido da error PROTEGIDO', () => {
    const { motor } = abrir();
    assert.throws(() => motor.insertarPdf({ en: -1, buffer: leer('protegido.pdf') }), /PROTEGIDO/);
});

test('insertar imágenes crea una página por imagen (A4 o tamaño de la imagen)', () => {
    const { doc, motor } = abrir();
    const total = doc.countPages();
    motor.insertarImagenes({ en: -1, imagenes: [png(), png()], modo: 'a4' });
    assert.equal(doc.countPages(), total + 2);
    const [, , ancho] = doc.loadPage(total).getBounds();
    assert.equal(Math.round(ancho), 595);
    motor.insertarImagenes({ en: -1, imagenes: [png()], modo: 'imagen' });
    const [, , anchoImg] = doc.loadPage(total + 2).getBounds();
    assert.ok(anchoImg < 595, 'en modo imagen la página mide lo que la imagen');
});

test('recortar cambia el tamaño visible y quitar el recorte lo devuelve', () => {
    const { doc, motor } = abrir();
    const original = doc.loadPage(0).getBounds();
    motor.recortar({ paginas: [0], rect: [50, 50, 300, 400] });
    const [x0, y0, x1, y1] = doc.loadPage(0).getBounds();
    assert.equal(Math.round(x1 - x0), 250);
    assert.equal(Math.round(y1 - y0), 350);
    motor.recortar({ paginas: [0], rect: null });
    assert.deepEqual(doc.loadPage(0).getBounds().map(Math.round), original.map(Math.round));
});

test('extraer crea un PDF aparte sin tocar el abierto', () => {
    const { doc, motor } = abrir();
    const antes = textos(doc);
    const { bytes } = motor.extraer({ paginas: [2, 0] });
    assert.deepEqual(textos(abrirBytes(bytes)), [antes[2], antes[0]]);
    assert.deepEqual(textos(doc), antes);
});

test('unir junta PDF e imágenes en el orden de la lista', () => {
    const { motor } = abrir();
    const unoTexto = textos(abrirBytes(leer('texto.pdf')));
    const { bytes } = motor.unir({ piezas: [{ pdf: leer('texto.pdf') }, { imagen: png() }, { pdf: leer('texto.pdf') }], modo: 'a4' });
    const unido = abrirBytes(bytes);
    assert.equal(unido.countPages(), unoTexto.length * 2 + 1);
    assert.deepEqual(textos(unido).slice(0, unoTexto.length), unoTexto);
});

test('cada cambio queda en el historial y se puede deshacer', () => {
    const { doc, motor, cambios } = abrir();
    doc.enableJournal();
    const antes = textos(doc);
    motor.borrar({ paginas: [0] });
    assert.equal(cambios(), 1);
    assert.ok(doc.canUndo());
    doc.undo();
    assert.deepEqual(textos(doc), antes);
});

test('el PDF grande de 320 páginas se reordena y extrae sin problemas', () => {
    const { doc, motor } = abrir('grande-320-paginas.pdf');
    assert.equal(doc.countPages(), 320);
    motor.reordenar({ orden: [...Array(320).keys()].reverse() });
    const { bytes } = motor.extraer({ paginas: [0, 319] });
    assert.equal(abrirBytes(bytes).countPages(), 2);
});

test('leerRangos entiende rangos, sueltas y separadores', () => {
    assert.deepEqual(leerRangos('1-3, 5', 10), [[0, 1, 2], [4]]);
    assert.deepEqual(leerRangos(' 2 ; 4 - 5 ', 10), [[1], [3, 4]]);
    assert.throws(() => leerRangos('', 10), /rangosVacios/);
    assert.throws(() => leerRangos('a-b', 10), /rangosMal/);
    assert.throws(() => leerRangos('3-1', 10), /rangosFuera/);
    assert.throws(() => leerRangos('9-12', 10), /rangosFuera/);
});

test('cadaN reparte en bloques y la última parte se queda con el resto', () => {
    assert.deepEqual(cadaN(2, 5), [[0, 1], [2, 3], [4]]);
    assert.deepEqual(cadaN(5, 5), [[0, 1, 2, 3, 4]]);
});
