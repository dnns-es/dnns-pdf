// Fecha: 2026-10-12
// Ruta: /src/modulos/anotar/herramientas.js
// Herramientas de dibujo de la capa de anotación
// Lápiz, formas (rectángulo, círculo, línea, flecha), cuadro de texto, nota y sello
// Notas: cada herramienta recibe puntos en coordenadas de página (puntos PDF, origen arriba-izquierda)
//        y devuelve los datos que el worker necesita para crear la anotación. La vista previa se dibuja
//        en SVG mientras se arrastra; MuPDF pinta la versión definitiva al repintar la página.

import { colorAMupdf } from './anotar.js';
import { pedirTexto } from '../../ui/dialogos.js';

const SVG = 'http://www.w3.org/2000/svg';
const ANCHO_TEXTO = 220;
const LADO_NOTA = 20;
const ANCHO_SELLO = 200;
const ALTO_SELLO = 60;
const DISTANCIA_MINIMA = 2;
const ANCHO_FIRMA = 150;
const ALTO_MAXIMO_FIRMA = 70;

function elementoSvg(nombre, atributos) {
    const elemento = document.createElementNS(SVG, nombre);
    for (const [clave, valor] of Object.entries(atributos)) {
        elemento.setAttribute(clave, valor);
    }
    return elemento;
}

function estiloTrazo(ajustes) {
    return { stroke: ajustes.color, 'stroke-width': ajustes.grosor, 'stroke-opacity': ajustes.opacidad, fill: 'none' };
}

function rectDesde(a, b) {
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
}

function comunes(ajustes) {
    return { color: colorAMupdf(ajustes.color), grosor: ajustes.grosor, opacidad: ajustes.opacidad };
}

// ---- Herramientas de arrastre: empezar(punto) -> mover(punto) -> terminar(punto) => datos | null

export const lapiz = {
    empezar(punto, capa, ajustes) {
        const linea = elementoSvg('polyline', { ...estiloTrazo(ajustes), 'stroke-linecap': 'round', 'stroke-linejoin': 'round', points: punto.join(',') });
        capa.append(linea);
        return { puntos: [punto], linea };
    },
    mover(punto, estado) {
        const ultimo = estado.puntos.at(-1);
        if (Math.hypot(punto[0] - ultimo[0], punto[1] - ultimo[1]) < DISTANCIA_MINIMA) {
            return;
        }
        estado.puntos.push(punto);
        estado.linea.setAttribute('points', estado.puntos.map((p) => p.join(',')).join(' '));
    },
    terminar(punto, estado, ajustes) {
        estado.linea.remove();
        if (estado.puntos.length < 2) {
            return null;
        }
        return { trazos: [estado.puntos], ...comunes(ajustes) };
    }
};

function herramientaDeForma(crearVista, datosFinales) {
    return {
        empezar(punto, capa, ajustes) {
            const vista = crearVista(punto, punto, ajustes);
            capa.append(vista);
            return { origen: punto, vista, ajustes };
        },
        mover(punto, estado) {
            const nueva = crearVista(estado.origen, punto, estado.ajustes);
            estado.vista.replaceWith(nueva);
            estado.vista = nueva;
        },
        terminar(punto, estado, ajustes) {
            estado.vista.remove();
            if (Math.hypot(punto[0] - estado.origen[0], punto[1] - estado.origen[1]) < DISTANCIA_MINIMA * 2) {
                return null;
            }
            return datosFinales(estado.origen, punto, ajustes);
        }
    };
}

export const rectangulo = herramientaDeForma(
    (a, b, ajustes) => {
        const [x0, y0, x1, y1] = rectDesde(a, b);
        return elementoSvg('rect', { ...estiloTrazo(ajustes), x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
    },
    (a, b, ajustes) => ({ rect: rectDesde(a, b), ...comunes(ajustes) })
);

export const circulo = herramientaDeForma(
    (a, b, ajustes) => {
        const [x0, y0, x1, y1] = rectDesde(a, b);
        return elementoSvg('ellipse', { ...estiloTrazo(ajustes), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rx: (x1 - x0) / 2, ry: (y1 - y0) / 2 });
    },
    (a, b, ajustes) => ({ rect: rectDesde(a, b), ...comunes(ajustes) })
);

export const linea = herramientaDeForma(
    (a, b, ajustes) => elementoSvg('line', { ...estiloTrazo(ajustes), x1: a[0], y1: a[1], x2: b[0], y2: b[1] }),
    (a, b, ajustes) => ({ linea: [a, b], ...comunes(ajustes) })
);

export const flecha = herramientaDeForma(
    (a, b, ajustes) => elementoSvg('line', { ...estiloTrazo(ajustes), x1: a[0], y1: a[1], x2: b[0], y2: b[1], 'marker-end': 'url(#punta-flecha)' }),
    (a, b, ajustes) => ({ linea: [a, b], flecha: true, ...comunes(ajustes) })
);

// ---- Herramientas de clic: colocar(punto) => datos | null (pueden pedir texto)

export const texto = {
    async colocar(punto, ajustes) {
        const contenido = await pedirTexto('anotar.pedirTexto');
        if (!contenido) {
            return null;
        }
        const lineas = contenido.split('\n').length;
        const alto = ajustes.tamanoFuente * 1.4 * lineas + 8;
        return {
            rect: [punto[0], punto[1], punto[0] + ANCHO_TEXTO, punto[1] + alto],
            contenido,
            tamanoFuente: ajustes.tamanoFuente,
            color: colorAMupdf(ajustes.color),
            opacidad: ajustes.opacidad
        };
    }
};

export const nota = {
    async colocar(punto, ajustes) {
        const contenido = await pedirTexto('anotar.pedirNota');
        if (!contenido) {
            return null;
        }
        return {
            rect: [punto[0], punto[1], punto[0] + LADO_NOTA, punto[1] + LADO_NOTA],
            icono: 'Comment',
            contenido,
            color: colorAMupdf(ajustes.color)
        };
    }
};

export const sello = {
    colocar(punto, ajustes) {
        return {
            rect: [punto[0] - ANCHO_SELLO / 2, punto[1] - ALTO_SELLO / 2, punto[0] + ANCHO_SELLO / 2, punto[1] + ALTO_SELLO / 2],
            sello: ajustes.sello,
            contenido: ajustes.sello,
            color: colorAMupdf(ajustes.color),
            opacidad: ajustes.opacidad
        };
    }
};

// La firma llega hecha desde el módulo Firmar (ajustes.firma); aquí solo se le da sitio y tamaño
export const firma = {
    colocar(punto, ajustes) {
        if (!ajustes.firma) {
            return null;
        }
        const { png, ancho, alto } = ajustes.firma;
        let w = ANCHO_FIRMA;
        let h = (w * alto) / ancho;
        if (h > ALTO_MAXIMO_FIRMA) {
            h = ALTO_MAXIMO_FIRMA;
            w = (h * ancho) / alto;
        }
        // Copia: el mismo PNG puede colocarse varias veces y el original se cede al worker
        return { rect: [punto[0] - w / 2, punto[1] - h / 2, punto[0] + w / 2, punto[1] + h / 2], imagen: png.slice() };
    }
};

export const DE_ARRASTRE = { lapiz, rectangulo, circulo, linea, flecha };
// Toque sin anotación: capaAnotaciones avisa con 'anotar:punto'
const punto = { colocar: () => null };

export const DE_CLIC = { texto, nota, sello, firma, punto };
export const DE_TEXTO = new Set(['resaltar', 'subrayar', 'tachar']);
