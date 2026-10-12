// Fecha: 2026-10-12
// Ruta: /desktop/src-tauri/src/lib.rs
// Parte nativa de la app de escritorio (Tauri)
// Abre el PDF recibido por doble clic o línea de comandos, lee y escribe archivos y registra los plugins
// Notas: la interfaz es la misma web de /dist. Lo que necesita del sistema lo pide por `invoke`.
//        Una sola instancia: si ya está abierta y se hace doble clic en otro PDF, se lo pasa
//        a la ventana existente con el evento 'archivo-recibido'. En macOS llega por el evento `Opened`.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

/// Busca entre los argumentos el primer documento que exista de verdad en disco.
fn pdf_en_argumentos<I: IntoIterator<Item = String>>(argumentos: I) -> Option<PathBuf> {
    argumentos
        .into_iter()
        .skip(1)
        .map(PathBuf::from)
        .find(|ruta| ruta.is_file() && es_documento(ruta))
}

/// PDF, o documento de texto, hoja de cálculo, presentación, RTF, texto o imagen (la web los convierte a PDF)
fn es_documento(ruta: &Path) -> bool {
    const CONOCIDAS: [&str; 11] = ["pdf", "docx", "xlsx", "pptx", "rtf", "txt", "py", "bmp", "jpg", "jpeg", "png"];
    ruta.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| CONOCIDAS.iter().any(|conocida| ext.eq_ignore_ascii_case(conocida)))
        .unwrap_or(false)
}

/// En macOS el Finder no pasa el documento por argumentos: llega con el evento `Opened`, a veces antes de
/// que la interfaz esté escuchando. Hasta que la interfaz pide el archivo inicial se guarda aquí.
#[derive(Default)]
struct Recibidos {
    interfaz_lista: bool,
    pendiente: Option<String>,
}

/// Ruta del PDF con el que se arrancó la app (doble clic, línea de comandos o Finder), si lo hubo.
#[tauri::command]
fn archivo_inicial(recibidos: tauri::State<'_, Mutex<Recibidos>>) -> Option<String> {
    let mut recibidos = recibidos.lock().unwrap();
    recibidos.interfaz_lista = true;
    recibidos
        .pendiente
        .take()
        .or_else(|| pdf_en_argumentos(std::env::args()).map(|ruta| ruta.to_string_lossy().into_owned()))
}

#[cfg(target_os = "macos")]
fn recibir_del_finder(app: &AppHandle, urls: Vec<tauri::Url>) {
    let Some(ruta) = urls
        .into_iter()
        .filter_map(|url| url.to_file_path().ok())
        .find(|ruta| ruta.is_file() && es_documento(ruta))
    else {
        return;
    };
    let ruta = ruta.to_string_lossy().into_owned();
    let estado = app.state::<Mutex<Recibidos>>();
    let mut recibidos = estado.lock().unwrap();
    if recibidos.interfaz_lista {
        enfocar_ventana(app);
        let _ = app.emit("archivo-recibido", ruta);
    } else {
        recibidos.pendiente = Some(ruta);
    }
}

/// Devuelve el contenido de un archivo en binario (la UI lo pasa al worker de MuPDF).
#[tauri::command]
fn leer_archivo(ruta: String) -> Result<tauri::ipc::Response, String> {
    std::fs::read(&ruta)
        .map(tauri::ipc::Response::new)
        .map_err(|error| format!("No se pudo leer {ruta}: {error}"))
}

/// Escribe el PDF en la ruta pedida: primero en un archivo temporal al lado y luego lo sustituye,
/// así un fallo a medias no deja el original roto. La ruta va en la cabecera `ruta` (codificada como
/// URL, porque las cabeceras solo admiten ASCII) y los bytes, en el cuerpo sin pasar por JSON.
#[tauri::command]
fn escribir_archivo(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let codificada = request
        .headers()
        .get("ruta")
        .and_then(|valor| valor.to_str().ok())
        .ok_or("Falta la ruta del archivo")?;
    let ruta = PathBuf::from(urlencoding::decode(codificada).map_err(|error| error.to_string())?.into_owned());
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Faltan los datos del archivo".into());
    };
    let nombre = ruta.file_name().and_then(|n| n.to_str()).unwrap_or("documento.pdf");
    let temporal = ruta.with_file_name(format!("{nombre}.tmp"));
    std::fs::write(&temporal, bytes).map_err(|error| format!("No se pudo escribir {}: {error}", temporal.display()))?;
    std::fs::rename(&temporal, &ruta).map_err(|error| {
        let _ = std::fs::remove_file(&temporal);
        format!("No se pudo sustituir {}: {error}", ruta.display())
    })
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
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(Recibidos::default()))
        .invoke_handler(tauri::generate_handler![archivo_inicial, leer_archivo, escribir_archivo])
        .build(tauri::generate_context!())
        .expect("No se pudo arrancar DNNS PDF")
        .run(|_app, _evento| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _evento {
                recibir_del_finder(_app, urls);
            }
        });
}
