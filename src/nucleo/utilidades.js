// Fecha: 2026-10-12
// Ruta: /src/nucleo/utilidades.js
// Pequeñas utilidades compartidas
// Retardo de llamadas, límites numéricos y descarga de archivos

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

// Un atajo de teclado no debe saltar mientras se escribe en un campo
// Los documentos de texto, hojas y presentaciones (.docx, .xlsx, .pptx) son ZIP: empiezan por «PK»
export async function esArchivoZip(archivo) {
    const cabecera = new Uint8Array(await archivo.slice(0, 4).arrayBuffer());
    return cabecera[0] === 0x50 && cabecera[1] === 0x4b && cabecera[2] === 3 && cabecera[3] === 4;
}

export function escribiendoEnCampo(evento) {
    const objetivo = evento.target;
    return objetivo instanceof HTMLInputElement || objetivo instanceof HTMLTextAreaElement
        || objetivo instanceof HTMLSelectElement || objetivo?.isContentEditable;
}
