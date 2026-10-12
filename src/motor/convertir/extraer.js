// Fecha: 2026-10-12
// Ruta: /src/motor/convertir/extraer.js
// Lee una página para convertirla a Word o Excel: bloques de texto con sus líneas, cada línea partida en
// trozos (donde hay un hueco grande, como entre celdas) y cada trozo en tramos del mismo estilo (letra,
// tamaño, negrita, cursiva, color); y las imágenes con su sitio.
// Notas: corre en el worker (usa MuPDF). Lo que devuelve son datos simples que se pueden pasar a la
//        interfaz, donde word.js y excel.js montan el archivo sin MuPDF.

import { imagenCodificada } from '../exportar.js';

// Hueco entre letras (en tamaños de letra) a partir del cual se corta en otro trozo
const HUECO_TROZO = 1.2;
// Una imagen que tapa casi toda la página con texto encima es un escaneado con OCR: se deja solo el texto
const COBERTURA_ESCANEADO = 0.8;

const redondear = (valor) => Math.round(valor * 100) / 100;

// Nombre de letra sin el prefijo de subconjunto (ABCDEF+) ni el estilo
function familiaDeLetra(nombre) {
    const limpio = String(nombre ?? '').replace(/^[A-Z]{6}\+/, '');
    const base = limpio.split(/[-,]/)[0].replace(/(PSMT|PS|MT)$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    const equivalencias = { Helvetica: 'Arial', 'Times': 'Times New Roman', 'Times Roman': 'Times New Roman', 'Times New Roman': 'Times New Roman', Courier: 'Courier New', 'Arial': 'Arial' };
    return equivalencias[base] ?? (base || 'Arial');
}

function colorHex(color) {
    if (!color?.length) {
        return '000000';
    }
    let rgb = color;
    if (color.length === 1) {
        rgb = [color[0], color[0], color[0]];
    } else if (color.length === 4) {
        const [c, m, y, k] = color;
        rgb = [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)];
    }
    return rgb.slice(0, 3).map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function cajaDeQuad(quad) {
    const xs = [quad[0], quad[2], quad[4], quad[6]];
    const ys = [quad[1], quad[3], quad[5], quad[7]];
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

const mismoEstilo = (a, b) => a.letra === b.letra && a.tamano === b.tamano && a.negrita === b.negrita && a.cursiva === b.cursiva && a.color === b.color;

// Línea (letras sueltas) -> trozos separados por huecos grandes, cada uno con tramos del mismo estilo
function trocear(letras) {
    const trozos = [];
    let trozo = null;
    let ultima = null;
    for (const letra of letras) {
        const espacio = /\s/.test(letra.c);
        const hueco = ultima ? letra.x0 - ultima.x1 : 0;
        if (!espacio && trozo && ultima && hueco > Math.max(3, ultima.tamano * HUECO_TROZO)) {
            trozos.push(trozo);
            trozo = null;
        }
        if (espacio && !trozo) {
            continue;
        }
        if (!trozo) {
            trozo = { x0: letra.x0, x1: letra.x1, y0: letra.y0, y1: letra.y1, tramos: [] };
        }
        const tramo = trozo.tramos.at(-1);
        if (tramo && mismoEstilo(tramo, letra.estilo)) {
            tramo.texto += letra.c;
        } else {
            trozo.tramos.push({ ...letra.estilo, texto: letra.c });
        }
        if (!espacio) {
            trozo.x1 = Math.max(trozo.x1, letra.x1);
            trozo.y0 = Math.min(trozo.y0, letra.y0);
            trozo.y1 = Math.max(trozo.y1, letra.y1);
            ultima = letra;
        }
    }
    if (trozo) {
        trozos.push(trozo);
    }
    for (const t of trozos) {
        // Sin espacios colgando al final
        const fin = t.tramos.at(-1);
        fin.texto = fin.texto.replace(/\s+$/, '');
        t.tramos = t.tramos.filter((tramo) => tramo.texto);
        t.texto = t.tramos.map((tramo) => tramo.texto).join('');
        t.x0 = redondear(t.x0);
        t.x1 = redondear(t.x1);
        t.y0 = redondear(t.y0);
        t.y1 = redondear(t.y1);
    }
    return trozos.filter((t) => t.texto);
}

export function extraerPagina(pagina) {
    const [px0, py0, px1, py1] = pagina.getBounds();
    const ancho = px1 - px0;
    const alto = py1 - py0;
    const bloques = [];
    let bloque = null;
    let linea = null;
    const texto = pagina.toStructuredText('preserve-whitespace,preserve-images');
    try {
        texto.walk({
            beginTextBlock(bbox) {
                bloque = { tipo: 'texto', rect: bbox.map(redondear), lineas: [] };
            },
            beginLine(bbox, wmode) {
                linea = wmode === 0 ? { rect: bbox.map(redondear), letras: [], base: null } : null;
            },
            onChar(c, origen, fuente, tamano, quad, color) {
                if (!linea) {
                    return;
                }
                const [x0, y0, x1, y1] = cajaDeQuad(quad);
                linea.base ??= redondear(origen[1]);
                linea.letras.push({
                    c, x0, y0, x1, y1, tamano,
                    estilo: {
                        letra: familiaDeLetra(fuente.getName()),
                        tamano: Math.round(tamano * 2) / 2,
                        negrita: fuente.isBold() || /bold|black|heavy/i.test(fuente.getName()),
                        cursiva: fuente.isItalic() || /italic|oblique/i.test(fuente.getName()),
                        color: colorHex(color)
                    }
                });
            },
            endLine() {
                if (linea && bloque) {
                    const trozos = trocear(linea.letras);
                    if (trozos.length) {
                        bloque.lineas.push({ rect: linea.rect, base: linea.base, trozos });
                    }
                }
                linea = null;
            },
            endTextBlock() {
                if (bloque?.lineas.length) {
                    bloques.push(bloque);
                }
                bloque = null;
            },
            onImageBlock(bbox, transformacion, imagen) {
                const rect = bbox.map(redondear);
                const codificada = imagenCodificada(imagen);
                if (codificada) {
                    bloques.push({ tipo: 'imagen', rect, ...codificada });
                }
            }
        });
    } finally {
        texto.destroy();
    }
    // Escaneado con texto reconocido (OCR): la imagen de fondo sobra, ya está el texto
    const hayTexto = bloques.some((b) => b.tipo === 'texto');
    const filtrados = bloques.filter((b) => {
        if (b.tipo !== 'imagen' || !hayTexto) {
            return true;
        }
        const [x0, y0, x1, y1] = b.rect;
        return ((x1 - x0) * (y1 - y0)) / (ancho * alto) < COBERTURA_ESCANEADO;
    });
    return { ancho: redondear(ancho), alto: redondear(alto), bloques: filtrados };
}
