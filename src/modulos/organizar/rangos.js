// Fecha: 2026-10-12
// Ruta: /src/modulos/organizar/rangos.js
// Cálculo de las partes al dividir un PDF: por rangos escritos («1-3, 5») o cada N páginas
// Notas: sin dependencias de la página, para poder probarlo aparte (tests/organizar.test.js).
//        Las páginas que devuelve se numeran desde 0.

// «1-3, 5, 8-10» -> [[0,1,2],[4],[7,8,9]]; lanza un error con la clave de texto si no vale
export function leerRangos(texto, total) {
    const partes = texto.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    if (!partes.length) {
        throw new Error('organizar.rangosVacios');
    }
    return partes.map((parte) => {
        const m = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(parte);
        if (!m) {
            throw new Error('organizar.rangosMal');
        }
        const desde = Number(m[1]);
        const hasta = m[2] ? Number(m[2]) : desde;
        if (desde < 1 || hasta > total || desde > hasta) {
            throw new Error('organizar.rangosFuera');
        }
        return Array.from({ length: hasta - desde + 1 }, (_, i) => desde - 1 + i);
    });
}

// Partes de n páginas seguidas; la última se queda con las que sobren
export function cadaN(n, total) {
    const partes = [];
    for (let inicio = 0; inicio < total; inicio += n) {
        partes.push(Array.from({ length: Math.min(n, total - inicio) }, (_, i) => inicio + i));
    }
    return partes;
}
