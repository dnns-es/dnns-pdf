// Fecha: 2026-10-12
// Ruta: /src/motor/convertir/word.js
// PDF -> Word (.docx) a partir de lo que da extraer.js, sin servidor
// Párrafos con su letra, tamaño, negrita, cursiva, color, alineación, sangría y separación; listas como
// párrafos sueltos; tablas sencillas (por la alineación de las columnas); imágenes en su sitio; una sección
// por página con su tamaño. Las líneas de un párrafo se unen para que el texto se pueda editar seguido.
// Notas: sin MuPDF (corre en la interfaz). El .docx se escribe a mano (Office Open XML) y se comprime con fflate.

import { zipSync, strToU8 } from 'fflate';
import { trozosDePagina, agruparFilas, buscarTablas, columnaDe, margenes, leerNumero } from './disposicion.js';

const TWIP = 20;
const EMU = 12700;
const ESPACIO_MAXIMO = 1440;
const LISTA = /^([•·▪‣◦○■□➢►\-–—*]|\(?\d{1,3}[.)]|[a-zA-Z][.)])\s/;

const esc = (texto) => String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // Caracteres de control que XML no admite
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const tw = (puntos) => Math.max(0, Math.round(puntos * TWIP));

function propiedadesTramo(tramo) {
    const partes = [`<w:rFonts w:ascii="${esc(tramo.letra)}" w:hAnsi="${esc(tramo.letra)}" w:cs="${esc(tramo.letra)}"/>`];
    if (tramo.negrita) {
        partes.push('<w:b/><w:bCs/>');
    }
    if (tramo.cursiva) {
        partes.push('<w:i/><w:iCs/>');
    }
    if (tramo.color && tramo.color !== '000000') {
        partes.push(`<w:color w:val="${tramo.color}"/>`);
    }
    const medios = Math.max(2, Math.round(tramo.tamano * 2));
    partes.push(`<w:sz w:val="${medios}"/><w:szCs w:val="${medios}"/>`);
    return `<w:rPr>${partes.join('')}</w:rPr>`;
}

function run(tramo) {
    return `<w:r>${propiedadesTramo(tramo)}<w:t xml:space="preserve">${esc(tramo.texto)}</w:t></w:r>`;
}

const saltoDeLinea = (tramo) => `<w:r>${propiedadesTramo(tramo)}<w:br/></w:r>`;

// Línea terminada antes de tiempo (dirección, verso, título): se respeta el salto
function terminaAntes(linea, siguiente, anchoBloque, x1Bloque) {
    const texto = siguiente.trozos[0].texto;
    const primera = texto.split(/\s/)[0];
    const anchoPrimera = (siguiente.trozos[0].x1 - siguiente.trozos[0].x0) * (primera.length / Math.max(1, texto.length));
    const ultimoX1 = linea.trozos.at(-1).x1;
    return ultimoX1 + anchoPrimera < x1Bloque - anchoBloque * 0.05;
}

// Alineación de un párrafo según dónde caen sus líneas en la página
function alineacion(lineas, pagina, margen) {
    const x0s = lineas.map((l) => l.trozos[0].x0);
    const x1s = lineas.map((l) => l.trozos.at(-1).x1);
    const centroPagina = (margen.izquierda + pagina.ancho - margen.derecha) / 2;
    const centrada = lineas.every((l, i) => Math.abs((x0s[i] + x1s[i]) / 2 - centroPagina) < 4) && Math.min(...x0s) > margen.izquierda + 15;
    if (centrada) {
        return 'center';
    }
    const derechaMax = Math.max(...x1s);
    if (lineas.length > 1 && x1s.every((x) => Math.abs(x - derechaMax) < 2) && x0s.some((x) => x - Math.min(...x0s) > 20)) {
        return 'right';
    }
    if (lineas.length > 2 && x1s.slice(0, -1).every((x) => Math.abs(x - derechaMax) < 2.5)) {
        return 'both';
    }
    return 'left';
}

