// Fecha: 2026-10-12
// Ruta: /src/modulos/visor/abrir.js
// Apertura de documentos PDF
// Botón Abrir, arrastrar y soltar, y "Abrir con" desde el sistema cuando la PWA está instalada
// Notas: el archivo se lee en local y se cede al worker; nunca sale del dispositivo.
//        Se conserva el File original para poder descargarlo tal cual.

import { escuchar } from '../../nucleo/eventos.js';
import { cambiar } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { mostrarAviso } from '../../ui/dialogos.js';
import { pedirContrasena } from './contrasena.js';

const BYTES_CABECERA = 1024;

// Algunos PDF traen basura antes de '%PDF-'; MuPDF los abre igual, así que se busca en el primer KB
async function pareceUnPdf(archivo) {
    if (archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name)) {
        return true;
    }
    const inicio = new TextDecoder('latin1').decode(await archivo.slice(0, BYTES_CABECERA).arrayBuffer());
    return inicio.includes('%PDF-');
}

// Devuelve los datos del documento, o null si el usuario cancela la contraseña
async function abrirEnMotor(archivo) {
    const buffer = await archivo.arrayBuffer();
    const respuesta = await pedir('abrir', { buffer }, [buffer]);
    if (!respuesta.necesitaClave) {
        return respuesta;
    }
    let conError = false;
    for (;;) {
        const clave = await pedirContrasena(conError);
        if (clave === null) {
            await pedir('cerrar');
            return null;
        }
        const intento = await pedir('autenticar', { clave });
        if (intento.ok) {
            return intento;
        }
        conError = true;
    }
}

export async function abrirArchivo(archivo) {
    if (!archivo) {
        return;
    }
    if (!(await pareceUnPdf(archivo))) {
        mostrarAviso(t('errores.noEsPdf'));
        return;
    }
    cambiar('documento', null);
    document.title = 'DNNS PDF';
    try {
        const datos = await abrirEnMotor(archivo);
        if (!datos) {
            return;
        }
        cambiar('documento', {
            nombre: archivo.name || 'documento.pdf',
            archivo,
            paginas: datos.paginas,
            tamanos: datos.tamanos,
            titulo: datos.titulo
        });
        document.title = `${datos.titulo || archivo.name} · DNNS PDF`;
    } catch (error) {
        console.error('No se pudo abrir el documento:', error);
        mostrarAviso(t('errores.abrir'));
    }
}

function prepararSelector() {
    const entrada = document.getElementById('entrada-archivo');
    const elegir = () => entrada.click();
    document.getElementById('portada-abrir').addEventListener('click', elegir);
    escuchar('archivo:elegir', elegir);
    entrada.addEventListener('change', () => {
        abrirArchivo(entrada.files[0]);
        // Vaciar permite volver a elegir el mismo archivo
        entrada.value = '';
    });
}

function prepararArrastrar() {
    const zona = document.getElementById('zona-soltar');
    const llevaArchivos = (evento) => evento.dataTransfer?.types.includes('Files');
    let profundidad = 0;

    window.addEventListener('dragenter', (evento) => {
        if (llevaArchivos(evento)) {
            profundidad++;
            zona.hidden = false;
        }
    });
    window.addEventListener('dragleave', () => {
        // dragleave salta al pasar por cada elemento hijo; solo se oculta al salir de la ventana
        profundidad = Math.max(0, profundidad - 1);
        if (profundidad === 0) {
            zona.hidden = true;
        }
    });
    window.addEventListener('dragover', (evento) => {
        if (llevaArchivos(evento)) {
            evento.preventDefault();
        }
    });
    window.addEventListener('drop', (evento) => {
        if (!llevaArchivos(evento)) {
            return;
        }
        evento.preventDefault();
        profundidad = 0;
        zona.hidden = true;
        abrirArchivo(evento.dataTransfer.files[0]);
    });
}

// "Abrir con DNNS PDF" en el sistema: solo existe con la PWA instalada en Chrome/Edge
function prepararAbrirCon() {
    if (!('launchQueue' in window)) {
        return;
    }
    window.launchQueue.setConsumer(async (parametros) => {
        const [manejador] = parametros.files ?? [];
        if (manejador) {
            abrirArchivo(await manejador.getFile());
        }
    });
}

export function iniciarAbrir() {
    prepararSelector();
    prepararArrastrar();
    prepararAbrirCon();
}
