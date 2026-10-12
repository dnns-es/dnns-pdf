// Fecha: 2026-10-12
// Ruta: /src/main.js
// Punto de entrada de DNNS PDF
// Arranca idioma, tema, interfaz, visor, motor MuPDF y service worker
// Notas: los módulos de cada fase (anotar, organizar...) se inician desde aquí

import './estilos/base.css';
import './estilos/ui.css';
import './estilos/visor.css';
import './estilos/organizar.css';
import './estilos/firmar.css';
import { idiomaInicial, ponerIdioma, traducirPagina } from './nucleo/i18n.js';
import { cambiar } from './nucleo/estado.js';
import { emitir } from './nucleo/eventos.js';
import { iniciarMotor, pedir } from './motor/cliente.js';
import { registrarServiceWorker } from './nucleo/actualizacion.js';
import { iniciarTema } from './ui/tema.js';
import { iniciarBarra } from './ui/barra.js';
import { iniciarPanelLateral } from './ui/panelLateral.js';
import { iniciarVisor } from './modulos/visor/visor.js';
import { iniciarActualizador } from './modulos/actualizador/actualizador.js';
import { iniciarAnotar } from './modulos/anotar/anotar.js';
import { iniciarOrganizar } from './modulos/organizar/organizar.js';
import { iniciarFirmar } from './modulos/firmar/firmar.js';
import { iniciarOficina } from './modulos/oficina/oficina.js';
import { iniciarHistorial } from './nucleo/historial.js';

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
iniciarTema();
// El panel escucha 'estado:documento' antes que el visor: así el zoom inicial ya mide el ancho real
iniciarPanelLateral();
iniciarVisor();
iniciarHistorial();
iniciarAnotar();
iniciarOrganizar();
iniciarFirmar();
iniciarOficina();
iniciarBarra();
iniciarActualizador();
arrancarMotor();
registrarServiceWorker().catch((error) => console.error('Service worker no registrado:', error));
