// Fecha: 2026-10-12
// Ruta: /src/modulos/recientes/recientes.js
// Archivos abiertos hace poco, en la portada, para volver a abrirlos con un clic
// Escritorio: se recuerda la ruta. Web (Chrome y Edge): se guarda el manejador del archivo en IndexedDB y
// el navegador pide permiso para leerlo otra vez. En Android y otros navegadores no hay forma de reabrir
// un archivo sin elegirlo de nuevo, así que no se lista nada.
// Notas: solo se guarda el nombre, la ruta o el manejador y la fecha; nunca el contenido del PDF.

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { mostrarAviso } from '../../ui/dialogos.js';
import { abrirRuta } from '../../plataforma/index.js';

const CLAVE = 'dnns-pdf:recientes';
const MAXIMO = 10;
const BASE = 'dnns-pdf';
const ALMACEN = 'manejadores';

const $ = (id) => document.getElementById(id);

function leerLista() {
    try {
        const lista = JSON.parse(localStorage.getItem(CLAVE) ?? '[]');
        return Array.isArray(lista) ? lista : [];
    } catch {
        return [];
    }
}

function guardarLista(lista) {
    try {
        localStorage.setItem(CLAVE, JSON.stringify(lista.slice(0, MAXIMO)));
    } catch (error) {
        console.warn('No se pudo guardar la lista de recientes:', error);
    }
}

// --- IndexedDB, solo para los manejadores de la web (no caben en localStorage) ---

function abrirBase() {
    return new Promise((resolver, rechazar) => {
        const peticion = indexedDB.open(BASE, 1);
        peticion.onupgradeneeded = () => peticion.result.createObjectStore(ALMACEN);
        peticion.onsuccess = () => resolver(peticion.result);
        peticion.onerror = () => rechazar(peticion.error);
    });
}

async function operar(modo, accion) {
    const base = await abrirBase();
    try {
        return await new Promise((resolver, rechazar) => {
            const peticion = accion(base.transaction(ALMACEN, modo).objectStore(ALMACEN));
            peticion.onsuccess = () => resolver(peticion.result);
            peticion.onerror = () => rechazar(peticion.error);
        });
    } finally {
        base.close();
    }
}

const leerManejador = (id) => operar('readonly', (almacen) => almacen.get(id));
const guardarManejador = (id, manejador) => operar('readwrite', (almacen) => almacen.put(manejador, id));
const borrarManejador = (id) => operar('readwrite', (almacen) => almacen.delete(id)).catch(() => {});

