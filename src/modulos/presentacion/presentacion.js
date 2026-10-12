// Fecha: 2026-10-12
// Ruta: /src/modulos/presentacion/presentacion.js
// Modo presentación: una página cada vez a pantalla completa, para proyectar o leer sin distracciones
// Teclas: flechas, Av Pág/Re Pág, espacio e Intro para pasar; Inicio y Fin; R gira la vista (Mayús+R al
// otro lado); Esc sale. Con el ratón: clic en la mitad derecha avanza y en la izquierda retrocede. En el
// móvil, deslizar. Al salir, el visor se queda en la página a la que se llegó.
// Notas: girar aquí solo cambia cómo se ve; el documento no se toca (para girar de verdad, Organizar).

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { limitar } from '../../nucleo/utilidades.js';

const MAX_LADO = 6000;
const OCULTAR_CONTROLES = 2500;
const DESLIZAR_MINIMO = 50;

const $ = (id) => document.getElementById(id);

let activa = false;
let pagina = 0;
let giro = 0;
let peticion = 0;
let temporizador = 0;
const guardados = new Map();

function tamanoGirado(numero) {
    const [ancho, alto] = leer('documento').tamanos[numero];
    return giro % 180 === 0 ? [ancho, alto] : [alto, ancho];
}

// Escala en puntos CSS para que la página quepa entera en la pantalla
function escalaAjustada(numero) {
    const [ancho, alto] = tamanoGirado(numero);
    return Math.min(window.innerWidth / ancho, window.innerHeight / alto);
}

async function imagenDe(numero) {
    const [ancho, alto] = leer('documento').tamanos[numero];
    const deseada = escalaAjustada(numero) * (window.devicePixelRatio || 1);
    const escala = Math.min(deseada, MAX_LADO / Math.max(ancho, alto));
    const clave = `${numero}|${escala.toFixed(4)}`;
    if (!guardados.has(clave)) {
        guardados.set(clave, pedir('renderizar', { pagina: numero, escala }).then(({ bitmap }) => bitmap));
        // Se guardan pocas: la actual y las vecinas
        while (guardados.size > 4) {
            const [primera, promesa] = guardados.entries().next().value;
            guardados.delete(primera);
            promesa.then((bitmap) => bitmap.close()).catch(() => {});
        }
    }
    return guardados.get(clave);
}

function vaciarGuardados() {
    for (const promesa of guardados.values()) {
        promesa.then((bitmap) => bitmap.close()).catch(() => {});
    }
    guardados.clear();
}

function dibujar(bitmap, numero) {
    const lienzo = $('presentacion-lienzo');
    const [ancho, alto] = tamanoGirado(numero);
    const escala = escalaAjustada(numero);
    const girado = giro % 180 !== 0;
    lienzo.width = girado ? bitmap.height : bitmap.width;
    lienzo.height = girado ? bitmap.width : bitmap.height;
    lienzo.style.width = `${ancho * escala}px`;
    lienzo.style.height = `${alto * escala}px`;
    const contexto = lienzo.getContext('2d');
    contexto.save();
    contexto.translate(lienzo.width / 2, lienzo.height / 2);
    contexto.rotate((giro * Math.PI) / 180);
    contexto.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    contexto.restore();
}

async function mostrar(numero) {
    const total = leer('documento').paginas;
    pagina = limitar(numero, 0, total - 1);
    $('presentacion-pagina').textContent = t('presentacion.pagina', { n: pagina + 1, total });
    const mia = ++peticion;
    try {
        const bitmap = await imagenDe(pagina);
        if (mia === peticion && activa) {
            dibujar(bitmap, pagina);
        }
        // La siguiente queda preparada para que el cambio sea inmediato
        if (pagina + 1 < total) {
            imagenDe(pagina + 1).catch(() => {});
        }
    } catch (error) {
        console.error('No se pudo pintar la página en la presentación:', error);
    }
}

