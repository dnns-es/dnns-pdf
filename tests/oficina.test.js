// Fecha: 2026-10-12
// Ruta: /tests/oficina.test.js
// Pruebas de la fase 5 (Oficina): .docx, .xlsx y .pptx convertidos a PDF, lector XML y ayudas de hojas
// Uso: npm test
// Notas: texto.docx, hoja.xlsx y presentacion.pptx están hechos con python-docx, openpyxl y python-pptx;
//        hoja-compleja.xlsx está escrito a mano (cadenas compartidas, celdas unidas, fechas, hoja oculta).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as mupdf from 'mupdf';
import { zipSync } from 'fflate';
import { convertirOficina } from '../src/motor/oficina/oficina.js';
import { leerXml, hijos, buscar, textoDe } from '../src/motor/oficina/xml.js';
import { columnaDe, tipoFecha } from '../src/motor/oficina/excel.js';
import { resolverRuta } from '../src/motor/oficina/comun.js';

const leer = (nombre) => readFileSync(new URL(`./pdfs/${nombre}`, import.meta.url));
const TEXTOS = { hojaVacia: 'Hoja vacía', filasOmitidas: '… y {total} filas más', verdadero: 'VERDADERO', falso: 'FALSO' };

async function convertir(nombre) {
    const respuesta = await convertirOficina({ buffer: new Uint8Array(leer(nombre)).buffer, idioma: 'es', textos: TEXTOS });
    const doc = mupdf.Document.openDocument(respuesta.bytes, 'application/pdf');
    const texto = (n = 0) => doc.loadPage(n).toStructuredText().asText().replace(/\s+/g, ' ').trim();
    return { ...respuesta, doc, texto };
}

test('el lector XML entiende entidades, atributos con >, CDATA, autocierre y prefijos', () => {
    const raiz = leerXml('<?xml version="1.0"?><!-- c --><x:a xmlns:x="u"><b n="1 &gt; 0" m=\'q\'/><x:t>Tom&amp;Jerry &#241; &#xF1;</x:t><c><![CDATA[<raw>]]></c></x:a>');
    assert.equal(raiz.local, 'a');
    const b = hijos(raiz, 'b')[0];
    assert.equal(b.atributos.n, '1 > 0');
    assert.equal(b.atributos.m, 'q');
    assert.equal(textoDe(hijos(raiz, 't')[0]), 'Tom&Jerry ñ ñ');
    assert.equal(textoDe(buscar(raiz, 'c')[0]), '<raw>');
});

test('ayudas de hojas: letras de columna, formatos de fecha y rutas relativas', () => {
    assert.equal(columnaDe('A1'), 0);
    assert.equal(columnaDe('Z9'), 25);
    assert.equal(columnaDe('AA1'), 26);
    assert.equal(columnaDe('BC12'), 54);
    const propios = new Map([[164, '0.00'], [165, 'dd/mm/yyyy hh:mm'], [166, '[$-C0A]d" de "mmmm" de "yyyy;@']]);
    assert.equal(tipoFecha(0, propios), null);
    assert.equal(tipoFecha(14, propios), 'fecha');
    assert.equal(tipoFecha(22, propios), 'fechaHora');
    assert.equal(tipoFecha(21, propios), 'hora');
    assert.equal(tipoFecha(164, propios), null);
    assert.equal(tipoFecha(165, propios), 'fechaHora');
    assert.equal(tipoFecha(166, propios), 'fecha');
    assert.equal(resolverRuta('ppt/slides/', '../media/x.png'), 'ppt/media/x.png');
    assert.equal(resolverRuta('xl/', '/xl/worksheets/sheet1.xml'), 'xl/worksheets/sheet1.xml');
});

test('un .docx se convierte en PDF con su texto, su tabla y su tamaño de página', async () => {
    const { tipo, doc, texto } = await convertir('texto.docx');
    assert.equal(tipo, 'word');
    assert.ok(doc.countPages() >= 1);
    const contenido = texto(0);
    for (const esperado of ['Presupuesto de prueba', 'negrita', 'cursiva', 'áéíóú ñ', 'Instalación', '120 €']) {
        assert.ok(contenido.includes(esperado), `falta «${esperado}»`);
    }
    // python-docx usa carta (8,5 × 11 pulgadas)
    const [, , ancho, alto] = doc.loadPage(0).getBounds();
    assert.equal(Math.round(ancho), 612);
    assert.equal(Math.round(alto), 792);
});

test('un .xlsx da una página por hoja con los valores en el idioma pedido', async () => {
    const { tipo, doc, texto } = await convertir('hoja.xlsx');
    assert.equal(tipo, 'excel');
    assert.equal(doc.countPages(), 2);
    const primera = texto(0);
    for (const esperado of ['Gastos', 'Mes', 'Luz', 'Enero', '52,3', '17,5', 'Total']) {
        assert.ok(primera.includes(esperado), `falta «${esperado}»`);
    }
    assert.ok(texto(1).includes('Hoja dos'));
});

test('hoja compleja: cadenas compartidas, fechas, booleanos, fórmulas y hoja oculta', async () => {
    const { doc, texto } = await convertir('hoja-compleja.xlsx');
    assert.equal(doc.countPages(), 1, 'la hoja oculta no sale');
    const contenido = texto(0);
    for (const esperado of ['Factura > 2026', 'Concepto', 'Instalación', 'VERDADERO', '31/12/2025', 'Total & IVA', '1234,5', 'Texto de fórmula', '0,3']) {
        assert.ok(contenido.includes(esperado), `falta «${esperado}» en: ${contenido}`);
    }
    // B1 queda tapada por la unión A1:B1: solo se ve la celda principal, como en la hoja de cálculo
    assert.ok(!contenido.includes('Pagado'));
    assert.ok(!contenido.includes('no debería salir'));
});

test('un .pptx da una página por diapositiva, del tamaño de la diapositiva', async () => {
    const { tipo, doc, texto } = await convertir('presentacion.pptx');
    assert.equal(tipo, 'presentacion');
    assert.equal(doc.countPages(), 2);
    assert.ok(texto(0).includes('Diapositiva uno'));
    assert.ok(texto(0).includes('Punto B con acento: canción'));
    assert.ok(texto(1).includes('Segunda'));
    const [, , ancho, alto] = doc.loadPage(0).getBounds();
    assert.equal(Math.round(ancho), 720);
    assert.equal(Math.round(alto), 540);
});

test('un ZIP que no es de Office da error TIPO', async () => {
    const zip = zipSync({ 'hola.txt': new TextEncoder().encode('hola') });
    await assert.rejects(convertirOficina({ buffer: zip.buffer, idioma: 'es', textos: TEXTOS }), /TIPO/);
});
