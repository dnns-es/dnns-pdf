// Fecha: 2026-10-12
// Ruta: /src/modulos/organizar/archivos.js
// Elegir varios archivos (PDF e imágenes) y prepararlos para el worker
// Notas: todo se lee en local; nada sale del dispositivo

const TIPOS_IMAGEN = /^image\/(jpeg|png)$/;

export function esImagen(archivo) {
    return TIPOS_IMAGEN.test(archivo.type) || /\.(jpe?g|png)$/i.test(archivo.name);
}

export function esPdf(archivo) {
    return archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name);
}

// Abre el selector del sistema; devuelve los archivos elegidos (vacío si se cancela)
export function elegirArchivos({ multiple = true, soloImagenes = false } = {}) {
    const entrada = document.getElementById('entrada-varios');
    entrada.multiple = multiple;
    entrada.accept = soloImagenes ? 'image/jpeg,image/png' : 'application/pdf,.pdf,image/jpeg,image/png';
    return new Promise((resolver) => {
        const alCambiar = () => {
            entrada.removeEventListener('change', alCambiar);
            const archivos = [...entrada.files].filter((a) => esPdf(a) || esImagen(a));
            entrada.value = '';
            resolver(archivos);
        };
        entrada.addEventListener('change', alCambiar);
        // Si el usuario cierra el selector sin elegir, 'change' no llega: 'cancel' sí (navegadores modernos)
        entrada.addEventListener('cancel', () => {
            entrada.removeEventListener('change', alCambiar);
            resolver([]);
        }, { once: true });
        entrada.click();
    });
}

// Pieza para 'paginas:unir' o 'paginas:insertar*': los bytes se ceden al worker sin copiarlos
export async function bytesDe(archivo) {
    return new Uint8Array(await archivo.arrayBuffer());
}

// Nombre base para los archivos resultantes: «informe.pdf» -> «informe»
export function nombreBase(nombre) {
    return (nombre || 'documento').replace(/\.pdf$/i, '');
}
