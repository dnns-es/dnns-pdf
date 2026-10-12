// Fecha: 2026-10-12
// Ruta: /src/modulos/organizar/cuadricula.js
// Cuadrícula de páginas de la vista Organizar
// Selección (clic, Ctrl/Cmd, Mayús), arrastrar para reordenar con ratón o dedo, y pintado perezoso
// Notas: con el ratón se arrastra al moverlo unos píxeles; con el dedo hay que mantener pulsado un
//        momento, para que deslizar siga desplazando la cuadrícula. Al soltar se calcula el orden nuevo
//        y se avisa con 'organizar:reordenar' (orden completo, p. ej. [2, 0, 1]).

import { emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';

const ANCHO_TARJETA = 150;
const DISTANCIA_ARRASTRE = 8;
const ESPERA_TACTIL = 350;

let contenedor = null;
let tarjetas = [];
const seleccion = new Set();
let ancla = null;
let observador = null;
let generacion = 0;
let cola = Promise.resolve();

export function seleccionadas() {
    return [...seleccion].sort((a, b) => a - b);
}

function avisarSeleccion() {
    for (const [n, tarjeta] of tarjetas.entries()) {
        const marcada = seleccion.has(n);
        tarjeta.classList.toggle('tarjeta--seleccionada', marcada);
        tarjeta.setAttribute('aria-selected', String(marcada));
    }
    emitir('organizar:seleccion', seleccionadas());
}

export function seleccionar(paginas) {
    seleccion.clear();
    for (const n of paginas) {
        if (n >= 0 && n < tarjetas.length) {
            seleccion.add(n);
        }
    }
    avisarSeleccion();
}

export function seleccionarTodo() {
    seleccionar(tarjetas.map((_, n) => n));
}

function alElegir(numero, evento) {
    if (evento.shiftKey && ancla !== null) {
        const [desde, hasta] = ancla < numero ? [ancla, numero] : [numero, ancla];
        if (!(evento.ctrlKey || evento.metaKey)) {
            seleccion.clear();
        }
        for (let n = desde; n <= hasta; n++) {
            seleccion.add(n);
        }
    } else if (evento.ctrlKey || evento.metaKey || evento.pointerType === 'touch') {
        // En el móvil cada toque suma o quita: no hay Ctrl
        seleccion.has(numero) ? seleccion.delete(numero) : seleccion.add(numero);
        ancla = numero;
    } else {
        seleccion.clear();
        seleccion.add(numero);
        ancla = numero;
    }
    avisarSeleccion();
}

// ---- Pintado: una página cada vez, solo las que se ven

function pintar(numero, gen) {
    cola = cola.then(async () => {
        if (gen !== generacion || !tarjetas[numero]) {
            return;
        }
        const [ancho, alto] = leer('documento').tamanos[numero];
        const escala = (ANCHO_TARJETA * (window.devicePixelRatio || 1)) / Math.max(ancho, alto);
        try {
            const { bitmap } = await pedir('renderizar', { pagina: numero, escala });
            if (gen !== generacion) {
                bitmap.close();
                return;
            }
            tarjetas[numero].querySelector('canvas').getContext('bitmaprenderer').transferFromImageBitmap(bitmap);
        } catch (error) {
            console.error('No se pudo pintar la miniatura:', error);
        }
    });
}

function crearTarjeta(numero, [ancho, alto]) {
    const tarjeta = document.createElement('div');
    tarjeta.className = 'tarjeta';
    tarjeta.dataset.pagina = String(numero);
    tarjeta.setAttribute('role', 'option');
    tarjeta.setAttribute('aria-label', t('panel.pagina', { numero: numero + 1 }));
    tarjeta.tabIndex = 0;
    const hoja = document.createElement('div');
    hoja.className = 'tarjeta__hoja';
    // La hoja ocupa siempre el mismo cuadrado; dentro, la página con su proporción
    const lienzo = document.createElement('canvas');
    lienzo.style.aspectRatio = `${ancho} / ${alto}`;
    lienzo.style[ancho >= alto ? 'width' : 'height'] = '100%';
    hoja.append(lienzo);
    const numeroPagina = document.createElement('span');
    numeroPagina.className = 'tarjeta__numero';
    numeroPagina.textContent = String(numero + 1);
    tarjeta.append(hoja, numeroPagina);
    tarjeta.addEventListener('pointerdown', (evento) => alPulsar(evento, numero));
    tarjeta.addEventListener('dblclick', () => emitir('organizar:abrirPagina', numero));
    tarjeta.addEventListener('keydown', (evento) => {
        if (evento.key === ' ' || evento.key === 'Enter') {
            evento.preventDefault();
            alElegir(numero, evento);
        }
    });
    return tarjeta;
}

export function construir() {
    const documento = leer('documento');
    generacion++;
    observador?.disconnect();
    tarjetas = documento ? documento.tamanos.map((tamano, n) => crearTarjeta(n, tamano)) : [];
    contenedor.replaceChildren(...tarjetas);
    const gen = generacion;
    observador = new IntersectionObserver((entradas) => {
        for (const entrada of entradas) {
            if (entrada.isIntersecting) {
                observador.unobserve(entrada.target);
                pintar(Number(entrada.target.dataset.pagina), gen);
            }
        }
    }, { root: contenedor, rootMargin: '200px 0px' });
    tarjetas.forEach((tarjeta) => observador.observe(tarjeta));
    // La selección sobrevive si las páginas siguen existiendo
    seleccionar([...seleccion].filter((n) => n < tarjetas.length));
}

// ---- Arrastrar para reordenar

let arrastre = null;

function alPulsar(evento, numero) {
    if (evento.button !== 0) {
        return;
    }
    const inicio = { x: evento.clientX, y: evento.clientY };
    const tactil = evento.pointerType === 'touch';
    let temporizador = null;
    let listo = !tactil;
    let movido = false;

    if (tactil) {
        temporizador = setTimeout(() => {
            listo = true;
            navigator.vibrate?.(15);
            empezarArrastre(numero, evento.pointerId, evento.currentTarget);
        }, ESPERA_TACTIL);
    }

    const mover = (ev) => {
        const distancia = Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y);
        if (!arrastre && tactil && !listo && distancia > DISTANCIA_ARRASTRE) {
            // El dedo se movió antes de tiempo: es un desplazamiento, no un arrastre
            terminar();
            return;
        }
        if (!arrastre && listo && distancia > DISTANCIA_ARRASTRE) {
            empezarArrastre(numero, ev.pointerId, ev.currentTarget ?? ev.target);
        }
        if (arrastre) {
            movido = true;
            ev.preventDefault();
            moverArrastre(ev);
        }
    };
    const soltar = (ev) => {
        const habiaArrastre = Boolean(arrastre);
        terminar();
        if (habiaArrastre && movido) {
            soltarArrastre();
        } else if (!habiaArrastre && ev.type === 'pointerup') {
            alElegir(numero, ev);
        } else {
            cancelarArrastre();
        }
    };
    function terminar() {
        clearTimeout(temporizador);
        window.removeEventListener('pointermove', mover);
        window.removeEventListener('pointerup', soltar);
        window.removeEventListener('pointercancel', soltar);
    }
    window.addEventListener('pointermove', mover, { passive: false });
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
}

