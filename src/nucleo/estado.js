// Fecha: 2026-10-12
// Ruta: /src/nucleo/estado.js
// Estado global mínimo de la interfaz
// Guarda valores compartidos y avisa por el bus cuando cambian ('estado:clave')
// Notas: el documento PDF no vive aquí, vive en el worker; aquí solo hay datos de la UI.
//        documento = { nombre, archivo, paginas, tamanos: [[ancho, alto]...], titulo } o null

import { emitir } from './eventos.js';

const valores = {
    idioma: 'es',
    tema: 'claro',
    motorListo: false,
    documento: null,
    paginaActual: 0,
    escala: 1,
    modoZoom: 'ancho'
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
