// Fecha: 2026-10-12
// Ruta: /src/ui/dialogos.js
// Avisos breves y diálogo de progreso
// Ofrece mostrarAviso() para errores y abrirProgreso() para tareas largas como imprimir

const DURACION_AVISO = 5000;
let temporizadorAviso = null;

export function mostrarAviso(texto) {
    const aviso = document.getElementById('aviso');
    aviso.textContent = texto;
    aviso.hidden = false;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => {
        aviso.hidden = true;
    }, DURACION_AVISO);
}

// Devuelve controles para ir actualizando; alCancelar se llama si el usuario pulsa Cancelar o Esc
export function abrirProgreso(alCancelar) {
    const dialogo = document.getElementById('dialogo-progreso');
    const texto = document.getElementById('texto-progreso');
    const barra = document.getElementById('barra-progreso');
    const botonCancelar = document.getElementById('progreso-cancelar');

    const cancelar = (evento) => {
        evento?.preventDefault();
        alCancelar();
    };
    botonCancelar.addEventListener('click', cancelar);
    dialogo.addEventListener('cancel', cancelar);
    barra.value = 0;
    dialogo.showModal();

    return {
        actualizar(mensaje, fraccion) {
            texto.textContent = mensaje;
            barra.value = fraccion;
        },
        cerrar() {
            botonCancelar.removeEventListener('click', cancelar);
            dialogo.removeEventListener('cancel', cancelar);
            dialogo.close();
        }
    };
}
