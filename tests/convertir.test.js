// Fecha: 2026-10-12
// Ruta: /tests/convertir.test.js
// Pruebas de convertir PDF a Word y Excel: párrafos unidos con su formato, tabla con sus columnas, imagen,
// una sección por página y cantidades como números
// Uso: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as mupdf from 'mupdf';
import { unzipSync, strFromU8 } from 'fflate';
import mammoth from 'mammoth';
import { extraerPagina } from '../src/motor/convertir/extraer.js';
import { crearDocx } from '../src/motor/convertir/word.js';
import { crearXlsx } from '../src/motor/convertir/excel.js';
import { leerNumero, trozosDePagina, agruparFilas, buscarTablas } from '../src/motor/convertir/disposicion.js';

function paginasDe(nombre) {
    const doc = mupdf.Document.openDocument(readFileSync(new URL(`./pdfs/${nombre}`, import.meta.url)), 'application/pdf');
    return Array.from({ length: doc.countPages() }, (_, n) => {
        const pagina = doc.loadPage(n);
        try {
            return extraerPagina(pagina);
        } finally {
            pagina.destroy();
        }
    });
}

test('números escritos: formatos español e inglés, moneda, porcentaje y códigos', () => {
    assert.equal(leerNumero('1.234,56').valor, 1234.56);
    assert.equal(leerNumero('1,234.56').valor, 1234.56);
    assert.equal(leerNumero('1.200').valor, 1200);
    assert.equal(leerNumero('12,5').valor, 12.5);
    assert.ok(leerNumero('45,00 €').moneda);
    assert.equal(leerNumero('21 %').valor, 0.21);
    assert.equal(leerNumero('-3').valor, -3);
    assert.equal(leerNumero('007'), null);
    assert.equal(leerNumero('Total'), null);
    assert.equal(leerNumero('12 34 5'), null);
});

test('tabla con encabezados a la izquierda y números a la derecha: 4 columnas, 6 filas', () => {
    const [pagina] = paginasDe('factura.pdf');
    const tablas = buscarTablas(agruparFilas(trozosDePagina(pagina)));
    assert.equal(tablas.length, 1);
    assert.equal(tablas[0].columnas.length, 4);
    assert.equal(tablas[0].filas.length, 6);
});

test('Word: párrafo unido con negrita y cursiva, lista, tabla, imagen y dos secciones', async () => {
    const bytes = crearDocx(paginasDe('factura.pdf'));
    const archivos = unzipSync(bytes);
    const documento = strFromU8(archivos['word/document.xml']);
    assert.match(documento, /que el texto se une en un solo/, 'las líneas del párrafo van seguidas');
    assert.match(documento, /<w:b\/><w:bCs\/>[\s\S]*?negritas/);
    assert.match(documento, /<w:i\/><w:iCs\/>[\s\S]*?cursivas/);
    assert.match(documento, /<w:jc w:val="both"\/>/, 'el párrafo justificado sigue justificado');
    assert.equal((documento.match(/<w:tbl>/g) ?? []).length, 1);
    assert.equal((documento.match(/<w:tr>/g) ?? []).length, 6);
    assert.equal((documento.match(/<w:sectPr>/g) ?? []).length, 2, 'una sección por página');
    assert.ok(Object.keys(archivos).some((nombre) => nombre.startsWith('word/media/imagen1.')));
    // Lo lee otro programa (mammoth) sin errores y con el texto
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    assert.match(value, /Factura de prueba 2026/);
    assert.match(value, /1\.688,94 €/);
    assert.match(value, /Segunda página/);
});

test('Excel: una hoja por página, importes como números con formato y textos en su columna', () => {
    const bytes = crearXlsx(paginasDe('factura.pdf'));
    const archivos = unzipSync(bytes);
    const libro = strFromU8(archivos['xl/workbook.xml']);
    assert.equal((libro.match(/<sheet /g) ?? []).length, 2);
    const hoja = strFromU8(archivos['xl/worksheets/hoja1.xml']);
    assert.match(hoja, /<c r="A9"[^>]*t="inlineStr"><is><t xml:space="preserve">Diseño de la web<\/t>/);
    assert.match(hoja, /<c r="C9" s="3"><v>1200<\/v><\/c>/, 'precio en euros como número');
    assert.match(hoja, /<c r="B10"[^>]*><v>12<\/v><\/c>/);
    assert.match(hoja, /<c r="C12" s="4"><v>0.21<\/v><\/c>/, 'porcentaje');
});

test('sin texto (escaneado sin OCR): Excel no tiene nada que poner', () => {
    assert.equal(crearXlsx(paginasDe('escaneado.pdf')), null);
});
