// Fecha: 2026-10-12
// Ruta: /src/nucleo/historial.js
// Deshacer / rehacer centralizado
// Apoyado en el journal de MuPDF (en el worker); aquí solo se coordina y se avisa a la interfaz
// Notas: cualquier módulo que cambie el documento llama a registrarCambio() después, y el
//        historial avisa con 'historial:cambiado' para que el visor repinte y actualice botones.

import { escuchar, emitir } from './eventos.js';
import { leer } from './estado.js';
import { escribiendoEnCampo } from './utilidades.js';
import { pedir } from '../motor/cliente.js';

let estado = { puedeDeshacer: false, puedeRehacer: false };

function publicar(nuevo, repintar) {
    estado = nuevo;
    emitir('historial:cambiado', { ...estado, repintar });
}

export function estadoHistorial() {
    return estado;
}

// Tras crear, modificar o borrar algo: refresca los botones sin repintar (el módulo ya repintó su página)
export async function registrarCambio() {
    publicar(await pedir('historial:estado'), false);
}

export async function deshacer() {
    if (!leer('documento') || !estado.puedeDeshacer) {
        return;
    }
    publicar(await pedir('historial:deshacer'), true);
}

export async function rehacer() {
    if (!leer('documento') || !estado.puedeRehacer) {
        return;
    }
    publicar(await pedir('historial:rehacer'), true);
}

export function iniciarHistorial() {
    escuchar('estado:documento', () => publicar({ puedeDeshacer: false, puedeRehacer: false }, false));
    escuchar('historial:deshacer', deshacer);
    escuchar('historial:rehacer', rehacer);
    document.addEventListener('keydown', (evento) => {
        if (!(evento.ctrlKey || evento.metaKey) || escribiendoEnCampo(evento)) {
            return;
        }
        const tecla = evento.key.toLowerCase();
        if (tecla === 'z' && !evento.shiftKey) {
            evento.preventDefault();
            deshacer();
        } else if (tecla === 'y' || (tecla === 'z' && evento.shiftKey)) {
            evento.preventDefault();
            rehacer();
        }
    });
}
