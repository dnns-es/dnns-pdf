// Fecha: 2026-10-12
// Ruta: /tests/seguridad.test.js
// Pruebas de seguridad: proteger con contraseña y permisos, y quitar la protección
// Uso: npm test
// Notas: protegido.pdf (contraseña «dnns») sirve para probar quitar la protección.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as mupdf from 'mupdf';
import { crearModuloSeguridad } from '../src/motor/seguridad.js';

const leer = (nombre) => readFileSync(new URL(`./pdfs/${nombre}`, import.meta.url));

function abrir(bytes, clave = null) {
    const doc = mupdf.Document.openDocument(bytes, 'application/pdf');
    const motor = crearModuloSeguridad(() => doc);
    const nivel = clave ? doc.authenticatePassword(clave) : 0;
    motor.registrarApertura(clave, nivel);
    return { doc, motor };
}

test('proteger con contraseña de apertura y permisos; la copia pide clave y respeta los permisos', () => {
    const { motor } = abrir(leer('texto.pdf'));
    assert.deepEqual(motor.estado(), { cifrado: false, restringido: false, permisos: { imprimir: true, copiar: true, modificar: true }, conClaveApertura: false, esPropietario: false });
    const { bytes } = motor.proteger({ claveApertura: 'abre,me', clavePropietario: 'dueño', restricciones: { imprimir: true, copiar: false, modificar: true } });
    const copia = abrir(bytes, 'abreme');
    assert.equal(copia.doc.needsPassword(), true);
    const estado = copia.motor.estado();
    assert.equal(estado.cifrado, true);
    assert.deepEqual(estado.permisos, { imprimir: false, copiar: true, modificar: false });
    assert.equal(estado.esPropietario, false);
    // Con la de propietario, todo permitido
    const dueño = abrir(bytes, 'dueño');
    assert.equal(dueño.motor.estado().esPropietario, true);
    assert.deepEqual(dueño.motor.estado().permisos, { imprimir: true, copiar: true, modificar: true });
});

test('solo permisos (sin contraseña de apertura): se abre sin clave pero restringido', () => {
    const { motor } = abrir(leer('texto.pdf'));
    const { bytes } = motor.proteger({ claveApertura: '', clavePropietario: 'dueño', restricciones: { imprimir: false, copiar: true, modificar: false } });
    const copia = abrir(bytes);
    assert.equal(copia.doc.needsPassword(), false);
    assert.deepEqual(copia.motor.estado().permisos, { imprimir: true, copiar: false, modificar: true });
    assert.equal(copia.motor.estado().restringido, true);
    assert.throws(() => motor.proteger({ claveApertura: '', clavePropietario: '' }), /SINCLAVE/);
});

test('quitar la protección: con la clave conocida si solo hay apertura, con la de propietario si hay permisos', () => {
    // protegido.pdf: solo contraseña de apertura
    const abierto = abrir(leer('protegido.pdf'), 'dnns');
    assert.equal(abierto.motor.estado().cifrado, true);
    const { bytes } = abierto.motor.quitarProteccion({});
    const libre = abrir(bytes);
    assert.equal(libre.doc.needsPassword(), false);
    assert.equal(libre.motor.estado().cifrado, false);
    assert.throws(() => libre.motor.quitarProteccion({}), /SINCIFRAR/);

    // Con permisos restringidos hace falta la de propietario
    const { bytes: restringido } = abrir(leer('texto.pdf')).motor.proteger({ claveApertura: 'abre', clavePropietario: 'dueño', restricciones: { imprimir: true } });
    const usuario = abrir(restringido, 'abre');
    assert.throws(() => usuario.motor.quitarProteccion({}), /CLAVE/);
    assert.throws(() => usuario.motor.quitarProteccion({ clave: 'mal' }), /CLAVE/);
    const { bytes: limpio } = usuario.motor.quitarProteccion({ clave: 'dueño' });
    assert.equal(abrir(limpio).motor.estado().cifrado, false);
});
