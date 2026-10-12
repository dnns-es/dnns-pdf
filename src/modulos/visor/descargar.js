// Fecha: 2026-10-12
// Ruta: /src/modulos/visor/descargar.js
// Descargar el documento abierto
// Si no se ha tocado, baja el archivo original tal cual; si tiene cambios, la versión editada del worker
// (en Android se guarda con el selector de archivos del sistema)
// Notas: emite 'documento:guardado' para que el aviso de cambios sin guardar se quite

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { guardarArchivo } from '../../plataforma/index.js';
import { mostrarAviso } from '../../ui/dialogos.js';

async function descargar() {
    const documento = leer('documento');
    if (!documento) {
        return;
    }
    try {
        const modificado = await pedir('modificado');
        const blob = modificado
            ? new Blob([(await pedir('exportar')).bytes], { type: 'application/pdf' })
            : documento.archivo;
        // En Android el usuario puede cancelar el selector: entonces sigue habiendo cambios sin guardar
        if (await guardarArchivo(blob, documento.nombre)) {
            await pedir('marcarGuardado');
            emitir('documento:guardado');
        }
    } catch (error) {
        console.error('No se pudo guardar:', error);
        mostrarAviso(t('anotar.errorGuardar'));
    }
}

export function iniciarDescargar() {
    escuchar('descargar:pedir', descargar);
}
