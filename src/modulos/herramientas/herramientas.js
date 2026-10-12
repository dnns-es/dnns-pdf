// Fecha: 2026-10-12
// Ruta: /src/modulos/herramientas/herramientas.js
// Menú «Herramientas» de la barra: proteger, quitar contraseña, comprimir y lo que vaya llegando
// Cada módulo registra su opción con registrarUtilidad(nombre, accion); el menú solo abre y cierra
// Notas: las opciones están en el HTML (data-util="nombre"); aquí no se sabe qué hace cada una.

const $ = (id) => document.getElementById(id);

const acciones = new Map();

export function registrarUtilidad(nombre, accion) {
    acciones.set(nombre, accion);
}

function mostrarMenu(visible) {
    const menu = $('menu-herramientas');
    menu.hidden = !visible;
    if (visible) {
        const caja = $('boton-herramientas').getBoundingClientRect();
        menu.style.top = `${caja.bottom + 4}px`;
        menu.style.left = `${Math.max(8, Math.min(caja.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    }
    $('boton-herramientas').setAttribute('aria-expanded', String(visible));
}

export function iniciarHerramientas() {
    $('boton-herramientas').addEventListener('click', (evento) => {
        evento.stopPropagation();
        mostrarMenu($('menu-herramientas').hidden);
    });
    for (const boton of document.querySelectorAll('[data-util]')) {
        boton.addEventListener('click', () => {
            mostrarMenu(false);
            acciones.get(boton.dataset.util)?.();
        });
    }
    document.addEventListener('click', (evento) => {
        if (!$('menu-herramientas').hidden && !evento.target.closest('#menu-herramientas')) {
            mostrarMenu(false);
        }
    });
    document.addEventListener('keydown', (evento) => evento.key === 'Escape' && mostrarMenu(false));
}
