// Fecha: 2026-10-12
// Ruta: /ios/App/App/Recibidos.swift
// Documentos que llegan a la app desde «Abrir en», «Compartir» o la app Archivos
// Se copian a la carpeta temporal de la app y se avisan a la web; si la web aún no está lista,
// se guardan hasta que pida el archivo inicial.
// Notas: la copia se llama siempre «documento.<extensión>» para que la dirección local no lleve espacios ni
//        acentos; el nombre de verdad viaja aparte.

import Foundation

final class Recibidos {
    static let compartido = Recibidos()
    static let aviso = Notification.Name("DnnsPdfArchivoRecibido")

    private static let conocidas: Set<String> = ["pdf", "docx", "xlsx", "pptx", "rtf", "txt", "py", "bmp", "jpg", "jpeg", "png"]

    private let cola = DispatchQueue(label: "es.dnns.pdf.recibidos")
    private var pendiente: [String: String]?
    private var webLista = false

    func recibir(_ url: URL) {
        guard url.isFileURL, let copia = copiar(url) else {
            return
        }
        cola.sync {
            if webLista {
                NotificationCenter.default.post(name: Recibidos.aviso, object: nil, userInfo: copia)
            } else {
                pendiente = copia
            }
        }
    }

    /// Lo pide la web al arrancar; desde ese momento los siguientes se avisan al momento
    func tomarInicial() -> [String: String]? {
        cola.sync {
            webLista = true
            let inicial = pendiente
            pendiente = nil
            return inicial
        }
    }

    private func copiar(_ url: URL) -> [String: String]? {
        let accedido = url.startAccessingSecurityScopedResource()
        defer {
            if accedido {
                url.stopAccessingSecurityScopedResource()
            }
        }
        var nombre = url.lastPathComponent.isEmpty ? "documento.pdf" : url.lastPathComponent
        var tipo = url.pathExtension.lowercased()
        if !Recibidos.conocidas.contains(tipo) {
            tipo = "pdf"
            nombre += ".pdf"
        }
        let gestor = FileManager.default
        let carpeta = gestor.temporaryDirectory.appendingPathComponent("recibidos", isDirectory: true)
        let destino = carpeta.appendingPathComponent("documento.\(tipo)")
        do {
            try? gestor.removeItem(at: carpeta)
            try gestor.createDirectory(at: carpeta, withIntermediateDirectories: true)
            try gestor.copyItem(at: url, to: destino)
            return ["ruta": destino.path, "nombre": nombre]
        } catch {
            return nil
        }
    }
}
