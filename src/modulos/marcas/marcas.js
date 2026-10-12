// Fecha: 2026-10-12
// Ruta: /src/modulos/marcas/marcas.js
// Módulo Marcas: numerar páginas, poner encabezados o pies de texto, y marcas de agua de texto o imagen
// Dos opciones del menú Herramientas; lo añadido queda como contenido de la página y se puede deshacer
// Notas: las páginas se eligen escribiendo rangos («1-3, 5»); vacío = todas. Los números siguen el orden
//        de las páginas elegidas y empiezan en el número indicado.

import { emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t, traducirPagina } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { registrarCambio } from '../../nucleo/historial.js';
import { mostrarAviso } from '../../ui/dialogos.js';
import { leerRangos } from '../../nucleo/rangos.js';
import { registrarUtilidad } from '../herramientas/herramientas.js';

const $ = (id) => document.getElementById(id);

const PLANTILLAS = {
    numero: '{n}',
    pagina: 'Página {n}',
    paginaDe: 'Página {n} de {total}',
    barra: '{n} / {total}'
};

let imagenMarca = null;

// '#rrggbb' -> [r, g, b] entre 0 y 1
function color(hex) {
    const n = Number.parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function paginasElegidas(campo, idError) {
    const total = leer('documento').paginas;
    const texto = $(campo).value.trim();
    if (!texto) {
        return Array.from({ length: total }, (_, i) => i);
    }
    try {
        return [...new Set(leerRangos(texto, total).flat())].sort((a, b) => a - b);
    } catch (error) {
        $(idError).textContent = t(error.message, { total });
        $(idError).hidden = false;
        return null;
    }
}

async function aplicar(accion, datos, idDialogo) {
    try {
        await pedir(accion, datos);
        $(idDialogo).close();
        emitir('visor:repintarTodo');
        await registrarCambio();
        emitir('anotaciones:cambiadas', { pagina: null });
        mostrarAviso(t('marcas.hecho', { total: datos.paginas.length }));
    } catch (error) {
        console.error('No se pudo añadir a las páginas:', error);
        mostrarAviso(t('marcas.error'));
    }
}

// ---- Numerar y encabezados

function abrirNumerar() {
    $('numerar-error').hidden = true;
    traducirPagina($('dialogo-numerar'));
    $('dialogo-numerar').showModal();
}

function elegirPlantilla() {
    const valor = $('numerar-formato').value;
    if (valor !== 'propio') {
        // La palabra «Página» sale en el idioma de la interfaz
        $('numerar-texto').value = PLANTILLAS[valor].replace('Página', t('marcas.palabraPagina')).replace(' de ', ` ${t('marcas.palabraDe')} `);
    }
    $('numerar-texto').readOnly = valor !== 'propio';
}

function numerar() {
    $('numerar-error').hidden = true;
    const paginas = paginasElegidas('numerar-paginas', 'numerar-error');
    if (!paginas) {
        return;
    }
    const plantilla = $('numerar-texto').value.trim();
    if (!plantilla) {
        return;
    }
    aplicar('marcas:numerar', {
        paginas,
        plantilla,
        posicion: $('numerar-posicion').value,
        tamano: Number($('numerar-tamano').value) || 10,
        inicio: Number($('numerar-inicio').value) || 1,
        color: color($('numerar-color').value),
        nombre: (leer('documento').nombre || '').replace(/\.pdf$/i, ''),
        fecha: new Date().toLocaleDateString(leer('idioma'))
    }, 'dialogo-numerar');
}

// ---- Marca de agua

function abrirMarca() {
    $('marca-error').hidden = true;
    traducirPagina($('dialogo-marca'));
    if (!$('marca-texto').value) {
        $('marca-texto').value = t('marcas.borrador');
    }
    $('dialogo-marca').showModal();
}

function elegirImagen() {
    const entrada = document.createElement('input');
    entrada.type = 'file';
    entrada.accept = 'image/png,image/jpeg';
    entrada.addEventListener('change', async () => {
        const [archivo] = entrada.files;
        if (!archivo) {
            return;
        }
        imagenMarca = new Uint8Array(await archivo.arrayBuffer());
        // El nombre viene del sistema de archivos del usuario: solo como texto
        $('marca-imagen-nombre').textContent = archivo.name;
        $('marca-quitar-imagen').hidden = false;
    });
    entrada.click();
}

function quitarImagen() {
    imagenMarca = null;
    $('marca-imagen-nombre').textContent = '';
    $('marca-quitar-imagen').hidden = true;
}

function ponerMarca() {
    $('marca-error').hidden = true;
    const paginas = paginasElegidas('marca-paginas', 'marca-error');
    if (!paginas) {
        return;
    }
    const texto = $('marca-texto').value.trim();
    if (!texto && !imagenMarca) {
        $('marca-error').textContent = t('marcas.faltaMarca');
        $('marca-error').hidden = false;
        return;
    }
    aplicar('marcas:marcaAgua', {
        paginas,
        texto,
        imagen: imagenMarca ? imagenMarca.slice() : null,
        tamano: Number($('marca-tamano').value) || 60,
        opacidad: Number($('marca-opacidad').value) / 100,
        color: color($('marca-color').value),
        angulo: Number($('marca-angulo').value),
        debajo: $('marca-debajo').checked
    }, 'dialogo-marca');
}

export function iniciarMarcas() {
    registrarUtilidad('numerar', abrirNumerar);
    registrarUtilidad('marca', abrirMarca);
    $('numerar-formato').addEventListener('change', elegirPlantilla);
    $('numerar-cancelar').addEventListener('click', () => $('dialogo-numerar').close());
    $('formulario-numerar').addEventListener('submit', (evento) => {
        evento.preventDefault();
        numerar();
    });
    $('marca-elegir-imagen').addEventListener('click', elegirImagen);
    $('marca-quitar-imagen').addEventListener('click', quitarImagen);
    $('marca-opacidad').addEventListener('input', () => {
        $('marca-opacidad-valor').textContent = `${$('marca-opacidad').value} %`;
    });
    $('marca-cancelar').addEventListener('click', () => $('dialogo-marca').close());
    $('formulario-marca').addEventListener('submit', (evento) => {
        evento.preventDefault();
        ponerMarca();
    });
    elegirPlantilla();
}
