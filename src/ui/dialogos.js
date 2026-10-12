// Fecha: 2026-10-12
// Ruta: /src/ui/dialogos.js
// Avisos breves y diálogo de progreso
// Ofrece mostrarAviso() para errores, pedirTexto(), confirmar() y abrirProgreso() para tareas largas

import { traducirPagina } from '../nucleo/i18n.js';

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

// Pide un texto (nota, cuadro de texto, sello personalizado). Devuelve null si se cancela.
export function pedirTexto(claveTitulo, valorInicial = '', multilinea = true) {
    const dialogo = document.getElementById('dialogo-texto');
    const formulario = document.getElementById('formulario-texto');
    const titulo = document.getElementById('titulo-texto');
    const area = document.getElementById('campo-texto');
    const linea = document.getElementById('campo-texto-linea');
    titulo.dataset.i18n = claveTitulo;
    traducirPagina(dialogo);
    area.hidden = !multilinea;
    linea.hidden = multilinea;
    const campo = multilinea ? area : linea;
    campo.value = valorInicial;

    return new Promise((resolver) => {
        const terminar = (valor) => {
            formulario.removeEventListener('submit', alEnviar);
            dialogo.removeEventListener('cancel', alCancelar);
            document.getElementById('texto-cancelar').removeEventListener('click', alCancelar);
            dialogo.close();
            resolver(valor);
        };
        const alEnviar = (evento) => {
            evento.preventDefault();
            terminar(campo.value.trim());
        };
        const alCancelar = (evento) => {
            evento.preventDefault();
            terminar(null);
        };
        formulario.addEventListener('submit', alEnviar);
        dialogo.addEventListener('cancel', alCancelar);
        document.getElementById('texto-cancelar').addEventListener('click', alCancelar);
        dialogo.showModal();
        campo.focus();
        campo.select();
    });
}

// Pregunta sí/no con textos traducidos. Devuelve true si el usuario acepta.
export function confirmar(claveTexto, claveAceptar = 'comun.aceptar') {
    const dialogo = document.getElementById('dialogo-confirmar');
    const texto = document.getElementById('texto-confirmar');
    const aceptar = document.getElementById('confirmar-aceptar');
    texto.dataset.i18n = claveTexto;
    aceptar.dataset.i18n = claveAceptar;
    traducirPagina(dialogo);
    return new Promise((resolver) => {
        const terminar = (valor) => {
            aceptar.removeEventListener('click', alAceptar);
            dialogo.removeEventListener('cancel', alCancelar);
            document.getElementById('confirmar-cancelar').removeEventListener('click', alCancelar);
            dialogo.close();
            resolver(valor);
        };
        const alAceptar = () => terminar(true);
        const alCancelar = (evento) => {
            evento.preventDefault();
            terminar(false);
        };
        aceptar.addEventListener('click', alAceptar);
        dialogo.addEventListener('cancel', alCancelar);
        document.getElementById('confirmar-cancelar').addEventListener('click', alCancelar);
        dialogo.showModal();
    });
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
        // fraccion null = barra indeterminada (tarea sin avance conocido)
        actualizar(mensaje, fraccion) {
            texto.textContent = mensaje;
            if (fraccion === null) {
                barra.removeAttribute('value');
            } else {
                barra.value = fraccion;
            }
        },
        cerrar() {
            botonCancelar.removeEventListener('click', cancelar);
            dialogo.removeEventListener('cancel', cancelar);
            dialogo.close();
        }
    };
}
