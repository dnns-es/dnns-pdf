# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico.

## [0.5.0] - 2026-10-12

### Añadido
- Fase 4: organizar páginas. Botón «Organizar» en la barra: el documento se ve en cuadrícula.
- Reordenar páginas arrastrando (con el ratón, o manteniendo pulsado en el móvil); selección con clic, Ctrl, Mayús y Ctrl+A.
- Girar a izquierda y derecha, borrar (Supr) y duplicar una o varias páginas.
- Recortar márgenes dibujando un recuadro, en una página o en todas; y quitar el recorte.
- Insertar páginas en blanco, todas las de otro PDF o imágenes JPG/PNG detrás de la selección.
- Extraer las páginas seleccionadas a un PDF nuevo, y dividir por rangos («1-3, 5») o cada N páginas.
- Unir varios PDF e imágenes en uno, eligiendo el orden; pasar fotos a PDF en A4 o a su tamaño. Desde la portada o soltando varios archivos a la vez.
- Todos los cambios de páginas entran en Deshacer/Rehacer junto con las anotaciones.
- Pruebas automáticas del motor de páginas (`npm test`).

## [0.4.0] - 2026-10-12

### Añadido
- App de Android: se instala con un APK desde dnns.es y se actualiza sola desde la propia app.
- En Android, «Abrir con» y «Compartir» llevan los PDF directamente a la app.
- En Android, Guardar deja elegir carpeta y nombre, e Imprimir manda el PDF tal cual al sistema de impresión.
- Las actualizaciones de Android solo se aceptan si vienen de descargas.dnns.es, con la huella correcta y la misma firma.

### Cambiado
- Guardar ya no da el documento por guardado si se cancela.

## [0.3.0] - 2026-10-12

### Añadido
- Fase 3: anotar. Botón del lápiz en la barra para abrir las herramientas.
- Resaltar, subrayar y tachar texto seleccionándolo.
- Notas adhesivas, cuadros de texto, lápiz, rectángulo, círculo, línea y flecha, con color, grosor y opacidad.
- Sellos: Aprobado, Revisado, Borrador, Confidencial, Urgente y personalizados.
- Seleccionar, mover y borrar anotaciones (tecla Supr); doble clic para editar el texto de una nota.
- Pestaña «Notas» en el panel lateral con todas las anotaciones: ir a ella, editar y borrar.
- Deshacer y rehacer (Ctrl+Z, Ctrl+Y).
- Guardar: descarga el PDF con las anotaciones dentro, en formato estándar que abren otros lectores.
- Aviso antes de abrir otro documento o cerrar si hay anotaciones sin guardar.

## [0.2.1] - 2026-10-12

### Cambiado
- Hoja de ruta al día con la Fase 2 terminada.
- Primera versión que llega a las instalaciones de Windows por el actualizador automático.

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
