# DNNS PDF — Hoja de ruta

Editor de PDF libre y gratuito. Licencia AGPL-3.0.
Cada fase se trabaja en su propia rama y termina con un PR y una versión publicada.

---

## Fase 0 — Puesta en marcha (día 1, mañana)

**Objetivo:** repo funcionando, app vacía publicada en GitHub Pages e instalable como PWA.

- [x] Crear el repositorio público `dnns-pdf` en GitHub
- [x] Copiar `ROADMAP.md` a la raíz
- [x] `LICENSE` con el texto completo de AGPL-3.0
- [x] `README.md` en español e inglés (qué es, funciones, privacidad, cómo contribuir)
- [x] `CONTRIBUTING.md` (ramas, convenciones, cabecera de archivos)
- [x] `.gitignore` (node_modules, dist, .DS_Store, archivos de entorno)
- [x] Proyecto Vite con JS vanilla y estructura de carpetas de `CLAUDE.md`
- [x] Instalar `mupdf` y comprobar que carga en un Web Worker
- [x] Núcleo: bus de eventos, estado y carga de idiomas (es/en)
- [x] PWA: `manifest.json`, `sw.js` con `CACHE_VERSION`, banner de actualización, iconos 192 y 512
- [x] GitHub Actions: build y despliegue automático a GitHub Pages en cada push a `main`
- [x] Añadir PDFs de prueba en `tests/pdfs/` (texto, escaneado, formulario, protegido, 300+ páginas)

**Terminado cuando:** la URL de Pages abre la app, se puede instalar y aparece el banner al subir versión.

---

## Fase 1 — Visor

**Objetivo:** abrir y leer cualquier PDF con soltura.

- [x] Abrir PDF con botón, arrastrar y soltar, y "Abrir con" en la PWA (`file_handlers`)
- [x] Renderizado de páginas desde el worker con carga perezosa (solo las visibles)
- [x] Panel lateral de miniaturas con navegación
- [x] Zoom: más, menos, ajustar a ancho, ajustar a página, pellizcar en móvil
- [x] Navegación: página anterior/siguiente, ir a página, teclado
- [x] Índice/marcadores del PDF (outline)
- [x] Búsqueda de texto con resaltado y saltar entre resultados
- [x] Seleccionar y copiar texto
- [x] Modo oscuro y modo claro
- [x] Imprimir y descargar
- [x] Pedir contraseña al abrir PDFs protegidos
- [x] Rendimiento aceptable con un PDF de 300+ páginas

---

## Fase 2 — App de Windows instalable y con actualización automática

**Objetivo:** instalador de Windows que se actualiza solo cada vez que publicamos versión.
A partir de aquí, cada fase nueva llega automáticamente a todos los usuarios.

**Herramienta:** Tauri v2 (usa el WebView2 que ya trae Windows 10/11; instalador de pocos MB).

### Empaquetado
- [x] Inicializar Tauri v2 en `/desktop` apuntando al build de Vite (`dist/`)
- [x] Nombre, identificador (`es.dnns.pdf`), icono y versión en `tauri.conf.json`
- [x] Instalador NSIS (`.exe`) para Windows 10 y 11, instalación por usuario (sin pedir administrador)
- [x] Asociar la extensión `.pdf`: "Abrir con DNNS PDF" y opción de programa predeterminado
- [x] Abrir el PDF recibido por línea de comandos o doble clic
- [x] Acceso directo en menú Inicio y escritorio
- [x] Desinstalador limpio

