// Fecha: 2026-10-12
// Ruta: /src/modulos/escanear/esquinas.js
// Editor de las cuatro esquinas del documento sobre la foto
// Un polígono y cuatro asas arrastrables en un SVG cuyo viewBox es el tamaño de la foto en píxeles
// Notas: el puntero se pasa a coordenadas del SVG con getScreenCTM, así da igual cómo esté escalado.

const SVG = 'http://www.w3.org/2000/svg';

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
    svg.append(poligono, ...asas);

    function pintar() {
        poligono.setAttribute('points', puntos.map((p) => p.join(',')).join(' '));
        asas.forEach((asa, i) => {
            asa.setAttribute('cx', puntos[i][0]);
            asa.setAttribute('cy', puntos[i][1]);
        });
    }

    function puntoSvg(evento) {
        const p = new DOMPoint(evento.clientX, evento.clientY).matrixTransform(svg.getScreenCTM().inverse());
        return [Math.min(Math.max(p.x, 0), ancho), Math.min(Math.max(p.y, 0), alto)];
    }

    asas.forEach((asa, i) => {
        asa.addEventListener('pointerdown', (evento) => {
            evento.preventDefault();
            asa.setPointerCapture(evento.pointerId);
            const mover = (ev) => {
                puntos[i] = puntoSvg(ev);
                pintar();
            };
            const soltar = () => {
                asa.removeEventListener('pointermove', mover);
                asa.removeEventListener('pointerup', soltar);
                asa.removeEventListener('pointercancel', soltar);
            };
            asa.addEventListener('pointermove', mover);
            asa.addEventListener('pointerup', soltar);
            asa.addEventListener('pointercancel', soltar);
        });
    });

    return {
        poner(nuevas, anchoFoto, altoFoto) {
            ancho = anchoFoto;
            alto = altoFoto;
            svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
            puntos = nuevas.map((p) => [...p]);
            // Las asas se miden en píxeles de la foto: más grandes cuanto mayor sea la foto
            const radio = Math.max(10, Math.round(Math.max(ancho, alto) / 60));
            asas.forEach((asa) => asa.setAttribute('r', radio));
            pintar();
        },
        leer: () => puntos.map((p) => [...p])
    };
}
