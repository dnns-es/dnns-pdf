// Fecha: 2026-10-12
// Ruta: /src/motor/seguridad.js
// Seguridad dentro del worker de MuPDF: proteger con contraseña y permisos, y quitar la protección
// Notas: corre dentro del worker. Proteger devuelve un PDF nuevo cifrado (AES-256) con todos los cambios;
//        el documento abierto no se toca. Quitar la protección exige la contraseña de propietario si hay
//        permisos restringidos (como hacen los lectores habituales). Las contraseñas no salen del worker.

// Bits de permisos del PDF (todos permitidos = -4)
const TODOS = -4;
const BITS = {
    imprimir: 4 | 2048,
    copiar: 16 | 512,
    modificar: 8 | 32 | 256 | 1024
};
const NIVEL_PROPIETARIO = 4;

export function crearModuloSeguridad(exigirDocumento) {
    // Contraseña con la que se abrió el documento actual y qué nivel dio (2 usuario, 4 propietario)
    let claveAbierta = null;
    let nivel = 0;

    function permisos(doc) {
        return { imprimir: doc.hasPermission('print'), copiar: doc.hasPermission('copy'), modificar: doc.hasPermission('edit') };
    }

    function bytesDe(doc, opciones) {
        const buffer = doc.saveToBuffer(opciones);
        const bytes = buffer.asUint8Array().slice();
        buffer.destroy();
        return { bytes, _transferir: [bytes.buffer] };
    }

    // Las opciones de guardado se separan por comas: una coma en la contraseña la rompería
    function limpiar(clave) {
        return String(clave ?? '').replace(/,/g, '');
    }

    return {
        registrarApertura(clave, nivelDado) {
            claveAbierta = clave ?? null;
            nivel = nivelDado ?? 0;
        },

        estado() {
            const doc = exigirDocumento();
            const cifrado = doc.getMetaData('encryption') !== 'None';
            const restringido = Object.values(permisos(doc)).some((permitido) => !permitido);
            return { cifrado, restringido, permisos: permisos(doc), conClaveApertura: claveAbierta !== null, esPropietario: (nivel & NIVEL_PROPIETARIO) !== 0 };
        },

        // restricciones: { imprimir, copiar, modificar } = true para impedirlo
        proteger({ claveApertura = '', clavePropietario = '', restricciones = {} }) {
            const doc = exigirDocumento();
            let bits = TODOS;
            for (const [nombre, mascara] of Object.entries(BITS)) {
                if (restricciones[nombre]) {
                    bits &= ~mascara;
                }
            }
            const usuario = limpiar(claveApertura);
            const propietario = limpiar(clavePropietario) || usuario;
            if (!usuario && !propietario) {
                throw new Error('SINCLAVE');
            }
            const opciones = ['encrypt=aes-256', `permissions=${bits}`, 'garbage=compact'];
            if (usuario) {
                opciones.push(`user-password=${usuario}`);
            }
            opciones.push(`owner-password=${propietario}`);
            return bytesDe(doc, opciones.join(','));
        },

        // clave: la de propietario si hay permisos restringidos y no se abrió como propietario
        quitarProteccion({ clave = '' } = {}) {
            const doc = exigirDocumento();
            const { cifrado, restringido, esPropietario } = this.estado();
            if (!cifrado) {
                throw new Error('SINCIFRAR');
            }
            if (restringido && !esPropietario) {
                const resultado = clave ? doc.authenticatePassword(clave) : 0;
                if ((resultado & NIVEL_PROPIETARIO) === 0) {
                    throw new Error('CLAVE');
                }
                nivel |= resultado;
            }
            return bytesDe(doc, 'encrypt=none,garbage=compact');
        }
    };
}