function parrafo(lineas, contexto) {
    const { pagina, margen } = contexto;
    const tramos = [];
    const x0 = Math.min(...lineas.map((l) => l.trozos[0].x0));
    const x1 = Math.max(...lineas.map((l) => l.trozos.at(-1).x1));
    lineas.forEach((linea, i) => {
        const deLinea = linea.trozos.flatMap((trozo, t) => (t === 0 ? trozo.tramos : [{ ...trozo.tramos[0], texto: '\t' }, ...trozo.tramos]));
        const siguiente = lineas[i + 1];
        if (siguiente) {
            const ultimo = deLinea.at(-1);
            if (terminaAntes(linea, siguiente, x1 - x0, x1)) {
                deLinea.push({ ...ultimo, salto: true });
            } else if (/[A-Za-zÀ-ÿ]-$/.test(ultimo.texto) && /^[a-zà-ÿ]/.test(siguiente.trozos[0].texto)) {
                // Palabra partida al final de la línea: se une sin el guion
                deLinea[deLinea.length - 1] = { ...ultimo, texto: ultimo.texto.slice(0, -1) };
            } else {
                deLinea[deLinea.length - 1] = { ...ultimo, texto: `${ultimo.texto} ` };
            }
        }
        tramos.push(...deLinea);
    });
    const alinear = alineacion(lineas, pagina, margen);
    const tamanoMayor = Math.max(...tramos.map((t) => t.tamano));
    const interlineado = lineas.length > 1
        ? Math.max((lineas.at(-1).base - lineas[0].base) / (lineas.length - 1), tamanoMayor * 1.05)
        : tamanoMayor * 1.17;
    const props = [`<w:spacing w:before="${tw(contexto.antes)}" w:after="0" w:line="${tw(interlineado)}" w:lineRule="exact"/>`];
    if (alinear === 'left' || alinear === 'both') {
        const sangria = x0 - margen.izquierda;
        const primera = lineas[0].trozos[0].x0 - x0;
        if (sangria > 3 || primera > 3) {
            props.push(`<w:ind w:left="${tw(sangria)}"${primera > 3 ? ` w:firstLine="${tw(primera)}"` : ''}/>`);
        }
    }
    props.push(`<w:jc w:val="${alinear}"/>`);
    // Tramos seguidos con el mismo formato van en uno solo (cada línea traía el suyo)
    const unidos = [];
    for (const tramo of tramos) {
        const previo = unidos.at(-1);
        if (previo && !previo.salto && !tramo.salto && previo.letra === tramo.letra && previo.tamano === tramo.tamano
            && previo.negrita === tramo.negrita && previo.cursiva === tramo.cursiva && previo.color === tramo.color) {
            unidos[unidos.length - 1] = { ...previo, texto: previo.texto + tramo.texto };
        } else {
            unidos.push(tramo);
        }
    }
    const cuerpo = unidos.map((t) => (t.salto ? saltoDeLinea(t) : run(t))).join('');
    return { xml: `<w:p><w:pPr>${props.join('')}</w:pPr>${cuerpo}</w:p>`, fondo: Math.max(...lineas.map((l) => l.rect[3])) };
}

// Partes de un bloque en párrafos: cada elemento de lista empieza uno nuevo
function partirEnParrafos(lineas) {
    const grupos = [];
    for (const linea of lineas) {
        if (!grupos.length || LISTA.test(linea.trozos[0].texto)) {
            grupos.push([linea]);
        } else {
            grupos.at(-1).push(linea);
        }
    }
    return grupos;
}

function celda(trozos, ancho) {
    const numero = trozos.length === 1 && leerNumero(trozos[0].texto);
    const tramos = trozos.flatMap((trozo, i) => (i ? [{ ...trozo.tramos[0], texto: ' ' }, ...trozo.tramos] : trozo.tramos));
    const contenido = tramos.length ? tramos.map(run).join('') : '';
    return `<w:tc><w:tcPr><w:tcW w:w="${tw(ancho)}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${numero ? '<w:jc w:val="right"/>' : ''}</w:pPr>${contenido}</w:p></w:tc>`;
}

