# Firma del instalador de Windows (SmartScreen)

## Qué pasa hoy

El instalador `.exe` **no va firmado con certificado de código**. Windows muestra la primera vez
«Windows protegió su PC» (SmartScreen). Funciona: pulsar «Más información» → «Ejecutar de todas
formas». Asusta, pero no hay riesgo: el archivo viene de la Release de GitHub.

Esto es distinto de la **firma de las actualizaciones**, que sí existe desde el principio:
cada actualización va firmada con la clave del proyecto (minisign) y la app instalada rechaza
cualquier paquete que no la lleve. Esa firma protege contra manipulación; la de SmartScreen solo
quita el aviso.

## Opciones para quitar el aviso

| Opción | Coste | Cómo |
|---|---|---|
| **SignPath Foundation** | Gratis para código abierto | Solicitud en https://signpath.org/apply (proyecto, licencia, repo público). Si aceptan, firman desde su servicio integrado en GitHub Actions. Tarda semanas y exige cumplir sus normas (p. ej. publicar desde CI, revisores). |
| **Azure Trusted Signing** | ~10 $/mes | Cuenta Azure, verificación de identidad de la organización, firma desde Actions con `azure/trusted-signing-action`. Reputación SmartScreen inmediata. |
| Certificado OV/EV clásico | 200-400 €/año | Comprar a una CA, token hardware (EV). Hoy no compensa. |

## Cómo se integraría en `release.yml`

Tauri permite firmar el ejecutable y el instalador con un comando propio:

```json
"bundle": {
    "windows": {
        "signCommand": "firmar.cmd %1"
    }
}
```

El workflow llamaría al servicio elegido (SignPath o Trusted Signing) desde ese comando, con las
credenciales en los secretos del repositorio. Hasta entonces, el instalador se publica sin firma.

## Decisión

Pendiente de Antonio: solicitar SignPath (gratis, lento) o Trusted Signing (de pago, rápido).
