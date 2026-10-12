// Fecha: 2026-10-12
// Ruta: /src/motor/oficina/rtf.js
// Texto enriquecido (.rtf) a HTML para convertirlo a PDF
// Lector RTF propio: grupos y palabras de control, Unicode y página de códigos, tamaño de página, párrafos
// (alineación, sangrías, espaciado), negrita/cursiva/subrayado/tachado, tamaño y color, tablas sencillas,
// saltos de página e imágenes PNG/JPEG incrustadas
// Notas: se conserva el contenido y el formato básico, no la maquetación exacta. Las cabeceras, los pies,
//        las notas y las imágenes en otros formatos (WMF/EMF) no se pintan.

import { escapar, paginaHtml, aBase64 } from './comun.js';

const TWIPS = 20;
// Carta con márgenes de 1 pulgada (1,25 a los lados): lo que RTF supone si el documento no dice otra cosa
const PAPEL = { ancho: 12240, alto: 15840, margl: 1800, margr: 1800, margt: 1440, margb: 1440, apaisado: false };
const TAMANO_DEFECTO = 24;

const CSS = `
html, body { margin: 0; }
body { font-family: sans-serif; font-size: 12pt; line-height: 1.3; }
p { margin: 0; }
table { border-collapse: collapse; margin: 4pt 0; }
td { border: 0.5pt solid #999; padding: 2pt 5pt; vertical-align: top; }
img { max-width: 100%; }
hr.salto { page-break-after: always; border: 0; height: 0; margin: 0; }
`;

// Grupos cuyo contenido no va al documento: cabeceras, pies, metadatos, tablas de estilos y listas...
const SALTAR = new Set(['stylesheet', 'info', 'header', 'footer', 'headerl', 'headerr', 'headerf', 'footerl', 'footerr',
    'footerf', 'footnote', 'annotation', 'object', 'fldinst', 'datafield', 'xe', 'tc', 'themedata', 'colorschememapping',
    'latentstyles', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'pntxta', 'pntxtb', 'nonshppict',
    'nesttableprops', 'userprops', 'docvar', 'revtbl', 'ftnsep', 'ftnsepc', 'aftnsep', 'aftnsepc', 'background',
    'template', 'mmathPr', 'factoidname', 'protusertbl', 'passwordhash', 'xmlnstbl', 'wgrffmtfilter', 'pgdsctbl']);
// Destinos marcados con \* que sí se leen (los demás desconocidos se saltan, como manda la norma)
const ESTRELLA_UTIL = new Set(['shppict']);

// Caracteres de las fuentes de símbolos que se usan como viñetas
const VINETAS = {
    symbol: { 0xb7: '•', 0xa7: '♣' },
    wingdings: { 0x6c: '●', 0x6e: '■', 0x75: '◆', 0x76: '❖', 0xa7: '▪', 0xd8: '➢', 0xfc: '✓', 0xe0: '→' }
};

const CARACTERES = {
    emdash: '—', endash: '–', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”', bullet: '•',
    emspace: ' ', enspace: ' ', qmspace: ' ', zwj: '', zwnj: '', ltrmark: '', rtlmark: ''
};

const DEFECTO_CAR = { b: false, i: false, ul: false, strike: false, fs: TAMANO_DEFECTO, cf: 0, highlight: 0, f: -1, sup: false, sub: false, caps: false };
const DEFECTO_PAR = { q: 'l', li: 0, ri: 0, fi: 0, sb: 0, sa: 0, intbl: false, pagebb: false };

// \b activa, \b0 desactiva
const activo = (p) => p !== 0;

