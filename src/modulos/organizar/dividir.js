// Fecha: 2026-10-12
// Ruta: /src/modulos/organizar/dividir.js
// Diálogo Dividir: por rangos («1-3, 5, 8-10», un PDF por rango) o cada N páginas
// Devuelve la lista de partes (cada parte, sus páginas desde 0) o null si se cancela

import { t } from '../../nucleo/i18n.js';
import { leerRangos, cadaN } from '../../nucleo/rangos.js';

const $ = (id) => document.getElementById(id);

export function pedirDivision(total) {
    const dialogo = $('dialogo-dividir');
    const formulario = $('formulario-dividir');
    const error = $('dividir-error');
    error.hidden = true;
    $('dividir-cada').max = String(total);

    return new Promise((resolver) => {
        const terminar = (valor) => {
            formulario.removeEventListener('submit', alEnviar);
            dialogo.removeEventListener('cancel', alCancelar);
            $('dividir-cancelar').removeEventListener('click', alCancelar);
            dialogo.close();
            resolver(valor);
        };
        const alEnviar = (evento) => {
            evento.preventDefault();
            const modo = formulario.elements['modo-dividir'].value;
            try {
                if (modo === 'cada') {
                    const n = Number($('dividir-cada').value);
                    if (!Number.isInteger(n) || n < 1 || n >= total) {
                        throw new Error('organizar.cadaMal');
                    }
                    terminar(cadaN(n, total));
                } else {
                    terminar(leerRangos($('dividir-rangos').value, total));
                }
            } catch (fallo) {
                error.textContent = t(fallo.message, { total });
                error.hidden = false;
            }
        };
        const alCancelar = (evento) => {
            evento.preventDefault();
            terminar(null);
        };
        formulario.addEventListener('submit', alEnviar);
        dialogo.addEventListener('cancel', alCancelar);
        $('dividir-cancelar').addEventListener('click', alCancelar);
        // Escribir en un campo marca su opción
        $('dividir-rangos').onfocus = () => { formulario.elements['modo-dividir'].value = 'rangos'; };
        $('dividir-cada').onfocus = () => { formulario.elements['modo-dividir'].value = 'cada'; };
        dialogo.showModal();
    });
}
