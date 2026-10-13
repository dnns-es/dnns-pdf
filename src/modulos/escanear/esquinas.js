// Fecha: 2026-10-12
// Ruta: /src/modulos/escanear/esquinas.js
// Editor de las cuatro esquinas del documento sobre la foto
// Un polígono y cuatro asas arrastrables en un SVG cuyo viewBox es el tamaño de la foto en píxeles
// Notas: el puntero se pasa a coordenadas del SVG con getScreenCTM, así da igual cómo esté escalado.
//        Cada asa tiene encima un círculo transparente más grande que es el que recibe el dedo.

const SVG = 'http://www.w3.org/2000/svg';
// Radios en píxeles de pantalla: el círculo que se ve y la zona que responde al dedo
const RADIO_ASA = 11;
const RADIO_TOQUE = 26;

function elementoSvg(nombre, atributos) {
    const elemento = document.createElementNS(SVG, nombre);
    for (const [clave, valor] of Object.entries(atributos)) {
        elemento.setAttribute(clave, valor);
    }
    return elemento;
}

export function crearEditorEsquinas(svg) {
    let puntos = [[0, 0], [1, 0], [1, 1], [0, 1]];
    let ancho = 1;
    let alto = 1;
    const poligono = elementoSvg('polygon', { class: 'escanear__poligono' });
    const asas = puntos.map(() => elementoSvg('circle', { class: 'escanear__asa', r: 12 }));
    const toques = puntos.map(() => elementoSvg('circle', { class: 'escanear__toque', r: 24 }));
    svg.append(poligono, ...asas, ...toques);

    function pintar() {
        poligono.setAttribute('points', puntos.map((p) => p.join(',')).join(' '));
        [asas, toques].forEach((circulos) => circulos.forEach((circulo, i) => {
            circulo.setAttribute('cx', puntos[i][0]);
            circulo.setAttribute('cy', puntos[i][1]);
        }));
    }

    // Tamaño de las asas en píxeles de pantalla (el SVG se mide en píxeles de la foto, que va reducida)
    function medirAsas() {
        const anchoEnPantalla = svg.getBoundingClientRect().width;
        const escala = anchoEnPantalla > 0 ? ancho / anchoEnPantalla : Math.max(ancho, alto) / 400;
        asas.forEach((asa) => asa.setAttribute('r', RADIO_ASA * escala));
        toques.forEach((toque) => toque.setAttribute('r', RADIO_TOQUE * escala));
    }

    function puntoSvg(evento) {
        const p = new DOMPoint(evento.clientX, evento.clientY).matrixTransform(svg.getScreenCTM().inverse());
        return [Math.min(Math.max(p.x, 0), ancho), Math.min(Math.max(p.y, 0), alto)];
    }

    toques.forEach((toque, i) => {
        toque.addEventListener('pointerdown', (evento) => {
            evento.preventDefault();
            toque.setPointerCapture(evento.pointerId);
            const mover = (ev) => {
                puntos[i] = puntoSvg(ev);
                pintar();
            };
            const soltar = () => {
                toque.removeEventListener('pointermove', mover);
                toque.removeEventListener('pointerup', soltar);
                toque.removeEventListener('pointercancel', soltar);
            };
            toque.addEventListener('pointermove', mover);
            toque.addEventListener('pointerup', soltar);
            toque.addEventListener('pointercancel', soltar);
        });
    });

    return {
        poner(nuevas, anchoFoto, altoFoto) {
            ancho = anchoFoto;
            alto = altoFoto;
            svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
            puntos = nuevas.map((p) => [...p]);
            medirAsas();
            pintar();
        },
        leer: () => puntos.map((p) => [...p])
    };
}