function tabla(datos, contexto) {
    const { columnas } = datos;
    // Anchos: de mitad a mitad de los huecos entre columnas
    const cortes = columnas.map(([x0], i) => (i === 0 ? x0 - 2 : (columnas[i - 1][1] + x0) / 2));
    cortes.push(columnas.at(-1)[1] + 2);
    const anchos = columnas.map((_, i) => cortes[i + 1] - cortes[i]);
    // Alto de cada fila: la distancia hasta la siguiente (la última, como la anterior)
    const centros = datos.filas.map((fila) => (fila.y0 + fila.y1) / 2);
    const filas = datos.filas.map((fila, i) => {
        const porColumna = columnas.map(() => []);
        for (const trozo of fila.trozos) {
            porColumna[columnaDe(trozo, columnas)].push(trozo);
        }
        const paso = i < centros.length - 1 ? centros[i + 1] - centros[i] : centros[i] - (centros[i - 1] ?? centros[i] - (fila.y1 - fila.y0) * 1.4);
        const alto = Math.max(fila.y1 - fila.y0, paso);
        return `<w:tr><w:trPr><w:trHeight w:val="${tw(alto)}" w:hRule="atLeast"/></w:trPr>${porColumna.map((trozos, c) => celda(trozos, anchos[c])).join('')}</w:tr>`;
    });
    const borde = 'w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"';
    const sangria = cortes[0] - contexto.margen.izquierda;
    const props = `<w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblInd w:w="${tw(sangria)}" w:type="dxa"/><w:tblBorders><w:top ${borde}/><w:left ${borde}/><w:bottom ${borde}/><w:right ${borde}/><w:insideH ${borde}/><w:insideV ${borde}/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="40" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tblCellMar></w:tblPr>`;
    const rejilla = `<w:tblGrid>${anchos.map((a) => `<w:gridCol w:w="${tw(a)}"/>`).join('')}</w:tblGrid>`;
    // Separación antes de la tabla: un párrafo vacío de esa altura
    const antes = contexto.antes > 2 ? `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${tw(contexto.antes)}" w:lineRule="exact"/></w:pPr></w:p>` : '';
    return { xml: `${antes}<w:tbl>${props}${rejilla}${filas.join('')}</w:tbl>`, fondo: datos.y1 };
}

function imagen(bloque, contexto, id) {
    const [x0, y0, x1, y1] = bloque.rect;
    const cx = Math.round((x1 - x0) * EMU);
    const cy = Math.round((y1 - y0) * EMU);
    const sangria = x0 - contexto.margen.izquierda;
    const dibujo = `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Imagen ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="imagen${id}.${bloque.formato}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
    const ind = sangria > 3 ? `<w:ind w:left="${tw(sangria)}"/>` : '';
    return { xml: `<w:p><w:pPr><w:spacing w:before="${tw(contexto.antes)}" w:after="0"/>${ind}</w:pPr><w:r>${dibujo}</w:r></w:p>`, fondo: y1 };
}

function seccion(pagina, margen) {
    const horizontal = pagina.ancho > pagina.alto ? ' w:orient="landscape"' : '';
    return `<w:sectPr><w:pgSz w:w="${tw(pagina.ancho)}" w:h="${tw(pagina.alto)}"${horizontal}/><w:pgMar w:top="${tw(margen.arriba)}" w:right="${tw(margen.derecha)}" w:bottom="${tw(margen.arriba)}" w:left="${tw(margen.izquierda)}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;
}

// Elementos de una página en el orden de lectura de MuPDF; cada tabla sale donde aparece su primera celda
function elementosDePagina(pagina, imagenes) {
    const margen = margenes(pagina);
    const tablas = buscarTablas(agruparFilas(trozosDePagina(pagina)));
    const enTabla = new Map();
    for (const datos of tablas) {
        for (const fila of datos.filas) {
            for (const trozo of fila.trozos) {
                enTabla.set(trozo.clave, datos);
            }
        }
    }
    const emitidas = new Set();
    const elementos = [];
    let fondo = margen.arriba;
    const contexto = { pagina, margen, antes: 0 };
    const poner = (crear) => {
        const elemento = crear();
        elementos.push(elemento.xml);
        fondo = Math.max(fondo, elemento.fondo);
    };
    const antesDe = (y) => Math.min(ESPACIO_MAXIMO / TWIP, Math.max(0, y - fondo));
    pagina.bloques.forEach((bloque, b) => {
        if (bloque.tipo === 'imagen') {
            contexto.antes = antesDe(bloque.rect[1]);
            imagenes.push(bloque);
            poner(() => imagen(bloque, contexto, imagenes.length));
            return;
        }
        let pendientes = [];
        const volcar = () => {
            for (const grupo of partirEnParrafos(pendientes)) {
                contexto.antes = antesDe(grupo[0].rect[1]);
                poner(() => parrafo(grupo, contexto));
            }
            pendientes = [];
        };
        bloque.lineas.forEach((linea, l) => {
            const libres = linea.trozos.filter((_, t) => !enTabla.has(`${b}:${l}:${t}`));
            const tablaAqui = linea.trozos.map((_, t) => enTabla.get(`${b}:${l}:${t}`)).find(Boolean);
            if (tablaAqui && !emitidas.has(tablaAqui)) {
                volcar();
                emitidas.add(tablaAqui);
                contexto.antes = antesDe(tablaAqui.y0);
                poner(() => tabla(tablaAqui, contexto));
            }
            if (libres.length) {
                pendientes.push({ ...linea, trozos: libres });
            }
        });
        volcar();
    });
    return { elementos, margen };
}

