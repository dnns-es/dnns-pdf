// Fecha: 2026-10-12
// Ruta: /src/modulos/visor/capaTexto.js
// Capa de texto invisible sobre cada página
// Permite seleccionar y copiar el texto del PDF con el ratón o pulsación larga
// Notas: cada línea es un <span> transparente colocado en % y estirado con scaleX para que
//        ocupe lo mismo que en el PDF. Como todo va en % y en función de --escala, el zoom no
//        obliga a rehacer la capa. El texto viene del PDF: solo se usa textContent.

let contextoMedida = null;

function medirAncho(texto, alto) {
    contextoMedida ??= document.createElement('canvas').getContext('2d');
    contextoMedida.font = `${alto}px sans-serif`;
    return contextoMedida.measureText(texto).width;
}

function crearLinea(linea, anchoPagina, altoPagina) {
    const span = document.createElement('span');
    span.textContent = linea.texto;
    span.style.left = `${(linea.x / anchoPagina) * 100}%`;
    span.style.top = `${(linea.y / altoPagina) * 100}%`;
    span.style.setProperty('--alto-linea', linea.h);
    const anchoNatural = medirAncho(linea.texto, linea.h);
    if (anchoNatural > 0) {
        span.style.transform = `scaleX(${linea.w / anchoNatural})`;
    }
    return span;
}

export function rellenarCapaTexto(capa, lineas, anchoPagina, altoPagina) {
    const fragmento = document.createDocumentFragment();
    for (const linea of lineas) {
        fragmento.append(crearLinea(linea, anchoPagina, altoPagina));
        // El <br> no se ve, pero hace que al copiar varias líneas salgan separadas
        fragmento.append(document.createElement('br'));
    }
    capa.replaceChildren(fragmento);
}
