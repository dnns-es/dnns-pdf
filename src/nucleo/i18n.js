// Fecha: 2026-10-12
// Ruta: /src/nucleo/i18n.js
// Carga de idiomas y traducción de la interfaz
// Rellena los elementos con data-i18n y ofrece t('clave') para el código
// Notas: el idioma elegido se recuerda en localStorage; si falla, se usa el del navegador

import es from '../i18n/es.json';
import en from '../i18n/en.json';
import { cambiar } from './estado.js';

const diccionarios = { es, en };
const IDIOMA_POR_DEFECTO = 'es';
const CLAVE_GUARDADA = 'dnns-pdf:idioma';

let idiomaActual = IDIOMA_POR_DEFECTO;

// Los parámetros sustituyen marcas {nombre} dentro del texto traducido
export function t(clave, parametros = {}) {
    const texto = buscar(diccionarios[idiomaActual], clave) ?? buscar(diccionarios[IDIOMA_POR_DEFECTO], clave) ?? clave;
    return texto.replace(/\{(\w+)\}/g, (marca, nombre) => parametros[nombre] ?? marca);
}

function buscar(diccionario, clave) {
    return clave.split('.').reduce((nodo, parte) => nodo?.[parte], diccionario);
}

export function idiomaInicial() {
    try {
        const guardado = localStorage.getItem(CLAVE_GUARDADA);
        if (guardado && diccionarios[guardado]) {
            return guardado;
        }
    } catch {
        // Navegación privada o almacenamiento bloqueado: seguimos con el del navegador
    }
    const delNavegador = (navigator.language || '').slice(0, 2);
    return diccionarios[delNavegador] ? delNavegador : IDIOMA_POR_DEFECTO;
}

export function ponerIdioma(idioma) {
    if (!diccionarios[idioma]) {
        return;
    }
    idiomaActual = idioma;
    document.documentElement.lang = idioma;
    try {
        localStorage.setItem(CLAVE_GUARDADA, idioma);
    } catch {
        // Sin almacenamiento solo se pierde recordar el idioma
    }
    traducirPagina();
    cambiar('idioma', idioma);
}

export function traducirPagina(raiz = document) {
    for (const elemento of raiz.querySelectorAll('[data-i18n]')) {
        // data-i18n-param guarda los parámetros en JSON para poder retraducir al cambiar de idioma
        const parametros = elemento.dataset.i18nParam ? JSON.parse(elemento.dataset.i18nParam) : {};
        elemento.textContent = t(elemento.dataset.i18n, parametros);
    }
    // Botones con solo icono: el texto va en title y aria-label para ratón y lector de pantalla
    for (const elemento of raiz.querySelectorAll('[data-i18n-titulo]')) {
        const texto = t(elemento.dataset.i18nTitulo);
        elemento.title = texto;
        elemento.setAttribute('aria-label', texto);
    }
    for (const elemento of raiz.querySelectorAll('[data-i18n-placeholder]')) {
        elemento.placeholder = t(elemento.dataset.i18nPlaceholder);
    }
}