const TIPOS = { png: 'image/png', jpg: 'image/jpeg' };

function empaquetar(cuerpo, imagenes, letraPrincipal, tamanoPrincipal) {
    const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
    const cabecera = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const archivos = {
        '[Content_Types].xml': strToU8(`${cabecera}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`),
        '_rels/.rels': strToU8(`${cabecera}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`),
        'docProps/core.xml': strToU8(`${cabecera}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>DNNS PDF</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`),
        'docProps/app.xml': strToU8(`${cabecera}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>DNNS PDF</Application></Properties>`),
        'word/_rels/document.xml.rels': strToU8(`${cabecera}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdEstilos" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${imagenes.map((img, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/imagen${i + 1}.${img.formato}"/>`).join('')}</Relationships>`),
        'word/styles.xml': strToU8(`${cabecera}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${esc(letraPrincipal)}" w:hAnsi="${esc(letraPrincipal)}" w:cs="${esc(letraPrincipal)}" w:eastAsia="${esc(letraPrincipal)}"/><w:sz w:val="${Math.round(tamanoPrincipal * 2)}"/><w:szCs w:val="${Math.round(tamanoPrincipal * 2)}"/><w:lang w:val="es-ES"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="table" w:default="1" w:styleId="TablaNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`),
        'word/document.xml': strToU8(`${cabecera}<w:document ${ns}><w:body>${cuerpo}</w:body></w:document>`)
    };
    imagenes.forEach((img, i) => {
        // Ya van comprimidas: se guardan tal cual en el zip
        archivos[`word/media/imagen${i + 1}.${img.formato}`] = [img.bytes, { level: 0 }];
    });
    return zipSync(archivos, { level: 6 });
}

// Letra y tamaño más usados: los del estilo Normal
function principal(paginas) {
    const cuenta = new Map();
    for (const pagina of paginas) {
        for (const bloque of pagina.bloques) {
            for (const linea of bloque.lineas ?? []) {
                for (const trozo of linea.trozos) {
                    for (const tramo of trozo.tramos) {
                        const clave = `${tramo.letra}|${tramo.tamano}`;
                        cuenta.set(clave, (cuenta.get(clave) ?? 0) + tramo.texto.length);
                    }
                }
            }
        }
    }
    const [clave] = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['Arial|11'];
    const [letra, tamano] = clave.split('|');
    return { letra, tamano: Number(tamano) || 11 };
}

// paginas: lo que devuelve extraerPagina() de cada una. Devuelve los bytes del .docx
export function crearDocx(paginas) {
    const imagenes = [];
    const partes = [];
    paginas.forEach((pagina, i) => {
        const { elementos, margen } = elementosDePagina(pagina, imagenes);
        const ultima = i === paginas.length - 1;
        if (!elementos.length) {
            elementos.push('<w:p/>');
        }
        partes.push(...elementos);
        // Cada página es una sección con su tamaño: la siguiente empieza en página nueva.
        // La sección termina en un párrafo (tras una tabla hace falta uno vacío)
        if (!ultima) {
            const sect = seccion(pagina, margen);
            const fin = partes.at(-1);
            if (fin.startsWith('<w:p><w:pPr>') && !fin.includes('<w:sectPr>')) {
                // sectPr va al final de las propiedades del párrafo
                partes[partes.length - 1] = fin.replace('</w:pPr>', `${sect}</w:pPr>`);
            } else {
                partes.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>${sect}</w:pPr></w:p>`);
            }
        } else {
            partes.push(seccion(pagina, margen));
        }
    });
    const { letra, tamano } = principal(paginas);
    return empaquetar(partes.join(''), imagenes, letra, tamano);
}
