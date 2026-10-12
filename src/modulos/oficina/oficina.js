// Fecha: 2026-10-12
// Ruta: /src/modulos/oficina/oficina.js
// Módulo Oficina: abrir documentos de texto, hojas de cálculo y presentaciones (.docx, .xlsx, .pptx)
// Los convierte a PDF en el worker y los abre como un PDF más; con Descargar se guardan ya convertidos
// Notas: el visor avisa con 'oficina:abrir' cuando el archivo elegido es un ZIP (los de Office lo son);
//        el PDF resultante vuelve por 'archivo:abrir'. Se conserva el contenido, no la maquetación exacta.

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { mostrarAviso, abrirProgreso } from '../../ui/dialogos.js';

// Android renombra a .pdf lo que abre con la app: 'informe.docx.pdf' -> 'informe.pdf'
function nombrePdf(nombre) {
    return `${(nombre || 'documento').replace(/\.pdf$/i, '').replace(/\.(docx|xlsx|pptx)$/i, '')}.pdf`;
}

async function convertirYAbrir(archivo) {
    const progreso = abrirProgreso(() => {});
    progreso.actualizar(t('oficina.convirtiendo', { nombre: archivo.name }), null);
    try {
        const buffer = await archivo.arrayBuffer();
        // Lo que el worker escribe dentro del PDF va ya traducido
        const textos = {
            hojaVacia: t('oficina.hojaVacia'),
            filasOmitidas: t('oficina.filasOmitidas'),
            verdadero: t('oficina.verdadero'),
            falso: t('oficina.falso')
        };
        const { bytes } = await pedir('oficina:convertir', { buffer, idioma: leer('idioma'), textos }, [buffer]);
        progreso.cerrar();
        emitir('archivo:abrir', new File([bytes], nombrePdf(archivo.name), { type: 'application/pdf' }));
        mostrarAviso(t('oficina.convertido'));
    } catch (error) {
        progreso.cerrar();
        console.error('No se pudo convertir el documento:', error);
        mostrarAviso(t(error.message === 'TIPO' ? 'errores.noEsPdf' : 'oficina.error'));
    }
}

export function iniciarOficina() {
    escuchar('oficina:abrir', convertirYAbrir);
}
