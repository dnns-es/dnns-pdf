// Fecha: 2026-10-12
// Ruta: /tests/formularios.test.js
// Pruebas de la fase 5 (Formularios): listar, rellenar, crear y borrar campos, aplanar y deshacer
// Uso: npm test
// Notas: formulario.pdf trae texto, casilla, dos opciones y un desplegable; texto.pdf no tiene formulario.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as mupdf from 'mupdf';
import { crearModuloFormularios } from '../src/motor/formularios.js';

const leer = (nombre) => readFileSync(new URL(`./pdfs/${nombre}`, import.meta.url));

function abrir(nombre) {
    const doc = mupdf.Document.openDocument(leer(nombre), 'application/pdf');
    doc.enableJournal();
    let cambios = 0;
    const motor = crearModuloFormularios(() => doc, () => cambios++);
    return { doc, motor, cambios: () => cambios };
}

const porNombre = (campos, nombre) => campos.find((c) => c.nombre === nombre);

test('lista los campos de la página con su tipo, valor y opciones', () => {
    const { motor } = abrir('formulario.pdf');
    assert.equal(motor.hay(), true);
    const campos = motor.listar({ pagina: 0 });
    assert.deepEqual(campos.map((c) => c.tipo), ['texto', 'texto', 'casilla', 'opcion', 'opcion', 'desplegable']);
    assert.equal(porNombre(campos, 'nombre').valor, '');
    assert.equal(porNombre(campos, 'acepto').marcada, false);
    assert.deepEqual(porNombre(campos, 'pais').opciones, ['España', 'Portugal', 'Francia']);
    assert.equal(porNombre(campos, 'pais').valor, 'España');
    const [x0, y0, x1, y1] = porNombre(campos, 'nombre').rect;
    assert.ok(x1 > x0 && y1 > y0);
});

test('rellenar: texto, casilla, opción y desplegable, con deshacer', () => {
    const { doc, motor, cambios } = abrir('formulario.pdf');
    const campos = motor.listar({ pagina: 0 });
    const texto = motor.cambiar({ pagina: 0, id: porNombre(campos, 'nombre').id, valor: 'Antonio ñ' });
    assert.equal(texto.valor, 'Antonio ñ');
    const casilla = motor.cambiar({ pagina: 0, id: porNombre(campos, 'acepto').id, valor: true });
    assert.equal(casilla.marcada, true);
    // Marcar la segunda opción desmarca la primera
    const opciones = campos.filter((c) => c.tipo === 'opcion');
    motor.cambiar({ pagina: 0, id: opciones[1].id, valor: true });
    const despues = motor.listar({ pagina: 0 }).filter((c) => c.tipo === 'opcion');
    assert.deepEqual(despues.map((c) => c.marcada), [false, true]);
    const pais = motor.cambiar({ pagina: 0, id: porNombre(campos, 'pais').id, valor: 'Francia' });
    assert.equal(pais.valor, 'Francia');
    assert.equal(cambios(), 4);
    // El valor queda pintado en la página
    assert.ok(doc.canUndo());
    doc.undo();
    assert.equal(porNombre(motor.listar({ pagina: 0 }), 'pais').valor, 'España');
});

test('crear campos de texto y casilla en un PDF sin formulario, usarlos y borrarlos', () => {
    const { doc, motor } = abrir('texto.pdf');
    assert.equal(motor.hay(), false);
    const campo = motor.crear({ pagina: 0, tipo: 'texto', rect: [100, 400, 300, 420] });
    assert.equal(campo.tipo, 'texto');
    assert.equal(campo.nombre, 'campo1');
    const casilla = motor.crear({ pagina: 0, tipo: 'casilla', rect: [100, 440] });
    assert.equal(casilla.tipo, 'casilla');
    assert.equal(casilla.nombre, 'casilla1');
    assert.equal(casilla.marcada, false);
    const grande = motor.crear({ pagina: 0, tipo: 'texto', rect: [100, 480, 300, 560] });
    assert.equal(grande.multilinea, true, 'un campo alto admite varias líneas');
    assert.equal(grande.nombre, 'campo2');
    assert.equal(motor.hay(), true);

    assert.equal(motor.cambiar({ pagina: 0, id: campo.id, valor: 'Hola' }).valor, 'Hola');
    assert.equal(motor.cambiar({ pagina: 0, id: casilla.id, valor: true }).marcada, true);
    // La casilla lleva sus dos apariencias (Off y Yes)
    const pagina = doc.loadPage(0);
    const widget = pagina.getWidgets().find((w) => w.getName() === 'casilla1');
    assert.equal(widget.getObject().get('AS').asName(), 'Yes');
    assert.ok(!widget.getObject().get('AP').get('N').get('Yes').isNull());
    pagina.destroy();

    motor.borrar({ pagina: 0, id: casilla.id });
    assert.deepEqual(motor.listar({ pagina: 0 }).map((c) => c.nombre), ['campo1', 'campo2']);
    assert.equal(doc.getTrailer().get('Root').get('AcroForm').get('Fields').length, 2);
    doc.undo();
    assert.equal(motor.listar({ pagina: 0 }).length, 3, 'borrar se deshace');
});

test('aplanar deja el texto rellenado en la página, sin campos, y se puede deshacer', () => {
    const { doc, motor } = abrir('formulario.pdf');
    const campos = motor.listar({ pagina: 0 });
    motor.cambiar({ pagina: 0, id: porNombre(campos, 'nombre').id, valor: 'Texto fijo' });
    motor.aplanar();
    assert.equal(motor.listar({ pagina: 0 }).length, 0);
    assert.equal(motor.hay(), false);
    const pagina = doc.loadPage(0);
    assert.ok(pagina.toStructuredText().asText().includes('Texto fijo'));
    pagina.destroy();
    doc.undo();
    assert.equal(motor.listar({ pagina: 0 }).length, 6);
    assert.equal(porNombre(motor.listar({ pagina: 0 }), 'nombre').valor, 'Texto fijo');
});