// El mismo archivo puede llegar con otro manejador; isSameEntry evita duplicarlo en la lista
async function idDeManejador(manejador, lista) {
    for (const entrada of lista) {
        if (!entrada.web) {
            continue;
        }
        const guardado = await leerManejador(entrada.id).catch(() => null);
        if (guardado && (await guardado.isSameEntry(manejador).catch(() => false))) {
            return entrada.id;
        }
    }
    return `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function recordar() {
    const archivo = leer('documento')?.archivo;
    if (!archivo || (!archivo.ruta && !archivo.manejador)) {
        return;
    }
    let lista = leerLista();
    let entrada;
    if (archivo.ruta) {
        entrada = { id: `ruta:${archivo.ruta}`, nombre: archivo.name, ruta: archivo.ruta };
    } else {
        const id = await idDeManejador(archivo.manejador, lista);
        await guardarManejador(id, archivo.manejador);
        entrada = { id, nombre: archivo.manejador.name || archivo.name, web: true };
    }
    entrada.fecha = Date.now();
    lista = [entrada, ...lista.filter((otra) => otra.id !== entrada.id)];
    for (const sobrante of lista.slice(MAXIMO)) {
        if (sobrante.web) {
            borrarManejador(sobrante.id);
        }
    }
    guardarLista(lista);
}

function quitar(id) {
    guardarLista(leerLista().filter((entrada) => entrada.id !== id));
    borrarManejador(id);
    pintar();
}

async function archivoDeManejador(id) {
    const manejador = await leerManejador(id);
    if (!manejador) {
        return null;
    }
    // El clic da permiso al navegador para preguntar; si el usuario lo niega no se abre
    let permiso = await manejador.queryPermission?.({ mode: 'read' });
    if (permiso !== 'granted') {
        permiso = await manejador.requestPermission?.({ mode: 'read' });
    }
    if (permiso !== 'granted') {
        return undefined;
    }
    const archivo = await manejador.getFile();
    archivo.manejador = manejador;
    return archivo;
}

async function abrir(entrada) {
    try {
        const archivo = entrada.ruta ? await abrirRuta(entrada.ruta) : await archivoDeManejador(entrada.id);
        if (archivo === undefined) {
            return;
        }
        if (!archivo) {
            throw new Error('Sin archivo');
        }
        emitir('archivo:abrir', archivo);
    } catch (error) {
        // Movido, borrado o en una unidad que ya no está: fuera de la lista
        console.warn('No se pudo abrir el reciente:', error);
        mostrarAviso(t('recientes.noEncontrado', { nombre: entrada.nombre }));
        quitar(entrada.id);
    }
}

function formatoFecha(marca) {
    const fecha = new Date(marca);
    const idioma = leer('idioma') === 'en' ? 'en-GB' : 'es-ES';
    const hoy = new Date().toDateString() === fecha.toDateString();
    return hoy
        ? fecha.toLocaleTimeString(idioma, { hour: '2-digit', minute: '2-digit' })
        : fecha.toLocaleDateString(idioma, { day: 'numeric', month: 'short', year: 'numeric' });
}

function crearFila(entrada) {
    const fila = document.createElement('li');
    fila.className = 'recientes__fila';
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'recientes__abrir';
    boton.title = entrada.ruta ?? entrada.nombre;
    const nombre = document.createElement('span');
    nombre.className = 'recientes__nombre';
    nombre.textContent = entrada.nombre;
    const fecha = document.createElement('span');
    fecha.className = 'recientes__fecha';
    fecha.textContent = formatoFecha(entrada.fecha);
    boton.append(nombre, fecha);
    boton.addEventListener('click', () => abrir(entrada));
    const quitarBoton = document.createElement('button');
    quitarBoton.type = 'button';
    quitarBoton.className = 'recientes__quitar';
    quitarBoton.title = t('recientes.quitar');
    quitarBoton.setAttribute('aria-label', t('recientes.quitar'));
    quitarBoton.textContent = '×';
    quitarBoton.addEventListener('click', () => quitar(entrada.id));
    fila.append(boton, quitarBoton);
    return fila;
}

// Solo lo que esta plataforma sabe reabrir: rutas en escritorio, manejadores en la web
function utilizables() {
    const conRuta = '__TAURI_INTERNALS__' in window;
    const conManejador = !conRuta && typeof window.showOpenFilePicker === 'function' && 'indexedDB' in window;
    return leerLista().filter((entrada) => (entrada.ruta && conRuta) || (entrada.web && conManejador));
}

function pintar() {
    const lista = utilizables();
    $('portada-recientes').hidden = lista.length === 0;
    $('recientes-lista').replaceChildren(...lista.map(crearFila));
}

export function iniciarRecientes() {
    escuchar('estado:documento', (documento) => {
        if (documento) {
            recordar().catch((error) => console.warn('No se pudo recordar el archivo:', error));
        } else {
            pintar();
        }
    });
    escuchar('documento:guardado', () => recordar().catch(() => {}));
    escuchar('estado:idioma', pintar);
    $('recientes-borrar').addEventListener('click', () => {
        for (const entrada of leerLista()) {
            if (entrada.web) {
                borrarManejador(entrada.id);
            }
        }
        guardarLista([]);
        pintar();
    });
    pintar();
}
