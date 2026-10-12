// Fecha: 2026-10-12
// Ruta: /src/modulos/editar/editar.js
// Módulo Editar: cambiar el texto y las imágenes de las páginas, y las propiedades del documento
// Botón «Editar» en la barra: una barra con «Editar texto» (pulsar una línea y reescribirla), «Añadir texto»,
// «Añadir imagen» e «Imágenes» (mover, cambiar de tamaño o borrar), más tipo de letra, tamaño, negrita,
// cursiva y color. Las propiedades (título, autor, asunto, palabras clave) están en el menú Herramientas.
// Notas: no convive con Anotar, Rellenar ni Organizar: al abrirse pide cerrarlos ('anotar:salir') y se cierra
//        cuando ellos se abren.

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { registrarCambio } from '../../nucleo/historial.js';
import { mostrarAviso } from '../../ui/dialogos.js';
import { ponerTitulo } from '../../plataforma/index.js';
import { registrarUtilidad } from '../herramientas/herramientas.js';
import { iniciarCapaEditar, activarCapas, ponerHerramienta, cambiarFormato, prepararImagen } from './capaEditar.js';

const $ = (id) => document.getElementById(id);
const PISTAS = { texto: 'editar.pistaTexto', nuevoTexto: 'editar.pistaNuevo', imagen: 'editar.pistaImagen', imagenes: 'editar.pistaImagenes' };
const CON_FORMATO = new Set(['texto', 'nuevoTexto']);

const estado = { activo: false, herramienta: null };

function hexAColor(hex) {
    return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
}

function colorAHex(color) {
    return `#${color.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
}

function formatoDeBarra() {
    return {
        familia: $('editar-familia').value,
        tamano: Math.min(200, Math.max(4, Number($('editar-tamano').value) || 12)),
        negrita: $('editar-negrita').getAttribute('aria-pressed') === 'true',
        cursiva: $('editar-cursiva').getAttribute('aria-pressed') === 'true',
        color: hexAColor($('editar-color').value)
    };
}

// Al pulsar una línea, la barra enseña su formato
function mostrarFormato(datos) {
    $('editar-familia').value = datos.familia;
    $('editar-tamano').value = String(datos.tamano);
    $('editar-negrita').setAttribute('aria-pressed', String(Boolean(datos.negrita)));
    $('editar-cursiva').setAttribute('aria-pressed', String(Boolean(datos.cursiva)));
    $('editar-color').value = colorAHex(datos.color);
}

function ponerPista(clave) {
    const pista = $('editar-pista');
    pista.dataset.i18n = clave;
    pista.textContent = t(clave);
}

function elegirHerramienta(nombre) {
    estado.herramienta = nombre;
    for (const boton of document.querySelectorAll('[data-editar]')) {
        boton.setAttribute('aria-pressed', String(boton.dataset.editar === nombre));
    }
    $('editar-formato').hidden = !CON_FORMATO.has(nombre);
    ponerPista(PISTAS[nombre] ?? 'editar.pista');
    ponerHerramienta(nombre, formatoDeBarra());
}

function activar(activo) {
    if (activo && !leer('documento')) {
        return;
    }
    if (activo) {
        emitir('anotar:salir');
    }
    estado.activo = activo;
    $('barra-editar').hidden = !activo;
    $('boton-editar').setAttribute('aria-pressed', String(activo));
    document.body.classList.toggle('editando', activo);
    activarCapas(activo);
    elegirHerramienta(activo ? 'texto' : null);
    emitir('editar:modo', activo);
}

async function elegirImagen() {
    const entrada = $('editar-entrada-imagen');
    const archivo = await new Promise((resolver) => {
        entrada.onchange = () => resolver(entrada.files[0] ?? null);
        entrada.value = '';
        entrada.click();
    });
    if (!archivo) {
        return;
    }
    try {
        const bitmap = await createImageBitmap(archivo);
        prepararImagen({ bytes: new Uint8Array(await archivo.arrayBuffer()), ancho: bitmap.width, alto: bitmap.height });
        bitmap.close();
        elegirHerramienta('imagen');
    } catch (error) {
        console.error('No se pudo leer la imagen:', error);
        mostrarAviso(t('editar.imagenNoValida'));
    }
}

// --- Propiedades del documento (menú Herramientas) ---

async function abrirPropiedades() {
    try {
        const datos = await pedir('editar:propiedades');
        for (const campo of ['titulo', 'autor', 'asunto', 'claves']) {
            $(`propiedades-${campo}`).value = datos[campo];
        }
        $('dialogo-propiedades').showModal();
        $('propiedades-titulo').focus();
    } catch (error) {
        console.error('No se pudieron leer las propiedades:', error);
        mostrarAviso(t('editar.error'));
    }
}

async function guardarPropiedades() {
    const datos = Object.fromEntries(['titulo', 'autor', 'asunto', 'claves'].map((campo) => [campo, $(`propiedades-${campo}`).value.trim()]));
    try {
        await pedir('editar:ponerPropiedades', datos);
        $('dialogo-propiedades').close();
        await registrarCambio();
        const documento = leer('documento');
        documento.titulo = datos.titulo;
        ponerTitulo(`${datos.titulo || documento.nombre} · DNNS PDF`);
        mostrarAviso(t('editar.propiedadesHecho'));
    } catch (error) {
        console.error('No se pudieron guardar las propiedades:', error);
        mostrarAviso(t('editar.error'));
    }
}

function prepararBarra() {
    $('boton-editar').addEventListener('click', () => activar(!estado.activo));
    $('editar-cerrar').addEventListener('click', () => activar(false));
    for (const boton of document.querySelectorAll('[data-editar]')) {
        boton.addEventListener('click', () => {
            if (boton.dataset.editar === 'imagen') {
                elegirImagen();
            } else {
                elegirHerramienta(boton.dataset.editar);
            }
        });
    }
    for (const id of ['editar-negrita', 'editar-cursiva']) {
        $(id).addEventListener('click', () => {
            $(id).setAttribute('aria-pressed', String($(id).getAttribute('aria-pressed') !== 'true'));
            cambiarFormato(formatoDeBarra());
        });
    }
    for (const id of ['editar-familia', 'editar-tamano', 'editar-color']) {
        $(id).addEventListener('input', () => cambiarFormato(formatoDeBarra()));
    }
    document.addEventListener('keydown', (evento) => {
        if (evento.key === 'Escape' && estado.activo && !evento.target?.closest?.('input, textarea')) {
            activar(false);
        }
    });
}

export function iniciarEditar() {
    prepararBarra();
    iniciarCapaEditar();
    registrarUtilidad('propiedades', abrirPropiedades);
    $('propiedades-cancelar').addEventListener('click', () => $('dialogo-propiedades').close());
    $('formulario-propiedades').addEventListener('submit', (evento) => {
        evento.preventDefault();
        guardarPropiedades();
    });
    escuchar('editar:formatoDe', mostrarFormato);
    escuchar('editar:imagenColocada', () => elegirHerramienta('imagenes'));
    escuchar('estado:documento', () => estado.activo && activar(false));
    escuchar('anotar:modo', (activo) => activo && estado.activo && activar(false));
    escuchar('formularios:modo', (activo) => activo && estado.activo && activar(false));
    escuchar('anotar:salir', () => estado.activo && activar(false));
}
