// Fecha: 2026-10-12
// Ruta: /src/ui/barra.js
// Barra de herramientas superior
// Traduce los clics en eventos del bus y muestra página actual y zoom
// Notas: no hace el trabajo; lo pide por eventos y lo atienden los módulos del visor

import { escuchar, emitir } from '../nucleo/eventos.js';
import { leer } from '../nucleo/estado.js';
import { traducirPagina } from '../nucleo/i18n.js';

const $ = (id) => document.getElementById(id);

function alClic(id, evento, datos) {
    $(id).addEventListener('click', () => emitir(evento, typeof datos === 'function' ? datos() : datos));
}

function activarControles(hayDocumento) {
    for (const elemento of document.querySelectorAll('[data-requiere-doc]')) {
        elemento.disabled = !hayDocumento;
    }
}

function mostrarTotal(documento) {
    const total = $('total-paginas');
    if (!documento) {
        total.textContent = '';
        delete total.dataset.i18n;
        $('numero-pagina').value = '';
        return;
    }
    $('numero-pagina').value = '1';
    total.dataset.i18n = 'barra.de';
    total.dataset.i18nParam = JSON.stringify({ total: documento.paginas });
    traducirPagina(total.parentElement);
}

function prepararNumeroPagina() {
    const campo = $('numero-pagina');
    const confirmar = () => {
        const numero = Number.parseInt(campo.value, 10);
        if (Number.isInteger(numero)) {
            emitir('pagina:ir', numero - 1);
        }
        campo.value = String(leer('paginaActual') + 1);
    };
    campo.addEventListener('change', confirmar);
    campo.addEventListener('keydown', (evento) => {
        if (evento.key === 'Enter') {
            confirmar();
            campo.blur();
        }
    });
    campo.addEventListener('focus', () => campo.select());
    escuchar('estado:paginaActual', (pagina) => {
        if (document.activeElement !== campo) {
            campo.value = String(pagina + 1);
        }
    });
}

function mostrarZoom() {
    const selector = $('selector-zoom');
    const modo = leer('modoZoom');
    if (modo === 'ancho' || modo === 'pagina') {
        selector.value = modo;
        return;
    }
    const escala = leer('escala');
    const fija = [...selector.options].find((opcion) => Number(opcion.value) === escala);
    if (fija) {
        selector.value = fija.value;
        return;
    }
    const libre = selector.querySelector('option[value="libre"]');
    libre.textContent = `${Math.round(escala * 100)} %`;
    selector.value = 'libre';
}

export function iniciarBarra() {
    alClic('boton-abrir', 'archivo:elegir');
    alClic('boton-anterior', 'pagina:ir', () => leer('paginaActual') - 1);
    alClic('boton-siguiente', 'pagina:ir', () => leer('paginaActual') + 1);
    alClic('boton-alejar', 'zoom:alejar');
    alClic('boton-acercar', 'zoom:acercar');
    alClic('boton-buscar', 'busqueda:abrir');
    alClic('boton-imprimir', 'imprimir:pedir');
    alClic('boton-descargar', 'descargar:pedir');
    $('selector-zoom').addEventListener('change', (evento) => {
        const valor = evento.target.value;
        if (valor !== 'libre') {
            emitir('zoom:poner', valor === 'ancho' || valor === 'pagina' ? valor : Number(valor));
        }
    });

    prepararNumeroPagina();
    activarControles(false);
    escuchar('estado:documento', (documento) => {
        activarControles(Boolean(documento));
        mostrarTotal(documento);
    });
    // Rotar, borrar o insertar cambian el total
    escuchar('documento:estructura', mostrarTotal);
    escuchar('estado:escala', mostrarZoom);
    escuchar('estado:modoZoom', mostrarZoom);
}
