// Fecha: 2026-10-12
// Ruta: /src/motor/comprimir.js
// Comprimir el PDF dentro del worker: reduce y recomprime las imágenes, recorta las fuentes y limpia el archivo
// Devuelve un PDF nuevo; el documento abierto no se toca (se trabaja sobre una copia)
// Notas: las imágenes con transparencia, las máscaras de 1 bit y las pequeñas se dejan como están; una imagen
//        solo se sustituye si la versión nueva pesa menos. Niveles: cuánto se reduce el lado mayor y la calidad JPEG.

import * as mupdf from 'mupdf';

export const NIVELES = {
    ligero: { lado: 2400, calidad: 80 },
    medio: { lado: 1600, calidad: 65 },
    fuerte: { lado: 1000, calidad: 50 }
};
const LADO_MINIMO = 64;
const GUARDADO = 'garbage=compact,compress=yes,compress-images=yes,compress-fonts=yes';

function esImagenTratable(ref) {
    const subtipo = ref.get('Subtype');
    if (subtipo.isNull() || !subtipo.isName() || subtipo.asName() !== 'Image') {
        return false;
    }
    const mascara = ref.get('ImageMask');
    const bits = ref.get('BitsPerComponent');
    if ((!mascara.isNull() && mascara.asBoolean()) || (bits.isNumber() && bits.asNumber() === 1)) {
        return false;
    }
    // Con transparencia (SMask) o usada como máscara de otra: JPEG no guarda el alfa
    return ref.get('SMask').isNull() && ref.get('Mask').isNull();
}

function recomprimir(doc, ref, { lado, calidad }) {
    const ancho = ref.get('Width').asNumber();
    const alto = ref.get('Height').asNumber();
    if (Math.max(ancho, alto) < LADO_MINIMO) {
        return false;
    }
    const anterior = ref.readRawStream().asUint8Array().length;
    let pixmap = doc.loadImage(ref).toPixmap();
    // CMYK, indexadas, Lab...: a RGB o gris, que es lo que guarda JPEG sin sorpresas
    const espacio = pixmap.getColorSpace();
    if (!espacio || pixmap.getAlpha() || !(espacio.isGray() || espacio.isRGB())) {
        pixmap = pixmap.convertToColorSpace(espacio?.isGray() ? mupdf.ColorSpace.DeviceGray : mupdf.ColorSpace.DeviceRGB, false);
    }
    const escala = Math.min(1, lado / Math.max(ancho, alto));
    const nuevoAncho = Math.max(1, Math.round(ancho * escala));
    const nuevoAlto = Math.max(1, Math.round(alto * escala));
    if (escala < 1) {
        pixmap = pixmap.warp([[0, 0], [ancho, 0], [ancho, alto], [0, alto]], nuevoAncho, nuevoAlto);
    }
    const jpeg = pixmap.asJPEG(calidad, false);
    if (jpeg.length >= anterior) {
        return false;
    }
    ref.put('Width', nuevoAncho);
    ref.put('Height', nuevoAlto);
    ref.put('BitsPerComponent', 8);
    ref.put('ColorSpace', doc.newName(pixmap.getColorSpace().isGray() ? 'DeviceGray' : 'DeviceRGB'));
    ref.put('Filter', doc.newName('DCTDecode'));
    for (const clave of ['DecodeParms', 'Decode', 'Intent', 'Interpolate']) {
        ref.delete(clave);
    }
    ref.writeRawStream(jpeg);
    return true;
}

// bytes: el PDF actual (con los cambios sin guardar). Devuelve { bytes, antes, despues, imagenes }
export function comprimir(bytes, nivel = 'medio') {
    const ajustes = NIVELES[nivel] ?? NIVELES.medio;
    const doc = mupdf.Document.openDocument(bytes, 'application/pdf');
    try {
        let imagenes = 0;
        const total = doc.countObjects();
        for (let i = 1; i < total; i++) {
            const ref = doc.newIndirect(i);
            try {
                if (ref.isStream() && esImagenTratable(ref) && recomprimir(doc, ref, ajustes)) {
                    imagenes++;
                }
            } catch (error) {
                // Una imagen rara no debe impedir comprimir el resto
                console.warn(`Imagen ${i} sin comprimir:`, error?.message ?? error);
            }
        }
        try {
            doc.subsetFonts();
        } catch (error) {
            console.warn('No se pudieron recortar las fuentes:', error?.message ?? error);
        }
        const buffer = doc.saveToBuffer(GUARDADO);
        const salida = buffer.asUint8Array().slice();
        buffer.destroy();
        return { bytes: salida, antes: bytes.byteLength, despues: salida.length, imagenes, _transferir: [salida.buffer] };
    } finally {
        doc.destroy();
    }
}
