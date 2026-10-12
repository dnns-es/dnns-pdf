// Fecha: 2026-10-12
// Ruta: /src/motor/oficina/presentacion.js
// Presentación (.pptx) a HTML para convertirla a PDF
// Una página por diapositiva, del mismo tamaño que la diapositiva: título, texto con viñetas, imágenes y tablas
// Notas: el HTML de MuPDF no coloca elementos en posiciones absolutas, así que el contenido va en orden de
//        lectura (de arriba abajo) y no en su sitio exacto. Fondos, formas y gráficos no se pintan.

import { hijos, hijo, buscar, textoDe } from './xml.js';
import { xmlDe, relaciones, imagenDataUri, escapar, paginaHtml } from './comun.js';

// Unidades EMU de Office: 12700 por punto
const EMU = 12700;
const MARGEN = 30;
const SANGRIA_NIVEL = 18;
const TITULOS = new Set(['title', 'ctrTitle']);

const CSS = `
html, body { margin: 0; }
body { font-family: sans-serif; font-size: 16pt; line-height: 1.3; }
h1 { font-size: 30pt; margin: 0 0 14pt; }
.subtitulo { font-size: 18pt; color: #444; }
p { margin: 0 0 6pt; }
.vineta { text-indent: -12pt; padding-left: 12pt; }
table { border-collapse: collapse; margin: 8pt 0; font-size: 12pt; }
td { border: 0.5pt solid #888; padding: 3pt 6pt; vertical-align: top; }
.imagen { margin: 6pt 0; }
`;

function estiloRun(rPr) {
    if (!rPr) {
        return '';
    }
    const estilos = [];
    if (rPr.atributos.b === '1') {
        estilos.push('font-weight:bold');
    }
    if (rPr.atributos.i === '1') {
        estilos.push('font-style:italic');
    }
    if (rPr.atributos.u && rPr.atributos.u !== 'none') {
        estilos.push('text-decoration:underline');
    }
    if (rPr.atributos.sz) {
        estilos.push(`font-size:${Number(rPr.atributos.sz) / 100}pt`);
    }
    const color = hijo(hijo(rPr, 'solidFill'), 'srgbClr')?.atributos.val;
    if (/^[0-9a-f]{6}$/i.test(color ?? '')) {
        estilos.push(`color:#${color}`);
    }
    return estilos.join(';');
}

function parrafoHtml(p, { vinetas }) {
    const pPr = hijo(p, 'pPr');
    const nivel = Number(pPr?.atributos.lvl ?? 0);
    const explicita = Boolean(hijo(pPr, 'buChar') || hijo(pPr, 'buAutoNum'));
    const vineta = explicita || (vinetas && !hijo(pPr, 'buNone'));
    const trozos = [];
    for (const h of p.hijos) {
        if (h.local === 'r' || h.local === 'fld') {
            const texto = escapar(textoDe(hijo(h, 't')));
            const estilo = estiloRun(hijo(h, 'rPr'));
            trozos.push(estilo ? `<span style="${estilo}">${texto}</span>` : texto);
        } else if (h.local === 'br') {
            trozos.push('<br>');
        }
    }
    const contenido = trozos.join('');
    if (!contenido.replace(/<br>/g, '').trim()) {
        return '';
    }
    const estilos = [];
    const alineacion = pPr?.atributos.algn;
    if (alineacion === 'ctr') {
        estilos.push('text-align:center');
    } else if (alineacion === 'r') {
        estilos.push('text-align:right');
    }
    if (vineta && nivel) {
        estilos.push(`margin-left:${nivel * SANGRIA_NIVEL}pt`);
    }
    const estilo = estilos.length ? ` style="${estilos.join(';')}"` : '';
    return vineta ? `<p class="vineta"${estilo}>• ${contenido}</p>` : `<p${estilo}>${contenido}</p>`;
}

function formaHtml(sp) {
    const txBody = hijo(sp, 'txBody');
    if (!txBody) {
        return '';
    }
    const marcador = buscar(hijo(sp, 'nvSpPr'), 'ph')[0];
    const tipo = marcador ? marcador.atributos.type ?? 'body' : null;
    const esTitulo = TITULOS.has(tipo);
    const esSubtitulo = tipo === 'subTitle';
    const parrafos = hijos(txBody, 'p').map((p) => parrafoHtml(p, { vinetas: tipo && !esTitulo && !esSubtitulo })).filter(Boolean);
    if (!parrafos.length) {
        return '';
    }
    if (esTitulo) {
        return `<h1>${parrafos.map((p) => p.replace(/^<p[^>]*>|<\/p>$/g, '')).join('<br>')}</h1>`;
    }
    return `<div${esSubtitulo ? ' class="subtitulo"' : ''}>${parrafos.join('')}</div>`;
}

