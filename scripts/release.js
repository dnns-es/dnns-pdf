// Fecha: 2026-10-12
// Ruta: /scripts/release.js
// Publica una versión: sube el número en todos los sitios a la vez, crea la etiqueta y la empuja
// La etiqueta dispara release.yml (instalador de Windows), el push a main actualiza la web
// y al final se compila y sube el APK de Android (scripts/apk.js)
// Notas: uso: npm run release -- 0.2.0   (o patch | minor | major). Exige estar en main y sin cambios.
//        Los sitios con versión: package.json, package-lock.json, desktop/src-tauri/tauri.conf.json,
//        desktop/src-tauri/Cargo.toml y CACHE_VERSION de public/sw.js. CHANGELOG.md debe tener la sección.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

const raiz = new URL('../', import.meta.url);
const ruta = (relativa) => new URL(relativa, raiz);
const leer = (relativa) => readFileSync(ruta(relativa), 'utf8');
const escribir = (relativa, contenido) => writeFileSync(ruta(relativa), contenido);
const git = (orden) => execSync(`git ${orden}`, { cwd: raiz, encoding: 'utf8' }).trim();

function fallar(mensaje) {
    console.error(`\n✖ ${mensaje}`);
    process.exit(1);
}

function calcularVersion(actual, pedida) {
    if (/^\d+\.\d+\.\d+$/.test(pedida)) {
        return pedida;
    }
    const [mayor, menor, parche] = actual.split('.').map(Number);
    const saltos = {
        major: `${mayor + 1}.0.0`,
        minor: `${mayor}.${menor + 1}.0`,
        patch: `${mayor}.${menor}.${parche + 1}`
    };
    return saltos[pedida] ?? fallar('Indica la versión (0.2.0) o patch, minor o major');
}

function comprobarRepositorio() {
    if (git('branch --show-current') !== 'main') {
        fallar('Hay que publicar desde la rama main');
    }
    if (git('status --porcelain')) {
        fallar('Hay cambios sin confirmar; confírmalos o descártalos antes');
    }
    git('fetch -q origin main');
    if (git('rev-parse HEAD') !== git('rev-parse origin/main')) {
        fallar('main no está al día con origin/main');
    }
}

function sustituirVersion(relativa, buscar, reemplazo) {
    const contenido = leer(relativa);
    if (!buscar.test(contenido)) {
        fallar(`No se encontró la versión en ${relativa}`);
    }
    escribir(relativa, contenido.replace(buscar, reemplazo));
}

function aplicarVersion(nueva) {
    sustituirVersion('package.json', /"version": "[^"]+"/, `"version": "${nueva}"`);
    // El lock lleva la versión del paquete raíz dos veces, al principio
    sustituirVersion('package-lock.json', /("name": "dnns-pdf",\s*"version": ")[^"]+"/, `$1${nueva}"`);
    sustituirVersion('package-lock.json', /("": \{\s*"name": "dnns-pdf",\s*"version": ")[^"]+"/, `$1${nueva}"`);
    sustituirVersion('desktop/src-tauri/tauri.conf.json', /"version": "[^"]+"/, `"version": "${nueva}"`);
    sustituirVersion('desktop/src-tauri/Cargo.toml', /^version = "[^"]+"/m, `version = "${nueva}"`);
    sustituirVersion('public/sw.js', /CACHE_VERSION = 'v[^']+'/, `CACHE_VERSION = 'v${nueva}'`);
    if (!leer('CHANGELOG.md').includes(`## [${nueva}]`)) {
        fallar(`CHANGELOG.md no tiene la sección ## [${nueva}]; escríbela antes de publicar`);
    }
}

async function confirmar(pregunta) {
    const consola = createInterface({ input: process.stdin, output: process.stdout });
    const respuesta = (await consola.question(`${pregunta} (s/N) `)).trim().toLowerCase();
    consola.close();
    return respuesta === 's' || respuesta === 'si' || respuesta === 'sí';
}

async function principal() {
    const pedida = process.argv[2] ?? fallar('Uso: npm run release -- 0.2.0 | patch | minor | major');
    const actual = JSON.parse(leer('package.json')).version;
    const nueva = calcularVersion(actual, pedida);
    comprobarRepositorio();
    console.log(`\nVersión ${actual} → ${nueva}`);
    if (!process.argv.includes('--si') && !(await confirmar('Esto crea la etiqueta y publica la Release en GitHub. ¿Seguir?'))) {
        fallar('Cancelado');
    }
    aplicarVersion(nueva);
    // Cargo.lock debe reflejar la versión nueva del paquete para que el build no lo modifique
    execSync(`"${cargo()}" update -p dnns-pdf --offline`, { cwd: ruta('desktop/src-tauri/'), stdio: 'ignore' });
    git('add -A');
    git(`commit -q -m "Versión ${nueva}"`);
    git(`tag -a v${nueva} -m "Versión ${nueva}"`);
    git('push -q origin main');
    git(`push -q origin v${nueva}`);
    console.log(`\n✔ Publicada v${nueva}. Sigue el progreso en https://github.com/dnns-es/dnns-pdf/actions`);
    publicarAndroid();
}

// cargo no siempre está en el PATH de la consola (p. ej. el bash de Git): se busca donde lo deja rustup
function cargo() {
    const enRustup = join(homedir(), '.cargo', 'bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo');
    return existsSync(enRustup) ? enRustup : 'cargo';
}

// El APK se firma en este equipo (la llave no está en GitHub), así que se compila y sube desde aquí
function publicarAndroid() {
    if (!existsSync(ruta('desktop/.keys/android-firma.properties'))) {
        console.log('\n! Sin la llave de Android en este equipo: el APK no se ha publicado (npm run apk -- --publicar)');
        return;
    }
    execSync('node scripts/apk.js --publicar', { cwd: raiz, stdio: 'inherit' });
}

principal().catch((error) => fallar(error.message));
