// Fecha: 2026-10-12
// Ruta: /tests/firmaDigital.test.js
// Pruebas de la fase 5 (Firmar): firma digital con certificado y comprobación de firmas
// Uso: npm test
// Notas: certificado-prueba.p12 (cifrado antiguo, como el de la FNMT), certificado-prueba-aes.p12 (moderno) y
//        certificado-prueba-ca.p12 (emitido por la autoridad de prueba ac-prueba.b64)
//        Son de usar y tirar, con la contraseña «prueba».

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as mupdf from 'mupdf';
import { leerCertificado, firmar, verificar } from '../src/motor/firmaDigital.js';

const leer = (nombre) => readFileSync(new URL(`./pdfs/${nombre}`, import.meta.url));
const abrir = (bytes = leer('texto.pdf')) => mupdf.Document.openDocument(bytes, 'application/pdf');
const LINEAS = ['Firmado digitalmente por', '{titular}', 'Fecha: 12/10/2026 18:00', 'Motivo: conformidad, añadido'];

async function firmado(opciones = {}) {
    const doc = abrir();
    const { bytes } = await firmar(doc, { p12: leer('certificado-prueba.p12'), clave: 'prueba', pagina: 0, rect: null, lineas: LINEAS, ...opciones });
    return bytes;
}

test('lee el titular de un certificado con cifrado antiguo y con AES', async () => {
    for (const archivo of ['certificado-prueba.p12', 'certificado-prueba-aes.p12']) {
        const datos = await leerCertificado({ p12: leer(archivo), clave: 'prueba' });
        assert.equal(datos.titular.comun, 'PRUEBA FIRMANTE');
        assert.equal(datos.titular.nif, 'IDCES-00000000T');
        assert.equal(datos.caducado, false);
    }
});

test('una contraseña mal da error CLAVE', async () => {
    await assert.rejects(leerCertificado({ p12: leer('certificado-prueba.p12'), clave: 'otra' }), /CLAVE/);
});

test('firmar y verificar: la firma es válida, íntegra y cubre todo el archivo', async () => {
    const bytes = await firmado({ motivo: 'Conformidad', lugar: 'Palma' });
    const [firma] = await verificar({ buffer: bytes.buffer });
    assert.equal(firma.estado, 'valida');
    assert.equal(firma.cubreTodo, true);
    assert.equal(firma.nombre, 'PRUEBA FIRMANTE');
    assert.equal(firma.motivo, 'Conformidad');
    assert.equal(firma.confianza, false, 'autofirmado: no es de una autoridad de confianza');
    assert.equal(abrir(bytes).countPages(), abrir().countPages());
});

test('si se toca un byte del archivo firmado, la firma sale rota', async () => {
    const bytes = await firmado();
    // Un byte del principio del archivo (dentro del primer rango firmado)
    bytes[200] ^= 1;
    const [firma] = await verificar({ buffer: bytes.buffer });
    assert.equal(firma.estado, 'rota');
    assert.equal(firma.integra, false);
});

test('la firma visible pinta el recuadro en la página', async () => {
    const bytes = await firmado({ rect: [300, 700, 500, 760] });
    const pagina = abrir(bytes).loadPage(0);
    const pixmap = pagina.toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false, true);
    const p = pixmap.getPixels();
    let oscuros = 0;
    for (let y = 702; y < 758; y++) {
        for (let x = 302; x < 498; x++) {
            const i = (y * pixmap.getWidth() + x) * 3;
            oscuros += p[i] < 100 ? 1 : 0;
        }
    }
    assert.ok(oscuros > 100, `el texto de la firma se ve (${oscuros} píxeles oscuros)`);
});

test('dos firmas seguidas: las dos se verifican y la primera ya no cubre todo', async () => {
    const primera = await firmado();
    const doc = abrir(primera);
    const { bytes } = await firmar(doc, { p12: leer('certificado-prueba-aes.p12'), clave: 'prueba', pagina: 1, rect: null, lineas: LINEAS });
    const firmas = await verificar({ buffer: bytes.buffer });
    assert.equal(firmas.length, 2);
    assert.ok(firmas.every((f) => f.estado === 'valida'));
    assert.deepEqual(firmas.map((f) => f.cubreTodo).sort(), [false, true]);
});

test('un PDF sin firmas devuelve la lista vacía', async () => {
    assert.deepEqual(await verificar({ buffer: new Uint8Array(leer('texto.pdf')).buffer }), []);
});

test('confianza: sí si la cadena llega a una autoridad conocida, no si no la conocemos', async () => {
    const doc = abrir();
    const { bytes } = await firmar(doc, { p12: leer('certificado-prueba-ca.p12'), clave: 'prueba', pagina: 0, rect: null, lineas: LINEAS });
    const ac = readFileSync(new URL('./pdfs/ac-prueba.b64', import.meta.url), 'utf8').trim();
    const [conocida] = await verificar({ buffer: bytes.slice().buffer, raicesExtra: [ac] });
    assert.equal(conocida.estado, 'valida');
    assert.equal(conocida.confianza, true);
    assert.equal(conocida.certificado.emisor, 'AC PRUEBA');
    const [desconocida] = await verificar({ buffer: bytes.slice().buffer });
    assert.equal(desconocida.confianza, false);
});
