// Fecha: 2026-10-12
// Ruta: /src/modulos/visor/abrir.js
// Apertura de documentos PDF; los demás formatos (.docx, .xlsx, .pptx, .rtf, .txt, código) pasan por el módulo
// Oficina y las imágenes por «Crear PDF». Botón Abrir, arrastrar y soltar, y "Abrir con" desde el sistema
// Notas: el archivo se lee en local y se cede al worker; nunca sale del dispositivo.
//        Se conserva el File original para poder descargarlo tal cual.

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { cambiar, leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { mostrarAviso, confirmar } from '../../ui/dialogos.js';
import { tipoDeArchivo } from '../../nucleo/utilidades.js';
import { pedirContrasena } from './contrasena.js';
import { archivoInicial, alRecibirArchivo, ponerTitulo } from '../../plataforma/index.js';

const CONVERTIBLES = new Set(['zip', 'rtf', 'texto']);

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
    const tipo = await tipoDeArchivo(archivo);
    // Documentos de Office, RTF y texto: el módulo Oficina los convierte y los devuelve como PDF por 'archivo:abrir'
    if (CONVERTIBLES.has(tipo)) {
        emitir('oficina:abrir', archivo);
        return;
    }
    if (tipo === 'imagen') {
        emitir('organizar:crearCon', [archivo]);
        return;
    }
    if (!tipo) {
        mostrarAviso(t('errores.noEsPdf'));
        return;
    }
    // Abrir otro documento descarta las anotaciones que no se hayan descargado
    if (leer('documento') && (await pedir('hayCambios')) && !(await confirmar('anotar.descartar', 'anotar.descartarBoton'))) {
        return;
    }
    cambiar('documento', null);
    ponerTitulo('DNNS PDF');
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
        ponerTitulo(`${datos.titulo || archivo.name} · DNNS PDF`);
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
    // Otros módulos que crean un PDF nuevo (unir, imágenes a PDF) lo abren por aquí
    escuchar('archivo:abrir', abrirArchivo);
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
        const archivos = [...evento.dataTransfer.files];
        // Un solo archivo se abre (una imagen acaba en «Crear PDF»); varios van a «Crear PDF» (unir / imágenes a PDF)
        if (archivos.length === 1) {
            abrirArchivo(archivos[0]);
        } else if (archivos.length) {
            emitir('organizar:crearCon', archivos);
        }
    });
}

// "Abrir con DNNS PDF" en el sistema: PWA instalada en Chrome/Edge, o la app de escritorio
function prepararAbrirCon() {
    if ('launchQueue' in window) {
        window.launchQueue.setConsumer(async (parametros) => {
            const [manejador] = parametros.files ?? [];
            if (manejador) {
                abrirArchivo(await manejador.getFile());
            }
        });
    }
    // Escritorio: PDF del doble clic con el que arrancó, y los que lleguen con la app ya abierta
    archivoInicial().then(abrirArchivo).catch((error) => console.error('No se pudo abrir el archivo inicial:', error));
    alRecibirArchivo(abrirArchivo);
}

export function iniciarAbrir() {
    prepararSelector();
    prepararArrastrar();
    prepararAbrirCon();
}
