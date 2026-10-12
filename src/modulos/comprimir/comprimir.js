// Fecha: 2026-10-12
// Ruta: /src/modulos/comprimir/comprimir.js
// Módulo Comprimir: reducir el peso del PDF para enviarlo por correo o mensajería
// Opción del menú Herramientas: se elige el nivel, se comprime una copia y se guarda eligiendo dónde
// Notas: el documento abierto no cambia. Si el resultado no pesa menos, se avisa y no se guarda nada.

import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { mostrarAviso, abrirProgreso } from '../../ui/dialogos.js';
import { guardarComo } from '../../plataforma/index.js';
import { registrarUtilidad } from '../herramientas/herramientas.js';

const $ = (id) => document.getElementById(id);

function tamano(bytes) {
    return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function nombreComprimido() {
    return `${(leer('documento')?.nombre || 'documento').replace(/\.pdf$/i, '')}-${t('comprimir.sufijo')}.pdf`;
}

function abrir() {
    $('comprimir-actual').textContent = t('comprimir.actual', { tamano: tamano(leer('documento').archivo.size) });
    $('dialogo-comprimir').showModal();
}

async function comprimirYGuardar() {
    const nivel = new FormData($('formulario-comprimir')).get('nivel-comprimir');
    $('dialogo-comprimir').close();
    const progreso = abrirProgreso(() => {});
    progreso.actualizar(t('comprimir.trabajando'), null);
    try {
        const { bytes, antes, despues } = await pedir('comprimir', { nivel });
        progreso.cerrar();
        if (despues >= antes) {
            mostrarAviso(t('comprimir.sinMejora'));
            return;
        }
        const guardado = await guardarComo(new Blob([bytes], { type: 'application/pdf' }), nombreComprimido(), leer('documento').archivo);
        if (guardado) {
            const ahorro = Math.round((1 - despues / antes) * 100);
            mostrarAviso(t('comprimir.hecho', { antes: tamano(antes), despues: tamano(despues), ahorro }));
        }
    } catch (error) {
        progreso.cerrar();
        console.error('No se pudo comprimir:', error);
        mostrarAviso(t('comprimir.error'));
    }
}

export function iniciarComprimir() {
    registrarUtilidad('comprimir', abrir);
    $('comprimir-cancelar').addEventListener('click', () => $('dialogo-comprimir').close());
    $('formulario-comprimir').addEventListener('submit', (evento) => {
        evento.preventDefault();
        comprimirYGuardar();
    });
}
