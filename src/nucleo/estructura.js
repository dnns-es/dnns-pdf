// Fecha: 2026-10-12
// Ruta: /src/nucleo/estructura.js
// Cambios en las páginas del documento abierto (número, orden, tamaño)
// Actualiza el documento del estado y avisa con 'documento:estructura' para que cada vista se recoloque
// Notas: a diferencia de abrir otro documento ('estado:documento'), aquí no se reinicia el historial ni
//        se vuelve a la primera página. Se modifica el mismo objeto documento a propósito: es el mismo
//        archivo, solo con otras páginas.

import { emitir } from './eventos.js';
import { leer } from './estado.js';

const iguales = (a, b) => a.length === b.length && a.every((valor, i) => String(valor) === String(b[i]));

// forzar: avisar aunque no cambie nada medible (p. ej. girar 180° deja tamaños e identidades iguales)
export function aplicarEstructura(nueva, forzar = false) {
    const documento = leer('documento');
    if (!documento || !nueva) {
        return false;
    }
    const cambio = !iguales(documento.ids ?? [], nueva.ids) || !iguales(documento.tamanos, nueva.tamanos);
    if (!cambio && !forzar) {
        return false;
    }
    documento.paginas = nueva.paginas;
    documento.tamanos = nueva.tamanos;
    documento.ids = nueva.ids;
    emitir('documento:estructura', documento);
    return true;
}
