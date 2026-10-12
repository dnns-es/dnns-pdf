// Fecha: 2026-10-12
// Ruta: /src/ui/ajustes.js
// Ajustes y «Acerca de»: versión de la app y dónde se usa (web, Windows, Mac, Android, iPhone), motor, licencia,
// código fuente y web
// Notas: el botón está en todas las plataformas; las opciones de actualización las añade actualizador.js
//        solo en las apps. En las apps no hay navegador para abrir enlaces: las direcciones salen como texto.

import { emitir } from '../nucleo/eventos.js';
import { t } from '../nucleo/i18n.js';
import { pedir } from '../motor/cliente.js';
import { esApp, esEscritorio, esMac, esAndroid, esIOS } from '../plataforma/index.js';

const $ = (id) => document.getElementById(id);
const CODIGO = 'https://github.com/dnns-es/dnns-pdf';
const WEB = 'https://dnns.es/apps.html#dnns-pdf';

function plataforma() {
    if (esMac()) {
        return t('acerca.mac');
    }
    if (esEscritorio()) {
        return t('acerca.windows');
    }
    if (esIOS()) {
        return t('acerca.ios');
    }
    return esAndroid() ? t('acerca.android') : t('acerca.navegador');
}

function direccion(elemento, url) {
    const texto = url.replace('https://', '');
    if (esApp()) {
        elemento.textContent = texto;
        return;
    }
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.target = '_blank';
    enlace.rel = 'noopener';
    enlace.textContent = texto;
    elemento.replaceChildren(enlace);
}

async function abrir() {
    $('acerca-version').textContent = t('acerca.version', { version: __VERSION_APP__, plataforma: plataforma() });
    try {
        const { version } = await pedir('comprobar');
        $('acerca-motor').textContent = 'MuPDF ' + version;
    } catch {
        $('acerca-motor').textContent = 'MuPDF';
    }
    emitir('ajustes:abiertos');
    $('dialogo-ajustes').showModal();
}

export function iniciarAjustes() {
    direccion($('acerca-codigo'), CODIGO);
    direccion($('acerca-web'), WEB);
    $('boton-ajustes').addEventListener('click', abrir);
    $('ajustes-cerrar').addEventListener('click', () => $('dialogo-ajustes').close());
}
