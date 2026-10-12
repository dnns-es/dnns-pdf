// Fecha: 2026-10-12
// Ruta: /tests/oficina.test.js
// Pruebas de la fase 5 (Oficina): .docx, .xlsx, .pptx, .rtf, .txt y código convertidos a PDF, lector XML y ayudas
// Uso: npm test
// Notas: texto.docx, hoja.xlsx y presentacion.pptx están hechos con python-docx, openpyxl y python-pptx;
//        hoja-compleja.xlsx y texto.rtf están escritos a mano (cadenas compartidas, celdas unidas, fechas,
//        hoja oculta; en el RTF: fuentes, colores, viñetas, tabla, imagen, salto de página y metadatos ocultos).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as mupdf from 'mupdf';
import { zipSync } from 'fflate';
import { convertirOficina, detectarFormato } from '../src/motor/oficina/oficina.js';
import { leerXml, hijos, buscar, textoDe } from '../src/motor/oficina/xml.js';
import { columnaDe, tipoFecha } from '../src/motor/oficina/excel.js';
import { resolverRuta } from '../src/motor/oficina/comun.js';
import { pareceTexto, decodificarTexto, esCodigo } from '../src/motor/oficina/texto.js';

const leer = (nombre) => readFileSync(new URL(`./pdfs/${nombre}`, import.meta.url));
const TEXTOS = { hojaVacia: 'Hoja vacía', filasOmitidas: '… y {total} filas más', verdadero: 'VERDADERO', falso: 'FALSO' };

async function convertir(nombre) {
    const respuesta = await convertirOficina({ buffer: new Uint8Array(leer(nombre)).buffer, nombre, idioma: 'es', textos: TEXTOS });
    const doc = mupdf.Document.openDocument(respuesta.bytes, 'application/pdf');
    const texto = (n = 0) => doc.loadPage(n).toStructuredText().asText().replace(/\s+/g, ' ').trim();
    // Nombres de las fuentes usadas en la página (MuPDF pone las suyas: Nimbus Sans, Nimbus Roman, Nimbus Mono...)
    const fuentes = (n = 0) => {
        const nombres = new Set();
        doc.loadPage(n).toStructuredText().walk({ onChar: (c, origen, fuente) => nombres.add(fuente.getName()) });
        return nombres;
    };
    return { ...respuesta, doc, texto, fuentes };
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

test('un ZIP que no es de Office da error TIPO, igual que un archivo binario cualquiera', async () => {
    const zip = zipSync({ 'hola.txt': new TextEncoder().encode('hola') });
    await assert.rejects(convertirOficina({ buffer: zip.buffer, idioma: 'es', textos: TEXTOS }), /TIPO/);
    const binario = Uint8Array.from({ length: 512 }, (_, i) => (i * 37) % 256);
    await assert.rejects(convertirOficina({ buffer: binario.buffer, idioma: 'es', textos: TEXTOS }), /TIPO/);
});

test('un .rtf conserva texto, acentos, viñetas, fuentes, tabla, imagen, salto y tamaño de página; oculta lo que no se ve', async () => {
    const { tipo, doc, texto, fuentes } = await convertir('texto.rtf');
    assert.equal(tipo, 'rtf');
    assert.equal(doc.countPages(), 2);
    const primera = texto(0);
    for (const esperado of ['Título centrado', 'negrita, cursiva, subrayado y tachado', 'áéíóú ñ € fin', '• Primer punto de la lista',
        '• Segundo punto', 'Rojo en Times y código en Courier', 'Celda A1 Celda B1', 'Celda A2 Celda B2', 'Después de la tabla dnns.es x2']) {
        assert.ok(primera.includes(esperado), `falta «${esperado}» en: ${primera}`);
    }
    for (const oculto of ['Secreto', 'Autor oculto', 'Cabecera', 'HYPERLINK', 'Normal;', 'Editor de prueba', 'Arial']) {
        assert.ok(!primera.includes(oculto), `sobra «${oculto}»`);
    }
    assert.ok(texto(1).includes('Segunda página a la derecha'));
    const nombres = [...fuentes(0)].join(' ');
    assert.match(nombres, /Roman|Serif/i, `falta la fuente serif en: ${nombres}`);
    assert.match(nombres, /Mono/i, `falta la fuente de ancho fijo en: ${nombres}`);
    // La imagen PNG incrustada se pinta
    const { blocks } = JSON.parse(doc.loadPage(0).toStructuredText('preserve-images').asJSON());
    assert.ok(blocks.some((b) => b.type === 'image'), 'falta la imagen');
    // \paperw11906\paperh16838 es A4
    const [, , ancho, alto] = doc.loadPage(0).getBounds();
    assert.equal(Math.round(ancho), 595);
    assert.equal(Math.round(alto), 842);
});

test('un .txt se abre con su codificación (UTF-8 con BOM o Windows-1252), con saltos de página; el código, con ancho fijo', async () => {
    const notas = await convertir('notas.txt');
    assert.equal(notas.tipo, 'texto');
    assert.equal(notas.doc.countPages(), 2, 'el carácter de salto de página empieza página');
    const primera = notas.texto(0);
    assert.ok(primera.includes('Línea con acentos: áéíóú ñ €'), primera);
    assert.ok(!primera.includes('﻿'), 'el BOM no se pinta');
    assert.ok(primera.includes('Tabulado dos espacios'));
    assert.ok(notas.texto(1).includes('Segunda página del texto'));
    assert.doesNotMatch([...notas.fuentes(0)].join(' '), /Mono/i);

    const antiguo = await convertir('antiguo.txt');
    assert.ok(antiguo.texto(0).includes('Mañana será otro día'), antiguo.texto(0));

    const codigo = await convertir('script.py');
    assert.equal(codigo.tipo, 'texto');
    assert.ok(codigo.texto(0).includes('def hola(): print("Hola, mundo") hola()'), codigo.texto(0));
    assert.match([...codigo.fuentes(0)].join(' '), /Mono/i);
});

test('ayudas de texto: qué parece texto, codificaciones y qué es código', () => {
    const utf8 = new TextEncoder().encode('hola ñ');
    assert.equal(detectarFormato(utf8), 'texto');
    assert.equal(detectarFormato(new TextEncoder().encode('{\\rtf1 hola}')), 'rtf');
    assert.equal(detectarFormato(Uint8Array.from([0x50, 0x4b, 3, 4, 0, 0])), 'zip');
    assert.equal(detectarFormato(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0, 1, 2])), null, 'un PDF no es texto');
    assert.equal(pareceTexto(new Uint8Array(0)), false);
    assert.equal(pareceTexto(Uint8Array.from([0xff, 0xfe, 0x68, 0x00])), true, 'UTF-16 con BOM');
    assert.equal(decodificarTexto(Uint8Array.from([0xef, 0xbb, 0xbf, 0xc3, 0xb1])), 'ñ');
    assert.equal(decodificarTexto(Uint8Array.from([0xf1, 0x61])), 'ña');
    assert.equal(decodificarTexto(Uint8Array.from([0xff, 0xfe, 0xf1, 0x00])), 'ñ');
    assert.equal(esCodigo('script.py'), true);
    assert.equal(esCodigo('estilos.css'), true);
    assert.equal(esCodigo('notas.txt'), false);
    assert.equal(esCodigo('documento.pdf'), false);
});
