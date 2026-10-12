// Fecha: 2026-10-12
// Ruta: /src/modulos/visor/indice.js
// Índice (marcadores / outline) del PDF en el panel lateral
// Árbol plegable; un clic en una entrada lleva a su página
// Notas: los títulos vienen del PDF, así que solo se usan con textContent

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { pedir } from '../../motor/cliente.js';

function crearEntrada(entrada) {
    const elemento = document.createElement('li');
    const fila = document.createElement('div');
    fila.className = 'indice__fila';

    const plegar = document.createElement('button');
    plegar.type = 'button';
    plegar.className = 'indice__plegar';
    plegar.textContent = '▸';
    plegar.setAttribute('aria-hidden', 'true');
    plegar.tabIndex = -1;

    const enlace = document.createElement('button');
    enlace.type = 'button';
    enlace.className = 'indice__enlace';
    enlace.textContent = entrada.titulo;
    if (entrada.pagina >= 0) {
        enlace.addEventListener('click', () => {
            emitir('pagina:ir', entrada.pagina);
            emitir('panel:elegido');
        });
    }
    fila.append(plegar, enlace);
    elemento.append(fila);

    if (entrada.hijos.length) {
        const hijos = crearArbol(entrada.hijos);
        hijos.hidden = true;
        plegar.setAttribute('aria-expanded', 'false');
        plegar.addEventListener('click', () => {
            hijos.hidden = !hijos.hidden;
            plegar.setAttribute('aria-expanded', String(!hijos.hidden));
        });
        elemento.append(hijos);
    } else {
        plegar.classList.add('indice__plegar--vacio');
    }
    return elemento;
}

function crearArbol(entradas) {
    const lista = document.createElement('ul');
    lista.append(...entradas.map(crearEntrada));
    return lista;
}

async function construir(documento) {
    const arbol = document.getElementById('arbol-indice');
    const vacio = document.getElementById('indice-vacio');
    arbol.replaceChildren();
    vacio.hidden = true;
    if (!documento) {
        return;
    }
    let entradas = [];
    try {
        entradas = await pedir('indice');
    } catch (error) {
        console.error('No se pudo leer el índice:', error);
    }
    vacio.hidden = entradas.length > 0;
    arbol.append(...entradas.map(crearEntrada));
}

export function iniciarIndice() {
    escuchar('estado:documento', construir);
    // Los enlaces del índice apuntan a páginas: al moverlas cambian de número
    escuchar('documento:estructura', construir);
}
