// Fecha: 2026-10-12
// Ruta: /src/motor/convertir/disposicion.js
// Cómo está colocado el texto de una página: filas (trozos a la misma altura), columnas (por los huecos que
// ninguna fila con varias celdas pisa), tablas, márgenes y números escritos («1.234,56 €», «12 %»)
// Notas: sin MuPDF; lo usan word.js y excel.js con lo que da extraer.js.

const TOLERANCIA_COLUMNA = 2;

// Todos los trozos de texto de la página, con su bloque y línea
export function trozosDePagina(pagina) {
    const trozos = [];
    pagina.bloques.forEach((bloque, b) => {
        if (bloque.tipo !== 'texto') {
            return;
        }
        bloque.lineas.forEach((linea, l) => {
            linea.trozos.forEach((trozo, t) => {
                trozos.push({ ...trozo, bloque: b, linea: l, clave: `${b}:${l}:${t}`, base: linea.base });
            });
        });
    });
    return trozos;
}

// Filas: trozos cuyo centro vertical cae dentro de la altura de la fila
export function agruparFilas(trozos) {
    const ordenados = [...trozos].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
    const filas = [];
    for (const trozo of ordenados) {
        const centro = (trozo.y0 + trozo.y1) / 2;
        const fila = filas.at(-1);
        if (fila && centro >= fila.y0 && centro <= fila.y1) {
            fila.trozos.push(trozo);
            fila.y0 = Math.min(fila.y0, trozo.y0);
            fila.y1 = Math.max(fila.y1, trozo.y1);
        } else {
            filas.push({ y0: trozo.y0, y1: trozo.y1, trozos: [trozo] });
        }
    }
    for (const fila of filas) {
        fila.trozos.sort((a, b) => a.x0 - b.x0);
    }
    return filas;
}

// Columnas: los tramos horizontales que ocupan los trozos de las filas con varias celdas; los huecos que
// ninguna pisa separan columnas. Funciona con celdas alineadas a la izquierda, a la derecha o centradas
export function columnasDe(filas) {
    const intervalos = filas.filter((fila) => fila.trozos.length > 1)
        .flatMap((fila) => fila.trozos.map((t) => [t.x0, t.x1]))
        .sort((a, b) => a[0] - b[0]);
    const columnas = [];
    for (const [x0, x1] of intervalos) {
        const ultima = columnas.at(-1);
        if (ultima && x0 <= ultima[1] + TOLERANCIA_COLUMNA) {
            ultima[1] = Math.max(ultima[1], x1);
        } else {
            columnas.push([x0, x1]);
        }
    }
    return unirColumnasSueltas(columnas, filas);
}

// Encabezado a la izquierda y números a la derecha dejan dos «columnas» que nunca coinciden en la misma
// fila: son una sola. Se unen las vecinas que ninguna fila ocupa a la vez
function unirColumnasSueltas(columnas, filas) {
    const resultado = columnas.map((c) => [...c]);
    let unidas = true;
    while (unidas && resultado.length > 1) {
        unidas = false;
        const ocupadas = filas.filter((fila) => fila.trozos.length > 1)
            .map((fila) => new Set(fila.trozos.map((t) => columnaDe(t, resultado))));
        for (let i = 0; i < resultado.length - 1; i++) {
            const usadaA = ocupadas.some((s) => s.has(i));
            const usadaB = ocupadas.some((s) => s.has(i + 1));
            const juntas = ocupadas.some((s) => s.has(i) && s.has(i + 1));
            if (usadaA && usadaB && !juntas) {
                resultado.splice(i, 2, [resultado[i][0], resultado[i + 1][1]]);
                unidas = true;
                break;
            }
        }
    }
    return resultado;
}

// Columna de un trozo: la que contiene su centro; si cae en un hueco, la más cercana
export function columnaDe(trozo, columnas) {
    const centro = (trozo.x0 + trozo.x1) / 2;
    let mejor = 0;
    let distancia = Infinity;
    columnas.forEach(([x0, x1], i) => {
        const d = centro < x0 ? x0 - centro : centro > x1 ? centro - x1 : 0;
        if (d < distancia) {
            distancia = d;
            mejor = i;
        }
    });
    return mejor;
}

