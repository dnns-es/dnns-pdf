# Cómo contribuir a DNNS PDF

¡Gracias por echar una mano! *(English below.)*

## Antes de empezar

- Lee [ROADMAP.md](ROADMAP.md) para ver en qué fase estamos.
- Si vas a hacer algo grande, abre antes un issue para comentarlo.
- Todo el código es **AGPL-3.0**. Al enviar un PR aceptas publicarlo con esa licencia.
- No añadas dependencias con licencias incompatibles con AGPL-3.0. Pregunta si tienes dudas.

## Ramas

- `main` siempre funciona y se publica sola en GitHub Pages.
- Cada fase en su rama: `fase-1-visor`, `fase-2-windows`, `fase-3-anotar`...
- Arreglos sueltos: `arreglo-descripcion-corta`.
- Todo entra en `main` mediante pull request.

## Commits

Pequeños y descriptivos, en español: `Añade búsqueda de texto en el visor`.

## Convenciones de código

**Cabecera obligatoria** en todos los archivos HTML, JS y CSS:

```javascript
// Fecha: AAAA-MM-DD
// Ruta: /src/motor/worker.js
// Descripción breve del archivo
// Qué funcionalidad o servicio ofrece
// Notas relevantes (opcional)
```

En HTML con `<!-- -->` y en CSS con `/* */`. La fecha es la de creación o la de la última modificación.

**Estilo:**

- Nombres de variables, funciones y comentarios en español: `abrirDocumento()`, `paginaActual`.
- 4 espacios de indentación, comillas simples.
- Funciones cortas (menos de 40-50 líneas).
- Comenta el porqué, no el qué.
- Nunca `innerHTML` con datos que vengan de un PDF: usa `textContent`.
- Nada de texto fijo en HTML o JS: va en `src/i18n/es.json` y `src/i18n/en.json`.

**Arquitectura:**

- MuPDF solo se usa dentro del worker (`src/motor/worker.js`). La interfaz le pide cosas con `pedir()` desde `src/motor/cliente.js`.
- Los módulos de `src/modulos/` no se importan entre sí: se hablan por el bus de eventos (`src/nucleo/eventos.js`).

## Pruebas

Prueba tu cambio con los PDFs de `tests/pdfs/` antes de abrir el PR.

---

## Contributing (English)

- Read [ROADMAP.md](ROADMAP.md) and open an issue before large changes.
- All code is **AGPL-3.0**; by sending a PR you agree to license it that way.
- One branch per phase or fix; everything goes into `main` through a pull request.
- Code identifiers and comments are in Spanish (project convention). Every HTML/JS/CSS file starts with the header shown above.
- 4-space indentation, single quotes, short functions, never `innerHTML` with PDF-derived data, all UI text in `src/i18n/`.
- Test with the PDFs in `tests/pdfs/` before opening a PR.
