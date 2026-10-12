// Fecha: 2026-10-12
// Ruta: /src/plataforma/android.js
// Implementación de plataforma para la app de Android (Capacitor)
// PDFs recibidos de «Abrir con» y «Compartir», guardar con el selector del sistema, imprimir y actualizar
// Notas: solo se importa desde plataforma/index.js y solo dentro de la app. Los plugins nativos son
//        Archivos.java y Actualizador.java (android/app/src/main/java/es/dnns/pdf/).

import { registerPlugin, Capacitor } from '@capacitor/core';

const Archivos = registerPlugin('Archivos');
const Actualizador = registerPlugin('Actualizador');

// El PDF recibido está en la caché de la app; el servidor local de Capacitor lo sirve sin copiarlo en base64
async function archivoDesde({ ruta, nombre }) {
    const respuesta = await fetch(Capacitor.convertFileSrc(`file://${ruta}`));
    if (!respuesta.ok) {
        throw new Error(`No se pudo leer el PDF recibido (${respuesta.status})`);
    }
    return new File([await respuesta.blob()], nombre || 'documento.pdf', { type: 'application/pdf' });
}

export async function archivoInicial() {
    const recibido = await Archivos.archivoInicial();
    return recibido?.ruta ? archivoDesde(recibido) : null;
}

export function alRecibirArchivo(callback) {
    Archivos.addListener('archivoRecibido', async (recibido) => {
        try {
            callback(await archivoDesde(recibido));
        } catch (error) {
            console.error('No se pudo abrir el archivo recibido:', error);
        }
    });
}

function aBase64(blob) {
    return new Promise((resolver, rechazar) => {
        const lector = new FileReader();
        lector.onload = () => resolver(String(lector.result).split(',')[1]);
        lector.onerror = () => rechazar(lector.error);
        lector.readAsDataURL(blob);
    });
}

export async function guardarArchivo(blob, nombre) {
    const { guardado } = await Archivos.guardar({ nombre, datos: await aBase64(blob) });
    return guardado;
}

export async function imprimirPdf(blob, nombre) {
    await Archivos.imprimir({ nombre, datos: await aBase64(blob) });
}

// Versiones X.Y.Z comparadas por partes
function esMasNueva(candidata, actual) {
    const a = candidata.split('.').map(Number);
    const b = actual.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if ((a[i] || 0) !== (b[i] || 0)) {
            return (a[i] || 0) > (b[i] || 0);
        }
    }
    return false;
}

// Devuelve null si no hay versión nueva, o { version, notas, instalar(alProgresar) }
export async function comprobarActualizacion() {
    const [{ version: instalada }, ultima] = await Promise.all([Actualizador.version(), Actualizador.consultar()]);
    if (!ultima?.version || !esMasNueva(ultima.version, instalada)) {
        return null;
    }
    return {
        version: ultima.version,
        notas: ultima.notas || '',
        async instalar(alProgresar) {
            // La descarga y las comprobaciones (huella, firma, versión) las hace el plugin nativo;
            // al terminar abre el instalador del sistema, donde el usuario confirma
            alProgresar?.(0);
            await Actualizador.instalar({ url: ultima.url, sha256: ultima.sha256 });
            alProgresar?.(1);
        }
    };
}

// El instalador de Android cierra y vuelve a abrir la app por su cuenta
export async function reiniciarApp() {}
