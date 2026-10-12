// Fecha: 2026-10-12
// Ruta: /src/motor/convertir/excel.js
// PDF -> Excel (.xlsx) a partir de lo que da extraer.js, sin servidor
// Una hoja por página con texto. Cada fila de texto es una fila de la hoja y las columnas salen de cómo está
// alineado el texto (los huecos que ninguna fila con varias celdas pisa). Las cantidades («1.234,56 €»,
// «21 %») pasan a ser números con su formato, para poder sumar; el resto queda como texto.
// Notas: sin MuPDF (corre en la interfaz). El .xlsx se escribe a mano (Office Open XML) y se comprime con fflate.

import { zipSync, strToU8 } from 'fflate';
import { trozosDePagina, agruparFilas, columnasDe, columnaDe, leerNumero } from './disposicion.js';

const PUNTOS_POR_CARACTER = 5.5;
const ANCHO_MINIMO = 6;
const ANCHO_MAXIMO = 80;

const esc = (texto) => String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

// A, B, ..., Z, AA...
function letraColumna(indice) {
    let n = indice + 1;
    let letras = '';
    while (n > 0) {
        const resto = (n - 1) % 26;
        letras = String.fromCharCode(65 + resto) + letras;
        n = Math.floor((n - 1) / 26);
    }
    return letras;
}

// Estilos (en styles.xml): 0 normal, 1 negrita, 2 número con decimales, 3 moneda en euros, 4 porcentaje,
// 5 número entero, y sus versiones en negrita (+5)
function estiloDe(numero, negrita) {
    let base = 0;
    if (numero) {
        if (numero.porcentaje) {
            base = 4;
        } else if (numero.moneda) {
            base = 3;
        } else {
            base = numero.decimales ? 2 : 5;
        }
    }
    if (!negrita) {
        return base;
    }
    return base === 0 ? 1 : base + 5;
}

function celda(referencia, trozos) {
    const texto = trozos.map((t) => t.texto).join(' ');
    const negrita = trozos.every((t) => t.tramos.every((tramo) => tramo.negrita));
    const numero = leerNumero(texto);
    const estilo = estiloDe(numero, negrita);
    const s = estilo ? ` s="${estilo}"` : '';
    if (numero) {
        return `<c r="${referencia}"${s}><v>${numero.valor}</v></c>`;
    }
    return `<c r="${referencia}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(texto)}</t></is></c>`;
}

function hoja(pagina) {
    const filas = agruparFilas(trozosDePagina(pagina));
    if (!filas.length) {
        return null;
    }
    let columnas = columnasDe(filas);
    if (!columnas.length) {
        // Solo texto corrido: todo en la columna A
        columnas = [[0, pagina.ancho]];
    }
    const anchos = columnas.map(() => ANCHO_MINIMO);
    const xmlFilas = filas.map((fila, f) => {
        const porColumna = columnas.map(() => []);
        for (const trozo of fila.trozos) {
            // Una fila de un solo trozo (título, párrafo) empieza en la columna donde empieza su texto
            const indice = fila.trozos.length === 1 ? columnaDe({ x0: trozo.x0, x1: trozo.x0 }, columnas) : columnaDe(trozo, columnas);
            porColumna[indice].push(trozo);
        }
        const celdas = porColumna.map((trozos, c) => {
            if (!trozos.length) {
                return '';
            }
            if (fila.trozos.length > 1) {
                const largo = trozos.reduce((suma, t) => suma + t.texto.length + 1, 0);
                anchos[c] = Math.max(anchos[c], Math.min(ANCHO_MAXIMO, largo + 2));
            }
            return celda(`${letraColumna(c)}${f + 1}`, trozos);
        }).join('');
        return `<row r="${f + 1}">${celdas}</row>`;
    });
    // Columnas sin filas de varias celdas: el ancho por su tamaño en la página
    columnas.forEach(([x0, x1], c) => {
        if (anchos[c] === ANCHO_MINIMO) {
            anchos[c] = Math.max(ANCHO_MINIMO, Math.min(ANCHO_MAXIMO, Math.round((x1 - x0) / PUNTOS_POR_CARACTER)));
        }
    });
    const cols = anchos.map((ancho, c) => `<col min="${c + 1}" max="${c + 1}" width="${ancho}" customWidth="1"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${xmlFilas.join('')}</sheetData></worksheet>`;
}

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;€&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="11"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="10" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

// paginas: lo que devuelve extraerPagina() de cada una; nombreHoja(n): nombre de la hoja de la página n
// (desde 1). Devuelve los bytes del .xlsx, o null si ninguna página tiene texto
export function crearXlsx(paginas, nombreHoja = (n) => `Página ${n}`) {
    const hojas = [];
    paginas.forEach((pagina, i) => {
        const xml = hoja(pagina);
        if (xml) {
            hojas.push({ nombre: nombreHoja(i + 1).slice(0, 31).replace(/[\\/?*[\]:]/g, ' '), xml });
        }
    });
    if (!hojas.length) {
        return null;
    }
    const cabecera = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const archivos = {
        '[Content_Types].xml': strToU8(`${cabecera}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/hoja${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
        '_rels/.rels': strToU8(`${cabecera}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
        'xl/workbook.xml': strToU8(`${cabecera}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map((h, i) => `<sheet name="${esc(h.nombre)}" sheetId="${i + 1}" r:id="rIdHoja${i + 1}"/>`).join('')}</sheets></workbook>`),
        'xl/_rels/workbook.xml.rels': strToU8(`${cabecera}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rIdHoja${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/hoja${i + 1}.xml"/>`).join('')}<Relationship Id="rIdEstilos" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
        'xl/styles.xml': strToU8(ESTILOS)
    };
    hojas.forEach((h, i) => {
        archivos[`xl/worksheets/hoja${i + 1}.xml`] = strToU8(h.xml);
    });
    return zipSync(archivos, { level: 6 });
}
