// Fecha: 2026-10-12
// Ruta: /src/modulos/seguridad/seguridad.js
// Módulo Seguridad: proteger el PDF con contraseña y permisos, y quitar la protección
// Vive en el menú «Herramientas» de la barra. Proteger guarda una copia cifrada eligiendo dónde (el documento
// abierto sigue igual); quitar la protección abre el documento ya sin contraseña para seguir trabajando
// Notas: las contraseñas solo pasan al worker. Si hay permisos restringidos, quitarlos pide la contraseña
//        de propietario, como los lectores habituales.

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { mostrarAviso } from '../../ui/dialogos.js';
import { guardarComo } from '../../plataforma/index.js';
import { registrarUtilidad } from '../herramientas/herramientas.js';

const $ = (id) => document.getElementById(id);

const ERRORES = { SINCLAVE: 'seguridad.errSinClave', CLAVE: 'seguridad.errClave', SINCIFRAR: 'seguridad.errSinCifrar' };

let estadoDoc = null;

function nombreCon(sufijo) {
    return `${(leer('documento')?.nombre || 'documento').replace(/\.pdf$/i, '')}-${sufijo}.pdf`;
}

// Botón del ojo: enseña u oculta la contraseña del campo que tiene al lado
function prepararOjos(dialogo) {
    for (const ojo of dialogo.querySelectorAll('.caja-clave__ojo')) {
        ojo.addEventListener('click', () => {
            const campo = ojo.parentElement.querySelector('input');
            const visible = campo.type === 'password';
            campo.type = visible ? 'text' : 'password';
            ojo.setAttribute('aria-pressed', String(visible));
        });
    }
}

function mostrarError(id, clave) {
    const error = $(id);
    error.hidden = !clave;
    error.textContent = clave ? t(clave) : '';
}

function abrirProteger() {
    const formulario = $('formulario-proteger');
    formulario.reset();
    mostrarError('proteger-error', null);
    $('dialogo-proteger').showModal();
    $('proteger-clave').focus();
}

async function proteger() {
    const claveApertura = $('proteger-clave').value;
    if (claveApertura !== $('proteger-clave2').value) {
        mostrarError('proteger-error', 'seguridad.errNoCoinciden');
        return;
    }
    const restricciones = {
        imprimir: $('proteger-imprimir').checked,
        copiar: $('proteger-copiar').checked,
        modificar: $('proteger-modificar').checked
    };
    const clavePropietario = $('proteger-propietario').value;
    if (!claveApertura && !clavePropietario) {
        mostrarError('proteger-error', 'seguridad.errSinClave');
        return;
    }
    try {
        const { bytes } = await pedir('seguridad:proteger', { claveApertura, clavePropietario, restricciones });
        $('dialogo-proteger').close();
        const guardado = await guardarComo(new Blob([bytes], { type: 'application/pdf' }), nombreCon(t('seguridad.sufijoProtegido')), leer('documento').archivo);
        if (guardado) {
            mostrarAviso(t('seguridad.protegido', { nombre: guardado.name }));
        }
    } catch (error) {
        console.error('No se pudo proteger:', error);
        mostrarError('proteger-error', ERRORES[error.message] ?? 'seguridad.error');
    } finally {
        $('formulario-proteger').reset();
    }
}

function abrirQuitar() {
    if (!estadoDoc?.cifrado) {
        mostrarAviso(t('seguridad.errSinCifrar'));
        return;
    }
    // Solo hace falta contraseña si hay permisos restringidos y no se abrió como propietario
    const pideClave = estadoDoc.restringido && !estadoDoc.esPropietario;
    $('quitar-clave-bloque').hidden = !pideClave;
    $('quitar-texto').dataset.i18n = pideClave ? 'seguridad.quitarTextoPropietario' : 'seguridad.quitarTexto';
    $('quitar-texto').textContent = t($('quitar-texto').dataset.i18n);
    $('formulario-quitar').reset();
    mostrarError('quitar-error', null);
    $('dialogo-quitar').showModal();
    if (pideClave) {
        $('quitar-clave').focus();
    }
}

async function quitar() {
    try {
        const { bytes } = await pedir('seguridad:quitar', { clave: $('quitar-clave').value });
        $('dialogo-quitar').close();
        // El documento sin cifrar sustituye al abierto, con el mismo nombre y sitio; Guardar lo escribe encima
        const { archivo, nombre } = leer('documento');
        const nuevo = new File([bytes], nombre, { type: 'application/pdf' });
        Object.assign(nuevo, { ruta: archivo.ruta, manejador: archivo.manejador });
        await pedir('marcarGuardado');
        emitir('documento:guardado');
        emitir('archivo:abrir', nuevo);
        mostrarAviso(t('seguridad.quitado'));
    } catch (error) {
        console.error('No se pudo quitar la protección:', error);
        mostrarError('quitar-error', ERRORES[error.message] ?? 'seguridad.error');
    } finally {
        $('formulario-quitar').reset();
    }
}

async function leerEstado(documento) {
    estadoDoc = null;
    if (documento) {
        try {
            estadoDoc = await pedir('seguridad:estado');
        } catch (error) {
            console.warn('No se pudo leer la seguridad del documento:', error);
        }
    }
    document.querySelector('[data-util="desproteger"]').disabled = !estadoDoc?.cifrado;
}

export function iniciarSeguridad() {
    registrarUtilidad('proteger', abrirProteger);
    registrarUtilidad('desproteger', abrirQuitar);
    prepararOjos($('dialogo-proteger'));
    prepararOjos($('dialogo-quitar'));
    $('proteger-cancelar').addEventListener('click', () => $('dialogo-proteger').close());
    $('formulario-proteger').addEventListener('submit', (evento) => {
        evento.preventDefault();
        proteger();
    });
    $('quitar-cancelar').addEventListener('click', () => $('dialogo-quitar').close());
    $('formulario-quitar').addEventListener('submit', (evento) => {
        evento.preventDefault();
        quitar();
    });
    escuchar('estado:documento', leerEstado);
}
