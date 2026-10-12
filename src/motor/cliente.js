// Fecha: 2026-10-12
// Ruta: /src/motor/cliente.js
// Cliente del worker de MuPDF
// Convierte el intercambio de mensajes con el worker en llamadas que devuelven promesas
// Notas: la UI nunca toca MuPDF directamente; todo pasa por pedir('accion', datos)

let worker = null;
let siguienteId = 1;
const pendientes = new Map();
let promesaListo = null;

export function iniciarMotor() {
    if (promesaListo) {
        return promesaListo;
    }
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    promesaListo = new Promise((resolver, rechazar) => {
        worker.addEventListener('error', (evento) => {
            rechazar(new Error(evento.message || 'Fallo al cargar el worker de MuPDF'));
        });
        worker.addEventListener('message', (evento) => {
            if (evento.data?.tipo === 'listo') {
                resolver();
                return;
            }
            resolverPendiente(evento.data);
        });
    });
    return promesaListo;
}

function resolverPendiente({ id, ok, resultado, error }) {
    const pendiente = pendientes.get(id);
    if (!pendiente) {
        return;
    }
    pendientes.delete(id);
    if (ok) {
        pendiente.resolver(resultado);
    } else {
        pendiente.rechazar(new Error(error));
    }
}

// transferibles: ArrayBuffers que se ceden al worker sin copiarlos (PDFs grandes)
export async function pedir(accion, datos, transferibles = []) {
    await iniciarMotor();
    const id = siguienteId++;
    return new Promise((resolver, rechazar) => {
        pendientes.set(id, { resolver, rechazar });
        worker.postMessage({ id, accion, datos }, transferibles);
    });
}
