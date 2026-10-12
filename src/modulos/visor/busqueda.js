// Fecha: 2026-10-12
// Ruta: /src/modulos/visor/busqueda.js
// Búsqueda de texto en el documento
// Busca mientras se escribe, resalta todos los resultados y salta entre ellos con Intro
// Notas: los resaltados van en % de la página, así el zoom no obliga a recolocarlos.
//        Cada búsqueda lleva un turno: si llega tarde una respuesta vieja, se descarta.

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { retrasar } from '../../nucleo/utilidades.js';
import { pedir } from '../../motor/cliente.js';

const ESPERA_TECLEO = 350;

const $ = (id) => document.getElementById(id);

let resultados = [];
let marcas = [];
let indiceActual = -1;
let textoBuscado = '';
let limitado = false;
let turno = 0;

function mostrarContador(clave, parametros) {
    const contador = $('contador-busqueda');
    contador.textContent = clave ? t(clave, parametros) : '';
}

function actualizarContador() {
    if (!resultados.length) {
        mostrarContador(textoBuscado ? 'busqueda.sinResultados' : null);
        return;
    }
    const clave = limitado ? 'busqueda.limitado' : 'busqueda.contador';
    mostrarContador(clave, { actual: indiceActual + 1, total: resultados.length });
}

function limpiarResaltados() {
    for (const capa of document.querySelectorAll('.capa-resaltado')) {
        capa.replaceChildren();
    }
    resultados = [];
    marcas = [];
    indiceActual = -1;
}

function dibujarResaltados() {
    const { tamanos } = leer('documento');
    marcas = resultados.map(({ pagina, rects }) => {
        const capa = document.querySelector(`.pagina[data-pagina="${pagina}"] .capa-resaltado`);
        const [ancho, alto] = tamanos[pagina];
        return rects.map((rect) => {
            const marca = document.createElement('div');
            marca.className = 'resaltado';
            marca.style.left = `${(rect.x / ancho) * 100}%`;
            marca.style.top = `${(rect.y / alto) * 100}%`;
            marca.style.width = `${(rect.w / ancho) * 100}%`;
            marca.style.height = `${(rect.h / alto) * 100}%`;
            capa?.append(marca);
            return marca;
        });
    });
}

function irAResultado(indice) {
    if (!resultados.length) {
        return;
    }
    marcas[indiceActual]?.forEach((marca) => marca.classList.remove('resaltado--actual'));
    indiceActual = (indice + resultados.length) % resultados.length;
    marcas[indiceActual].forEach((marca) => marca.classList.add('resaltado--actual'));
    const { pagina, rects } = resultados[indiceActual];
    emitir('visor:mostrarRect', { pagina, rect: rects[0] });
    actualizarContador();
}

// Empezar por el primer resultado desde la página que se está viendo, no desde el principio
function primerResultadoDesdeAqui() {
    const actual = leer('paginaActual');
    const indice = resultados.findIndex((resultado) => resultado.pagina >= actual);
    return indice === -1 ? 0 : indice;
}

async function buscar(texto) {
    const miTurno = ++turno;
    limpiarResaltados();
    textoBuscado = texto.trim();
    if (!textoBuscado || !leer('documento')) {
        actualizarContador();
        return;
    }
    mostrarContador('busqueda.buscando');
    const respuesta = await pedir('buscar', { texto: textoBuscado });
    if (miTurno !== turno) {
        return;
    }
    resultados = respuesta.resultados;
    limitado = respuesta.limitado;
    dibujarResaltados();
    if (resultados.length) {
        irAResultado(primerResultadoDesdeAqui());
    } else {
        actualizarContador();
    }
}

const buscarAlTeclear = retrasar((texto) => buscar(texto), ESPERA_TECLEO);

function abrirBarra() {
    $('barra-busqueda').hidden = false;
    $('boton-buscar').setAttribute('aria-pressed', 'true');
    $('texto-busqueda').focus();
    $('texto-busqueda').select();
}

function cerrarBarra() {
    turno++;
    limpiarResaltados();
    textoBuscado = '';
    $('texto-busqueda').value = '';
    mostrarContador(null);
    $('barra-busqueda').hidden = true;
    $('boton-buscar').setAttribute('aria-pressed', 'false');
    $('visor').focus({ preventScroll: true });
}

function alTeclaEnCampo(evento) {
    if (evento.key === 'Escape') {
        evento.preventDefault();
        cerrarBarra();
        return;
    }
    if (evento.key !== 'Enter') {
        return;
    }
    evento.preventDefault();
    const texto = evento.target.value.trim();
    if (texto !== textoBuscado) {
        buscar(texto);
    } else {
        irAResultado(indiceActual + (evento.shiftKey ? -1 : 1));
    }
}

export function iniciarBusqueda() {
    const campo = $('texto-busqueda');
    campo.addEventListener('input', () => buscarAlTeclear(campo.value));
    campo.addEventListener('keydown', alTeclaEnCampo);
    $('busqueda-anterior').addEventListener('click', () => irAResultado(indiceActual - 1));
    $('busqueda-siguiente').addEventListener('click', () => irAResultado(indiceActual + 1));
    $('busqueda-cerrar').addEventListener('click', cerrarBarra);

    escuchar('busqueda:abrir', abrirBarra);
    escuchar('estado:documento', () => {
        if (!$('barra-busqueda').hidden) {
            cerrarBarra();
        }
    });
    escuchar('estado:idioma', actualizarContador);
}
