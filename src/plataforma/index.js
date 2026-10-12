// Fecha: 2026-10-12
// Ruta: /src/plataforma/index.js
// Puente entre la interfaz y la plataforma donde corre (web o escritorio Tauri)
// Expone las mismas funciones en los dos sitios; en la web, las de escritorio no hacen nada
// Notas: las librerías de Tauri se cargan con import() solo en escritorio, así la web no las descarga

export function esEscritorio() {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function escritorio() {
    return import('./escritorio.js');
}

// Archivo con el que arrancó la app de escritorio (doble clic o línea de comandos), como File
export async function archivoInicial() {
    return esEscritorio() ? (await escritorio()).archivoInicial() : null;
}

// Llama a callback(File) cada vez que el sistema manda otro PDF a la app ya abierta
export async function alRecibirArchivo(callback) {
    if (esEscritorio()) {
        (await escritorio()).alRecibirArchivo(callback);
    }
}

// Título de la pestaña y, en escritorio, también de la ventana nativa
export async function ponerTitulo(titulo) {
    document.title = titulo;
    if (esEscritorio()) {
        await (await escritorio()).ponerTituloVentana(titulo);
    }
}

export async function comprobarActualizacion() {
    return esEscritorio() ? (await escritorio()).comprobarActualizacion() : null;
}

export async function reiniciarApp() {
    if (esEscritorio()) {
        await (await escritorio()).reiniciarApp();
    }
}
