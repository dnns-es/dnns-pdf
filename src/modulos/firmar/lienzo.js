// Fecha: 2026-10-12
// Ruta: /src/modulos/firmar/lienzo.js
// Lienzo para dibujar la firma con el dedo, el lápiz o el ratón
// Trazos suavizados, color de tinta y borrar
// Notas: el canvas se dimensiona a su tamaño en pantalla por la densidad de píxeles, para que el trazo
//        salga nítido en móvil. Su fondo es transparente: la firma no lleva recuadro blanco.

const GROSOR = 2.6;

export function crearLienzoFirma(lienzo) {
    const contexto = lienzo.getContext('2d');
    let tinta = '#000000';
    let puntos = null;
    let vacio = true;

    function dimensionar() {
        const escala = window.devicePixelRatio || 1;
        const { width, height } = lienzo.getBoundingClientRect();
        if (!width) {
            return;
        }
        lienzo.width = Math.round(width * escala);
        lienzo.height = Math.round(height * escala);
        vacio = true;
    }

    function punto(evento) {
        const caja = lienzo.getBoundingClientRect();
        return [(evento.clientX - caja.left) * (lienzo.width / caja.width), (evento.clientY - caja.top) * (lienzo.height / caja.height)];
    }

    // Curva por los puntos medios: el trazo sale redondeado aunque el puntero dé saltos
    function trazar(a, b, c) {
        contexto.beginPath();
        contexto.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        contexto.quadraticCurveTo(b[0], b[1], (b[0] + c[0]) / 2, (b[1] + c[1]) / 2);
        contexto.stroke();
    }

    function preparar() {
        contexto.strokeStyle = tinta;
        contexto.fillStyle = tinta;
        contexto.lineWidth = GROSOR * (window.devicePixelRatio || 1);
        contexto.lineCap = 'round';
        contexto.lineJoin = 'round';
    }

    lienzo.addEventListener('pointerdown', (evento) => {
        evento.preventDefault();
        lienzo.setPointerCapture(evento.pointerId);
        preparar();
        const p = punto(evento);
        puntos = [p, p];
        // Un toque sin arrastre deja un punto (la i, el punto final)
        contexto.beginPath();
        contexto.arc(p[0], p[1], contexto.lineWidth / 2, 0, Math.PI * 2);
        contexto.fill();
        vacio = false;
    });
    lienzo.addEventListener('pointermove', (evento) => {
        if (!puntos) {
            return;
        }
        puntos.push(punto(evento));
        trazar(...puntos.slice(-3));
    });
    const soltar = () => {
        puntos = null;
    };
    lienzo.addEventListener('pointerup', soltar);
    lienzo.addEventListener('pointercancel', soltar);

    return {
        dimensionar,
        borrar: () => {
            contexto.clearRect(0, 0, lienzo.width, lienzo.height);
            vacio = true;
        },
        ponerTinta: (color) => {
            tinta = color;
        },
        vacio: () => vacio
    };
}
