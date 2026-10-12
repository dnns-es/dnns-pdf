// Fecha: 2026-10-12
// Ruta: /src/modulos/firmar/almacen.js
// Firmas guardadas para reutilizarlas
// Guarda, lista y borra firmas (PNG en base64) en el almacenamiento local del navegador
// Notas: se quedan solo en este dispositivo. Si el navegador no deja guardar (modo privado), no pasa nada.

const CLAVE = 'dnns-pdf:firmas';
const MAXIMO = 6;

export function listarFirmas() {
    try {
        const lista = JSON.parse(localStorage.getItem(CLAVE) ?? '[]');
        return Array.isArray(lista) ? lista : [];
    } catch {
        return [];
    }
}

function escribir(lista) {
    try {
        localStorage.setItem(CLAVE, JSON.stringify(lista));
    } catch (error) {
        console.warn('No se pudo guardar la firma:', error);
    }
}

export function guardarFirma(png, ancho, alto) {
    let binario = '';
    for (const byte of png) {
        binario += String.fromCharCode(byte);
    }
    const firma = { id: Date.now().toString(36), datos: `data:image/png;base64,${btoa(binario)}`, ancho, alto };
    escribir([firma, ...listarFirmas()].slice(0, MAXIMO));
    return firma;
}

export function borrarFirma(id) {
    escribir(listarFirmas().filter((f) => f.id !== id));
}

export function pngDe(firma) {
    const binario = atob(firma.datos.split(',')[1]);
    return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}
