// Fecha: 2026-10-12
// Ruta: /src/modulos/firmar/digital.js
// Firma digital con certificado (.p12/.pfx, p. ej. el de la FNMT)
// Pide el certificado y su contraseña, dónde va el recuadro visible, firma y guarda el PDF firmado
// Notas: el certificado se lee del disco cada vez y no se guarda en ningún sitio; la contraseña tampoco.
//        Tras guardar se abre el PDF firmado: cualquier cambio posterior iría detrás de la firma.

import { escuchar, emitir } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { mostrarAviso } from '../../ui/dialogos.js';
import { guardarComo } from '../../plataforma/index.js';

const $ = (id) => document.getElementById(id);

// Recuadro visible en puntos PDF
const ANCHO = 210;
const ALTO = 62;

let certificado = null;

const ERRORES = { CLAVE: 'firmar.errClave', P12: 'firmar.errP12', SINCLAVE: 'firmar.errSinClave', GRANDE: 'firmar.errGrande' };

function mostrarError(clave) {
    $('cert-error').textContent = clave ? t(clave) : '';
    $('cert-error').hidden = !clave;
}

function fechaLocal(iso) {
    return new Date(iso).toLocaleDateString(document.documentElement.lang);
}

function pintarDatos(datos) {
    const caja = $('cert-datos');
    caja.hidden = !datos;
    if (!datos) {
        return;
    }
    const linea = (texto, clase) => {
        const p = document.createElement('p');
        p.textContent = texto;
        if (clase) {
            p.className = clase;
        }
        return p;
    };
    caja.replaceChildren(
        linea(datos.titular.comun || datos.titular.organizacion, 'cert__titular'),
        linea(t('firmar.certEmisor', { emisor: datos.emisor })),
        linea(t(datos.caducado ? 'firmar.certCaducado' : 'firmar.certValido', { hasta: fechaLocal(datos.hasta) }), datos.caducado ? 'dialogo__error' : '')
    );
}

// Copia de los bytes: el worker se queda con lo que se le cede
const copiaP12 = () => certificado.bytes.slice().buffer;

async function comprobarCertificado() {
    if (!certificado) {
        mostrarError('firmar.errSinCert');
        return null;
    }
    try {
        const datos = await pedir('firma:leerCertificado', { p12: copiaP12(), clave: $('cert-clave').value });
        pintarDatos(datos);
        mostrarError(datos.caducado ? 'firmar.errCaducado' : null);
        return datos.caducado ? null : datos;
    } catch (error) {
        pintarDatos(null);
        mostrarError(ERRORES[error.message] ?? 'firmar.errP12');
        return null;
    }
}

// Espera el toque en una página; null si se cambia de herramienta sin tocar
function pedirSitio() {
    return new Promise((resolver) => {
        const fuera = [];
        const terminar = (valor) => {
            fuera.forEach((quitar) => quitar());
            resolver(valor);
        };
        // Primero se activa la herramienta; luego, cualquier cambio de herramienta o salir de anotar cancela
        emitir('anotar:pedirPunto', 'firmar.tocaRecuadro');
        fuera.push(escuchar('anotar:punto', terminar));
        fuera.push(escuchar('anotar:herramienta', (nombre) => nombre !== 'punto' && terminar(null)));
        fuera.push(escuchar('anotar:modo', (activo) => !activo && terminar(null)));
    });
}

// Recuadro centrado en el toque, sin salirse de la página
function recuadro({ pagina, punto }) {
    const [anchoPagina, altoPagina] = leer('documento').tamanos[pagina];
    const x0 = Math.min(Math.max(0, punto[0] - ANCHO / 2), anchoPagina - ANCHO);
    const y0 = Math.min(Math.max(0, punto[1] - ALTO / 2), altoPagina - ALTO);
    return [x0, y0, x0 + ANCHO, y0 + ALTO];
}

function lineasVisibles(motivo) {
    const ahora = new Date().toLocaleString(document.documentElement.lang, { dateStyle: 'short', timeStyle: 'short' });
    const lineas = [t('firmar.visibleFirmado'), '{titular}', t('firmar.visibleFecha', { fecha: ahora })];
    if (motivo) {
        lineas.push(t('firmar.visibleMotivo', { motivo }));
    }
    return lineas;
}

function nombreFirmado() {
    const nombre = leer('documento').nombre || 'documento.pdf';
    return `${nombre.replace(/\.pdf$/i, '')}-firmado.pdf`;
}

async function firmarYGuardar() {
    const datos = await comprobarCertificado();
    if (!datos) {
        return;
    }
    const clave = $('cert-clave').value;
    const motivo = $('cert-motivo').value.trim();
    const lugar = $('cert-lugar').value.trim();
    $('dialogo-certificado').close();
    let sitio = { pagina: leer('paginaActual'), rect: null };
    if ($('cert-visible').checked) {
        const toque = await pedirSitio();
        if (!toque) {
            return;
        }
        sitio = { pagina: toque.pagina, rect: recuadro(toque) };
    }
    try {
        const { bytes } = await pedir('firma:firmar', { p12: copiaP12(), clave, ...sitio, motivo, lugar, lineas: lineasVisibles(motivo) });
        const nombre = nombreFirmado();
        // La copia firmada se guarda aparte, eligiendo dónde: el original nunca se sobrescribe
        const guardado = await guardarComo(new Blob([bytes], { type: 'application/pdf' }), nombre, leer('documento').archivo);
        if (!guardado) {
            return;
        }
        // Lo que había sin guardar ya va dentro del PDF firmado: se abre ese sin preguntar
        await pedir('marcarGuardado');
        emitir('documento:guardado');
        emitir('archivo:abrir', guardado);
        mostrarAviso(t('firmar.firmadoOk'));
    } catch (error) {
        console.error('No se pudo firmar:', error);
        mostrarAviso(t(ERRORES[error.message] ?? 'firmar.errFirmar'));
    }
}

export function abrirCertificado() {
    mostrarError(null);
    $('cert-clave').value = '';
    pintarDatos(null);
    $('dialogo-certificado').showModal();
}

export function iniciarDigital() {
    $('cert-elegir').addEventListener('click', () => $('entrada-certificado').click());
    $('entrada-certificado').addEventListener('change', async (evento) => {
        const [archivo] = evento.target.files;
        evento.target.value = '';
        if (!archivo) {
            return;
        }
        certificado = { nombre: archivo.name, bytes: new Uint8Array(await archivo.arrayBuffer()) };
        $('cert-nombre').textContent = archivo.name;
        pintarDatos(null);
        mostrarError(null);
        $('cert-clave').focus();
    });
    // Al salir de la contraseña se enseña de quién es el certificado, antes de firmar
    $('cert-clave').addEventListener('change', () => certificado && comprobarCertificado());
    $('cert-ojo').addEventListener('click', () => {
        const visible = $('cert-clave').type === 'password';
        $('cert-clave').type = visible ? 'text' : 'password';
        $('cert-ojo').setAttribute('aria-pressed', String(visible));
    });
    $('cert-cancelar').addEventListener('click', () => $('dialogo-certificado').close());
    $('formulario-certificado').addEventListener('submit', (evento) => {
        evento.preventDefault();
        firmarYGuardar();
    });
    // Al cerrar el documento se olvida el certificado
    escuchar('estado:documento', (documento) => {
        if (!documento) {
            certificado = null;
            $('cert-nombre').textContent = '';
        }
    });
}