// Tablas: grupos de filas seguidas con dos o más celdas, sin huecos verticales grandes
// Las filas con trozos largos son texto en dos columnas, no una tabla
const LARGO_MAXIMO_CELDA = 50;

export function buscarTablas(filas) {
    const tablas = [];
    let actual = [];
    const cerrar = () => {
        if (actual.length >= 2) {
            const columnas = columnasDe(actual);
            const celdas = actual.flatMap((fila) => fila.trozos);
            const largoMedio = celdas.reduce((suma, t) => suma + t.texto.length, 0) / celdas.length;
            if (columnas.length >= 2 && largoMedio <= LARGO_MAXIMO_CELDA) {
                tablas.push({ filas: actual, columnas, y0: actual[0].y0, y1: actual.at(-1).y1 });
            }
        }
        actual = [];
    };
    for (const fila of filas) {
        const anterior = actual.at(-1);
        const altoFila = fila.y1 - fila.y0;
        const seguida = anterior && fila.y0 - anterior.y1 < altoFila * 2.5;
        if (fila.trozos.length >= 2 && (!anterior || seguida)) {
            actual.push(fila);
        } else {
            cerrar();
            if (fila.trozos.length >= 2) {
                actual.push(fila);
            }
        }
    }
    cerrar();
    return tablas;
}

// Margen izquierdo y superior de la página: donde empieza el contenido (con límites razonables)
export function margenes(pagina) {
    let izquierda = Infinity;
    let arriba = Infinity;
    let derecha = -Infinity;
    for (const bloque of pagina.bloques) {
        izquierda = Math.min(izquierda, bloque.rect[0]);
        arriba = Math.min(arriba, bloque.rect[1]);
        derecha = Math.max(derecha, bloque.rect[2]);
    }
    const limitar = (v, min, max) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : 72));
    return {
        izquierda: limitar(izquierda, 18, 108),
        arriba: limitar(arriba, 18, 108),
        derecha: limitar(pagina.ancho - derecha, 18, 108)
    };
}

// «1.234,56», «1,234.56», «-12 %», «45,00 €», «$1,200» -> { valor, porcentaje, decimales } o null
export function leerNumero(texto) {
    const limpio = String(texto).trim().replace(/ /g, ' ');
    const m = /^([-+−]?)\s*(?:[€$£]\s*)?([\d][\d.,\s]*)\s*(%|€|EUR|\$|£)?$/.exec(limpio);
    if (!m) {
        return null;
    }
    const bruto = m[2].trim();
    // Espacios solo como separador de miles («1 234,5»); si no, es un teléfono o un código
    if (/\s/.test(bruto) && !/^\d{1,3}( \d{3})+([.,]\d+)?$/.test(bruto)) {
        return null;
    }
    // «007», «0034...»: códigos, no cantidades
    if (/^0\d/.test(bruto)) {
        return null;
    }
    let cifras = m[2].replace(/\s/g, '');
    const ultimoPunto = cifras.lastIndexOf('.');
    const ultimaComa = cifras.lastIndexOf(',');
    let decimal = null;
    if (ultimoPunto >= 0 && ultimaComa >= 0) {
        decimal = ultimoPunto > ultimaComa ? '.' : ',';
    } else if (ultimaComa >= 0) {
        // «1,234» (miles en inglés) frente a «1,5» o «12,50» (decimales en español)
        decimal = /^\d{1,3}(,\d{3})+$/.test(cifras) ? null : ',';
    } else if (ultimoPunto >= 0) {
        decimal = /^\d{1,3}(\.\d{3})+$/.test(cifras) ? null : '.';
    }
    const miles = decimal === ',' ? '.' : decimal === '.' ? ',' : /[.]/.test(cifras) ? '.' : ',';
    cifras = cifras.split(miles).join('');
    if (decimal === ',') {
        cifras = cifras.replace(',', '.');
    }
    if (!/^\d+(\.\d+)?$/.test(cifras)) {
        return null;
    }
    const signo = m[1] && m[1] !== '+' ? -1 : 1;
    const porcentaje = m[3] === '%';
    const decimales = cifras.includes('.') ? cifras.split('.')[1].length : 0;
    const valor = signo * Number(cifras);
    return { valor: porcentaje ? valor / 100 : valor, porcentaje, decimales, moneda: m[3] === '€' || m[3] === 'EUR' || /[€$£]/.test(limpio) && !porcentaje };
}