// Propiedades de carácter
const CAR = {
    b: (car, p) => (car.b = activo(p)),
    i: (car, p) => (car.i = activo(p)),
    ul: (car, p) => (car.ul = activo(p)),
    ulnone: (car) => (car.ul = false),
    strike: (car, p) => (car.strike = activo(p)),
    striked: (car, p) => (car.strike = activo(p)),
    fs: (car, p) => (car.fs = p ?? TAMANO_DEFECTO),
    cf: (car, p) => (car.cf = p ?? 0),
    highlight: (car, p) => (car.highlight = p ?? 0),
    f: (car, p) => (car.f = p ?? -1),
    super: (car) => Object.assign(car, { sup: true, sub: false }),
    sub: (car) => Object.assign(car, { sup: false, sub: true }),
    nosupersub: (car) => Object.assign(car, { sup: false, sub: false }),
    caps: (car, p) => (car.caps = activo(p)),
    plain: (car, p, ctx) => Object.assign(car, DEFECTO_CAR, { f: ctx.deff })
};
for (const variante of ['uld', 'uldash', 'uldashd', 'uldashdd', 'uldb', 'ulhwave', 'ulldash', 'ulth', 'ulthd', 'ulthdash',
    'ulthdashd', 'ulthdashdd', 'ulthldash', 'ululdbwave', 'ulw', 'ulwave']) {
    CAR[variante] = (car, p) => (car.ul = activo(p));
}

// Propiedades de párrafo
const PAR = {
    pard: (par) => Object.assign(par, DEFECTO_PAR),
    ql: (par) => (par.q = 'l'),
    qc: (par) => (par.q = 'c'),
    qr: (par) => (par.q = 'r'),
    qj: (par) => (par.q = 'j'),
    li: (par, p) => (par.li = p ?? 0),
    ri: (par, p) => (par.ri = p ?? 0),
    fi: (par, p) => (par.fi = p ?? 0),
    sb: (par, p) => (par.sb = p ?? 0),
    sa: (par, p) => (par.sa = p ?? 0),
    intbl: (par) => (par.intbl = true),
    pagebb: (par) => (par.pagebb = true)
};

// Palabras que actúan sobre el documento entero o emiten contenido
const DOC = {
    ansicpg: (ctx, p) => (ctx.decodificador = decodificadorDe(p)),
    deff: (ctx, p) => {
        ctx.deff = p ?? 0;
        if (ctx.estado.car.f === -1) {
            ctx.estado.car.f = ctx.deff;
        }
    },
    uc: (ctx, p) => (ctx.estado.uc = p ?? 1),
    u: (ctx, p) => {
        const codigo = p < 0 ? p + 65536 : p;
        anadirTexto(ctx, String.fromCodePoint(codigo));
        ctx.estado.saltarChars = ctx.estado.uc;
    },
    par: (ctx) => cerrarParrafo(ctx, true),
    sect: (ctx) => cerrarParrafo(ctx, false),
    line: (ctx) => anadirParte(ctx, { html: '<br>' }),
    tab: (ctx) => anadirTexto(ctx, '\t'),
    page: (ctx) => {
        cerrarParrafo(ctx, false);
        volcarTabla(ctx);
        ctx.cuerpo.push('<hr class="salto">');
    },
    cell: cerrarCelda,
    nestcell: cerrarCelda,
    row: cerrarFila,
    nestrow: cerrarFila,
    trowd: (ctx) => (ctx.cellx = []),
    cellx: (ctx, p) => ctx.cellx.push(p ?? 0),
    fonttbl: (ctx) => (ctx.estado.destino = 'fonttbl'),
    colortbl: (ctx) => (ctx.estado.destino = 'colortbl'),
    red: (ctx, p) => (ctx.colorActual.r = p ?? 0),
    green: (ctx, p) => (ctx.colorActual.g = p ?? 0),
    blue: (ctx, p) => (ctx.colorActual.b = p ?? 0),
    fcharset: (ctx, p) => p === 2 && ctx.simbolicas.add(ctx.estado.car.f),
    pict: (ctx) => {
        ctx.estado.destino = 'pict';
        ctx.estado.imagen = { hex: '', bin: null, tipo: null, ancho: 0, alto: 0, anchoGoal: 0, altoGoal: 0, escalaX: 100, escalaY: 100 };
    },
    paperw: (ctx, p) => (ctx.papel.ancho = p || ctx.papel.ancho),
    paperh: (ctx, p) => (ctx.papel.alto = p || ctx.papel.alto),
    pgwsxn: (ctx, p) => (ctx.papel.ancho = p || ctx.papel.ancho),
    pghsxn: (ctx, p) => (ctx.papel.alto = p || ctx.papel.alto),
    margl: (ctx, p) => (ctx.papel.margl = p ?? ctx.papel.margl),
    margr: (ctx, p) => (ctx.papel.margr = p ?? ctx.papel.margr),
    margt: (ctx, p) => (ctx.papel.margt = p ?? ctx.papel.margt),
    margb: (ctx, p) => (ctx.papel.margb = p ?? ctx.papel.margb),
    landscape: (ctx) => (ctx.papel.apaisado = true),
    lndscpsxn: (ctx) => (ctx.papel.apaisado = true)
};

