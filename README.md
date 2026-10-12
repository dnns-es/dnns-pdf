# DNNS PDF

**Español** · [English](#english)

Editor de PDF libre y gratuito, con las funciones de los editores comerciales. Sin registro, sin anuncios y sin subir tus documentos a ningún sitio.

**Pruébalo:** https://dnns-es.github.io/dnns-pdf/

## Privacidad

Todo se procesa en tu dispositivo. Tus PDF nunca salen de tu navegador; tampoco los documentos que abres, tu certificado de firma ni las fotos que escaneas. La única excepción será la conversión de PDF a documento de texto u hoja de cálculo (fase 8), que será opcional y te avisará antes de subir nada.

## Funciones

Mira [ROADMAP.md](ROADMAP.md) para ver qué hay hecho y qué viene.

**Ya disponible (visor):**

- Abrir PDF con botón, arrastrando o con «Abrir con» desde el sistema (PWA instalada)
- Miniaturas, índice del documento, ir a página y atajos de teclado
- Zoom: ajustar al ancho o a la página, Ctrl+rueda y pellizco en el móvil
- Búsqueda de texto con resaltado, seleccionar y copiar texto
- PDFs protegidos con contraseña, imprimir, guardar (Ctrl+S, encima del archivo abierto cuando el sistema lo permite) y guardar como (Ctrl+Mayús+S)
- Modo claro y oscuro, y fluido con documentos de cientos de páginas

**Anotar:**

- Resaltar, subrayar y tachar texto; notas adhesivas y cuadros de texto
- Lápiz, rectángulo, círculo, línea y flecha con color, grosor y opacidad
- Sellos (Aprobado, Revisado, Borrador, Confidencial, Urgente y personalizados)
- Mover y borrar anotaciones, lista de anotaciones en el panel, deshacer y rehacer
- Las anotaciones se guardan dentro del PDF en formato estándar: se ven en cualquier lector

**Organizar páginas:**

- Vista de cuadrícula: reordenar arrastrando (también en el móvil, manteniendo pulsado)
- Girar, borrar, duplicar y recortar márgenes de una o varias páginas
- Insertar páginas en blanco, de otro PDF o desde imágenes
- Extraer páginas o dividir el PDF por rangos («1-3, 5») o cada N páginas
- Unir varios PDF e imágenes en uno, y pasar fotos (JPG/PNG/BMP) a PDF, desde la portada o soltando varios archivos
- Todo se puede deshacer, igual que las anotaciones

**Formularios:**

- Rellenar los campos de un PDF (texto, casillas, opciones, desplegables y listas) escribiendo encima de la página; al guardar quedan dentro del PDF en formato estándar
- Añadir campos de texto y casillas a cualquier PDF, borrarlos y aplanar el formulario (convertirlo en contenido fijo); todo se puede deshacer

**Firmar:**

- Firma manuscrita: dibújala con el dedo o el ratón, escribe tu nombre con letra manuscrita o sube una foto de tu firma (el fondo se quita solo). Se guarda en el dispositivo para reutilizarla, y se coloca con un toque, se mueve y se cambia de tamaño
- Firma digital con tu certificado .p12/.pfx (por ejemplo, el de persona física de la FNMT), con recuadro visible, motivo y lugar. El certificado y su contraseña no salen del dispositivo
- Comprobar las firmas de un PDF recibido: quién firma, cuándo, si el documento sigue intacto y si el certificado es de una autoridad española reconocida (FNMT, DNIe). Al abrir un PDF firmado te avisa

**Abrir documentos de texto, hojas de cálculo, presentaciones y otros formatos (.docx, .xlsx, .pptx, .rtf, .txt, código, imágenes):**

- Se convierten a PDF en tu dispositivo y se abren como un PDF más; con Descargar los guardas ya convertidos
- Se conserva el contenido (texto, negritas, listas, tablas, imágenes; una página por hoja y por diapositiva), no la maquetación exacta
- Texto enriquecido (.rtf) con su formato básico, texto plano (.txt, respetando su codificación) y archivos de código (.py y similares) con letra de ancho fijo; las imágenes BMP, JPG y PNG pasan a PDF

**Escanear con la cámara:**

- Fotografía un documento, o elige una foto de la galería: detecta los bordes, deja ajustar las cuatro esquinas, lo endereza y lo limpia (mejorado, color, gris o texto en blanco y negro)
- Varias páginas en un PDF nuevo desde la portada, o añadidas a un documento abierto desde Organizar

**App de Windows:** instalador en la [última Release](https://github.com/dnns-es/dnns-pdf/releases/latest)
(`DNNS.PDF_x.y.z_x64-setup.exe`). Se instala sin administrador, asocia los `.pdf` y se actualiza sola.
Windows puede avisar la primera vez («Windows protegió su PC»): pulsa «Más información» → «Ejecutar de todas formas».
El motivo está en [docs/firma-smartscreen.md](docs/firma-smartscreen.md).

**App de Android:** descarga el APK desde [dnns.es/apps](https://dnns.es/apps.html#dnns-pdf)
(siempre la última: `dnnspdf_ultima.apk`). Android pedirá permiso para instalar apps de fuera de la tienda.
Se registra para «Abrir con» y «Compartir» PDF, y avisa e instala las versiones nuevas desde la propia app.

**En camino:**
- Formularios: rellenar, crear campos y aplanar
- Edición de texto e imágenes, redacción
- Contraseñas, compresión, OCR

Se puede instalar como app (PWA) desde el navegador y funciona sin conexión.

## Desarrollo

```bash
npm install
npm run dev            # web en http://localhost:5173/dnns-pdf/
npm test               # pruebas del motor con los PDF de tests/pdfs
```

App de Windows (necesita [Rust](https://rustup.rs) y las Build Tools de Visual Studio con C++):

```bash
cd desktop
npx tauri dev          # app de escritorio en desarrollo
npx tauri build        # instalador en desktop/src-tauri/target/release/bundle/nsis/
```

App de Android (necesita JDK 21 y el SDK de Android; [Capacitor](https://capacitorjs.com) empaqueta la web):

```bash
npm run apk            # APK firmado en salida/ (la llave de firma no está en el repo)
npx cap open android   # abrir el proyecto en Android Studio
```

Publicar una versión (web, Windows y Android a la vez): `npm run release -- 0.2.0`. Sube el número en todos
los sitios, crea la etiqueta `v0.2.0`, GitHub Actions compila, firma y publica la Release de Windows, y el
APK se compila y sube a descargas.dnns.es desde el equipo que tiene la llave.

Motor PDF: [MuPDF.js](https://mupdf.readthedocs.io/) (WebAssembly) dentro de un Web Worker. Interfaz en JavaScript vanilla con Vite.

## Contribuir

Lee [CONTRIBUTING.md](CONTRIBUTING.md). Toda ayuda es bienvenida: código, traducciones, pruebas y avisos de fallos.

## Licencia

[AGPL-3.0](LICENSE). Usamos MuPDF.js, que también es AGPL. Además: node-forge (BSD-3) para las firmas digitales, mammoth (BSD-2) para leer documentos de texto y fflate (MIT) para abrir archivos comprimidos. Las letras manuscritas de la firma (Dancing Script, Great Vibes y Allura) son libres, con licencia OFL (en `src/fuentes`).

---

## English

Free and open source PDF editor with the features of commercial editors. No sign-up, no ads, and your documents are never uploaded anywhere.

**Try it:** https://dnns-es.github.io/dnns-pdf/

### Privacy

Everything is processed on your device. Your PDFs never leave your browser; neither do the documents you open, your signing certificate or the photos you scan. The only exception will be PDF to text document / spreadsheet conversion (phase 8), which will be optional and will warn you before uploading anything.

### Features

**Available now (viewer):** open PDFs (button, drag and drop, or "Open with" from the OS when installed), thumbnails, outline, go to page and keyboard shortcuts, zoom (fit width/page, Ctrl+wheel, pinch on mobile), text search with highlights, text selection and copy, password-protected PDFs, print, save (Ctrl+S, over the open file when the system allows it) and save as (Ctrl+Shift+S), light and dark mode, and smooth with documents of hundreds of pages.

**Annotate:** highlight, underline and strike out text, sticky notes, text boxes, pen, rectangle, circle, line and arrow (colour, thickness, opacity), stamps (including custom ones), move and delete annotations, annotation list in the side panel, undo and redo. Annotations are saved inside the PDF in the standard format, so any reader shows them.

**Organise pages:** grid view with drag-and-drop reordering (long press on mobile), rotate, delete, duplicate and crop pages, insert blank pages, pages from another PDF or from images, extract pages or split by ranges or every N pages, merge several PDFs and images into one, and turn photos (JPG/PNG/BMP) into a PDF. Everything can be undone.

**Forms:** fill in the fields of a PDF (text, checkboxes, radio buttons, drop-downs and lists) right on the page; Save keeps them inside the PDF in the standard format. Add text fields and checkboxes to any PDF, delete them and flatten the form (turn it into fixed content); everything can be undone.

**Sign:** handwritten signature (draw it, type your name in a handwriting font or upload a photo with the background removed; saved on your device for reuse; place, move and resize it), digital signature with your .p12/.pfx certificate (for example the Spanish FNMT one) with an optional visible box, and signature checking of received PDFs (signer, date, whether the file is intact and whether the certificate chains to a recognised Spanish authority). The certificate and its password never leave your device.

**Open text documents, spreadsheets, presentations and other formats (.docx, .xlsx, .pptx, .rtf, .txt, code, images):** converted to PDF on your device and opened like any PDF (text, bold, lists, tables, images; one page per sheet and per slide; content is kept, exact layout is not). Rich text (.rtf) keeps its basic formatting, plain text (.txt) its encoding, code files (.py and similar) use a monospaced font, and BMP/JPG/PNG images become a PDF. Download saves them already converted.

**Scan with the camera:** take a photo of a document (or pick one from the gallery), edges are detected, the four corners can be adjusted, the page is straightened and cleaned up (enhanced, colour, grey or black-and-white text). Several pages into a new PDF, or added to an open document from Organise.

**Windows app:** installer in the [latest Release](https://github.com/dnns-es/dnns-pdf/releases/latest). Installs per user, associates `.pdf` files and updates itself. Windows may show a SmartScreen warning the first time: "More info" → "Run anyway" (see [docs/firma-smartscreen.md](docs/firma-smartscreen.md)).

**Android app:** download the APK from [dnns.es/apps](https://dnns.es/apps.html#dnns-pdf). It handles "Open with" and "Share" for PDFs and updates itself from inside the app.

**Coming next** (see [ROADMAP.md](ROADMAP.md), in Spanish): forms, content editing, security tools and OCR.

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

[AGPL-3.0](LICENSE), required by MuPDF.js. Also: node-forge (BSD-3) for digital signatures, mammoth (BSD-2) for text documents and fflate (MIT) for compressed files. The handwriting fonts (Dancing Script, Great Vibes, Allura) are OFL licensed (in `src/fuentes`).
