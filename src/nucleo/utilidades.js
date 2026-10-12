// Fecha: 2026-10-12
// Ruta: /src/nucleo/utilidades.js
// Pequeñas utilidades compartidas
// Retardo de llamadas, límites numéricos, descarga de archivos y tipo de un archivo por su contenido

import { pareceTexto } from '../motor/oficina/texto.js';

// Espera a que paren las llamadas seguidas (redimensionar, zoom con rueda...) antes de ejecutar
export function retrasar(funcion, espera) {
    let temporizador = null;
    return (...argumentos) => {
        clearTimeout(temporizador);
        temporizador = setTimeout(() => funcion(...argumentos), espera);
    };
}

export function limitar(valor, minimo, maximo) {
    return Math.min(maximo, Math.max(minimo, valor));
}

export function descargarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.append(enlace);
    enlace.click();
    enlace.remove();
    // Dar margen al navegador para empezar la descarga antes de liberar la URL
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const BYTES_CABECERA = 1024;
const EXTENSIONES_TEXTO = /\.(txt|rtf|py|js|mjs|ts|json|xml|html?|css|java|c|h|cpp|cs|go|rs|php|rb|sh|bat|ps1|sql|ini|cfg|yaml|yml|csv|md|log)$/i;

// Qué es un archivo elegido por el usuario, mirando primero su contenido (Android renombra a .pdf lo que
// abre con la app): 'pdf', 'zip' (documentos de Office), 'rtf', 'imagen', 'texto' o null si no es nada de eso
export async function tipoDeArchivo(archivo) {
    const cabecera = new Uint8Array(await archivo.slice(0, BYTES_CABECERA).arrayBuffer());
    const inicio = String.fromCharCode(...cabecera.subarray(0, 8));
    if (inicio.startsWith('PK\x03\x04')) {
        return 'zip';
    }
    if (inicio.startsWith('{\\rtf')) {
        return 'rtf';
    }
    if (/^(BM|\x89PNG|\xff\xd8\xff)/.test(inicio)) {
        return 'imagen';
    }
    // Algunos PDF traen basura antes de '%PDF-'; MuPDF los abre igual, así que se busca en el primer KB
    if (String.fromCharCode(...cabecera).includes('%PDF-')) {
        return 'pdf';
    }
    if (EXTENSIONES_TEXTO.test(archivo.name) || /^text\//.test(archivo.type)) {
        return 'texto';
    }
    const diceSerPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name);
    if (pareceTexto(cabecera)) {
        return 'texto';
    }
    return diceSerPdf ? 'pdf' : null;
}

// Un atajo de teclado no debe saltar mientras se escribe en un campo
export function escribiendoEnCampo(evento) {
    const objetivo = evento.target;
    return objetivo instanceof HTMLInputElement || objetivo instanceof HTMLTextAreaElement
        || objetivo instanceof HTMLSelectElement || objetivo?.isContentEditable;
}
