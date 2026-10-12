// Fecha: 2026-10-12
// Ruta: /scripts/apk.js
// Compila la app de Android y, con --publicar, la sube a descargas.dnns.es con su latest.json
// Uso: npm run apk                 (APK firmado en salida/)
//      npm run apk -- --publicar   (además lo publica; lo llama release.js al sacar versión)
// Notas: la firma usa desktop/.keys/android-firma.properties (fuera de git). Sin esa llave no se publica:
//        un APK con otra firma no podría actualizar las instalaciones existentes.
//        Rutas de herramientas por variables de entorno, con los valores de este equipo por defecto.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID = join(RAIZ, 'android');
const SALIDA = join(RAIZ, 'salida');
const FIRMA = join(RAIZ, 'desktop', '.keys', 'android-firma.properties');

const ANDROID_HOME = process.env.ANDROID_HOME || 'F:\\APP\\_tools\\Android\\Sdk';
const JAVA_HOME = [process.env.JAVA_HOME, 'F:\\APP\\_tools\\jdk21'].find((p) => p && existsSync(join(p, 'bin')));
const GRADLE_USER_HOME = process.env.GRADLE_USER_HOME || 'F:\\APP\\_tools\\gradle-home';

// Servidor de descargas (vpsfran). La carpeta lleva un token para no dejar rutas adivinables.
const SERVIDOR = 'root@51.210.41.88';
const LLAVE_SSH = join(process.env.USERPROFILE || process.env.HOME || '', '.ssh', 'vpsfran');
const CARPETA_REMOTA = '/opt/descargas/63lwb88n0c/dnnspdf';
const URL_PUBLICA = 'https://descargas.dnns.es/63lwb88n0c/dnnspdf';

const publicar = process.argv.includes('--publicar');
const version = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).version;
const entorno = { ...process.env, ANDROID_HOME, JAVA_HOME, GRADLE_USER_HOME, DNNS_APP: 'android' };

function fallar(mensaje) {
    console.error(`\n✖ ${mensaje}`);
    process.exit(1);
}

function ejecutar(orden, argumentos, opciones = {}) {
    const r = spawnSync(orden, argumentos, { stdio: 'inherit', env: entorno, shell: process.platform === 'win32', ...opciones });
    if (r.status !== 0) {
        fallar(`Falló: ${orden} ${argumentos.join(' ')}`);
    }
}

// Las novedades de esta versión salen de su sección del CHANGELOG, igual que en la Release de Windows
function notasDeVersion() {
    const changelog = readFileSync(join(RAIZ, 'CHANGELOG.md'), 'utf8');
    const inicio = changelog.indexOf(`## [${version}]`);
    if (inicio < 0) {
        return '';
    }
    const resto = changelog.slice(inicio).split('\n').slice(1);
    const fin = resto.findIndex((linea) => linea.startsWith('## ['));
    return resto.slice(0, fin < 0 ? undefined : fin).filter((l) => l.startsWith('- ')).join('\n');
}

function compilar() {
    if (!existsSync(FIRMA)) {
        fallar('Falta la llave de firma (desktop/.keys/android-firma.properties). Recupérala de la copia de llaves.');
    }
    if (!JAVA_HOME) {
        fallar('No se encuentra un JDK 21: pon JAVA_HOME');
    }
    ejecutar('npx', ['vite', 'build']);
    ejecutar('npx', ['cap', 'sync', 'android']);
    ejecutar(join(ANDROID, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'), ['assembleRelease', '-q'], { cwd: ANDROID });

    const apk = join(ANDROID, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
    if (!existsSync(apk)) {
        fallar('Gradle terminó pero no hay APK firmado');
    }
    // Comprobar la firma antes de dar el APK por bueno
    const herramientas = join(ANDROID_HOME, 'build-tools');
    const ultima = execFileSync('cmd', ['/c', 'dir', '/b', '/o-n', herramientas], { encoding: 'utf8' }).split(/\r?\n/)[0];
    ejecutar(join(herramientas, ultima, 'apksigner.bat'), ['verify', apk]);

    mkdirSync(SALIDA, { recursive: true });
    const final = join(SALIDA, `dnnspdf-${version}.apk`);
    copyFileSync(apk, final);
    return final;
}

function sha256(ruta) {
    return createHash('sha256').update(readFileSync(ruta)).digest('hex');
}

function subir(apk) {
    const nombre = `dnnspdf-${version}.apk`;
    const huella = sha256(apk);
    const latest = {
        version,
        url: `${URL_PUBLICA}/${nombre}`,
        sha256: huella,
        notas: notasDeVersion(),
        fecha: new Date().toISOString().slice(0, 10)
    };
    const latestLocal = join(SALIDA, 'latest.json');
    writeFileSync(latestLocal, JSON.stringify(latest, null, 2) + '\n');

    const ssh = ['-i', LLAVE_SSH, '-o', 'BatchMode=yes'];
    ejecutar('scp', [...ssh, apk, `${SERVIDOR}:${CARPETA_REMOTA}/${nombre}`], { shell: false });
    // Comprobar la huella en el servidor antes de anunciar la versión en latest.json
    const remota = execFileSync('ssh', [...ssh, SERVIDOR, `sha256sum ${CARPETA_REMOTA}/${nombre}`], { encoding: 'utf8' }).split(' ')[0];
    if (remota !== huella) {
        fallar('La huella del APK subido no coincide; no se publica el latest.json');
    }
    execFileSync('ssh', [...ssh, SERVIDOR, `cp ${CARPETA_REMOTA}/${nombre} ${CARPETA_REMOTA}/dnnspdf_ultima.apk`]);
    ejecutar('scp', [...ssh, latestLocal, `${SERVIDOR}:${CARPETA_REMOTA}/latest.json`], { shell: false });
    console.log(`\n✔ Android ${version} publicada: ${URL_PUBLICA}/dnnspdf_ultima.apk`);
}

const apk = compilar();
console.log(`\n✔ APK firmado: ${apk}`);
if (publicar) {
    subir(apk);
}
