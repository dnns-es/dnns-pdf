// Fecha: 2026-10-12
// Ruta: /src/modulos/comparar/comparar.js
// Módulo Comparar: el documento abierto frente a otro PDF (por ejemplo, dos versiones de un contrato)
// Opción del menú Herramientas. Se elige el otro PDF y sale un panel a la derecha con los cambios de cada
// página: en rojo lo que el abierto tiene y el otro no; en verde lo que el otro añade (con una marca en el
// sitio del abierto donde iría). Las páginas escaneadas se comparan por imagen y se marca la zona.
// Notas: el otro PDF no se abre en el visor: el worker lo lee solo para comparar y se suelta al cerrar.

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { mostrarAviso, abrirProgreso } from '../../ui/dialogos.js';
import { registrarUtilidad } from '../herramientas/herramientas.js';

const $ = (id) => document.getElementById(id);
const MAX_TEXTO = 160;
const ERRORES = { PROTEGIDO: 'comparar.protegido' };

let resultado = null;
let otroNombre = '';

function elegirOtro() {
    const entrada = $('comparar-entrada');
    return new Promise((resolver) => {
        entrada.onchange = () => resolver(entrada.files[0] ?? null);
        entrada.value = '';
        entrada.click();
    });
}

function porcentaje(valor, total) {
    return `${(valor / total) * 100}%`;
}

function crearMarca(cambio, rect, [ancho, alto]) {
    const marca = document.createElement('div');
    marca.className = `comparar-marca comparar-marca--${cambio.tipo === 'anadido' ? 'anadido' : 'quitado'}`;
    const [x0, y0, x1, y1] = rect;
    marca.style.left = porcentaje(x0, ancho);
    marca.style.top = porcentaje(y0, alto);
    marca.style.width = porcentaje(x1 - x0, ancho);
    marca.style.height = porcentaje(y1 - y0, alto);
    marca.title = cambio.texto ? `${cambio.tipo === 'anadido' ? '+' : '−'} ${cambio.texto}` : t('comparar.imagen');
    return marca;
}

// Marcas sobre una página del documento abierto
function pintarPagina(numero) {
    const elemento = document.querySelector(`.pagina[data-pagina="${numero}"]`);
    if (!elemento) {
        return;
    }
    elemento.querySelector('.capa-comparar')?.remove();
    const datos = resultado?.paginas.find((p) => p.pagina === numero);
    if (!datos?.cambios.length) {
        return;
    }
    const capa = document.createElement('div');
    capa.className = 'capa-comparar';
    const tamano = leer('documento').tamanos[numero];
    for (const cambio of datos.cambios) {
        if (cambio.tipo === 'anadido') {
            // Lo añadido está en el otro PDF: aquí solo se señala dónde iría
            if (cambio.referencia) {
                const [, y0, x1, y1] = cambio.referencia;
                capa.append(crearMarca(cambio, [x1, y0, x1 + 3, y1], tamano));
            }
        } else {
            for (const rect of cambio.rects) {
                capa.append(crearMarca(cambio, rect, tamano));
            }
        }
    }
    elemento.append(capa);
}

function rectDe(cambio) {
    const rect = cambio.tipo === 'anadido' ? cambio.referencia : cambio.rects[0];
    return rect ? { x: rect[0], y: rect[1], w: rect[2] - rect[0], h: rect[3] - rect[1] } : null;
}

function crearCambio(pagina, cambio) {
    const fila = document.createElement('li');
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = `comparar__cambio comparar__cambio--${cambio.tipo}`;
    const signo = { quitado: '−', anadido: '+', imagen: '≠' }[cambio.tipo];
    const texto = cambio.texto.length > MAX_TEXTO ? `${cambio.texto.slice(0, MAX_TEXTO)}…` : cambio.texto;
    boton.textContent = `${signo} ${texto || t('comparar.imagen')}`;
    boton.addEventListener('click', () => {
        emitir('pagina:ir', pagina);
        const rect = rectDe(cambio);
        if (rect) {
            emitir('visor:mostrarRect', { pagina, rect });
        }
    });
    fila.append(boton);
    return fila;
}

function crearPagina(datos) {
    const grupo = document.createElement('li');
    grupo.className = 'comparar__pagina';
    const titulo = document.createElement('h3');
    titulo.textContent = t('comparar.pagina', { n: datos.pagina + 1 });
    grupo.append(titulo);
    if (datos.soloEn) {
        const aviso = document.createElement('p');
        aviso.className = 'comparar__solo';
        aviso.textContent = t(datos.soloEn === 'otro' ? 'comparar.soloOtro' : 'comparar.soloAbierto');
        grupo.append(aviso);
        return grupo;
    }
    const lista = document.createElement('ul');
    lista.append(...datos.cambios.map((cambio) => crearCambio(datos.pagina, cambio)));
    grupo.append(lista);
    return grupo;
}

function mostrarResultado() {
    const cambios = resultado.paginas.reduce((suma, p) => suma + p.cambios.length, 0);
    $('comparar-con').textContent = t('comparar.con', { nombre: otroNombre });
    $('comparar-resumen').textContent = resultado.paginas.length
        ? t('comparar.resumen', { cambios, paginas: resultado.paginas.length })
        : t('comparar.iguales');
    if (resultado.paginasAbierto !== resultado.paginasOtro) {
        $('comparar-resumen').textContent += ` ${t('comparar.paginasDistintas', { abierto: resultado.paginasAbierto, otro: resultado.paginasOtro })}`;
    }
    $('comparar-lista').replaceChildren(...resultado.paginas.map(crearPagina));
    $('panel-comparar').hidden = false;
    for (const elemento of document.querySelectorAll('.pagina')) {
        pintarPagina(Number(elemento.dataset.pagina));
    }
}

function cerrar() {
    if (!resultado && $('panel-comparar').hidden) {
        return;
    }
    resultado = null;
    $('panel-comparar').hidden = true;
    $('comparar-lista').replaceChildren();
    for (const capa of document.querySelectorAll('.capa-comparar')) {
        capa.remove();
    }
    pedir('comparar:cerrar').catch(() => {});
}

async function comparar() {
    const archivo = await elegirOtro();
    if (!archivo) {
        return;
    }
    // El worker no se puede interrumpir a mitad: cancelar cierra el aviso y se descarta el resultado
    let cancelado = false;
    const progreso = abrirProgreso(() => {
        cancelado = true;
        progreso.cerrar();
    });
    progreso.actualizar(t('comparar.comparando'), null);
    try {
        const buffer = await archivo.arrayBuffer();
        await pedir('comparar:cargar', { buffer, nombre: archivo.name }, [buffer]);
        const datos = await pedir('comparar:comparar');
        if (cancelado) {
            pedir('comparar:cerrar').catch(() => {});
            return;
        }
        resultado = datos;
        otroNombre = archivo.name;
        mostrarResultado();
    } catch (error) {
        console.error('No se pudo comparar:', error);
        if (!cancelado) {
            mostrarAviso(t(ERRORES[error.message] ?? 'comparar.error'));
        }
    } finally {
        if (!cancelado) {
            progreso.cerrar();
        }
    }
}

export function iniciarComparar() {
    registrarUtilidad('comparar', comparar);
    $('comparar-cerrar').addEventListener('click', cerrar);
    escuchar('pagina:pintada', (numero) => resultado && pintarPagina(numero));
    escuchar('estado:documento', cerrar);
    // Si el documento abierto cambia de páginas, la comparación ya no corresponde
    escuchar('documento:estructura', cerrar);
}
