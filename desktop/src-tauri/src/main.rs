// Fecha: 2026-10-12
// Ruta: /desktop/src-tauri/src/main.rs
// Punto de entrada del ejecutable de Windows
// Solo arranca la librería; sin consola en modo release

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    dnns_pdf_lib::run();
}
