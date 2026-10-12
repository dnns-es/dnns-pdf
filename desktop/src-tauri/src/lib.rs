// Fecha: 2026-10-12
// Ruta: /desktop/src-tauri/src/lib.rs
// Parte nativa de la app de escritorio (Tauri)
// Abre el PDF recibido por doble clic o línea de comandos, lee archivos y registra los plugins
// Notas: la interfaz es la misma web de /dist. Lo que necesita del sistema lo pide por `invoke`.
//        Una sola instancia: si ya está abierta y se hace doble clic en otro PDF, se lo pasa
//        a la ventana existente con el evento 'archivo-recibido'.

use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

/// Busca entre los argumentos el primer PDF que exista de verdad en disco.
fn pdf_en_argumentos<I: IntoIterator<Item = String>>(argumentos: I) -> Option<PathBuf> {
    argumentos
        .into_iter()
        .skip(1)
        .map(PathBuf::from)
        .find(|ruta| ruta.is_file() && es_pdf(ruta))
}

fn es_pdf(ruta: &Path) -> bool {
    ruta.extension()
        .map(|ext| ext.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false)
}

/// Ruta del PDF con el que se arrancó la app (doble clic o línea de comandos), si lo hubo.
#[tauri::command]
fn archivo_inicial() -> Option<String> {
    pdf_en_argumentos(std::env::args()).map(|ruta| ruta.to_string_lossy().into_owned())
}

/// Devuelve el contenido de un archivo en binario (la UI lo pasa al worker de MuPDF).
#[tauri::command]
fn leer_archivo(ruta: String) -> Result<tauri::ipc::Response, String> {
    std::fs::read(&ruta)
        .map(tauri::ipc::Response::new)
        .map_err(|error| format!("No se pudo leer {ruta}: {error}"))
}

fn enfocar_ventana(app: &AppHandle) {
    if let Some(ventana) = app.get_webview_window("main") {
        let _ = ventana.unminimize();
        let _ = ventana.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argumentos, _cwd| {
            enfocar_ventana(app);
            if let Some(ruta) = pdf_en_argumentos(argumentos) {
                let _ = app.emit("archivo-recibido", ruta.to_string_lossy().into_owned());
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![archivo_inicial, leer_archivo])
        .run(tauri::generate_context!())
        .expect("No se pudo arrancar DNNS PDF");
}
