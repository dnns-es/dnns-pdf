// Fecha: 2026-10-12
// Ruta: /src/motor/contenido.js
// Ayudas para añadir contenido propio a una página PDF (texto del OCR, números de página, marcas de agua)
// Recursos propios de la página, contenido original protegido con q/Q, cadenas en WinAnsi y anchos de Helvetica
// Notas: se dibuja en el espacio de la página tal como se ve (origen arriba a la izquierda, y hacia abajo);
//        matrizPagina() da la matriz que lo pasa al espacio PDF, también en páginas giradas.

import * as mupdf from 'mupdf';

// Caracteres de WinAnsi fuera de Latin-1
const WINANSI = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };

let helvetica = null;
let helveticaNegrita = null;

export function fuenteHelvetica(negrita = false) {
    if (negrita) {
        helveticaNegrita ??= new mupdf.Font('Helvetica-Bold');
        return helveticaNegrita;
    }
    helvetica ??= new mupdf.Font('Helvetica');
    return helvetica;
}

function codigoWinAnsi(c) {
    if (WINANSI[c]) {
        return WINANSI[c];
    }
    const codigo = c.codePointAt(0);
    return codigo >= 32 && codigo <= 255 && !(codigo >= 127 && codigo < 160) ? codigo : 63;
}

// Texto para un string PDF en WinAnsi: lo que no es ASCII va en octal
export function textoPdf(texto) {
    return [...texto].map((c) => {
        if (c === '(' || c === ')' || c === '\\') {
            return `\\${c}`;
        }
        const codigo = codigoWinAnsi(c);
        return codigo > 126 ? `\\${codigo.toString(8).padStart(3, '0')}` : String.fromCharCode(codigo);
    }).join('');
}

// Las 12 fuentes estándar de texto de PDF (no hace falta incrustarlas): familia sans, serif o mono
const ESTANDAR = {
    sans: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'],
    serif: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'],
    mono: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique']
};
const fuentesEstandar = new Map();

export function nombreFuenteEstandar(familia = 'sans', negrita = false, cursiva = false) {
    return (ESTANDAR[familia] ?? ESTANDAR.sans)[(negrita ? 1 : 0) + (cursiva ? 2 : 0)];
}

export function fuenteEstandar(nombre) {
    if (!fuentesEstandar.has(nombre)) {
        fuentesEstandar.set(nombre, new mupdf.Font(nombre));
    }
    return fuentesEstandar.get(nombre);
}

// Ancho del texto a cuerpo 1 (en unidades de cuerpo). fuente: un mupdf.Font; por defecto Helvetica
export function anchoTexto(texto, negrita = false, fuente = fuenteHelvetica(negrita)) {
    let ancho = 0;
    for (const c of texto) {
        ancho += fuente.advanceGlyph(fuente.encodeCharacter(c));
    }
    return ancho;
}

export const num = (valor) => Number(valor.toFixed(3));

// Matriz del espacio de la página que se ve (fitz) al espacio PDF, y tamaño visible de la página
export function matrizPagina(doc, numero) {
    const pagina = doc.loadPage(numero);
    try {
        const [x0, y0, x1, y1] = pagina.getBounds();
        return { matriz: mupdf.Matrix.invert(pagina.getTransform()), ancho: x1 - x0, alto: y1 - y0 };
    } finally {
        pagina.destroy();
    }
}

// La página puede heredar los recursos del árbol: se le ponen propios para poder añadir
export function recursosPropios(doc, objetoPagina) {
    let recursos = objetoPagina.get('Resources');
    if (recursos.isNull()) {
        const heredados = objetoPagina.getInheritable('Resources');
        recursos = doc.newDictionary();
        if (!heredados.isNull()) {
            heredados.forEach((valor, clave) => recursos.put(clave, valor));
        }
        objetoPagina.put('Resources', recursos);
    }
    return recursos;
}

// Mete un recurso (fuente, imagen, estado gráfico) en la categoría pedida con un nombre propio
export function ponerRecurso(doc, objetoPagina, categoria, nombre, valor) {
    const recursos = recursosPropios(doc, objetoPagina);
    if (recursos.get(categoria).isNull()) {
        recursos.put(categoria, doc.newDictionary());
    }
    recursos.get(categoria).put(nombre, valor);
}

// Estado gráfico con opacidad (para marcas de agua)
export function estadoOpacidad(doc, opacidad) {
    const estado = doc.newDictionary();
    estado.put('Type', doc.newName('ExtGState'));
    estado.put('ca', opacidad);
    estado.put('CA', opacidad);
    return doc.addObject(estado);
}

// Contenido original entre q/Q para que su estado gráfico no afecte a lo añadido.
// debajo: el contenido nuevo va antes que el original (queda tapado por él)
export function anadirContenido(doc, objetoPagina, contenido, { debajo = false } = {}) {
    const anterior = objetoPagina.get('Contents');
    const lista = doc.newArray();
    if (debajo) {
        lista.push(doc.addStream(`q\n${contenido}\nQ\n`, {}));
    }
    lista.push(doc.addStream('q\n', {}));
    if (anterior.isArray()) {
        anterior.forEach((parte) => lista.push(parte));
    } else if (!anterior.isNull()) {
        lista.push(anterior);
    }
    lista.push(doc.addStream('\nQ\n', {}));
    if (!debajo) {
        lista.push(doc.addStream(contenido, {}));
    }
    objetoPagina.put('Contents', lista);
}
