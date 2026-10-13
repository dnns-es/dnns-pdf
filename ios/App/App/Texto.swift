// Fecha: 2026-10-13
// Ruta: /ios/App/App/Texto.swift
// Lector de texto del iPhone para el escáner «Solo texto» de DNNS PDF
// Usa Vision, el reconocedor de texto del propio sistema (el de «Texto en vivo»): lee bien papel torcido,
// arrugado o con sombras. Devuelve cada línea con su texto, su caja y la de cada palabra, en píxeles de la foto.
// Notas: todo ocurre en el dispositivo, sin conexión. La foto llega en base64 desde la web.

import UIKit
import Vision
import Capacitor

@objc(Texto)
public class Texto: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "Texto"
    public let jsName = "Texto"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "reconocer", returnType: CAPPluginReturnPromise)
    ]

    @objc func reconocer(_ call: CAPPluginCall) {
        guard let datos = call.getString("datos"), let bytes = Data(base64Encoded: datos),
              let imagen = UIImage(data: bytes)?.cgImage else {
            call.reject("No se pudo leer la foto.")
            return
        }
        let ancho = CGFloat(imagen.width)
        let alto = CGFloat(imagen.height)
        let peticion = VNRecognizeTextRequest { peticion, error in
            if let error = error {
                call.reject("No se pudo reconocer el texto.", nil, error)
                return
            }
            let lineas = (peticion.results as? [VNRecognizedTextObservation] ?? []).compactMap {
                Texto.linea($0, ancho: ancho, alto: alto)
            }
            call.resolve(["ancho": ancho, "alto": alto, "lineas": lineas])
        }
        peticion.recognitionLevel = .accurate
        peticion.usesLanguageCorrection = true
        peticion.recognitionLanguages = ["es-ES", "en-US"]
        if #available(iOS 16.0, *) {
            peticion.automaticallyDetectsLanguage = true
        }
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try VNImageRequestHandler(cgImage: imagen, options: [:]).perform([peticion])
            } catch {
                call.reject("No se pudo reconocer el texto.", nil, error)
            }
        }
    }

    // Vision mide de 0 a 1 con el origen abajo a la izquierda; la web quiere píxeles desde arriba
    private static func caja(_ r: CGRect, ancho: CGFloat, alto: CGFloat) -> [String: CGFloat] {
        return ["x0": r.minX * ancho, "y0": (1 - r.maxY) * alto, "x1": r.maxX * ancho, "y1": (1 - r.minY) * alto]
    }

    private static func linea(_ observacion: VNRecognizedTextObservation, ancho: CGFloat, alto: CGFloat) -> [String: Any]? {
        guard let candidato = observacion.topCandidates(1).first else {
            return nil
        }
        let texto = candidato.string
        var palabras: [[String: Any]] = []
        texto.enumerateSubstrings(in: texto.startIndex..<texto.endIndex, options: .byWords) { palabra, rango, _, _ in
            guard let palabra = palabra, let cuadro = try? candidato.boundingBox(for: rango) else {
                return
            }
            palabras.append(["texto": palabra, "caja": caja(cuadro.boundingBox, ancho: ancho, alto: alto)])
        }
        // Alto de la fila medido en el lado izquierdo: no crece si la línea está torcida
        let altoFila = hypot((observacion.topLeft.x - observacion.bottomLeft.x) * ancho, (observacion.topLeft.y - observacion.bottomLeft.y) * alto)
        return [
            "texto": texto,
            "confianza": candidato.confidence,
            "caja": caja(observacion.boundingBox, ancho: ancho, alto: alto),
            "altoFila": altoFila,
            "palabras": palabras
        ]
    }
}
