// Fecha: 2026-10-12
// Ruta: /src/ui/tema.js
// Modo claro / oscuro de la interfaz
// Claro por defecto; el botón alterna y la elección se recuerda en este navegador
// Notas: las páginas del PDF siempre se ven en blanco, el tema solo afecta a la interfaz

import { cambiar } from '../nucleo/estado.js';

const CLAVE_GUARDADA = 'dnns-pdf:tema';
const COLOR_BARRA = { claro: '#ffffff', oscuro: '#161b22' };

function aplicarTema(tema) {
    document.documentElement.dataset.tema = tema;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_BARRA[tema]);
    document.getElementById('boton-tema').setAttribute('aria-pressed', String(tema === 'oscuro'));
    cambiar('tema', tema);
}

function temaGuardado() {
    try {
        return localStorage.getItem(CLAVE_GUARDADA) === 'oscuro' ? 'oscuro' : 'claro';
    } catch {
        return 'claro';
    }
}

export function iniciarTema() {
    aplicarTema(temaGuardado());
    document.getElementById('boton-tema').addEventListener('click', () => {
        const nuevo = document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro';
        aplicarTema(nuevo);
        try {
            localStorage.setItem(CLAVE_GUARDADA, nuevo);
        } catch {
            // Sin almacenamiento solo se pierde recordar la elección
        }
    });
}
