# DNNS PDF

**Español** · [English](#english)

Editor de PDF libre y gratuito, al estilo de Adobe Acrobat. Sin registro, sin anuncios y sin subir tus documentos a ningún sitio.

**Pruébalo:** https://dnns-es.github.io/dnns-pdf/

## Privacidad

Todo se procesa en tu dispositivo. Tus PDF nunca salen de tu navegador. La única excepción será la conversión a Word/Excel (fase 8), que será opcional y te avisará antes de subir nada.

## Funciones

El proyecto está empezando. Mira [ROADMAP.md](ROADMAP.md) para ver qué hay hecho y qué viene:

- Visor: abrir, buscar, miniaturas, zoom, índice
- App de Windows con actualización automática
- Anotar: resaltar, notas, dibujo, sellos
- Organizar páginas: unir, dividir, rotar, reordenar
- Formularios y firma
- Edición de texto e imágenes, redacción
- Contraseñas, compresión, OCR

Se puede instalar como app (PWA) desde el navegador y funciona sin conexión.

## Desarrollo

```bash
npm install
npm run dev
```

Motor PDF: [MuPDF.js](https://mupdf.readthedocs.io/) (WebAssembly) dentro de un Web Worker. Interfaz en JavaScript vanilla con Vite.

## Contribuir

Lee [CONTRIBUTING.md](CONTRIBUTING.md). Toda ayuda es bienvenida: código, traducciones, pruebas y avisos de fallos.

## Licencia

[AGPL-3.0](LICENSE). Usamos MuPDF.js, que también es AGPL.

---

## English

Free and open source PDF editor, similar to Adobe Acrobat. No sign-up, no ads, and your documents are never uploaded anywhere.

**Try it:** https://dnns-es.github.io/dnns-pdf/

### Privacy

Everything is processed on your device. Your PDFs never leave your browser. The only exception will be Word/Excel conversion (phase 8), which will be optional and will warn you before uploading anything.

### Features

The project is just starting. See [ROADMAP.md](ROADMAP.md) (in Spanish) for progress: viewer, Windows app with auto-update, annotations, page organisation, forms and signatures, content editing, security tools and OCR.

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
