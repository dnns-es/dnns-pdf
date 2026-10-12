// Fecha: 2026-10-12
// Ruta: /src/main.js
// Punto de entrada de DNNS PDF
// Arranca idioma, motor MuPDF y service worker
// Notas: los módulos de cada fase (visor, anotar...) se iniciarán desde aquí

import './estilos/base.css';
import { idiomaInicial, ponerIdioma, traducirPagina } from './nucleo/i18n.js';
import { cambiar } from './nucleo/estado.js';
import { emitir } from './nucleo/eventos.js';
import { iniciarMotor, pedir } from './motor/cliente.js';
import { registrarServiceWorker } from './nucleo/actualizacion.js';

function prepararIdioma() {
    const selector = document.getElementById('selector-idioma');
    const idioma = idiomaInicial();
    selector.value = idioma;
    ponerIdioma(idioma);
    selector.addEventListener('change', () => ponerIdioma(selector.value));
}

async function arrancarMotor() {
    const etiqueta = document.getElementById('estado-motor');
    try {
        await iniciarMotor();
        const { version } = await pedir('comprobar');
        etiqueta.dataset.i18n = 'motor.listo';
        etiqueta.dataset.i18nParam = JSON.stringify({ version });
        cambiar('motorListo', true);
        emitir('motor:listo', { version });
    } catch (error) {
        console.error('MuPDF no ha cargado:', error);
        etiqueta.dataset.i18n = 'motor.error';
        emitir('motor:error', error);
    }
    traducirPagina();
}

document.getElementById('version-app').textContent = `v${__VERSION_APP__}`;
prepararIdioma();
arrancarMotor();
registrarServiceWorker().catch((error) => console.error('Service worker no registrado:', error));
