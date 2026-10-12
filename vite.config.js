// Fecha: 2026-10-12
// Ruta: /vite.config.js
// Configuración de Vite para DNNS PDF
// Servidor de desarrollo y build de la PWA
// Notas: base '/dnns-pdf/' porque GitHub Pages sirve el proyecto en esa subruta.
//        mupdf usa await de nivel superior, por eso el destino es esnext y el worker es módulo ES.

import { defineConfig } from 'vite';
import { readFileSync, mkdirSync, copyFileSync, existsSync, statSync } from 'node:fs';

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

// OCR en local: el worker y el motor de Tesseract y los idiomas (español e inglés) se copian a public/ocr/
// (ignorado por git). Se sirven desde la propia app y solo se descargan la primera vez que se usa el OCR.
const RECURSOS_OCR = {
    'worker.min.js': 'node_modules/tesseract.js/dist/worker.min.js',
    'tesseract-core-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
    'tesseract-core-simd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
    'tesseract-core-relaxedsimd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
    'spa.traineddata.gz': 'node_modules/@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz',
    'eng.traineddata.gz': 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'
};

function recursosOcr() {
    return {
        name: 'recursos-ocr',
        configResolved() {
            const destino = new URL('./public/ocr/', import.meta.url);
            mkdirSync(destino, { recursive: true });
            for (const [nombre, origen] of Object.entries(RECURSOS_OCR)) {
                const desde = new URL(`./${origen}`, import.meta.url);
                const hacia = new URL(nombre, destino);
                if (!existsSync(hacia) || statSync(hacia).size !== statSync(desde).size) {
                    copyFileSync(desde, hacia);
                }
            }
        }
    };
}

// Las apps (Tauri y Android) sirven la web desde la raíz; GitHub Pages desde /dnns-pdf/.
// El CLI de Tauri marca su build con TAURI_ENV_PLATFORM y scripts/apk.js con DNNS_APP
const paraApp = Boolean(process.env.TAURI_ENV_PLATFORM || process.env.DNNS_APP);

export default defineConfig({
    base: paraApp ? './' : '/dnns-pdf/',
    plugins: [versionPublicada(), recursosOcr()],
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