function mostrarControles() {
    const capa = $('presentacion');
    capa.classList.add('presentacion--controles');
    clearTimeout(temporizador);
    temporizador = setTimeout(() => capa.classList.remove('presentacion--controles'), OCULTAR_CONTROLES);
}

function girar(grados) {
    giro = (giro + grados + 360) % 360;
    vaciarGuardados();
    mostrar(pagina);
}

const TECLAS = {
    ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': 1, Enter: 1, n: 1,
    ArrowLeft: -1, ArrowUp: -1, PageUp: -1, Backspace: -1, p: -1
};

function alTeclado(evento) {
    if (!activa) {
        return;
    }
    // Ningún otro atajo debe actuar con la presentación delante
    evento.stopPropagation();
    if (evento.key === 'Escape') {
        evento.preventDefault();
        salir();
    } else if (evento.key === 'Home' || evento.key === 'End') {
        evento.preventDefault();
        mostrar(evento.key === 'Home' ? 0 : leer('documento').paginas - 1);
    } else if (evento.key === 'r' || evento.key === 'R') {
        evento.preventDefault();
        girar(evento.shiftKey ? -90 : 90);
    } else if (TECLAS[evento.key] && !evento.ctrlKey && !evento.metaKey) {
        evento.preventDefault();
        mostrar(pagina + TECLAS[evento.key]);
    }
}

function alClic(evento) {
    if (evento.target.closest('.presentacion__controles')) {
        return;
    }
    mostrar(pagina + (evento.clientX > window.innerWidth / 2 ? 1 : -1));
}

function prepararDeslizar(capa) {
    let inicio = null;
    capa.addEventListener('touchstart', (evento) => {
        inicio = evento.touches.length === 1 ? evento.touches[0].clientX : null;
    }, { passive: true });
    capa.addEventListener('touchend', (evento) => {
        if (inicio === null) {
            return;
        }
        const recorrido = evento.changedTouches[0].clientX - inicio;
        inicio = null;
        if (Math.abs(recorrido) >= DESLIZAR_MINIMO) {
            mostrar(pagina + (recorrido < 0 ? 1 : -1));
        }
    }, { passive: true });
}

async function entrar() {
    if (!leer('documento') || activa) {
        return;
    }
    activa = true;
    giro = 0;
    const capa = $('presentacion');
    capa.hidden = false;
    capa.focus();
    mostrarControles();
    try {
        await capa.requestFullscreen?.();
    } catch {
        // Sin pantalla completa (iframes, iOS) la capa ya ocupa toda la ventana
    }
    mostrar(leer('paginaActual'));
}

function salir() {
    if (!activa) {
        return;
    }
    activa = false;
    peticion++;
    $('presentacion').hidden = true;
    vaciarGuardados();
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
    emitir('pagina:ir', pagina);
}

export function iniciarPresentacion() {
    const capa = $('presentacion');
    $('boton-presentacion').addEventListener('click', entrar);
    $('presentacion-salir').addEventListener('click', salir);
    $('presentacion-girar').addEventListener('click', () => girar(90));
    $('presentacion-anterior').addEventListener('click', () => mostrar(pagina - 1));
    $('presentacion-siguiente').addEventListener('click', () => mostrar(pagina + 1));
    capa.addEventListener('click', alClic);
    capa.addEventListener('pointermove', mostrarControles);
    prepararDeslizar(capa);
    // En captura: llega antes que los atajos del visor
    window.addEventListener('keydown', alTeclado, true);
    window.addEventListener('keydown', (evento) => {
        if (evento.key === 'F5' && leer('documento') && !activa) {
            evento.preventDefault();
            entrar();
        }
    });
    // Salir de pantalla completa con la tecla del sistema también cierra la presentación
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && activa) {
            salir();
        }
    });
    window.addEventListener('resize', () => {
        if (activa) {
            mostrar(pagina);
        }
    });
    escuchar('estado:documento', salir);
    escuchar('presentacion:entrar', entrar);
}
