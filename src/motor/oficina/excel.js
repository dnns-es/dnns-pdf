// Fecha: 2026-10-12
// Ruta: /src/motor/oficina/excel.js
// Hoja de cálculo (.xlsx) a HTML para convertirla a PDF
// Una tabla por hoja con los valores tal como se ven: números, fechas, textos, negritas, celdas unidas y anchos de columna
// Notas: no recalcula fórmulas, usa el último valor guardado. Las hojas ocultas no se incluyen.
//        Si la tabla no cabe a lo ancho, la página se pone apaisada y, si aún no cabe, se encoge.

import { hijos, hijo, buscar, textoDe } from './xml.js';
import { xmlDe, relaciones, escapar, paginaHtml, A4, MARGEN } from './comun.js';

const MAX_FILAS = 10000;
const MAX_COLUMNAS = 256;
const ANCHO_COLUMNA_DEFECTO = 8.43;
const FUENTE = 9;
const FUENTE_MINIMA = 6;
// Formatos de fecha y hora predefinidos de las hojas de cálculo
const FORMATOS_FECHA = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const SIN_FONETICA = new Set(['rPh']);
const OCULTA = { oculta: true };

const CSS = `
html, body { margin: 0; }
body { font-family: sans-serif; }
h2 { font-size: 12pt; margin: 0 0 6pt; }
table { border-collapse: collapse; table-layout: fixed; }
td { border: 0.5pt solid #b0b0b0; padding: 1.5pt 3pt; vertical-align: bottom; overflow: hidden; word-wrap: break-word; }
td.n { text-align: right; } td.b { font-weight: bold; }
p.nota { font-size: 8pt; color: #666; margin: 6pt 0 0; }
`;

// 'BC12' -> columna 54 (desde 0)
function columnaDe(ref) {
    let n = 0;
    for (const c of ref) {
        if (c < 'A' || c > 'Z') {
            break;
        }
        n = n * 26 + (c.charCodeAt(0) - 64);
    }
    return n - 1;
}

const filaDe = (ref) => parseInt(ref.replace(/^[A-Z]+/, ''), 10) - 1;

// 'A1:C3' -> [col0, fila0, col1, fila1]
function rango(ref) {
    const [a, b = a] = ref.split(':');
    return [columnaDe(a), filaDe(a), columnaDe(b), filaDe(b)];
}

// ---- Estilos: qué celdas son fechas y cuáles van en negrita