// Palabras propias del grupo \pict
const IMAGEN = {
    pngblip: (img) => (img.tipo = 'png'),
    jpegblip: (img) => (img.tipo = 'jpeg'),
    picw: (img, p) => (img.ancho = p ?? 0),
    pich: (img, p) => (img.alto = p ?? 0),
    picwgoal: (img, p) => (img.anchoGoal = p ?? 0),
    pichgoal: (img, p) => (img.altoGoal = p ?? 0),
    picscalex: (img, p) => (img.escalaX = p || 100),
    picscaley: (img, p) => (img.escalaY = p || 100),
    wmetafile: () => {},
    emfblip: () => {},
    dibitmap: () => {},
    wbitmap: () => {},
    macpict: () => {}
};

function decodificadorDe(pagina) {
    const nombre = pagina === 65001 ? 'utf-8' : pagina === 10000 ? 'macintosh' : `windows-${pagina}`;
    try {
        return new TextDecoder(nombre);
    } catch {
        return new TextDecoder('windows-1252');
    }
}

const esLetra = (c) => (c >= 0x61 && c <= 0x7a) || (c >= 0x41 && c <= 0x5a);
const esDigito = (c) => c >= 0x30 && c <= 0x39;
const esHex = (c) => esDigito(c) || (c >= 0x61 && c <= 0x66) || (c >= 0x41 && c <= 0x46);

// Familia CSS según el nombre de la fuente; null deja la de la página (sans-serif)
function familiaDe(nombre = '') {
    const n = nombre.toLowerCase();
    if (/courier|consolas|mono|lucida console/.test(n)) {
        return 'monospace';
    }
    if (/sans|arial|helvetica|calibri|verdana|tahoma|segoe/.test(n)) {
        return null;
    }
    return /times|georgia|garamond|cambria|book|serif|palatino|century|roman/.test(n) ? 'serif' : null;
}

// Tras una '\': palabra de control con parámetro, byte \'hh o símbolo
function leerControl(ctx) {
    const d = ctx.d;
    const c = d[ctx.i];
    if (c === 0x27) {
        const hex = String.fromCharCode(d[ctx.i + 1] ?? 0x30, d[ctx.i + 2] ?? 0x30);
        ctx.i += 3;
        return { tipo: 'byte', valor: parseInt(hex, 16) || 0 };
    }
    if (!esLetra(c)) {
        ctx.i++;
        return { tipo: 'simbolo', valor: c };
    }
    let fin = ctx.i;
    while (esLetra(d[fin])) {
        fin++;
    }
    const palabra = String.fromCharCode(...d.subarray(ctx.i, fin));
    let parametro = null;
    let signo = 1;
    if (d[fin] === 0x2d) {
        signo = -1;
        fin++;
    }
    if (esDigito(d[fin])) {
        let n = 0;
        while (esDigito(d[fin])) {
            n = n * 10 + d[fin++] - 0x30;
        }
        parametro = signo * n;
    }
    // El espacio que sigue a la palabra es su delimitador, no texto
    if (d[fin] === 0x20) {
        fin++;
    }
    ctx.i = fin;
    return { tipo: 'palabra', palabra, parametro };
}

function abrirGrupo(ctx) {
    volcarPendientes(ctx);
    const e = ctx.estado;
    ctx.pila.push(e);
    ctx.estado = { ...e, car: { ...e.car }, par: { ...e.par }, ignorable: false };
}

function cerrarGrupo(ctx) {
    volcarPendientes(ctx);
    const cerrado = ctx.estado;
    ctx.estado = ctx.pila.pop() ?? cerrado;
    if (cerrado.destino === 'pict' && ctx.estado.destino !== 'pict' && !cerrado.saltar) {
        terminarImagen(ctx, cerrado.imagen);
    }
}

