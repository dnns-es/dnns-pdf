// Fecha: 2026-10-12
// Ruta: /src/modulos/visor/colaRender.js
// Cola de trabajos de pintado con prioridad
// Las páginas visibles pasan delante de las miniaturas, y se descarta lo que ya no se ve
// Notas: solo hay un trabajo en marcha a la vez; el worker es un único hilo y mandarle
//        muchos a la vez solo retrasaría lo que el usuario está mirando

const pendientes = new Map();
let ocupado = false;
let generacion = 0;

// clave: identifica el trabajo (repetir la clave sustituye al anterior)
// prioridad: menor = antes. vigente(): si devuelve false al llegar su turno, se descarta
export function encolar(clave, prioridad, tarea, vigente = () => true) {
    pendientes.set(clave, { prioridad, tarea, vigente });
    procesar();
}

export function cancelar(clave) {
    pendientes.delete(clave);
}

// Al cambiar de documento todo lo pendiente sobra, y lo que esté en curso debe ignorarse
export function reiniciarCola() {
    pendientes.clear();
    generacion++;
}

export function generacionActual() {
    return generacion;
}

function siguiente() {
    let mejor = null;
    for (const [clave, trabajo] of pendientes) {
        if (!mejor || trabajo.prioridad < mejor[1].prioridad) {
            mejor = [clave, trabajo];
        }
    }
    return mejor;
}

async function procesar() {
    if (ocupado) {
        return;
    }
    ocupado = true;
    try {
        let elegido = siguiente();
        while (elegido) {
            const [clave, trabajo] = elegido;
            pendientes.delete(clave);
            if (trabajo.vigente()) {
                try {
                    await trabajo.tarea();
                } catch (error) {
                    console.error(`Fallo al pintar '${clave}':`, error);
                }
            }
            elegido = siguiente();
        }
    } finally {
        ocupado = false;
    }
}
