// Fecha: 2026-10-12
// Ruta: /src/modulos/firmar/verificar.js
// Comprobar las firmas digitales de un PDF recibido
// Para cada firma: quién firma, cuándo, si el documento sigue intacto y si el certificado es de confianza
// Notas: se comprueba sobre el archivo tal como llegó (no sobre los cambios sin guardar).
//        Al abrir un PDF con firmas se avisa sin que nadie lo pida.

import { escuchar } from '../../nucleo/eventos.js';
import { leer } from '../../nucleo/estado.js';
import { t } from '../../nucleo/i18n.js';
import { pedir } from '../../motor/cliente.js';
import { mostrarAviso } from '../../ui/dialogos.js';

const $ = (id) => document.getElementById(id);

const ESTADOS = {
    valida: { clase: 'verificar__estado--bien', icono: '✔', texto: 'firmar.verValida' },
    rota: { clase: 'verificar__estado--mal', icono: '✖', texto: 'firmar.verRota' },
    desconocida: { clase: 'verificar__estado--duda', icono: '?', texto: 'firmar.verDesconocida' }
};

// Fecha de un diccionario de firma: D:AAAAMMDDHHmmSS
function fechaPdf(texto) {
    const m = /D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?/.exec(texto ?? '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0)) : null;
}

function textoFecha(firma) {
    const fecha = firma.fechaFirma ? new Date(firma.fechaFirma) : fechaPdf(firma.fecha);
    return fecha ? fecha.toLocaleString(document.documentElement.lang, { dateStyle: 'short', timeStyle: 'short' }) : '';
}

function linea(texto, clase = '') {
    const p = document.createElement('p');
    p.className = clase;
    p.textContent = texto;
    return p;
}

function fichaDe(firma) {
    const estado = ESTADOS[firma.estado] ?? ESTADOS.desconocida;
    const ficha = document.createElement('li');
    ficha.className = 'verificar__ficha';
    const cabecera = document.createElement('div');
    cabecera.className = `verificar__estado ${estado.clase}`;
    cabecera.textContent = `${estado.icono} ${t(estado.texto)}`;
    ficha.append(cabecera, linea(firma.certificado?.titular.comun || firma.nombre || t('firmar.verSinNombre'), 'verificar__titular'));
    const fecha = textoFecha(firma);
    if (fecha) {
        ficha.append(linea(t('firmar.verFecha', { fecha })));
    }
    if (firma.motivo) {
        ficha.append(linea(t('firmar.visibleMotivo', { motivo: firma.motivo })));
    }
    if (firma.certificado) {
        ficha.append(linea(t('firmar.certEmisor', { emisor: firma.certificado.emisor })));
        ficha.append(linea(t(firma.confianza ? 'firmar.verConfianza' : 'firmar.verSinConfianza'), firma.confianza ? '' : 'verificar__aviso'));
    }
    if (firma.estado === 'valida' && !firma.cubreTodo) {
        ficha.append(linea(t('firmar.verCambiosDespues'), 'verificar__aviso'));
    }
    return ficha;
}

async function comprobar() {
    const archivo = leer('documento')?.archivo;
    if (!archivo) {
        return null;
    }
    const buffer = await archivo.arrayBuffer();
    return pedir('firma:verificar', { buffer }, [buffer]);
}

export async function abrirVerificar() {
    let firmas;
    try {
        firmas = await comprobar();
    } catch (error) {
        console.error('No se pudieron comprobar las firmas:', error);
        mostrarAviso(t('firmar.errVerificar'));
        return;
    }
    if (!firmas?.length) {
        mostrarAviso(t('firmar.verNinguna'));
        return;
    }
    $('verificar-resumen').textContent = t('firmar.verResumen', { total: firmas.length });
    $('verificar-lista').replaceChildren(...firmas.map(fichaDe));
    $('dialogo-verificar').showModal();
}

export function iniciarVerificar() {
    $('verificar-cerrar').addEventListener('click', () => $('dialogo-verificar').close());
    // Un PDF con firmas avisa al abrirlo; el detalle está en Firmar > Comprobar firmas
    escuchar('estado:documento', async (documento) => {
        if (!documento || documento.avisado) {
            return;
        }
        try {
            const firmas = await comprobar();
            if (firmas?.length && leer('documento') === documento) {
                const rotas = firmas.some((f) => f.estado !== 'valida');
                mostrarAviso(t(rotas ? 'firmar.avisoFirmasRotas' : 'firmar.avisoFirmas', { total: firmas.length }));
            }
        } catch (error) {
            console.warn('No se pudieron comprobar las firmas al abrir:', error);
        }
    });
}