// Un byte de texto (literal o \'hh): según el destino va a la tabla de fuentes, a la de colores, a la imagen o al texto
function caracter(ctx, c) {
    const e = ctx.estado;
    if (e.saltar) {
        return;
    }
    if (e.destino === 'fonttbl') {
        ctx.fuentes.set(e.car.f, (ctx.fuentes.get(e.car.f) ?? '') + String.fromCharCode(c));
        return;
    }
    if (e.destino === 'colortbl') {
        if (c === 0x3b) {
            const { r, g, b } = ctx.colorActual;
            ctx.colores.push(r === null ? null : `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
            ctx.colorActual = { r: null, g: 0, b: 0 };
        }
        return;
    }
    if (e.destino === 'pict') {
        if (esHex(c)) {
            e.imagen.hex += String.fromCharCode(c);
        }
        return;
    }
    if (e.saltarChars > 0) {
        e.saltarChars--;
        return;
    }
    ctx.pendientes.push(c);
}

function simbolo(ctx, c) {
    const e = ctx.estado;
    if (c === 0x2a) {
        e.ignorable = true;
        return;
    }
    if (e.saltar) {
        return;
    }
    if (c === 0x0d || c === 0x0a) {
        DOC.par(ctx);
    } else if (c === 0x7e) {
        anadirTexto(ctx, ' ');
    } else if (c === 0x5f) {
        anadirTexto(ctx, '‑');
    } else if (c === 0x5c || c === 0x7b || c === 0x7d) {
        caracter(ctx, c);
    }
    // \- (guion opcional) y el resto de símbolos no pintan nada
}

function control(ctx, token) {
    if (token.tipo === 'byte') {
        caracter(ctx, token.valor);
        return;
    }
    if (token.tipo === 'simbolo') {
        simbolo(ctx, token.valor);
        return;
    }
    const e = ctx.estado;
    if (e.saltar) {
        return;
    }
    volcarPendientes(ctx);
    const { palabra, parametro } = token;
    const ignorable = e.ignorable;
    e.ignorable = false;
    if (e.destino === 'pict' && IMAGEN[palabra]) {
        IMAGEN[palabra](e.imagen, parametro);
    } else if (palabra === 'bin') {
        leerBinario(ctx, parametro ?? 0);
    } else if (CARACTERES[palabra] !== undefined) {
        anadirTexto(ctx, CARACTERES[palabra]);
    } else if (CAR[palabra]) {
        CAR[palabra](e.car, parametro, ctx);
    } else if (PAR[palabra]) {
        PAR[palabra](e.par, parametro);
    } else if (DOC[palabra]) {
        DOC[palabra](ctx, parametro);
    } else if (SALTAR.has(palabra) || (ignorable && !ESTRELLA_UTIL.has(palabra))) {
        e.saltar = true;
    }
}

// \binN: los N bytes siguientes son datos en crudo (imágenes sin pasar a hexadecimal)
function leerBinario(ctx, longitud) {
    const datos = ctx.d.subarray(ctx.i, ctx.i + longitud);
    ctx.i += longitud;
    if (ctx.estado.destino === 'pict') {
        ctx.estado.imagen.bin = datos;
    }
}

// Los bytes acumulados se decodifican con la página de códigos del documento (o como viñetas si la fuente es de símbolos)
function volcarPendientes(ctx) {
    if (!ctx.pendientes.length) {
        return;
    }
    const bytes = Uint8Array.from(ctx.pendientes);
    ctx.pendientes.length = 0;
    const fuente = ctx.estado.car.f;
    const nombre = (ctx.fuentes.get(fuente) ?? '').toLowerCase();
    const tabla = VINETAS[nombre.includes('wingdings') ? 'wingdings' : 'symbol'];
    if (ctx.simbolicas.has(fuente) || nombre.includes('symbol') || nombre.includes('wingdings')) {
        anadirTexto(ctx, Array.from(bytes, (b) => tabla[b] ?? (b >= 0x80 ? '•' : String.fromCharCode(b))).join(''));
    } else {
        anadirTexto(ctx, ctx.decodificador.decode(bytes));
    }
}

function estiloCaracter(ctx, car) {
    const estilos = [];
    if (car.b) {
        estilos.push('font-weight:bold');
    }
    if (car.i) {
        estilos.push('font-style:italic');
    }
    const decoracion = [car.ul && 'underline', car.strike && 'line-through'].filter(Boolean);
    if (decoracion.length) {
        estilos.push(`text-decoration:${decoracion.join(' ')}`);
    }
    if (car.fs !== TAMANO_DEFECTO) {
        estilos.push(`font-size:${car.fs / 2}pt`);
    }
    const familia = familiaDe(ctx.fuentes.get(car.f));
    if (familia) {
        estilos.push(`font-family:${familia}`);
    }
    if (ctx.colores[car.cf]) {
        estilos.push(`color:${ctx.colores[car.cf]}`);
    }
    if (ctx.colores[car.highlight]) {
        estilos.push(`background-color:${ctx.colores[car.highlight]}`);
    }
    return estilos.join(';');
}

function anadirTexto(ctx, texto) {
    const car = ctx.estado.car;
    const parte = { texto: car.caps ? texto.toUpperCase() : texto, estilo: estiloCaracter(ctx, car), sup: car.sup, sub: car.sub };
    const partes = ctx.parrafo.partes;
    const ultima = partes.at(-1);
    if (ultima?.texto !== undefined && ultima.estilo === parte.estilo && ultima.sup === parte.sup && ultima.sub === parte.sub) {
        ultima.texto += parte.texto;
    } else {
        partes.push(parte);
    }
}

function anadirParte(ctx, parte) {
    volcarPendientes(ctx);
    ctx.parrafo.partes.push(parte);
}

function parteHtml(parte) {
    if (parte.html) {
        return parte.html;
    }
    // Las tabulaciones y los espacios seguidos se conservan a ojo: el HTML los juntaría
    let html = escapar(parte.texto)
        .replace(/\t/g, '    ')
        .replace(/ {2,}/g, (m) => ' '.repeat(m.length - 1) + ' ');
    if (parte.sup) {
        html = `<sup>${html}</sup>`;
    } else if (parte.sub) {
        html = `<sub>${html}</sub>`;
    }
    return parte.estilo ? `<span style="${parte.estilo}">${html}</span>` : html;
}

function estiloParrafo(par) {
    const estilos = [];
    const alineacion = { c: 'center', r: 'right', j: 'justify' }[par.q];
    if (alineacion) {
        estilos.push(`text-align:${alineacion}`);
    }
    const medidas = { 'margin-left': par.li, 'margin-right': par.ri, 'text-indent': par.fi, 'margin-top': par.sb, 'margin-bottom': par.sa };
    for (const [propiedad, twips] of Object.entries(medidas)) {
        if (twips) {
            estilos.push(`${propiedad}:${(twips / TWIPS).toFixed(1)}pt`);
        }
    }
    return estilos.join(';');
}

// Un \par cierra el párrafo con las propiedades vigentes; vacío, ocupa una línea como en el original
function cerrarParrafo(ctx, aunqueVacio) {
    const { partes } = ctx.parrafo;
    const par = ctx.estado.par;
    if (!partes.length && !aunqueVacio) {
        return;
    }
    const estilo = estiloParrafo(par);
    const html = `<p${estilo ? ` style="${estilo}"` : ''}>${partes.map(parteHtml).join('') || '&nbsp;'}</p>`;
    ctx.parrafo = { partes: [] };
    if (par.intbl) {
        ctx.celda.push(html);
        return;
    }
    volcarTabla(ctx);
    if (par.pagebb && ctx.cuerpo.length) {
        ctx.cuerpo.push('<hr class="salto">');
    }
    ctx.cuerpo.push(html);
}

function cerrarCelda(ctx) {
    if (ctx.parrafo.partes.length) {
        ctx.estado.par.intbl = true;
        cerrarParrafo(ctx, true);
    }
    ctx.fila.push(ctx.celda.join(''));
    ctx.celda = [];
}

function cerrarFila(ctx) {
    if (ctx.celda.length) {
        cerrarCelda(ctx);
    }
    if (!ctx.fila.length) {
        return;
    }
    // Las fronteras \cellx son acumuladas: el ancho de cada celda es la diferencia con la anterior
    const anchos = ctx.cellx.map((x, i) => (x - (ctx.cellx[i - 1] ?? 0)) / TWIPS);
    ctx.tabla.push({ celdas: ctx.fila, anchos });
    ctx.fila = [];
}

function volcarTabla(ctx) {
    if (ctx.fila.length) {
        cerrarFila(ctx);
    }
    if (!ctx.tabla.length) {
        return;
    }
    const filas = ctx.tabla.map(({ celdas, anchos }) => {
        const tds = celdas.map((celda, i) => (anchos[i] > 0 ? `<td style="width:${anchos[i].toFixed(1)}pt">${celda}</td>` : `<td>${celda}</td>`));
        return `<tr>${tds.join('')}</tr>`;
    });
    ctx.cuerpo.push(`<table>${filas.join('')}</table>`);
    ctx.tabla = [];
}

function hexABytes(hex) {
    const bytes = new Uint8Array(hex.length >> 1);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

// Al cerrar el grupo \pict: la imagen va como parte del párrafo, con su tamaño en puntos si lo trae
function terminarImagen(ctx, img) {
    if (!img?.tipo || (!img.hex && !img.bin)) {
        return;
    }
    const bytes = img.bin ?? hexABytes(img.hex);
    // picwgoal/pichgoal vienen en twips; picw/pich, en píxeles (a 96 ppp)
    const ancho = (img.anchoGoal ? img.anchoGoal / TWIPS : img.ancho * 0.75) * img.escalaX / 100;
    const alto = (img.altoGoal ? img.altoGoal / TWIPS : img.alto * 0.75) * img.escalaY / 100;
    const estilo = ancho > 0 && alto > 0 ? ` style="width:${ancho.toFixed(1)}pt;height:${alto.toFixed(1)}pt"` : '';
    ctx.parrafo.partes.push({ html: `<img src="data:image/${img.tipo};base64,${aBase64(bytes)}"${estilo}>` });
}

function crearContexto(bytes) {
    return {
        d: bytes,
        i: 0,
        pila: [],
        estado: { car: { ...DEFECTO_CAR }, par: { ...DEFECTO_PAR }, uc: 1, saltar: false, destino: null, ignorable: false, saltarChars: 0, imagen: null },
        decodificador: new TextDecoder('windows-1252'),
        deff: 0,
        fuentes: new Map(),
        simbolicas: new Set(),
        colores: [],
        colorActual: { r: null, g: 0, b: 0 },
        papel: { ...PAPEL },
        pendientes: [],
        parrafo: { partes: [] },
        celda: [],
        fila: [],
        tabla: [],
        cellx: [],
        cuerpo: []
    };
}

function recorrer(ctx) {
    const d = ctx.d;
    while (ctx.i < d.length) {
        const c = d[ctx.i++];
        if (c === 0x7b) {
            abrirGrupo(ctx);
        } else if (c === 0x7d) {
            cerrarGrupo(ctx);
        } else if (c === 0x5c) {
            control(ctx, leerControl(ctx));
        } else if (c !== 0x0d && c !== 0x0a) {
            caracter(ctx, c);
        }
    }
    volcarPendientes(ctx);
    cerrarParrafo(ctx, false);
    volcarTabla(ctx);
}

export function rtfAHtml(bytes) {
    const ctx = crearContexto(bytes);
    recorrer(ctx);
    const { papel } = ctx;
    const apaisado = papel.apaisado && papel.ancho < papel.alto;
    const ancho = (apaisado ? papel.alto : papel.ancho) / TWIPS;
    const alto = (apaisado ? papel.ancho : papel.alto) / TWIPS;
    const margenes = [papel.margt, papel.margr, papel.margb, papel.margl].map((m) => `${(Math.max(0, m) / TWIPS).toFixed(1)}pt`);
    const css = `${CSS} body { padding: ${margenes.join(' ')}; }`;
    return [{ html: paginaHtml(css, ctx.cuerpo.join('')), ancho, alto, em: 12 }];
}