function imagenHtml(pic, contexto) {
    const blip = buscar(hijo(pic, 'blipFill'), 'blip')[0];
    const ruta = contexto.rels.get(blip?.atributos['r:embed']);
    const datos = imagenDataUri(contexto.archivos, ruta);
    if (!datos) {
        return '';
    }
    const ext = buscar(hijo(pic, 'spPr'), 'ext')[0];
    const anchoPt = Math.min(contexto.anchoUtil, Number(ext?.atributos.cx ?? 0) / EMU || contexto.anchoUtil);
    return `<p class="imagen"><img src="${datos}" style="width:${anchoPt.toFixed(1)}pt"></p>`;
}

function tablaHtml(marco) {
    const tbl = buscar(marco, 'tbl')[0];
    if (!tbl) {
        return '';
    }
    const anchos = hijos(hijo(tbl, 'tblGrid'), 'gridCol').map((col) => Number(col.atributos.w) / EMU);
    const filas = hijos(tbl, 'tr').map((tr) => {
        const celdas = [];
        hijos(tr, 'tc').forEach((tc, c) => {
            // Las celdas tapadas por una unión no se pintan
            if (tc.atributos.hMerge === '1' || tc.atributos.vMerge === '1') {
                return;
            }
            const texto = hijos(hijo(tc, 'txBody'), 'p').map((p) => parrafoHtml(p, { vinetas: false })).join('');
            const span = `${tc.atributos.gridSpan > 1 ? ` colspan="${tc.atributos.gridSpan}"` : ''}${tc.atributos.rowSpan > 1 ? ` rowspan="${tc.atributos.rowSpan}"` : ''}`;
            const ancho = anchos[c] ? ` style="width:${anchos[c].toFixed(1)}pt"` : '';
            celdas.push(`<td${ancho}${span}>${texto}</td>`);
        });
        return `<tr>${celdas.join('')}</tr>`;
    });
    return `<table>${filas.join('')}</table>`;
}

// Posición vertical para ordenar en lectura; los marcadores sin posición heredan del diseño: título arriba
function ordenDe(forma) {
    const off = buscar(hijo(forma, 'spPr') ?? hijo(forma, 'xfrm') ? forma : forma, 'off')[0];
    if (off?.atributos.y !== undefined) {
        return Number(off.atributos.y) / EMU;
    }
    const tipo = buscar(forma, 'ph')[0]?.atributos.type;
    return TITULOS.has(tipo) ? -2 : tipo === 'subTitle' ? -1 : 0;
}

function recogerFormas(nodo, salida) {
    for (const h of nodo?.hijos ?? []) {
        if (h.local === 'grpSp') {
            recogerFormas(h, salida);
        } else if (h.local === 'sp' || h.local === 'pic' || h.local === 'graphicFrame') {
            salida.push(h);
        }
    }
    return salida;
}

function diapositivaHtml(xml, contexto) {
    const formas = recogerFormas(buscar(xml, 'spTree')[0], []);
    const ordenadas = formas.map((forma, i) => ({ forma, i, y: ordenDe(forma) })).sort((a, b) => a.y - b.y || a.i - b.i);
    return ordenadas.map(({ forma }) => {
        if (forma.local === 'sp') {
            return formaHtml(forma);
        }
        if (forma.local === 'pic') {
            return imagenHtml(forma, contexto);
        }
        return tablaHtml(forma);
    }).join('');
}

export function presentacionAHtml(archivos) {
    const presentacion = xmlDe(archivos, 'ppt/presentation.xml');
    const tamano = hijo(presentacion, 'sldSz');
    const ancho = Number(tamano?.atributos.cx ?? 9144000) / EMU;
    const alto = Number(tamano?.atributos.cy ?? 6858000) / EMU;
    const rels = relaciones(archivos, 'ppt/presentation.xml');
    const css = `${CSS} body { padding: ${MARGEN}pt ${MARGEN * 1.2}pt; }`;
    const paginas = [];
    for (const id of hijos(hijo(presentacion, 'sldIdLst'), 'sldId')) {
        const ruta = rels.get(id.atributos['r:id']);
        const xml = ruta && xmlDe(archivos, ruta);
        if (!xml) {
            continue;
        }
        const contexto = { archivos, rels: relaciones(archivos, ruta), anchoUtil: ancho - MARGEN * 2.4 };
        paginas.push({ html: paginaHtml(css, diapositivaHtml(xml, contexto) || '&nbsp;'), ancho, alto, em: 16 });
    }
    return paginas;
}
