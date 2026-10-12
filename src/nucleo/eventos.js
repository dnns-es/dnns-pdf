// Fecha: 2026-10-12
// Ruta: /src/nucleo/eventos.js
// Bus de eventos central de la aplicación
// Permite que los módulos se comuniquen sin importarse entre sí
// Notas: los nombres de evento usan el formato 'modulo:accion' (p. ej. 'documento:abierto')

const suscriptores = new Map();

export function escuchar(nombre, callback) {
    if (!suscriptores.has(nombre)) {
        suscriptores.set(nombre, new Set());
    }
    suscriptores.get(nombre).add(callback);
    // Devolver la baja evita que cada módulo tenga que guardar la referencia del callback
    return () => dejarDeEscuchar(nombre, callback);
}

export function dejarDeEscuchar(nombre, callback) {
    suscriptores.get(nombre)?.delete(callback);
}

export function emitir(nombre, datos) {
    const lista = suscriptores.get(nombre);
    if (!lista) {
        return;
    }
    for (const callback of lista) {
        // Un módulo que falla no debe impedir que los demás reciban el evento
        try {
            callback(datos);
        } catch (error) {
            console.error(`Error en un suscriptor de '${nombre}':`, error);
        }
    }
}
