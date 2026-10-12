# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico.

## [0.9.0] - 2026-10-12

### Añadido
- Fase 5 (segunda parte): formularios. Botón «Rellenar» en la barra: los campos del PDF (texto, casillas, opciones, desplegables y listas) se rellenan encima de la página y quedan dentro del PDF al guardar. Al abrir un PDF con formulario, aviso.
- Añadir campos nuevos a cualquier PDF: campo de texto (dibujando un recuadro; los altos admiten varias líneas) y casilla; cada campo se puede borrar.
- Aplanar: los campos pasan a ser contenido fijo de la página. Todo (rellenar, crear, borrar, aplanar) se puede deshacer.
- Menú «Herramientas» en la barra, con: proteger el PDF con contraseña de apertura y permisos (impedir imprimir, copiar o modificar; cifrado AES-256; contraseña de propietario para poder quitarlo después) guardando una copia protegida; y quitar la contraseña y las restricciones de un PDF abierto (con la de propietario si tiene permisos restringidos).
- Comprimir (menú Herramientas): tres niveles (ligera, media, fuerte) que reducen y recomprimen las imágenes, recortan las fuentes y limpian el archivo; guarda una copia y dice cuánto se ha ahorrado.
- Reconocer texto (OCR, menú Herramientas): con Tesseract en el dispositivo, en español, inglés o ambos; añade el texto como capa invisible para buscar, seleccionar y copiar en escaneados y fotos, sin tocar la imagen. Por defecto solo las páginas sin texto; se puede cancelar y deshacer. El motor y los idiomas van dentro de la app y se descargan la primera vez que se usa.
- Numerar páginas, encabezado y pie (menú Herramientas): «1», «Página 1», «Página 1 de 10», «1 / 10» o texto propio con {n}, {total}, {fecha} y {nombre}; seis posiciones, tamaño, color, número inicial y páginas elegidas. Sale derecho también en páginas giradas.
- Marca de agua (menú Herramientas): texto o imagen (logo), en diagonal, horizontal o vertical, con color, tamaño y opacidad; encima o detrás del contenido.
- Ocultar datos de verdad (redacción): herramienta «Ocultar» en Anotar para marcar zonas, y en Herramientas buscar y marcar un texto en todo el documento (un DNI, un nombre) y aplicarlo: el texto, las imágenes y los dibujos de debajo se borran del archivo y queda un recuadro negro.
- Editar texto e imágenes (botón «Editar» en la barra): pulsar una línea y reescribirla en su sitio (se borra el texto original de esa línea sin tocar el fondo); añadir texto nuevo en una o varias líneas con tipo de letra (Helvetica, Times o Courier), tamaño, negrita, cursiva y color; añadir imágenes (PNG, JPG, BMP) con un toque o dibujando el recuadro; mover, cambiar de tamaño y borrar imágenes, también las que ya traía el PDF. Todo se puede deshacer. El texto nuevo usa letras del alfabeto latino; los símbolos que no caben salen como «?».
- Propiedades del documento (menú Herramientas): título, autor, asunto y palabras clave.
- Abiertos hace poco: la portada lista los últimos documentos para reabrirlos con un clic (app de Windows; en Chrome y Edge, con permiso del navegador). Se pueden quitar de uno en uno o vaciar la lista.
- Cada documento se vuelve a abrir en la página y con el zoom en que se dejó.
- Modo presentación (botón de la barra o F5): una página cada vez a pantalla completa; se pasa con las flechas, el espacio, un clic o deslizando, R gira la vista y Esc sale dejando el visor en la misma página.
- Pruebas automáticas de formularios, seguridad, compresión, OCR, marcas, redacción y edición (`npm test`).

## [0.8.0] - 2026-10-12

### Añadido
- Guardar con las opciones de siempre: el botón de guardar (barra y barra de anotar) abre un menú con «Guardar» (Ctrl+S) y «Guardar como…» (Ctrl+Mayús+S).
- Windows: «Guardar» sobrescribe el archivo abierto (escritura segura: primero en un temporal) y «Guardar como» abre el diálogo del sistema; el botón Abrir usa también el diálogo del sistema.
- Web (Chrome y Edge): abrir con el selector del sistema, soltar un archivo o «Abrir con» de la PWA dan permiso para guardar encima del archivo; «Guardar como» abre el diálogo de guardar. En otros navegadores se descarga, como hasta ahora.
- Tras guardar, el documento pasa a llamarse como el archivo guardado.

### Cambiado
- El botón «Descargar» de la barra es ahora el de guardar.

## [0.7.0] - 2026-10-12

### Añadido
- Abrir texto enriquecido (.rtf): lector propio que conserva negritas, cursivas, subrayados, tamaños, colores, alineación, sangrías, viñetas, tablas, imágenes PNG/JPEG, saltos de página y el tamaño de página.
- Abrir texto plano (.txt) respetando su codificación (UTF-8, UTF-16 o ANSI) y los saltos de página; los archivos de código (.py y similares) salen con letra de ancho fijo.
- Abrir imágenes BMP (además de JPG y PNG) como PDF, también desde el botón Abrir, arrastrando una sola imagen o con «Abrir con» en Android y Windows.
- El tipo de archivo se reconoce por su contenido, así que funciona aunque llegue con otro nombre (Android renombra lo que comparte).

### Cambiado
- El botón Abrir, la portada y la zona de soltar aceptan los formatos nuevos.

## [0.6.1] - 2026-10-12

### Corregido
- Escanear en móvil: el botón de capturar ya no se aplasta y el tamaño de página baja a su propia línea.

## [0.6.0] - 2026-10-12

### Añadido
- Fase 5 (primera parte): botón «Firmar» en la barra, con firma manuscrita, firma con certificado y comprobar firmas.
- Firma manuscrita: dibujar, escribir el nombre con letra manuscrita (tres tipos de letra libres) o subir una foto quitando el fondo; se guardan hasta seis firmas en el dispositivo; se coloca con un toque, se mueve y se cambia de tamaño con el asa de la esquina.
- Firma digital con certificado .p12/.pfx (FNMT y similares): firma estándar PDF (PKCS#7) con recuadro visible, motivo y lugar; guarda una copia firmada y la abre. Se aceptan los certificados con cifrado antiguo de la FNMT.
- Comprobar firmas: estado de cada firma (válida, no válida o desconocida), firmante, fecha, motivo, si cubre todo el archivo y si la cadena llega a una autoridad española reconocida (FNMT, DNIe). Aviso al abrir un PDF firmado.
- Abrir documentos .docx, .xlsx y .pptx: se convierten a PDF en el dispositivo (texto, negritas, listas, tablas e imágenes; una página por hoja y por diapositiva). También con «Abrir con» en Android y Windows.
- Escanear con la cámara, o desde una foto: detección de bordes, esquinas ajustables, enderezado y filtros (mejorado, color, gris, texto); varias páginas a un PDF nuevo o añadidas desde Organizar.
- Asa para cambiar el tamaño de cuadros de texto, sellos, rectángulos y círculos.
- Pruebas automáticas de firmas, conversión de documentos y escáner (`npm test`).

### Cambiado
- La portada y la zona de soltar aceptan también .docx, .xlsx y .pptx.
- La barra de progreso puede quedar indeterminada en tareas sin avance conocido.

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
