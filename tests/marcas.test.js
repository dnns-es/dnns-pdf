// Fecha: 2026-10-12
// Ruta: /tests/marcas.test.js
// Pruebas de números de página, encabezados y marcas de agua (también en páginas giradas)
// Uso: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as mupdf from 'mupdf';
import { crearModuloMarcas } from '../src/motor/marcas.js';

const leer = (nombre) => readFileSync(new URL(`./pdfs/${nombre}`, import.meta.url));

function abrir() {
    const doc = mupdf.Document.openDocument(leer('texto.pdf'), 'application/pdf');
    doc.enableJournal();
    let cambios = 0;
    return { doc, motor: crearModuloMarcas(() => doc, () => cambios++), cambios: () => cambios };
}

const textoDe = (doc, n) => doc.loadPage(n).toStructuredText().asText();

test('numerar las páginas elegidas con su plantilla, en su sitio, y deshacer', () => {
    const { doc, motor, cambios } = abrir();
    const total = doc.countPages();
    motor.numerar({ paginas: [0, 1], plantilla: 'Página {n} de {total} · {nombre}', posicion: 'abajo-derecha', inicio: 5, nombre: 'informe' });
    assert.equal(cambios(), 1);
    assert.ok(textoDe(doc, 0).includes('Página 5 de 6 · informe'));
    assert.ok(textoDe(doc, 1).includes('Página 6 de 6 · informe'));
    if (total > 2) {
        assert.ok(!textoDe(doc, 2).includes('Página'), 'las páginas no elegidas no cambian');
    }
    // Abajo a la derecha: cerca del borde inferior y del derecho
    const pagina = doc.loadPage(0);
    const [, , ancho, alto] = pagina.getBounds();
    const [quad] = pagina.search('informe')[0];
    assert.ok(quad[2] > ancho - 40 && quad[2] <= ancho - 20, `x ${quad[2]}`);
    assert.ok(quad[5] > alto - 40 && quad[5] <= alto, `y ${quad[5]}`);
    doc.undo();
    assert.ok(!textoDe(doc, 0).includes('Página 5'));
});

test('en una página girada el número sale abajo de la página tal como se ve', () => {
    const { doc, motor } = abrir();
    doc.beginOperation('girar');
    doc.findPage(1).put('Rotate', 90);
    doc.endOperation();
    motor.numerar({ paginas: [1], plantilla: '{n}', posicion: 'abajo-centro', inicio: 7 });
    const pagina = doc.loadPage(1);
    const [, , ancho, alto] = pagina.getBounds();
    assert.ok(ancho > alto, 'apaisada tras girar');
    const [quad] = pagina.search('7')[0];
    assert.ok(quad[5] > alto - 40, `y ${quad[5]} de ${alto}`);
    assert.ok(Math.abs((quad[0] + quad[2]) / 2 - ancho / 2) < 10, 'centrado');
    // Horizontal en la vista: la línea base es plana
    assert.ok(Math.abs(quad[1] - quad[3]) < 0.5);
});

test('marca de agua de texto e imagen: se ve en la página y la página sigue legible', () => {
    const { doc, motor } = abrir();
    const antes = textoDe(doc, 0);
    motor.marcaAgua({ paginas: [0], texto: 'BORRADOR', opacidad: 0.2, angulo: 45 });
    assert.ok(textoDe(doc, 0).includes('BORRADOR'));
    for (const linea of antes.split('\n').filter((l) => l.trim()).slice(0, 3)) {
        assert.ok(textoDe(doc, 0).includes(linea.trim()), 'el texto original sigue');
    }
    const png = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 20, 20], false);
    png.clear(0);
    const conImagen = motor.marcaAgua({ paginas: [0, 1], imagen: png.asPNG(), angulo: 0, opacidad: 0.5, debajo: true });
    assert.equal(conImagen.paginas, 2);
    const recursos = doc.findPage(1).get('Resources');
    assert.ok(!recursos.get('XObject').get('IMDNNS').isNull());
    assert.ok(!recursos.get('ExtGState').get('GSDNNS').isNull());
    const pixmap = doc.loadPage(1).toPixmap(mupdf.Matrix.scale(0.2, 0.2), mupdf.ColorSpace.DeviceRGB);
    assert.ok(pixmap.getWidth() > 0);
});
