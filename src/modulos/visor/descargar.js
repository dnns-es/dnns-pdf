// Fecha: 2026-10-12
// Ruta: /src/modulos/visor/descargar.js
// Descargar el documento abierto
// Si no se ha tocado, baja el archivo original tal cual; si tiene cambios, la versión editada del worker
// Notas: emite 'documento:guardado' para que el aviso de cambios sin guardar se quite

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { descargarBlob } from '../../nucleo/utilidades.js';
import { pedir } from '../../motor/cliente.js';
import { mostrarAviso } from '../../ui/dialogos.js';

async function descargar() {
    const documento = leer('documento');
    if (!documento) {
        return;
    }
    try {
        if (await pedir('modificado')) {
            const { bytes } = await pedir('guardar');
            descargarBlob(new Blob([bytes], { type: 'application/pdf' }), documento.nombre);
        } else {
            descargarBlob(documento.archivo, documento.nombre);
        }
        emitir('documento:guardado');
    } catch (error) {
        console.error('No se pudo guardar:', error);
        mostrarAviso(t('anotar.errorGuardar'));
    }
}

export function iniciarDescargar() {
    escuchar('descargar:pedir', descargar);
}