function empezarArrastre(numero) {
    // Se arrastra la selección si la tarjeta está en ella; si no, solo esa tarjeta
    if (!seleccion.has(numero)) {
        seleccionar([numero]);
        ancla = numero;
    }
    const indicador = document.createElement('div');
    indicador.className = 'organizar__indicador';
    contenedor.append(indicador);
    contenedor.classList.add('organizar__cuadricula--arrastrando');
    arrastre = { indicador, destino: null };
}

// Hueco donde caería: antes o después de la tarjeta más cercana al puntero
function moverArrastre(evento) {
    const debajo = document.elementFromPoint(evento.clientX, evento.clientY)?.closest('.tarjeta');
    autodesplazar(evento.clientY);
    if (!debajo) {
        return;
    }
    const caja = debajo.getBoundingClientRect();
    const despues = evento.clientX > caja.left + caja.width / 2;
    const n = Number(debajo.dataset.pagina);
    arrastre.destino = despues ? n + 1 : n;
    const base = contenedor.getBoundingClientRect();
    const x = (despues ? caja.right : caja.left) - base.left + contenedor.scrollLeft;
    Object.assign(arrastre.indicador.style, {
        left: `${x - 2}px`,
        top: `${caja.top - base.top + contenedor.scrollTop}px`,
        height: `${caja.height}px`
    });
}

function autodesplazar(y) {
    const caja = contenedor.getBoundingClientRect();
    const margen = 60;
    if (y < caja.top + margen) {
        contenedor.scrollTop -= 12;
    } else if (y > caja.bottom - margen) {
        contenedor.scrollTop += 12;
    }
}

function cancelarArrastre() {
    arrastre?.indicador.remove();
    contenedor.classList.remove('organizar__cuadricula--arrastrando');
    arrastre = null;
}

function soltarArrastre() {
    const destino = arrastre?.destino;
    cancelarArrastre();
    if (destino === null || destino === undefined) {
        return;
    }
    const movidas = seleccionadas();
    const resto = tarjetas.map((_, n) => n).filter((n) => !seleccion.has(n));
    // Posición en la lista sin las movidas: cuántas del resto quedan antes del hueco
    const hueco = resto.filter((n) => n < destino).length;
    const orden = [...resto.slice(0, hueco), ...movidas, ...resto.slice(hueco)];
    if (orden.every((n, i) => n === i)) {
        return;
    }
    // Tras mover, siguen seleccionadas en su sitio nuevo
    seleccion.clear();
    movidas.forEach((_, i) => seleccion.add(hueco + i));
    emitir('organizar:reordenar', orden);
}

export function iniciarCuadricula() {
    contenedor = document.getElementById('organizar-cuadricula');
    // Mientras se arrastra con el dedo, el navegador no debe desplazar la página por su cuenta
    document.addEventListener('touchmove', (evento) => {
        if (arrastre) {
            evento.preventDefault();
        }
    }, { passive: false });
    // Clic en el hueco entre tarjetas: quitar la selección
    contenedor.addEventListener('pointerup', (evento) => {
        if (evento.target === contenedor && !arrastre) {
            seleccionar([]);
        }
    });
}