function tipoFecha(id, personalizados) {
    const codigo = personalizados.get(id);
    if (codigo === undefined) {
        if (!FORMATOS_FECHA.has(id)) {
            return null;
        }
        return (id >= 18 && id <= 21) || (id >= 45 && id <= 47) ? 'hora' : id === 22 ? 'fechaHora' : 'fecha';
    }
    // Fuera lo que va entre comillas o corchetes (textos literales, colores, condiciones)
    const limpio = codigo.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
    if (/[#0?]/.test(limpio)) {
        return null;
    }
    // La «m» pegada a horas o segundos son minutos, no meses
    const sinMinutos = limpio.replace(/(h+:)m+/gi, '$1').replace(/m+(:s+)/gi, '$1');
    const fecha = /[dmy]/i.test(sinMinutos);
    const hora = /[hs]/i.test(limpio);
    return fecha && hora ? 'fechaHora' : fecha ? 'fecha' : hora ? 'hora' : null;
}

function leerEstilos(archivos) {
    const xml = xmlDe(archivos, 'xl/styles.xml');
    const personalizados = new Map();
    for (const formato of hijos(hijo(xml, 'numFmts'), 'numFmt')) {
        personalizados.set(Number(formato.atributos.numFmtId), formato.atributos.formatCode ?? '');
    }
    const negritas = hijos(hijo(xml, 'fonts'), 'font').map((fuente) => Boolean(hijo(fuente, 'b')));
    const xfs = hijos(hijo(xml, 'cellXfs'), 'xf');
    return {
        fecha: xfs.map((xf) => tipoFecha(Number(xf.atributos.numFmtId ?? 0), personalizados)),
        negrita: xfs.map((xf) => negritas[Number(xf.atributos.fontId ?? 0)] ?? false)
    };
}

function leerCadenas(archivos) {
    const xml = xmlDe(archivos, 'xl/sharedStrings.xml');
    return hijos(xml, 'si').map((si) => textoDe(si, SIN_FONETICA));
}

// ---- Valores

function formatearNumero(valor, idioma) {
    const n = Number(valor);
    if (!Number.isFinite(n)) {
        return valor;
    }
    // Quita la cola de decimales que deja la coma flotante (0.1 + 0.2)
    return parseFloat(n.toPrecision(12)).toLocaleString(idioma, { maximumFractionDigits: 10, useGrouping: false });
}

function formatearFecha(valor, tipo, idioma, de1904) {
    const serie = Number(valor);
    if (!Number.isFinite(serie)) {
        return valor;
    }
    // Días desde 1900 (o 1904) hasta la época de JS, en UTC para que no se mueva por la zona horaria
    const fecha = new Date(Math.round((serie - (de1904 ? 24107 : 25569)) * 86400000));
    const partes = [];
    if (tipo !== 'hora') {
        partes.push(fecha.toLocaleDateString(idioma, { timeZone: 'UTC' }));
    }
    if (tipo !== 'fecha') {
        partes.push(fecha.toLocaleTimeString(idioma, { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }));
    }
    return partes.join(' ');
}

function leerCelda(celda, contexto) {
    const tipo = celda.atributos.t;
    const estilo = Number(celda.atributos.s ?? 0);
    let valor = hijo(celda, 'v') ? textoDe(hijo(celda, 'v')) : null;
    if (tipo === 'inlineStr') {
        valor = textoDe(hijo(celda, 'is'), SIN_FONETICA);
    } else if (tipo === 's') {
        valor = contexto.cadenas[Number(valor)] ?? '';
    }
    if (valor === null || valor === '') {
        return null;
    }
    let texto = valor;
    let numero = false;
    if (tipo === 'b') {
        texto = valor === '1' ? contexto.textos.verdadero : contexto.textos.falso;
    } else if (tipo === undefined || tipo === 'n') {
        numero = true;
        const fecha = contexto.estilos.fecha[estilo];
        texto = fecha ? formatearFecha(valor, fecha, contexto.idioma, contexto.de1904) : formatearNumero(valor, contexto.idioma);
    }
    return { texto, numero, negrita: contexto.estilos.negrita[estilo] ?? false };
}

// ---- Hoja

function leerHoja(xml, contexto) {
    const filas = [];
    let ultimaFila = -1;
    for (const fila of hijos(hijo(xml, 'sheetData'), 'row')) {
        const r = fila.atributos.r ? Number(fila.atributos.r) - 1 : ultimaFila + 1;
        ultimaFila = r;
        let ultimaColumna = -1;
        for (const celda of hijos(fila, 'c')) {
            const col = celda.atributos.r ? columnaDe(celda.atributos.r) : ultimaColumna + 1;
            ultimaColumna = col;
            const valor = leerCelda(celda, contexto);
            if (valor && col < MAX_COLUMNAS) {
                (filas[r] ??= [])[col] = valor;
            }
        }
    }
    for (const unida of hijos(hijo(xml, 'mergeCells'), 'mergeCell')) {
        const [c0, f0, c1, f1] = rango(unida.atributos.ref ?? 'A1');
        const principal = ((filas[f0] ??= [])[c0] ??= { texto: '', numero: false, negrita: false });
        principal.colspan = c1 - c0 + 1;
        principal.rowspan = f1 - f0 + 1;
        for (let f = f0; f <= f1; f++) {
            for (let c = c0; c <= c1; c++) {
                if (f !== f0 || c !== c0) {
                    (filas[f] ??= [])[c] = OCULTA;
                }
            }
        }
    }
    // Anchos de columna en caracteres
    const anchos = [];
    for (const col of hijos(hijo(xml, 'cols'), 'col')) {
        const ancho = Number(col.atributos.width);
        for (let c = Number(col.atributos.min) - 1; c < Number(col.atributos.max); c++) {
            anchos[c] = ancho;
        }
    }
    const defecto = Number(hijo(xml, 'sheetFormatPr')?.atributos.defaultColWidth) || ANCHO_COLUMNA_DEFECTO;
    return { filas, anchos, defecto };
}

// Caracteres -> puntos, como lo hace la hoja de cálculo (7 px por carácter más 5 de margen)
const anchoEnPuntos = (caracteres) => (caracteres * 7 + 5) * 0.75;

function tablaHtml(nombre, hoja, contexto) {
    const { filas, anchos, defecto } = hoja;
    const totalFilas = Math.min(filas.length, MAX_FILAS);
    let columnas = 0;
    for (let f = 0; f < totalFilas; f++) {
        columnas = Math.max(columnas, filas[f]?.length ?? 0);
    }
    if (!columnas) {
        return null;
    }
    const anchosPt = Array.from({ length: columnas }, (_, c) => anchoEnPuntos(anchos[c] ?? defecto));
    const total = anchosPt.reduce((a, b) => a + b, 0);
    const vertical = total <= A4[0] - MARGEN * 2;
    const [ancho, alto] = vertical ? A4 : [A4[1], A4[0]];
    const escala = Math.min(1, (ancho - MARGEN * 2) / total);
    const fuente = Math.max(FUENTE_MINIMA, FUENTE * escala);
    const filasHtml = [];
    for (let f = 0; f < totalFilas; f++) {
        const celdas = [];
        for (let c = 0; c < columnas; c++) {
            const celda = filas[f]?.[c];
            if (celda === OCULTA) {
                continue;
            }
            const clases = [celda?.numero ? 'n' : '', celda?.negrita ? 'b' : ''].filter(Boolean).join(' ');
            const extension = `${celda?.colspan > 1 ? ` colspan="${celda.colspan}"` : ''}${celda?.rowspan > 1 ? ` rowspan="${celda.rowspan}"` : ''}`;
            celdas.push(`<td style="width:${(anchosPt[c] * escala).toFixed(1)}pt"${clases ? ` class="${clases}"` : ''}${extension}>${celda ? escapar(celda.texto) : ''}</td>`);
        }
        filasHtml.push(`<tr>${celdas.join('')}</tr>`);
    }
    const nota = filas.length > MAX_FILAS ? `<p class="nota">${escapar(contexto.textos.filasOmitidas.replace('{total}', filas.length - MAX_FILAS))}</p>` : '';
    const css = `${CSS} body { padding: ${MARGEN}pt; font-size: ${fuente.toFixed(1)}pt; }`;
    return { html: paginaHtml(css, `<h2>${escapar(nombre)}</h2><table>${filasHtml.join('')}</table>${nota}`), ancho, alto, em: fuente };
}

export function excelAHtml(archivos, { idioma = 'es', textos }) {
    const libro = xmlDe(archivos, 'xl/workbook.xml');
    const rels = relaciones(archivos, 'xl/workbook.xml');
    const contexto = {
        idioma,
        textos,
        cadenas: leerCadenas(archivos),
        estilos: leerEstilos(archivos),
        de1904: hijo(libro, 'workbookPr')?.atributos.date1904 === '1'
    };
    const paginas = [];
    for (const hoja of hijos(hijo(libro, 'sheets'), 'sheet')) {
        if (hoja.atributos.state === 'hidden' || hoja.atributos.state === 'veryHidden') {
            continue;
        }
        const ruta = rels.get(hoja.atributos['r:id'] ?? Object.values(hoja.atributos).find((v) => rels.has(v)));
        const xml = ruta && xmlDe(archivos, ruta);
        if (!xml) {
            continue;
        }
        const pagina = tablaHtml(hoja.atributos.name ?? '', leerHoja(xml, contexto), contexto);
        if (pagina) {
            paginas.push(pagina);
        }
    }
    if (!paginas.length) {
        paginas.push({ html: paginaHtml(CSS, `<p>${escapar(textos.hojaVacia)}</p>`), ancho: A4[0], alto: A4[1], em: 11 });
    }
    return paginas;
}

export { columnaDe, tipoFecha };
