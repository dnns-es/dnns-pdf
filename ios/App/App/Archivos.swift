// Fecha: 2026-10-12
// Ruta: /ios/App/App/Archivos.swift
// Puente de archivos entre iOS y la web de DNNS PDF (misma interfaz que Archivos.java de Android)
// Entrega a la web los documentos recibidos, guarda donde elija el usuario con el selector de Archivos
// e imprime el PDF tal cual con AirPrint
// Notas: la web lee el documento recibido por el servidor local de Capacitor (sin pasar megas en base64).
//        Al guardar e imprimir sí llega en base64 desde la web. Nada sale del dispositivo.

import UIKit
import Capacitor

@objc(Archivos)
public class Archivos: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "Archivos"
    public let jsName = "Archivos"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "archivoInicial", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "guardar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "imprimir", returnType: CAPPluginReturnPromise)
    ]

    private var llamadaGuardar: CAPPluginCall?

    override public func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(alRecibir(_:)), name: Recibidos.aviso, object: nil)
    }

    @objc private func alRecibir(_ aviso: Notification) {
        guard let archivo = aviso.userInfo as? [String: String] else {
            return
        }
        notifyListeners("archivoRecibido", data: archivo, retainUntilConsumed: true)
    }

    @objc func archivoInicial(_ call: CAPPluginCall) {
        call.resolve(Recibidos.compartido.tomarInicial() ?? [:])
    }

    // ---- Guardar: se escribe en la carpeta temporal y el usuario elige destino con el selector de Archivos

    @objc func guardar(_ call: CAPPluginCall) {
        guard let datos = call.getString("datos"), let bytes = Data(base64Encoded: datos) else {
            call.reject("Faltan los datos del archivo.")
            return
        }
        let archivo: URL
        do {
            archivo = try escribirTemporal(bytes, en: "guardar", nombre: call.getString("nombre") ?? "documento.pdf")
        } catch {
            call.reject("No se pudo preparar el archivo.")
            return
        }
        DispatchQueue.main.async {
            let selector = UIDocumentPickerViewController(forExporting: [archivo], asCopy: true)
            selector.delegate = self
            self.llamadaGuardar = call
            self.bridge?.viewController?.present(selector, animated: true)
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        terminarGuardar(!urls.isEmpty)
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        terminarGuardar(false)
    }

    private func terminarGuardar(_ guardado: Bool) {
        llamadaGuardar?.resolve(["guardado": guardado])
        llamadaGuardar = nil
    }

    // ---- Imprimir: el PDF va entero a AirPrint, sin volver a maquetarlo

    @objc func imprimir(_ call: CAPPluginCall) {
        guard let datos = call.getString("datos"), let bytes = Data(base64Encoded: datos) else {
            call.reject("Faltan los datos del PDF.")
            return
        }
        let nombre = call.getString("nombre") ?? "documento.pdf"
        DispatchQueue.main.async {
            let info = UIPrintInfo(dictionary: nil)
            info.outputType = .general
            info.jobName = nombre
            let impresion = UIPrintInteractionController.shared
            impresion.printInfo = info
            impresion.printingItem = bytes
            // En iPad el panel de impresión sale como globo y necesita un punto de anclaje
            if UIDevice.current.userInterfaceIdiom == .pad, let vista = self.bridge?.viewController?.view {
                let centro = CGRect(x: vista.bounds.midX, y: vista.bounds.midY, width: 1, height: 1)
                impresion.present(from: centro, in: vista, animated: true)
            } else {
                impresion.present(animated: true)
            }
            call.resolve()
        }
    }

    // ---- Utilidades

    private func escribirTemporal(_ bytes: Data, en subcarpeta: String, nombre: String) throws -> URL {
        let gestor = FileManager.default
        let carpeta = gestor.temporaryDirectory.appendingPathComponent(subcarpeta, isDirectory: true)
        try? gestor.removeItem(at: carpeta)
        try gestor.createDirectory(at: carpeta, withIntermediateDirectories: true)
        // El nombre lo ve el usuario en el selector: se respeta, quitando solo lo que no vale en un archivo
        let limpio = nombre.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-")
        let archivo = carpeta.appendingPathComponent(limpio.isEmpty ? "documento.pdf" : limpio)
        try bytes.write(to: archivo)
        return archivo
    }
}
