// Fecha: 2026-10-12
// Ruta: /src/motor/marcas.js
// Números de página, encabezados y pies, y marcas de agua (texto o imagen) dentro del worker de MuPDF
// Se escriben como contenido de la página (los ve y los imprime cualquier lector); pasan por el journal
// Notas: se coloca en el espacio de la página tal como se ve, así sale derecho también en páginas giradas.
//        Plantillas: {n} número, {total} total, {fecha} fecha de hoy, {nombre} nombre del documento.

import * as mupdf from 'mupdf';
import { fuenteHelvetica, textoPdf, anchoTexto, num, matrizPagina, ponerRecurso, estadoOpacidad, anadirContenido } from './contenido.js';

const FUENTE = 'FDNNS';
const FUENTE_NEGRITA = 'FDNNSB';
const ESTADO = 'GSDNNS';
const IMAGEN = 'IMDNNS';

function rellenar(plantilla, valores) {
    return plantilla.replace(/\{(n|total|fecha|nombre)\}/g, (_, clave) => String(valores[clave] ?? ''));
}

// [r, g, b] entre 0 y 1
const colorPdf = (color = [0, 0, 0]) => color.map(num).join(' ');

// x de la línea base según la alineación de la posición ('arriba-izquierda', 'abajo-centro'...)
function colocarTexto(posicion, ancho, alto, anchoTexto, tamano, margen) {
    const [vertical, horizontal] = posicion.split('-');
    const x = horizontal === 'izquierda' ? margen : horizontal === 'derecha' ? ancho - margen - anchoTexto : (ancho - anchoTexto) / 2;
    const y = vertical === 'arriba' ? margen + tamano * 0.8 : alto - margen;
    return [x, y];
}

export function crearModuloMarcas(exigirDocumento, marcarCambio) {
    function enOperacion(nombre, trabajo) {
        const doc = exigirDocumento();
        doc.beginOperation(nombre);
        try {
            const resultado = trabajo(doc);
            marcarCambio();
            return resultado;
        } finally {
            doc.endOperation();
        }
    }

    return {
        // paginas: índices desde 0; el número que se escribe empieza en «inicio» y sigue el orden de la lista
        numerar({ paginas, plantilla = '{n}', posicion = 'abajo-centro', tamano = 10, margen = 28, inicio = 1, color, negrita = false, nombre = '', fecha = '' }) {
            return enOperacion('numerar', (doc) => {
                const fuente = doc.addSimpleFont(fuenteHelvetica(negrita), 'Latin');
                const clave = negrita ? FUENTE_NEGRITA : FUENTE;
                const total = inicio + paginas.length - 1;
                paginas.forEach((pagina, i) => {
                    const objeto = doc.findPage(pagina);
                    const { matriz, ancho, alto } = matrizPagina(doc, pagina);
                    const texto = rellenar(plantilla, { n: inicio + i, total, fecha, nombre });
                    const [x, y] = colocarTexto(posicion, ancho, alto, anchoTexto(texto, negrita) * tamano, tamano, margen);
                    ponerRecurso(doc, objeto, 'Font', clave, fuente);
                    anadirContenido(doc, objeto, [
                        `q ${matriz.map(num).join(' ')} cm ${colorPdf(color)} rg BT /${clave} 1 Tf`,
                        `${num(tamano)} 0 0 ${num(-tamano)} ${num(x)} ${num(y)} Tm (${textoPdf(texto)}) Tj ET Q`
                    ].join('\n'));
                });
                return { paginas: paginas.length };
            });
        },

        // Texto en diagonal (o con el ángulo pedido) centrado; o una imagen centrada con su escala.
        // debajo: detrás del contenido de la página (no tapa el texto; en escaneados no se vería)
        marcaAgua({ paginas, texto = '', imagen = null, tamano = 60, opacidad = 0.25, color = [0.8, 0, 0], angulo = 45, escala = 0.5, debajo = false }) {
            return enOperacion('marca de agua', (doc) => {
                const estado = estadoOpacidad(doc, opacidad);
                const fuente = texto ? doc.addSimpleFont(fuenteHelvetica(true), 'Latin') : null;
                const imagenPdf = imagen ? doc.addImage(new mupdf.Image(imagen)) : null;
                let proporcion = 1;
                if (imagenPdf) {
                    const muestra = new mupdf.Image(imagen);
                    proporcion = muestra.getHeight() / muestra.getWidth();
                }
                for (const pagina of paginas) {
                    const objeto = doc.findPage(pagina);
                    const { matriz, ancho, alto } = matrizPagina(doc, pagina);
                    ponerRecurso(doc, objeto, 'ExtGState', ESTADO, estado);
                    // Centro de la página, girado: en el espacio que se ve el giro positivo va hacia arriba
                    const radianes = (-angulo * Math.PI) / 180;
                    const cos = Math.cos(radianes);
                    const sen = Math.sin(radianes);
                    const partes = [`q ${matriz.map(num).join(' ')} cm /${ESTADO} gs 1 0 0 1 ${num(ancho / 2)} ${num(alto / 2)} cm ${num(cos)} ${num(sen)} ${num(-sen)} ${num(cos)} 0 0 cm`];
                    if (imagenPdf) {
                        ponerRecurso(doc, objeto, 'XObject', IMAGEN, imagenPdf);
                        const w = Math.min(ancho, alto) * escala;
                        const h = w * proporcion;
                        // La imagen se pinta en el cuadrado unidad con la y hacia arriba: se da la vuelta
                        partes.push(`q ${num(w)} 0 0 ${num(-h)} ${num(-w / 2)} ${num(h / 2)} cm /${IMAGEN} Do Q`);
                    }
                    if (texto) {
                        ponerRecurso(doc, objeto, 'Font', FUENTE_NEGRITA, fuente);
                        const anchoLetras = anchoTexto(texto, true) * tamano;
                        partes.push(`${colorPdf(color)} rg BT /${FUENTE_NEGRITA} 1 Tf ${num(tamano)} 0 0 ${num(-tamano)} ${num(-anchoLetras / 2)} ${num(tamano * 0.35)} Tm (${textoPdf(texto)}) Tj ET`);
                    }
                    partes.push('Q');
                    anadirContenido(doc, objeto, partes.join('\n'), { debajo });
                }
                return { paginas: paginas.length };
            });
        }
    };
}
