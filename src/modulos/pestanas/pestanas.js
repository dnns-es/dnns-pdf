// Fecha: 2026-10-12
// Ruta: /src/modulos/pestanas/pestanas.js
// Módulo Pestañas: varios documentos abiertos a la vez
// Barra bajo la de herramientas (aparece con dos o más documentos): un clic cambia de documento, la × lo
// cierra (pregunta si tiene cambios sin guardar) y el clic con la rueda también lo cierra. Un punto marca
// los que tienen cambios sin guardar. Ctrl+Alt+Av Pág / Re Pág pasan a la siguiente o la anterior.
// Notas: cambiar de pestaña es cambiar el documento del estado: el visor y las herramientas se rehacen solos
//        y vuelven a la página y zoom de ese documento (posicion.js). El worker guarda una sesión por pestaña.

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer, cambiar } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { registrarCambio } from '../../nucleo/historial.js';
import { pestanas, quitarPestana } from '../../nucleo/pestanas.js';
import { confirmar, mostrarAviso } from '../../ui/dialogos.js';
import { ponerTitulo } from '../../plataforma/index.js';

const $ = (id) => document.getElementById(id);
// Pestañas con cambios sin guardar (por id)
const sucias = new Set();
let cambiando = false;

const tituloDe = (documento) => `${documento.titulo || documento.nombre} · DNNS PDF`;

export async function activarPestana(id) {
    const actual = leer('documento');
    const destino = pestanas().find((documento) => documento.id === id);
    if (!destino || actual === destino || cambiando) {
        return;
    }
    cambiando = true;
    try {
        await pedir('pestanas:activar', { id });
        cambiar('documento', destino);
        ponerTitulo(tituloDe(destino));
        // El historial se puso a cero con el cambio de documento: se lee el de esta pestaña
        await registrarCambio();
    } catch (error) {
        console.error('No se pudo cambiar de pestaña:', error);
        mostrarAviso(t('pestanas.error'));
    } finally {
        cambiando = false;
    }
}

async function cerrarPestana(id) {
    const documento = pestanas().find((otro) => otro.id === id);
    if (!documento) {
        return;
    }
    if ((await pedir('pestanas:hayCambios', { id })) && !(await confirmar('pestanas.descartar', 'anotar.descartarBoton'))) {
        return;
    }
    const eraActiva = leer('documento') === documento;
    const lista = pestanas();
    const indice = lista.indexOf(documento);
    await pedir('cerrar', { id });
    sucias.delete(id);
    quitarPestana(id);
    if (!eraActiva) {
        return;
    }
    // Se queda a la vista la de al lado (la de la derecha si la hay)
    const vecina = lista[indice + 1] ?? lista[indice - 1];
    if (vecina) {
        await activarPestana(vecina.id);
    } else {
        cambiar('documento', null);
        ponerTitulo('DNNS PDF');
    }
}

function crearPestana(documento) {
    const activa = leer('documento') === documento;
    const pestana = document.createElement('div');
    pestana.className = 'pestana';
    pestana.setAttribute('role', 'tab');
    pestana.setAttribute('aria-selected', String(activa));
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'pestana__nombre';
    boton.title = documento.archivo?.ruta ?? documento.nombre;
    if (sucias.has(documento.id)) {
        const punto = document.createElement('span');
        punto.className = 'pestana__cambios';
        punto.title = t('pestanas.sinGuardar');
        boton.append(punto);
    }
    const nombre = document.createElement('span');
    nombre.className = 'pestana__texto';
    nombre.textContent = documento.nombre;
    boton.append(nombre);
    boton.addEventListener('click', () => activarPestana(documento.id));
    const cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.className = 'pestana__cerrar';
    cerrar.title = t('pestanas.cerrar');
    cerrar.setAttribute('aria-label', t('pestanas.cerrar'));
    cerrar.textContent = '×';
    cerrar.addEventListener('click', () => cerrarPestana(documento.id));
    pestana.addEventListener('auxclick', (evento) => {
        if (evento.button === 1) {
            evento.preventDefault();
            cerrarPestana(documento.id);
        }
    });
    pestana.append(boton, cerrar);
    return pestana;
}

function pintar() {
    const lista = pestanas();
    const barra = $('barra-pestanas');
    barra.hidden = lista.length < 2;
    barra.replaceChildren(...lista.map(crearPestana));
    barra.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function moverse(paso) {
    const lista = pestanas();
    const indice = lista.indexOf(leer('documento'));
    if (lista.length > 1 && indice >= 0) {
        activarPestana(lista[(indice + paso + lista.length) % lista.length].id);
    }
}

function marcarSucia() {
    const documento = leer('documento');
    if (documento && !sucias.has(documento.id)) {
        sucias.add(documento.id);
        pintar();
    }
}

export function iniciarPestanas() {
    escuchar('pestanas:cambiadas', pintar);
    escuchar('estado:documento', pintar);
    escuchar('anotaciones:cambiadas', marcarSucia);
    escuchar('historial:cambiado', ({ repintar }) => repintar && marcarSucia());
    escuchar('documento:guardado', () => {
        sucias.delete(leer('documento')?.id);
        pintar();
    });
    escuchar('pestanas:ir', activarPestana);
    escuchar('pestanas:cerrar', () => leer('documento') && cerrarPestana(leer('documento').id));
    document.addEventListener('keydown', (evento) => {
        if (evento.ctrlKey && evento.altKey && (evento.key === 'PageDown' || evento.key === 'PageUp')) {
            evento.preventDefault();
            moverse(evento.key === 'PageDown' ? 1 : -1);
        }
    });
    // Cambios sin guardar en cualquier pestaña: el navegador pregunta antes de cerrar
    window.addEventListener('beforeunload', (evento) => {
        if (sucias.size) {
            evento.preventDefault();
        }
    });
}
