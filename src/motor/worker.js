// Fecha: 2026-10-12
// Ruta: /src/motor/worker.js
// Web Worker que aloja MuPDF.js
// Ejecuta todas las operaciones PDF fuera del hilo principal para no congelar la interfaz
// Notas: protocolo de mensajes { id, accion, datos } -> { id, ok, resultado | error }.
//        Las acciones se irán ampliando en cada fase (abrir, renderizar, buscar...).

import * as mupdf from 'mupdf';

const acciones = {
    // Crear un PDF vacío en memoria demuestra que el .wasm funciona, no solo que se descargó
    comprobar() {
        const prueba = new mupdf.PDFDocument();
        const paginas = prueba.countPages();
        prueba.destroy();
        return { version: __VERSION_MUPDF__, paginas };
    }
};

self.addEventListener('message', async (evento) => {
    const { id, accion, datos } = evento.data;
    const manejador = acciones[accion];
    if (!manejador) {
        self.postMessage({ id, ok: false, error: `Acción desconocida: ${accion}` });
        return;
    }
    try {
        const resultado = await manejador(datos);
        self.postMessage({ id, ok: true, resultado });
    } catch (error) {
        self.postMessage({ id, ok: false, error: error?.message ?? String(error) });
    }
});

// Aviso explícito: el import de mupdf ya resolvió su await, así que el motor está listo
self.postMessage({ tipo: 'listo' });
