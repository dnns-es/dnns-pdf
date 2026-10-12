# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico.

## [0.2.0] - 2026-10-12

### Añadido
- Fase 2: app de Windows (Tauri) con instalador y actualización automática.
- Instalador por usuario, sin pedir administrador; acceso directo en Inicio y escritorio.
- Asociación con los archivos .pdf: «Abrir con DNNS PDF» y doble clic.
- Una sola ventana: abrir otro PDF desde el sistema lo carga en la app ya abierta.
- Aviso de versión nueva al arrancar con las novedades; descarga e instalación en segundo plano y reinicio.
- Ajustes (solo escritorio): buscar actualizaciones a mano y activar o desactivar el aviso.
- Publicación automática en GitHub Releases al crear una etiqueta, con `npm run release`.

## [0.1.0] - 2026-10-12

### Añadido
- Fase 1: visor de PDF.
- Abrir con botón, arrastrar y soltar, y «Abrir con» desde el sistema (PWA instalada).
- Páginas con carga perezosa: solo se pintan las cercanas y se liberan las lejanas.
- Panel lateral con miniaturas e índice del documento.
- Zoom: botones, ajustar al ancho y a la página, Ctrl+rueda y pellizco táctil.
- Navegación: anterior/siguiente, ir a página, flechas, Inicio y Fin.
- Búsqueda de texto con resaltado y salto entre resultados.
- Selección y copia de texto.
- Contraseña para PDFs protegidos.
- Imprimir (con barra de progreso) y descargar.
- Modo claro y oscuro.

## [0.0.1] - 2026-10-12

### Añadido
- Fase 0: puesta en marcha del proyecto.
- App vacía con Vite y JavaScript vanilla, en español e inglés.
- MuPDF.js funcionando dentro de un Web Worker.
- Bus de eventos, estado y carga de idiomas.
- PWA instalable y sin conexión, con aviso de nueva versión.
- Publicación automática en GitHub Pages.
- PDFs de prueba en `tests/pdfs/`.
