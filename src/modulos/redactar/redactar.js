// Fecha: 2026-10-12
// Ruta: /src/modulos/redactar/redactar.js
// Módulo Ocultar datos (redacción): marcar zonas buscando un texto y borrarlas de verdad del archivo
// Opción del menú Herramientas. Las zonas también se marcan a mano con la herramienta «Ocultar» de Anotar.
// Notas: lo marcado son anotaciones Redact; hasta aplicar no se borra nada. Aplicar se puede deshacer
//        mientras no se guarde.

import { emitir } from '../../nucleo/eventos.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { registrarCambio } from '../../nucleo/historial.js';
import { mostrarAviso } from '../../ui/dialogos.js';
import { registrarUtilidad } from '../herramientas/herramientas.js';

const $ = (id) => document.getElementById(id);

async function contarPendientes() {
    const { zonas, paginas } = await pedir('redactar:pendientes');
    $('ocultar-pendientes').textContent = zonas ? t('redactar.marcadas', { zonas, paginas }) : t('redactar.ninguna');
    $('ocultar-aplicar').disabled = zonas === 0;
}

async function tomarCambio() {
    emitir('visor:repintarTodo');
    await registrarCambio();
    emitir('anotaciones:cambiadas', { pagina: null });
}

async function marcar() {
    const texto = $('ocultar-buscar').value.trim();
    if (!texto) {
        return;
    }
    try {
        const { zonas } = await pedir('redactar:marcarBusqueda', { texto });
        if (zonas) {
            await tomarCambio();
        }
        mostrarAviso(t(zonas ? 'redactar.encontradas' : 'redactar.noEncontrado', { zonas }));
        await contarPendientes();
    } catch (error) {
        console.error('No se pudo marcar:', error);
        mostrarAviso(t('redactar.error'));
    }
}

async function aplicar() {
    try {
        const { paginas } = await pedir('redactar:aplicar');
        $('dialogo-ocultar').close();
        await tomarCambio();
        mostrarAviso(t('redactar.hecho', { paginas }));
    } catch (error) {
        console.error('No se pudieron ocultar los datos:', error);
        mostrarAviso(t('redactar.error'));
    }
}

async function abrir() {
    $('ocultar-buscar').value = '';
    await contarPendientes();
    $('dialogo-ocultar').showModal();
    $('ocultar-buscar').focus();
}

export function iniciarRedactar() {
    registrarUtilidad('ocultar', abrir);
    $('ocultar-marcar').addEventListener('click', marcar);
    $('ocultar-buscar').addEventListener('keydown', (evento) => {
        if (evento.key === 'Enter') {
            evento.preventDefault();
            marcar();
        }
    });
    $('ocultar-cancelar').addEventListener('click', () => $('dialogo-ocultar').close());
    $('formulario-ocultar').addEventListener('submit', (evento) => {
        evento.preventDefault();
        aplicar();
    });
}
