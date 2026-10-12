// Fecha: 2026-10-12
// Ruta: /vite.config.js
// Configuración de Vite para DNNS PDF
// Servidor de desarrollo y build de la PWA
// Notas: base '/dnns-pdf/' porque GitHub Pages sirve el proyecto en esa subruta.
//        mupdf usa await de nivel superior, por eso el destino es esnext y el worker es módulo ES.

import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const leerJson = (ruta) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), 'utf8'));
const paquete = leerJson('./package.json');
const paqueteMupdf = leerJson('./node_modules/mupdf/package.json');

// /version.json en la web publicada: lo lee el tablero de apps de dnns.es para saber qué versión hay
function versionPublicada() {
    return {
        name: 'version-publicada',
        generateBundle() {
            this.emitFile({
                type: 'asset',
                fileName: 'version.json',
                source: JSON.stringify({ version: paquete.version, fecha: new Date().toISOString().slice(0, 10) })
            });
        }
    };
}

export default defineConfig({
    base: '/dnns-pdf/',
    plugins: [versionPublicada()],
    define: {
        __VERSION_APP__: JSON.stringify(paquete.version),
        __VERSION_MUPDF__: JSON.stringify(paqueteMupdf.version)
    },
    build: {
        target: 'esnext'
    },
    worker: {
        format: 'es'
    },
    optimizeDeps: {
        // Si Vite preempaqueta mupdf pierde la ruta relativa al .wasm
        exclude: ['mupdf']
    }
});
