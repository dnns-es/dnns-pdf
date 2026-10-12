// Fecha: 2026-10-12
// Ruta: /src/nucleo/pestanas.js
// Registro de los documentos abiertos (pestañas), compartido por abrir.js y el módulo Pestañas
// Cada entrada es el mismo objeto «documento» del estado ({ id, nombre, archivo, paginas, tamanos, titulo }),
// con el id de su sesión en el worker.
// Notas: avisa por el bus con 'pestanas:cambiadas' cada vez que la lista cambia.

import { emitir } from './eventos.js';

const lista = [];

export function pestanas() {
    return [...lista];
}

export function registrarPestana(documento) {
    lista.push(documento);
    emitir('pestanas:cambiadas', pestanas());
}

export function quitarPestana(id) {
    const indice = lista.findIndex((documento) => documento.id === id);
    if (indice >= 0) {
        lista.splice(indice, 1);
        emitir('pestanas:cambiadas', pestanas());
    }
    return indice;
}

const mismaRuta = (a, b) => a.toLowerCase().replace(/\\/g, '/') === b.toLowerCase().replace(/\\/g, '/');

// ¿Es el mismo archivo? Por ruta (escritorio), por manejador (web) o por nombre, tamaño y fecha
async function mismoArchivo(a, b) {
    if (!a || !b) {
        return false;
    }
    if (a.ruta && b.ruta) {
        return mismaRuta(a.ruta, b.ruta);
    }
    if (a.manejador && b.manejador) {
        return a.manejador.isSameEntry(b.manejador).catch(() => false);
    }
    return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

// Pestaña que ya tiene abierto ese archivo, o null
export async function pestanaCon(archivo) {
    for (const documento of lista) {
        if (await mismoArchivo(documento.archivo, archivo)) {
            return documento;
        }
    }
    return null;
}