### Actualización automática
- [x] Plugin `tauri-plugin-updater`
- [x] Generar par de claves de firma de actualizaciones (`tauri signer generate`)
- [x] Guardar la clave privada y su contraseña como secretos del repo
      (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`)
- [x] **Copia de seguridad de la clave privada fuera de GitHub** (si se pierde, las instalaciones existentes no podrán actualizarse nunca más)
- [x] Endpoint de actualizaciones: `latest.json` en la última GitHub Release
- [x] Al arrancar, comprobar si hay versión nueva y mostrar aviso
      "Nueva versión disponible — Actualizar ahora / Más tarde" con las novedades
- [x] Descarga e instalación en segundo plano y reinicio de la app
- [x] Opción en Ajustes: buscar actualizaciones manualmente y activar/desactivar el aviso

### Publicación automática
- [x] Workflow de GitHub Actions con `tauri-action` en `windows-latest`
- [x] Se dispara al crear una etiqueta `vX.Y.Z`: compila, firma, crea la Release con el instalador y `latest.json`
- [x] Notas de la versión a partir de los commits o del `CHANGELOG.md`
- [x] Script `npm run release` que sube la versión en `package.json`, `tauri.conf.json`
      y `CACHE_VERSION` de `sw.js` a la vez, crea la etiqueta y la sube

### Firma del instalador (SmartScreen)
- [x] Sin firma, Windows mostrará "Windows protegió su PC" la primera vez. Funciona, pero asusta.
- [ ] Solicitar firma de código gratuita para proyectos de código abierto (SignPath Foundation)
      o valorar Azure Trusted Signing (de pago, bajo coste)
- [ ] Integrar la firma en el workflow de publicación

**Terminado cuando:** instalo la v0.2.0, publico la v0.2.1 con una etiqueta y la app instalada
avisa y se actualiza sola sin desinstalar nada.

---

## Fase 3 — Anotar

- [ ] Resaltar, subrayar y tachar texto
- [ ] Notas adhesivas y comentarios
- [ ] Dibujo libre (lápiz) con color y grosor
- [ ] Formas: rectángulo, círculo, línea, flecha
- [ ] Cuadros de texto libres
- [ ] Sellos (Aprobado, Revisado, Borrador, personalizados)
- [ ] Panel de lista de anotaciones (ir a, editar, borrar)
- [ ] Deshacer / rehacer
- [ ] Guardar las anotaciones dentro del PDF (compatibles con otros lectores)

---

## Fase 4 — Organizar páginas

- [ ] Reordenar páginas arrastrando miniaturas
- [ ] Rotar, borrar y duplicar páginas
- [ ] Insertar páginas en blanco o de otro PDF
- [ ] Unir varios PDF
- [ ] Dividir por rangos, por cada N páginas o extraer páginas sueltas
- [ ] Recortar márgenes
- [ ] Imágenes (JPG/PNG) a PDF

---

## Fase 5 — Formularios y firma

- [ ] Detectar y rellenar formularios existentes (texto, casillas, radio, listas)
- [ ] Crear campos de formulario nuevos
- [ ] Aplanar formulario (convertir en contenido fijo)
- [ ] Firma manuscrita: dibujar, escribir o subir imagen, y guardarla para reutilizar
- [ ] Firma digital con certificado (.p12/.pfx, p. ej. FNMT) — **verificar soporte en MuPDF.js antes de empezar**; en la versión de escritorio se puede resolver con Rust si el navegador no basta
- [ ] Verificar firmas digitales de PDFs recibidos

---

## Fase 6 — Edición de contenido

- [ ] Añadir texto nuevo con fuente, tamaño y color
- [ ] Añadir, mover, redimensionar y borrar imágenes
- [ ] Editar texto existente (método "tapar y reescribir": detectar línea, cubrir y reescribir)
- [ ] Redacción real: borra el contenido de verdad, no solo lo tapa
- [ ] Encabezados, pies y numeración de páginas
- [ ] Marca de agua de texto o imagen
- [ ] Editar metadatos (título, autor, palabras clave)

---

## Fase 7 — Seguridad y utilidades

- [ ] Proteger con contraseña de apertura
- [ ] Permisos (impedir imprimir, copiar o editar)
- [ ] Quitar contraseña (conociéndola)
- [ ] Comprimir / optimizar tamaño
- [ ] OCR con Tesseract.js para hacer buscables los escaneados
- [ ] Comparar dos PDF y marcar diferencias
- [ ] Exportar páginas a imagen (PNG/JPG)
- [ ] Extraer texto e imágenes

---

## Fase 8 — Conversión (servidor opcional)

- [ ] Servicio en `/server` con LibreOffice headless en contenedor Docker
- [ ] PDF → Word, Excel y PowerPoint
- [ ] Word, Excel, PowerPoint → PDF
- [ ] Borrado automático de archivos tras convertir; sin registros de contenido
- [ ] Aviso claro al usuario de que esta función sí sube el archivo
- [ ] Instrucciones para autoalojarlo (Proxmox LXC / Docker)

---

## Lanzamiento público

- [ ] Dominio propio (p. ej. pdf.dnns.es)
- [ ] Página de presentación con capturas
- [ ] Publicar en foros y comunidades de software libre en español
- [ ] Plantillas de issues (fallo, sugerencia) y etiquetas para colaboradores
- [ ] Botón de donaciones opcional (GitHub Sponsors)
