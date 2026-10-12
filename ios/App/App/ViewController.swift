// Fecha: 2026-10-12
// Ruta: /ios/App/App/ViewController.swift
// Controlador principal de la app de iPhone: el de Capacitor más los plugins propios de DNNS PDF
// Notas: Capacitor no descubre solos los plugins que viven dentro del proyecto; se registran aquí.

import UIKit
import Capacitor

class ViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(Archivos())
    }
}
