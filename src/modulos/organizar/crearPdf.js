// Fecha: 2026-10-12
// Ruta: /src/modulos/organizar/crearPdf.js
// Unir varios PDF y convertir imágenes en PDF
// Lista de archivos que se puede ordenar y quitar; al crear, el PDF nuevo se abre en la app
// Notas: es un solo diálogo para las dos cosas (se pueden mezclar PDF e imágenes). Si había un
//        documento con cambios sin guardar, abrir el nuevo lo pregunta antes (lo hace abrir.js).

import { emitir } from '../../nucleo/eventos.js';
import { t, traducirPagina } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { mostrarAviso, abrirProgreso } from '../../ui/dialogos.js';
import { elegirArchivos, esImagen, bytesDe, nombreBase } from './archivos.js';

const $ = (id) => document.getElementById(id);

let archivos = [];
let soloImagenes = false;

function boton(texto, etiqueta, alPulsar, desactivado) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'crear__accion';
    b.textContent = texto;
    b.title = etiqueta;
    b.setAttribute('aria-label', etiqueta);
    b.disabled = desactivado;
    b.addEventListener('click', alPulsar);
    return b;
}

function mover(i, salto) {
    const j = i + salto;
    [archivos[i], archivos[j]] = [archivos[j], archivos[i]];
    pintarLista();
}

function pintarLista() {
    const lista = $('crear-lista');
    lista.replaceChildren(...archivos.map((archivo, i) => {
        const fila = document.createElement('li');
        fila.className = 'crear__fila';
        const nombre = document.createElement('span');
        nombre.className = 'crear__nombre';
        // El nombre viene del sistema de archivos del usuario: solo como texto
        nombre.textContent = archivo.name;
        const tipo = document.createElement('span');
        tipo.className = 'crear__tipo';
        tipo.textContent = esImagen(archivo) ? t('organizar.tipoImagen') : 'PDF';
        fila.append(
            tipo,
            nombre,
            boton('↑', t('organizar.subir'), () => mover(i, -1), i === 0),
            boton('↓', t('organizar.bajar'), () => mover(i, 1), i === archivos.length - 1),
            boton('×', t('organizar.quitar'), () => {
                archivos.splice(i, 1);
                pintarLista();
            }, false)
        );
        return fila;
    }));
    $('crear-aceptar').disabled = archivos.length === 0;
    // El tamaño de página solo importa si hay imágenes
    $('crear-modo-etiqueta').hidden = !archivos.some(esImagen);
}

async function anadir() {
    const nuevos = await elegirArchivos({ soloImagenes });
    archivos.push(...nuevos);
    pintarLista();
}

async function crear() {
    const dialogo = $('dialogo-crear');
    const lista = [...archivos];
    dialogo.close();
    const progreso = abrirProgreso(() => {});
    progreso.actualizar(t('organizar.creando'), 0.3);
    try {
        const piezas = await Promise.all(lista.map(async (archivo) => (esImagen(archivo)
            ? { imagen: await bytesDe(archivo) }
            : { pdf: await bytesDe(archivo) })));
        const transferibles = piezas.map((p) => (p.imagen ?? p.pdf).buffer);
        const { bytes } = await pedir('paginas:unir', { piezas, modo: $('crear-modo').value }, transferibles);
        const nombre = lista.length === 1 && !esImagen(lista[0])
            ? `${nombreBase(lista[0].name)}.pdf`
            : (lista.every(esImagen) ? t('organizar.nombreImagenes') : t('organizar.nombreUnido'));
        progreso.cerrar();
        emitir('archivo:abrir', new File([bytes], nombre, { type: 'application/pdf' }));
    } catch (error) {
        progreso.cerrar();
        console.error('No se pudo crear el PDF:', error);
        mostrarAviso(t(error.message === 'PROTEGIDO' ? 'organizar.errorProtegido' : 'organizar.error'));
    }
}

// opciones: { soloImagenes } para empezar eligiendo, o { archivos } si ya vienen (soltados en la ventana)
export async function abrirCrearPdf(opciones = {}) {
    soloImagenes = Boolean(opciones.soloImagenes);
    archivos = opciones.archivos ? [...opciones.archivos] : await elegirArchivos({ soloImagenes });
    if (!archivos.length) {
        return;
    }
    pintarLista();
    traducirPagina($('dialogo-crear'));
    $('dialogo-crear').showModal();
}

export function iniciarCrearPdf() {
    $('crear-anadir').addEventListener('click', anadir);
    $('crear-cancelar').addEventListener('click', () => $('dialogo-crear').close());
    $('crear-aceptar').addEventListener('click', crear);
}
