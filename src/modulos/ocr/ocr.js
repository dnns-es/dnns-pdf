// Fecha: 2026-10-12
// Ruta: /src/modulos/ocr/ocr.js
// Módulo OCR: reconocer el texto de las páginas escaneadas para poder buscarlo, seleccionarlo y copiarlo
// Opción del menú Herramientas: idioma y páginas; Tesseract.js reconoce cada página y el worker de MuPDF
// añade el texto como capa invisible (la imagen no cambia). Se puede cancelar y deshacer.
// Notas: todo en el dispositivo. El motor y los idiomas viven en /ocr/ de la propia app (vite.config.js) y
//        se descargan la primera vez que se usa; Tesseract los guarda en el almacenamiento del navegador.

import { emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { registrarCambio } from '../../nucleo/historial.js';
import { mostrarAviso, abrirProgreso } from '../../ui/dialogos.js';
import { registrarUtilidad } from '../herramientas/herramientas.js';

const $ = (id) => document.getElementById(id);

// Resolución para reconocer: 300 ppp es lo recomendado por Tesseract; se limita el lado mayor por memoria
const PPP = 300;
const LADO_MAXIMO = 3500;
const OEM_LSTM = 1;

let cancelado = false;
let motor = null;

function rutaRecursos() {
    return new URL('ocr/', document.baseURI).href;
}

async function crearMotor(idiomas, alProgresar) {
    const { createWorker } = await import('tesseract.js');
    const base = rutaRecursos();
    return createWorker(idiomas, OEM_LSTM, {
        workerPath: `${base}worker.min.js`,
        corePath: base,
        langPath: base.replace(/\/$/, ''),
        gzip: true,
        logger: (mensaje) => alProgresar?.(mensaje)
    });
}

function palabrasDe(datos, escala) {
    const palabras = [];
    for (const bloque of datos.blocks ?? []) {
        for (const parrafo of bloque.paragraphs ?? []) {
            for (const linea of parrafo.lines ?? []) {
                for (const palabra of linea.words ?? []) {
                    const { x0, y0, x1, y1 } = palabra.bbox;
                    palabras.push({ texto: palabra.text, x0: x0 / escala, y0: y0 / escala, x1: x1 / escala, y1: y1 / escala });
                }
            }
        }
    }
    return palabras;
}

function escalaDe(pagina) {
    const [ancho, alto] = leer('documento').tamanos[pagina];
    return Math.min(PPP / 72, LADO_MAXIMO / Math.max(ancho, alto));
}

async function paginasATratar(soloSinTexto) {
    const total = leer('documento').paginas;
    const lista = [];
    for (let n = 0; n < total; n++) {
        if (!soloSinTexto || !(await pedir('ocr:tieneTexto', { pagina: n }))) {
            lista.push(n);
        }
    }
    return lista;
}

async function reconocer() {
    const datos = new FormData($('formulario-ocr'));
    const idiomas = datos.get('idioma-ocr');
    const soloSinTexto = $('ocr-solo-sin-texto').checked;
    $('dialogo-ocr').close();
    cancelado = false;
    const progreso = abrirProgreso(() => {
        cancelado = true;
        motor?.terminate();
    });
    try {
        const paginas = await paginasATratar(soloSinTexto);
        if (!paginas.length) {
            progreso.cerrar();
            mostrarAviso(t('ocr.nadaQueHacer'));
            return;
        }
        progreso.actualizar(t('ocr.preparando'), null);
        motor = await crearMotor(idiomas);
        let palabras = 0;
        for (const [i, pagina] of paginas.entries()) {
            if (cancelado) {
                break;
            }
            progreso.actualizar(t('ocr.pagina', { actual: i + 1, total: paginas.length }), i / paginas.length);
            const escala = escalaDe(pagina);
            const { png } = await pedir('ocr:imagen', { pagina, escala });
            const { data } = await motor.recognize(new Blob([png], { type: 'image/png' }), {}, { blocks: true, text: false });
            if (cancelado) {
                break;
            }
            const encontradas = palabrasDe(data, escala);
            await pedir('ocr:anadirTexto', { pagina, palabras: encontradas });
            palabras += encontradas.length;
            emitir('visor:repintar', pagina);
        }
        progreso.cerrar();
        await registrarCambio();
        emitir('anotaciones:cambiadas', { pagina: null });
        // La capa de texto seleccionable se vuelve a leer al repintar
        emitir('visor:repintarTodo');
        mostrarAviso(t(cancelado ? 'ocr.cancelado' : 'ocr.hecho', { palabras }));
    } catch (error) {
        progreso.cerrar();
        if (!cancelado) {
            console.error('No se pudo hacer el OCR:', error);
            mostrarAviso(t('ocr.error'));
        }
    } finally {
        await motor?.terminate().catch(() => {});
        motor = null;
    }
}

function abrir() {
    $('dialogo-ocr').showModal();
}

export function iniciarOcr() {
    registrarUtilidad('ocr', abrir);
    $('ocr-cancelar').addEventListener('click', () => $('dialogo-ocr').close());
    $('formulario-ocr').addEventListener('submit', (evento) => {
        evento.preventDefault();
        reconocer();
    });
}
