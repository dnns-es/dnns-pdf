// Fecha: 2026-10-12
// Ruta: /src/motor/ocr.js
// OCR dentro del worker de MuPDF: añade el texto reconocido como capa invisible sobre la página
// La imagen de la página no cambia; el texto queda debajo, sin verse, para buscar, seleccionar y copiar
// Notas: el reconocimiento (Tesseract) se hace fuera, en el hilo de la interfaz; aquí solo llegan las palabras
//        con su caja en puntos de página (origen arriba a la izquierda). Se escribe con Helvetica en WinAnsi
//        y modo de texto 3 (invisible), ajustando cada palabra a su caja. Pasa por el journal: se puede deshacer.

import * as mupdf from 'mupdf';

const NOMBRE_FUENTE = 'FOCR';
// Parte de la caja de una palabra que queda bajo la línea base (aprox.: descendentes)
const BAJO_LINEA = 0.2;
// Caracteres de WinAnsi fuera de Latin-1
const WINANSI = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };

function codigoWinAnsi(c) {
    const codigo = c.codePointAt(0);
    if (WINANSI[c]) {
        return WINANSI[c];
    }
    return codigo >= 32 && codigo <= 255 && !(codigo >= 127 && codigo < 160) ? codigo : 63;
}

function textoPdf(texto) {
    return [...texto].map((c) => {
        const codigo = codigoWinAnsi(c);
        if (c === '(' || c === ')' || c === '\\') {
            return `\\${c}`;
        }
        return codigo > 126 || codigo < 32 ? `\\${codigo.toString(8).padStart(3, '0')}` : String.fromCharCode(codigo);
    }).join('');
}

const num = (valor) => Number(valor.toFixed(3));

export function crearModuloOcr(exigirDocumento, marcarCambio) {
    let fuente = null;

    // Ancho de la palabra en Helvetica a cuerpo 1, para estirarla o encogerla hasta su caja
    function anchoNatural(texto) {
        fuente ??= new mupdf.Font('Helvetica');
        let ancho = 0;
        for (const c of texto) {
            ancho += fuente.advanceGlyph(fuente.encodeCharacter(c));
        }
        return ancho || 0.5;
    }

    // La página puede heredar los recursos del árbol: se le ponen propios para añadir la fuente
    function recursosPropios(doc, objetoPagina) {
        let recursos = objetoPagina.get('Resources');
        if (recursos.isNull()) {
            const heredados = objetoPagina.getInheritable('Resources');
            recursos = doc.newDictionary();
            if (!heredados.isNull()) {
                heredados.forEach((valor, clave) => recursos.put(clave, valor));
            }
            objetoPagina.put('Resources', recursos);
        }
        if (recursos.get('Font').isNull()) {
            recursos.put('Font', doc.newDictionary());
        }
        return recursos;
    }

    // Contenido original entre q/Q para que su estado gráfico no afecte al texto añadido
    function anadirContenido(doc, objetoPagina, contenido) {
        const anterior = objetoPagina.get('Contents');
        const lista = doc.newArray();
        lista.push(doc.addStream('q\n', {}));
        if (anterior.isArray()) {
            anterior.forEach((parte) => lista.push(parte));
        } else if (!anterior.isNull()) {
            lista.push(anterior);
        }
        lista.push(doc.addStream('\nQ\n', {}));
        lista.push(doc.addStream(contenido, {}));
        objetoPagina.put('Contents', lista);
    }

    function contenidoDe(palabras, deFitzAPdf) {
        const lineas = [`q ${deFitzAPdf.map(num).join(' ')} cm BT 3 Tr /${NOMBRE_FUENTE} 1 Tf`];
        for (const { texto, x0, y0, x1, y1 } of palabras) {
            const limpio = texto.trim();
            const alto = y1 - y0;
            if (!limpio || alto <= 0 || x1 <= x0) {
                continue;
            }
            const cuerpo = alto;
            const estirar = (x1 - x0) / (anchoNatural(limpio) * cuerpo);
            const base = y1 - alto * BAJO_LINEA;
            // En el espacio de la página la y crece hacia abajo: la matriz de texto la da la vuelta
            lineas.push(`${num(cuerpo * estirar)} 0 0 ${num(-cuerpo)} ${num(x0)} ${num(base)} Tm (${textoPdf(limpio)}) Tj`);
        }
        lineas.push('ET Q');
        return lineas.join('\n');
    }

    return {
        // palabras: [{ texto, x0, y0, x1, y1 }] en puntos de página
        anadirTexto({ pagina, palabras }) {
            const doc = exigirDocumento();
            if (!palabras?.length) {
                return { palabras: 0 };
            }
            doc.beginOperation('OCR');
            try {
                const objetoPagina = doc.findPage(pagina);
                const paginaMupdf = doc.loadPage(pagina);
                const deFitzAPdf = mupdf.Matrix.invert(paginaMupdf.getTransform());
                paginaMupdf.destroy();
                const recursos = recursosPropios(doc, objetoPagina);
                fuente ??= new mupdf.Font('Helvetica');
                recursos.get('Font').put(NOMBRE_FUENTE, doc.addSimpleFont(fuente, 'Latin'));
                anadirContenido(doc, objetoPagina, contenidoDe(palabras, deFitzAPdf));
                marcarCambio();
                return { palabras: palabras.length };
            } finally {
                doc.endOperation();
            }
        }
    };
}
