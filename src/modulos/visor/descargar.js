// Fecha: 2026-10-12
// Ruta: /src/modulos/visor/descargar.js
// Descargar el documento abierto
// Guarda el archivo original tal cual (en esta fase todavía no se modifica)
// Notas: en fases posteriores, con anotaciones o cambios, se guardará la versión editada desde el worker

import { escuchar } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { descargarBlob } from '../../nucleo/utilidades.js';

export function iniciarDescargar() {
    escuchar('descargar:pedir', () => {
        const documento = leer('documento');
        if (documento) {
            descargarBlob(documento.archivo, documento.nombre);
        }
    });
}
