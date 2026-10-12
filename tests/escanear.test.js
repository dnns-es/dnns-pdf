// Fecha: 2026-10-12
// Ruta: /tests/escanear.test.js
// Pruebas de la fase 5 (Escanear): detección de esquinas, homografía, enderezado y filtros
// Uso: npm test
// Notas: las imágenes se fabrican aquí mismo (una hoja clara torcida sobre fondo oscuro).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearImagen, detectarEsquinas, esquinasPorDefecto, homografia, aplicarHomografia, enderezar, filtrar, reducir } from '../src/modulos/escanear/procesar.js';

// ¿Está el punto dentro del polígono? (regla par-impar)
function dentro([x, y], poligono) {
    let dentroDe = false;
    for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
        const [xi, yi] = poligono[i];
        const [xj, yj] = poligono[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
            dentroDe = !dentroDe;
        }
    }
    return dentroDe;
}

// Fondo oscuro con una hoja clara torcida; opcionalmente con «texto» (puntos oscuros) dentro
function hojaTorcida(ancho, alto, esquinas, { texto = false } = {}) {
    const imagen = crearImagen(ancho, alto);
    for (let y = 0; y < alto; y++) {
        for (let x = 0; x < ancho; x++) {
            const i = (y * ancho + x) * 4;
            const papel = dentro([x + 0.5, y + 0.5], esquinas);
            let valor = papel ? 225 : 45;
            if (papel && texto && x % 20 < 3 && y % 30 < 2) {
                valor = 30;
            }
            imagen.datos[i] = imagen.datos[i + 1] = imagen.datos[i + 2] = valor;
            imagen.datos[i + 3] = 255;
        }
    }
    return imagen;
}

const ESQUINAS = [[60, 40], [340, 60], [330, 262], [48, 240]];

test('detecta las cuatro esquinas de una hoja torcida', () => {
    const esquinas = detectarEsquinas(hojaTorcida(400, 300, ESQUINAS));
    assert.ok(esquinas, 'debería ver la hoja');
    esquinas.forEach(([x, y], i) => {
        assert.ok(Math.abs(x - ESQUINAS[i][0]) <= 4 && Math.abs(y - ESQUINAS[i][1]) <= 4, `esquina ${i}: ${[x, y]} frente a ${ESQUINAS[i]}`);
    });
});

test('en una foto grande la detección se hace a escala y devuelve coordenadas reales', () => {
    const grandes = ESQUINAS.map(([x, y]) => [x * 4, y * 4]);
    const esquinas = detectarEsquinas(hojaTorcida(1600, 1200, grandes));
    assert.ok(esquinas);
    esquinas.forEach(([x, y], i) => {
        assert.ok(Math.abs(x - grandes[i][0]) <= 12 && Math.abs(y - grandes[i][1]) <= 12, `esquina ${i}: ${[x, y]}`);
    });
});

test('sin documento claro (todo igual) no inventa esquinas y hay unas por defecto', () => {
    const plana = crearImagen(200, 100);
    plana.datos.fill(120);
    assert.equal(detectarEsquinas(plana), null);
    assert.deepEqual(esquinasPorDefecto(plana, 0.1), [[20, 10], [180, 10], [180, 90], [20, 90]]);
});

test('la homografía lleva cada esquina del rectángulo a su esquina del cuadrilátero', () => {
    const rect = [[0, 0], [100, 0], [100, 50], [0, 50]];
    const h = homografia(rect, ESQUINAS);
    rect.forEach((punto, i) => {
        const [x, y] = aplicarHomografia(h, punto);
        assert.ok(Math.abs(x - ESQUINAS[i][0]) < 1e-6 && Math.abs(y - ESQUINAS[i][1]) < 1e-6);
    });
});

test('enderezar deja un rectángulo casi todo papel, del tamaño real de la hoja', () => {
    const salida = enderezar(hojaTorcida(400, 300, ESQUINAS), ESQUINAS);
    // El lado mayor de cada par: abajo mide hypot(282, 22) ≈ 283, la derecha hypot(10, 202) ≈ 202
    assert.equal(salida.ancho, 283);
    assert.equal(salida.alto, 202);
    let claros = 0;
    for (let i = 0; i < salida.datos.length; i += 4) {
        claros += salida.datos[i] > 200 ? 1 : 0;
    }
    assert.ok(claros / (salida.ancho * salida.alto) > 0.97, `papel: ${claros / (salida.ancho * salida.alto)}`);
});

test('el filtro de texto deja el papel blanco y la tinta negra; el mejorado aclara el papel', () => {
    const hoja = enderezar(hojaTorcida(400, 300, ESQUINAS, { texto: true }), ESQUINAS);
    const texto = filtrar(hoja, 'texto');
    let blancos = 0;
    let negros = 0;
    for (let i = 0; i < texto.datos.length; i += 4) {
        blancos += texto.datos[i] === 255 ? 1 : 0;
        negros += texto.datos[i] === 0 ? 1 : 0;
    }
    assert.equal(blancos + negros, hoja.ancho * hoja.alto, 'solo blanco o negro');
    assert.ok(negros > 100 && negros < blancos * 0.1, `tinta: ${negros}`);
    const mejorado = filtrar(hoja, 'mejorado');
    assert.ok(mejorado.datos[(100 * hoja.ancho + 100) * 4] >= 250, 'el papel (225) pasa a blanco');
    const gris = filtrar(hoja, 'gris');
    assert.equal(gris.datos[0], gris.datos[1]);
});

test('reducir conserva la proporción y limita el lado mayor', () => {
    const { imagen, escala } = reducir(crearImagen(2000, 1000), 500);
    assert.equal(imagen.ancho, 500);
    assert.equal(imagen.alto, 250);
    assert.equal(escala, 0.25);
});
