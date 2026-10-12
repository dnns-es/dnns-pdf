// Fecha: 2026-10-12
// Ruta: /src/modulos/visor/contrasena.js
// Diálogo para pedir la contraseña de un PDF protegido
// Devuelve la contraseña escrita, o null si el usuario cancela
// Notas: la contraseña solo pasa al worker; no se guarda ni se registra en ningún sitio

export function pedirContrasena(conError) {
    const dialogo = document.getElementById('dialogo-clave');
    const formulario = document.getElementById('formulario-clave');
    const campo = document.getElementById('campo-clave');
    const botonCancelar = document.getElementById('clave-cancelar');
    document.getElementById('error-clave').hidden = !conError;
    campo.value = '';

    return new Promise((resolver) => {
        const terminar = (valor) => {
            formulario.removeEventListener('submit', alEnviar);
            botonCancelar.removeEventListener('click', alCancelar);
            dialogo.removeEventListener('cancel', alCancelar);
            dialogo.close();
            campo.value = '';
            resolver(valor);
        };
        const alEnviar = (evento) => {
            evento.preventDefault();
            terminar(campo.value);
        };
        const alCancelar = (evento) => {
            evento.preventDefault();
            terminar(null);
        };
        formulario.addEventListener('submit', alEnviar);
        botonCancelar.addEventListener('click', alCancelar);
        dialogo.addEventListener('cancel', alCancelar);
        dialogo.showModal();
        campo.focus();
    });
}
