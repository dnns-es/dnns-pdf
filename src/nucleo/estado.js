// Fecha: 2026-10-12
// Ruta: /src/nucleo/estado.js
// Estado global mínimo de la interfaz
// Guarda valores compartidos y avisa por el bus cuando cambian
// Notas: el documento PDF no vive aquí, vive en el worker; aquí solo hay datos de la UI

import { emitir } from './eventos.js';

const valores = {
    idioma: 'es',
    motorListo: false,
    documento: null
};

export function leer(clave) {
    return valores[clave];
}

export function cambiar(clave, valor) {
    if (valores[clave] === valor) {
        return;
    }
    valores[clave] = valor;
    emitir(`estado:${clave}`, valor);
}
