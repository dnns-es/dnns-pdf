# DNNS PDF

**Español** · [English](#english)

Editor de PDF libre y gratuito, con las funciones de los editores comerciales. Sin registro, sin anuncios y sin subir tus documentos a ningún sitio.

**Pruébalo:** https://dnns-es.github.io/dnns-pdf/

## Privacidad

Todo se procesa en tu dispositivo. Tus PDF nunca salen de tu navegador. La única excepción será la conversión a Word/Excel (fase 8), que será opcional y te avisará antes de subir nada.

## Funciones

Mira [ROADMAP.md](ROADMAP.md) para ver qué hay hecho y qué viene.

**Ya disponible (visor):**

- Abrir PDF con botón, arrastrando o con «Abrir con» desde el sistema (PWA instalada)
- Miniaturas, índice del documento, ir a página y atajos de teclado
- Zoom: ajustar al ancho o a la página, Ctrl+rueda y pellizco en el móvil
- Búsqueda de texto con resaltado, seleccionar y copiar texto
- PDFs protegidos con contraseña, imprimir y descargar
- Modo claro y oscuro, y fluido con documentos de cientos de páginas

**Anotar:**

- Resaltar, subrayar y tachar texto; notas adhesivas y cuadros de texto
- Lápiz, rectángulo, círculo, línea y flecha con color, grosor y opacidad
- Sellos (Aprobado, Revisado, Borrador, Confidencial, Urgente y personalizados)
- Mover y borrar anotaciones, lista de anotaciones en el panel, deshacer y rehacer
- Las anotaciones se guardan dentro del PDF en formato estándar: se ven en cualquier lector

**App de Windows:** instalador en la [última Release](https://github.com/dnns-es/dnns-pdf/releases/latest)
(`DNNS.PDF_x.y.z_x64-setup.exe`). Se instala sin administrador, asocia los `.pdf` y se actualiza sola.
Windows puede avisar la primera vez («Windows protegió su PC»): pulsa «Más información» → «Ejecutar de todas formas».
El motivo está en [docs/firma-smartscreen.md](docs/firma-smartscreen.md).

**En camino:**
- App de Android
- Organizar páginas: unir, dividir, rotar, reordenar
- Formularios y firma
- Edición de texto e imágenes, redacción
- Contraseñas, compresión, OCR

Se puede instalar como app (PWA) desde el navegador y funciona sin conexión.

## Desarrollo

```bash
npm install
npm run dev            # web en http://localhost:5173/dnns-pdf/
```

App de Windows (necesita [Rust](https://rustup.rs) y las Build Tools de Visual Studio con C++):

```bash
cd desktop
npx tauri dev          # app de escritorio en desarrollo
npx tauri build        # instalador en desktop/src-tauri/target/release/bundle/nsis/
```

Publicar una versión (web + Windows a la vez): `npm run release -- 0.2.0`. Sube el número en todos
los sitios, crea la etiqueta `v0.2.0` y GitHub Actions compila, firma y publica la Release.

Motor PDF: [MuPDF.js](https://mupdf.readthedocs.io/) (WebAssembly) dentro de un Web Worker. Interfaz en JavaScript vanilla con Vite.

## Contribuir

Lee [CONTRIBUTING.md](CONTRIBUTING.md). Toda ayuda es bienvenida: código, traducciones, pruebas y avisos de fallos.

## Licencia

[AGPL-3.0](LICENSE). Usamos MuPDF.js, que también es AGPL.

---

## English

Free and open source PDF editor with the features of commercial editors. No sign-up, no ads, and your documents are never uploaded anywhere.

**Try it:** https://dnns-es.github.io/dnns-pdf/

### Privacy

Everything is processed on your device. Your PDFs never leave your browser. The only exception will be Word/Excel conversion (phase 8), which will be optional and will warn you before uploading anything.

### Features

**Available now (viewer):** open PDFs (button, drag and drop, or "Open with" from the OS when installed), thumbnails, outline, go to page and keyboard shortcuts, zoom (fit width/page, Ctrl+wheel, pinch on mobile), text search with highlights, text selection and copy, password-protected PDFs, print and download, light and dark mode, and smooth with documents of hundreds of pages.

**Annotate:** highlight, underline and strike out text, sticky notes, text boxes, pen, rectangle, circle, line and arrow (colour, thickness, opacity), stamps (including custom ones), move and delete annotations, annotation list in the side panel, undo and redo. Annotations are saved inside the PDF in the standard format, so any reader shows them.

**Windows app:** installer in the [latest Release](https://github.com/dnns-es/dnns-pdf/releases/latest). Installs per user, associates `.pdf` files and updates itself. Windows may show a SmartScreen warning the first time: "More info" → "Run anyway" (see [docs/firma-smartscreen.md](docs/firma-smartscreen.md)).

**Coming next** (see [ROADMAP.md](ROADMAP.md), in Spanish): Android app, page organisation, forms and signatures, content editing, security tools and OCR.

It can be installed as an app (PWA) and works offline.

### Development

```bash
npm install
npm run dev
```

PDF engine: [MuPDF.js](https://mupdf.readthedocs.io/) (WebAssembly) running in a Web Worker. Vanilla JavaScript UI built with Vite.

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Code, translations, testing and bug reports are all welcome.

### License

[AGPL-3.0](LICENSE), required by MuPDF.js.
