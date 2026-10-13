// Fecha: 2026-10-12
// Ruta: /src/modulos/visor/imprimir.js
// Imprimir el documento
// Convierte cada página en imagen a 150 ppp, las pone en una zona oculta y abre el diálogo del sistema.
// En Android manda el PDF directamente al sistema de impresión.
// Notas: un PDF grande tarda (cada página se pinta en el worker); por eso hay barra de progreso
//        y se puede cancelar. Las imágenes se liberan al cerrar el diálogo de impresión.

import { escuchar } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { abrirProgreso, mostrarAviso } from '../../ui/dialogos.js';
import { esMovil, imprimirPdf } from '../../plataforma/index.js';

const PUNTOS_POR_PULGADA = 150;
const ESCALA_IMPRESION = PUNTOS_POR_PULGADA / 72;

let imprimiendo = false;

function vaciarZona() {
    const zona = document.getElementById('zona-impresion');
    for (const imagen of zona.querySelectorAll('img')) {
        URL.revokeObjectURL(imagen.src);
    }
    zona.replaceChildren();
}

async function prepararImagenes(documento, progreso, cancelado) {
    const zona = document.getElementById('zona-impresion');
    const cargas = [];
    for (let numero = 0; numero < documento.paginas; numero++) {
        if (cancelado()) {
            return null;
        }
        progreso.actualizar(t('imprimir.preparando', { actual: numero + 1, total: documento.paginas }), numero / documento.paginas);
        const { imagen } = await pedir('imprimir', { pagina: numero, escala: ESCALA_IMPRESION });
        const elemento = new Image();
        elemento.src = URL.createObjectURL(imagen);
        cargas.push(elemento.decode());
        zona.append(elemento);
    }
    await Promise.all(cargas);
    return true;
}

// Android imprime el PDF tal cual (con las anotaciones), sin pasar por imágenes
async function imprimirConSistema(documento) {
    const blob = (await pedir('modificado'))
        ? new Blob([(await pedir('exportar')).bytes], { type: 'application/pdf' })
        : documento.archivo;
    return imprimirPdf(blob, documento.nombre);
}

async function imprimir() {
    const documento = leer('documento');
    if (!documento || imprimiendo) {
        return;
    }
    imprimiendo = true;
    try {
        if (esMovil()) {
            await imprimirConSistema(documento);
        } else {
            await imprimirConImagenes(documento);
        }
    } catch (error) {
        console.error('No se pudo imprimir:', error);
        mostrarAviso(t('errores.imprimir'));
    } finally {
        imprimiendo = false;
    }
}

// Navegador y Windows: cada página como imagen en una zona oculta y el diálogo de impresión
async function imprimirConImagenes(documento) {
    let cancelado = false;
    const progreso = abrirProgreso(() => {
        cancelado = true;
    });
    try {
        vaciarZona();
        const listo = await prepararImagenes(documento, progreso, () => cancelado);
        progreso.cerrar();
        if (listo) {
            window.addEventListener('afterprint', vaciarZona, { once: true });
            window.print();
        } else {
            vaciarZona();
        }
    } catch (error) {
        progreso.cerrar();
        vaciarZona();
        throw error;
    }
}

export function iniciarImprimir() {
    escuchar('imprimir:pedir', imprimir);
}
