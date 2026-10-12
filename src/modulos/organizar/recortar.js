// Fecha: 2026-10-12
// Ruta: /src/modulos/organizar/recortar.js
// Diálogo Recortar márgenes: se arrastra un recuadro sobre la página con lo que se quiere conservar
// Devuelve { rect, todas } (rect en puntos de la página, o null para quitar el recorte) o null si se cancela
// Notas: recortar no borra nada del PDF, solo cambia la zona visible (CropBox): se puede deshacer o quitar

import { leer } from '../../nucleo/estado.js';
import { pedir } from '../../motor/cliente.js';

const $ = (id) => document.getElementById(id);
const ANCHO_VISTA = 480;
const MINIMO = 10;

let marco = null;

async function pintarPagina(numero) {
    const lienzo = $('recortar-imagen');
    const [ancho, alto] = leer('documento').tamanos[numero];
    // Cabe en el diálogo tanto en vertical como en horizontal
    const escalaVista = Math.min(ANCHO_VISTA / ancho, (window.innerHeight * 0.55) / alto);
    lienzo.style.width = `${ancho * escalaVista}px`;
    lienzo.style.height = `${alto * escalaVista}px`;
    const { bitmap } = await pedir('renderizar', { pagina: numero, escala: escalaVista * (window.devicePixelRatio || 1) });
    lienzo.getContext('bitmaprenderer').transferFromImageBitmap(bitmap);
}

function dibujarMarco() {
    const elemento = $('recortar-marco');
    if (!marco) {
        elemento.hidden = true;
        return;
    }
    const [x0, y0, x1, y1] = marco;
    Object.assign(elemento.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
    elemento.hidden = false;
}

function prepararArrastre() {
    const lienzo = $('recortar-imagen');
    lienzo.onpointerdown = (evento) => {
        evento.preventDefault();
        lienzo.setPointerCapture(evento.pointerId);
        const caja = lienzo.getBoundingClientRect();
        const punto = (ev) => [
            Math.min(Math.max(ev.clientX - caja.left, 0), caja.width),
            Math.min(Math.max(ev.clientY - caja.top, 0), caja.height)
        ];
        const inicio = punto(evento);
        lienzo.onpointermove = (ev) => {
            const fin = punto(ev);
            marco = [Math.min(inicio[0], fin[0]), Math.min(inicio[1], fin[1]), Math.max(inicio[0], fin[0]), Math.max(inicio[1], fin[1])];
            dibujarMarco();
        };
        lienzo.onpointerup = () => {
            lienzo.onpointermove = null;
            lienzo.onpointerup = null;
            if (marco && (marco[2] - marco[0] < MINIMO || marco[3] - marco[1] < MINIMO)) {
                marco = null;
                dibujarMarco();
            }
            $('recortar-aceptar').disabled = !marco;
        };
    };
}

// Píxeles en pantalla -> puntos de la página
function marcoEnPuntos(numero) {
    const [ancho] = leer('documento').tamanos[numero];
    const factor = ancho / $('recortar-imagen').getBoundingClientRect().width;
    return marco.map((v) => v * factor);
}

export async function pedirRecorte(numero) {
    const dialogo = $('dialogo-recortar');
    marco = null;
    dibujarMarco();
    $('recortar-aceptar').disabled = true;
    $('recortar-todas').checked = false;
    prepararArrastre();
    dialogo.showModal();
    await pintarPagina(numero);

    return new Promise((resolver) => {
        const terminar = (valor) => {
            dialogo.removeEventListener('cancel', alCancelar);
            $('recortar-cancelar').onclick = null;
            $('recortar-aceptar').onclick = null;
            $('recortar-quitar').onclick = null;
            dialogo.close();
            resolver(valor);
        };
        const alCancelar = (evento) => {
            evento?.preventDefault();
            terminar(null);
        };
        dialogo.addEventListener('cancel', alCancelar);
        $('recortar-cancelar').onclick = alCancelar;
        $('recortar-aceptar').onclick = () => terminar({ rect: marcoEnPuntos(numero), todas: $('recortar-todas').checked });
        $('recortar-quitar').onclick = () => terminar({ rect: null, todas: $('recortar-todas').checked });
    });
}
