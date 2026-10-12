// Fecha: 2026-10-12
// Ruta: /src/motor/exportar.js
// Exportar dentro del worker de MuPDF: páginas como imagen (PNG o JPG), el texto del documento y las
// imágenes que lleva dentro
// Notas: se trabaja página a página para que la interfaz pueda enseñar el avance y cancelar. Las imágenes
//        repetidas (un logotipo en todas las páginas) se sacan una sola vez.

import * as mupdf from 'mupdf';

const MAX_PIXELES = 60_000_000;
const CALIDAD_JPG = 90;
// Imágenes grandes y sin transparencia: JPG; el resto, PNG (sin pérdida)
const LADO_PARA_JPG = 600;

function conPagina(doc, numero, trabajo) {
    const pagina = doc.loadPage(numero);
    try {
        return trabajo(pagina);
    } finally {
        pagina.destroy();
    }
}

// Huella rápida de los píxeles (FNV-1a sobre una muestra) para no repetir imágenes
function huella(pixmap) {
    const pixeles = pixmap.getPixels();
    const paso = Math.max(1, Math.floor(pixeles.length / 4096));
    let h = 0x811c9dc5;
    for (let i = 0; i < pixeles.length; i += paso) {
        h ^= pixeles[i];
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return `${pixmap.getWidth()}x${pixmap.getHeight()}:${h.toString(16)}`;
}

// Copia propia: lo que da MuPDF es una vista de su memoria y no se puede ceder a la interfaz
function codificar(pixmap, formato, calidad = CALIDAD_JPG) {
    return (formato === 'jpg' ? pixmap.asJPEG(calidad, false) : pixmap.asPNG()).slice();
}

// Imagen del PDF lista para guardar: { formato: 'png'|'jpg', bytes, ancho, alto }. vistas: huellas ya sacadas
// (si se repite devuelve null). null también si no se puede (máscaras sueltas, formatos raros)
export function imagenCodificada(imagen, vistas = null) {
    let pixmap = null;
    try {
        pixmap = imagen.toPixmap();
        // CMYK, escala de grises con paleta, etc.: todo a RGB para poder guardarlo
        const componentes = pixmap.getColorSpace()?.getNumberOfComponents?.();
        if (componentes !== 3 && componentes !== 1) {
            const convertida = pixmap.convertToColorSpace(mupdf.ColorSpace.DeviceRGB, Boolean(pixmap.getAlpha?.()));
            pixmap.destroy();
            pixmap = convertida;
        }
        if (vistas) {
            const clave = huella(pixmap);
            if (vistas.has(clave)) {
                return null;
            }
            vistas.add(clave);
        }
        const conAlfa = Boolean(pixmap.getAlpha?.());
        const grande = Math.max(pixmap.getWidth(), pixmap.getHeight()) >= LADO_PARA_JPG;
        const formato = grande && !conAlfa ? 'jpg' : 'png';
        return { formato, bytes: codificar(pixmap, formato), ancho: pixmap.getWidth(), alto: pixmap.getHeight() };
    } catch (error) {
        console.warn('Imagen que no se puede exportar:', error);
        return null;
    } finally {
        pixmap?.destroy();
    }
}

export function crearModuloExportar(exigirDocumento) {
    return {
        // Una página como imagen a los ppp pedidos (con tope de memoria)
        paginaImagen({ pagina, ppp = 150, formato = 'png', calidad = CALIDAD_JPG }) {
            return conPagina(exigirDocumento(), pagina, (objeto) => {
                const [x0, y0, x1, y1] = objeto.getBounds();
                let escala = ppp / 72;
                const pixeles = (x1 - x0) * (y1 - y0) * escala * escala;
                if (pixeles > MAX_PIXELES) {
                    escala *= Math.sqrt(MAX_PIXELES / pixeles);
                }
                // JPG no tiene transparencia: siempre sobre blanco
                const pixmap = objeto.toPixmap(mupdf.Matrix.scale(escala, escala), mupdf.ColorSpace.DeviceRGB, false, true);
                try {
                    return { bytes: codificar(pixmap, formato, calidad) };
                } finally {
                    pixmap.destroy();
                }
            });
        },

        // Texto de una página tal como se lee
        paginaTexto({ pagina }) {
            return conPagina(exigirDocumento(), pagina, (objeto) => {
                const texto = objeto.toStructuredText('preserve-whitespace');
                try {
                    return { texto: texto.asText() };
                } finally {
                    texto.destroy();
                }
            });
        },

        // Imágenes de una página; vistas: huellas ya sacadas en páginas anteriores (se devuelven ampliadas)
        paginaImagenes({ pagina, vistas = [] }) {
            const yaVistas = new Set(vistas);
            const imagenes = [];
            conPagina(exigirDocumento(), pagina, (objeto) => {
                const texto = objeto.toStructuredText('preserve-images');
                try {
                    texto.walk({
                        onImageBlock(bbox, transformacion, imagen) {
                            const codificada = imagenCodificada(imagen, yaVistas);
                            if (codificada) {
                                imagenes.push(codificada);
                            }
                        }
                    });
                } finally {
                    texto.destroy();
                }
            });
            return { imagenes, vistas: [...yaVistas] };
        }
    };
}
