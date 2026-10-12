// Fecha: 2026-10-12
// Ruta: /src/motor/firmaDigital.js
// Firma digital con certificado (.p12/.pfx) y comprobación de firmas, dentro del worker
// Firma: añade un campo de firma, guarda en incremental, rellena ByteRange y mete el CMS (adbe.pkcs7.detached)
// Verificar: recorre los campos de firma, comprueba integridad (resumen) y la firma del certificado
// Notas: MuPDF.js no firma ni verifica; el CMS lo hace node-forge, que se carga solo al usarlo.
//        El certificado y su contraseña no salen del dispositivo ni se guardan en ningún sitio.

import * as mupdf from 'mupdf';
import { RAICES } from './raices.js';

// Hueco para el CMS: certificado + cadena + firma caben de sobra en 16 KB (en hexadecimal, el doble)
const RESERVA = 16384;
// Mismo número de cifras que cualquier tamaño real: así el ByteRange se reescribe sin mover nada
const RELLENO_RANGO = 2147483647;
const MARGEN = 6;

let forge = null;
async function cargarForge() {
    forge ??= (await import('node-forge')).default;
    return forge;
}

// ---- Certificado

function nombreDe(atributos) {
    const campo = (nombre) => atributos.getField(nombre)?.value ?? '';
    return { comun: campo('CN'), organizacion: campo('O'), nif: atributos.getField({ type: '2.5.4.5' })?.value ?? '' };
}

async function abrirP12(p12, clave) {
    const f = await cargarForge();
    let almacen;
    try {
        const asn1 = f.asn1.fromDer(f.util.binary.raw.encode(new Uint8Array(p12)));
        almacen = f.pkcs12.pkcs12FromAsn1(asn1, false, clave);
    } catch (error) {
        throw new Error(/password|mac|integrity/i.test(error.message) ? 'CLAVE' : 'P12');
    }
    const claves = [
        ...(almacen.getBags({ bagType: f.pki.oids.pkcs8ShroudedKeyBag })[f.pki.oids.pkcs8ShroudedKeyBag] ?? []),
        ...(almacen.getBags({ bagType: f.pki.oids.keyBag })[f.pki.oids.keyBag] ?? [])
    ].filter((b) => b.key);
    const certificados = (almacen.getBags({ bagType: f.pki.oids.certBag })[f.pki.oids.certBag] ?? []).map((b) => b.cert).filter(Boolean);
    if (!claves.length || !certificados.length) {
        throw new Error('SINCLAVE');
    }
    const clavePrivada = claves[0].key;
    // El certificado del firmante es el que lleva la clave pública de la clave privada
    const propio = certificados.find((c) => c.publicKey.n?.equals(clavePrivada.n)) ?? certificados[0];
    return { clavePrivada, propio, cadena: certificados.filter((c) => c !== propio) };
}

function resumenCertificado(cert) {
    return {
        titular: nombreDe(cert.subject),
        emisor: nombreDe(cert.issuer).comun || nombreDe(cert.issuer).organizacion,
        desde: cert.validity.notBefore.toISOString(),
        hasta: cert.validity.notAfter.toISOString(),
        caducado: Date.now() > cert.validity.notAfter.getTime() || Date.now() < cert.validity.notBefore.getTime()
    };
}

export async function leerCertificado({ p12, clave }) {
    const { propio } = await abrirP12(p12, clave);
    return resumenCertificado(propio);
}

// ---- Firmar

function fechaPdf(fecha) {
    const dos = (n) => String(n).padStart(2, '0');
    const zona = -fecha.getTimezoneOffset();
    const signo = zona >= 0 ? '+' : '-';
    return `D:${fecha.getFullYear()}${dos(fecha.getMonth() + 1)}${dos(fecha.getDate())}${dos(fecha.getHours())}${dos(fecha.getMinutes())}${dos(fecha.getSeconds())}`
        + `${signo}${dos(Math.floor(Math.abs(zona) / 60))}'${dos(Math.abs(zona) % 60)}'`;
}

function arrayPdf(doc, numeros) {
    const array = doc.newArray();
    for (const n of numeros) {
        array.push(Number.isInteger(n) ? doc.newInteger(n) : doc.newReal(n));
    }
    return array;
}

// Texto para un string PDF en WinAnsi: los acentos y la ñ van como octal
function textoPdf(texto) {
    return [...texto].map((c) => {
        const codigo = c.codePointAt(0);
        if (c === '(' || c === ')' || c === '\\') {
            return `\\${c}`;
        }
        if (codigo < 32 || codigo > 255) {
            return '?';
        }
        return codigo > 126 ? `\\${codigo.toString(8).padStart(3, '0')}` : c;
    }).join('');
}

// Recuadro visible: «Firmado digitalmente por», el titular y la fecha
function aparienciaVisible(doc, ancho, alto, lineas) {
    const fuente = doc.addSimpleFont(new mupdf.Font('Helvetica'), 'Latin');
    const negrita = doc.addSimpleFont(new mupdf.Font('Helvetica-Bold'), 'Latin');
    const tamano = Math.min(10, (alto - MARGEN * 2) / (lineas.length * 1.25));
    let y = alto - MARGEN - tamano;
    const texto = lineas.map((linea, i) => {
        const trozo = `BT /${i === 1 ? 'F2' : 'F1'} ${tamano.toFixed(2)} Tf ${MARGEN} ${y.toFixed(2)} Td (${textoPdf(linea)}) Tj ET`;
        y -= tamano * 1.25;
        return trozo;
    }).join('\n');
    const contenido = `q 0.12 0.43 0.92 RG 1 w 0.5 0.5 ${ancho - 1} ${alto - 1} re S Q\nq 0.1 0.1 0.1 rg\n${texto}\nQ`;
    const fuentes = doc.newDictionary();
    fuentes.put('F1', fuente);
    fuentes.put('F2', negrita);
    const recursos = doc.newDictionary();
    recursos.put('Font', fuentes);
    const dic = doc.newDictionary();
    dic.put('Type', doc.newName('XObject'));
    dic.put('Subtype', doc.newName('Form'));
    dic.put('BBox', arrayPdf(doc, [0, 0, ancho, alto]));
    dic.put('Resources', recursos);
    return doc.addStream(contenido, dic);
}

// Campo de firma con el diccionario /Sig vacío (ByteRange y Contents de relleno)
function anadirCampo(doc, { pagina, rect, motivo, lugar, nombre, lineas }) {
    const firma = doc.newDictionary();
    firma.put('Type', doc.newName('Sig'));
    firma.put('Filter', doc.newName('Adobe.PPKLite'));
    firma.put('SubFilter', doc.newName('adbe.pkcs7.detached'));
    firma.put('ByteRange', arrayPdf(doc, [0, RELLENO_RANGO, RELLENO_RANGO, RELLENO_RANGO]));
    firma.put('Contents', doc.newByteString(new Uint8Array(RESERVA)));
    firma.put('M', doc.newString(fechaPdf(new Date())));
    firma.put('Name', doc.newString(nombre));
    if (motivo) {
        firma.put('Reason', doc.newString(motivo));
    }
    if (lugar) {
        firma.put('Location', doc.newString(lugar));
    }
    const refFirma = doc.addObject(firma);

    const paginaPdf = doc.findPage(pagina);
    const [x0, y0, x1, y1] = rect ?? [0, 0, 0, 0];
    // rect llega con origen arriba a la izquierda (como la capa de anotar): el PDF lo quiere abajo
    const alturaPagina = doc.loadPage(pagina).getBounds()[3];
    const caja = rect ? [x0, alturaPagina - y1, x1, alturaPagina - y0] : [0, 0, 0, 0];
    const campo = doc.newDictionary();
    campo.put('Type', doc.newName('Annot'));
    campo.put('Subtype', doc.newName('Widget'));
    campo.put('FT', doc.newName('Sig'));
    campo.put('T', doc.newString(`Firma${Date.now().toString(36)}`));
    // Imprimible y bloqueada
    campo.put('F', doc.newInteger(132));
    campo.put('Rect', arrayPdf(doc, caja));
    campo.put('P', paginaPdf);
    campo.put('V', refFirma);
    if (rect) {
        const ap = doc.newDictionary();
        ap.put('N', aparienciaVisible(doc, x1 - x0, y1 - y0, lineas));
        campo.put('AP', ap);
    }
    const refCampo = doc.addObject(campo);

    let anotaciones = paginaPdf.get('Annots');
    if (anotaciones.isNull()) {
        anotaciones = doc.newArray();
        paginaPdf.put('Annots', anotaciones);
    }
    anotaciones.push(refCampo);
    const raiz = doc.getTrailer().get('Root');
    let formulario = raiz.get('AcroForm');
    if (formulario.isNull()) {
        formulario = doc.addObject(doc.newDictionary());
        raiz.put('AcroForm', formulario);
    }
    let campos = formulario.get('Fields');
    if (campos.isNull()) {
        campos = doc.newArray();
        formulario.put('Fields', campos);
    }
    campos.push(refCampo);
    // 1 = hay firmas, 2 = solo se puede añadir al final (guardado incremental)
    formulario.put('SigFlags', doc.newInteger(3));
}

const latin1 = (bytes) => {
    let texto = '';
    for (let i = 0; i < bytes.length; i += 8192) {
        texto += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return texto;
};

// Coloca los rangos reales en el ByteRange y devuelve dónde está el hueco de Contents
function fijarRangos(pdf) {
    const texto = latin1(pdf);
    const posContents = texto.lastIndexOf('/Contents<');
    const posRango = texto.lastIndexOf('/ByteRange[');
    if (posContents < 0 || posRango < 0) {
        throw new Error('HUECO');
    }
    const inicio = posContents + '/Contents'.length;
    const fin = texto.indexOf('>', inicio) + 1;
    const finRango = texto.indexOf(']', posRango) + 1;
    const viejo = texto.slice(posRango, finRango);
    const nuevo = `/ByteRange[0 ${inicio} ${fin} ${pdf.length - fin}`;
    pdf.set(new TextEncoder().encode(`${nuevo.padEnd(viejo.length - 1, ' ')}]`), posRango);
    return { inicio, fin };
}

function crearCms(f, datos, { clavePrivada, propio, cadena }) {
    const p7 = f.pkcs7.createSignedData();
    p7.content = f.util.createBuffer(latin1(datos));
    p7.addCertificate(propio);
    for (const cert of cadena) {
        p7.addCertificate(cert);
    }
    p7.addSigner({
        key: clavePrivada,
        certificate: propio,
        digestAlgorithm: f.pki.oids.sha256,
        authenticatedAttributes: [
            { type: f.pki.oids.contentType, value: f.pki.oids.data },
            { type: f.pki.oids.messageDigest },
            { type: f.pki.oids.signingTime, value: new Date() }
        ]
    });
    p7.sign({ detached: true });
    return f.asn1.toDer(p7.toAsn1()).getBytes();
}

export async function firmar(doc, { p12, clave, pagina, rect, motivo, lugar, lineas }) {
    const f = await cargarForge();
    const certificado = await abrirP12(p12, clave);
    const titular = nombreDe(certificado.propio.subject).comun;
    anadirCampo(doc, { pagina, rect, motivo, lugar, nombre: titular, lineas: lineas.map((l) => l.replace('{titular}', titular)) });
    let buffer;
    try {
        buffer = doc.saveToBuffer('incremental');
    } catch {
        buffer = doc.saveToBuffer('');
    }
    const pdf = buffer.asUint8Array().slice();
    buffer.destroy();
    const { inicio, fin } = fijarRangos(pdf);
    const datos = new Uint8Array(pdf.length - (fin - inicio));
    datos.set(pdf.subarray(0, inicio));
    datos.set(pdf.subarray(fin), inicio);
    const der = crearCms(f, datos, certificado);
    if (der.length * 2 > fin - inicio - 2) {
        throw new Error('GRANDE');
    }
    let hex = '';
    for (let i = 0; i < der.length; i++) {
        hex += der.charCodeAt(i).toString(16).padStart(2, '0');
    }
    pdf.set(new TextEncoder().encode(hex), inicio + 1);
    return { bytes: pdf, titular, _transferir: [pdf.buffer] };
}

// ---- Verificar

function camposDeFirma(doc) {
    const encontrados = [];
    const recorrer = (campos) => {
        for (let i = 0; i < campos.length; i++) {
            const campo = campos.get(i);
            const hijos = campo.get('Kids');
            if (hijos.isArray()) {
                recorrer(hijos);
            }
            const valor = campo.get('V');
            if (campo.get('FT').toString() === '/Sig' && valor.isDictionary()) {
                encontrados.push({ nombre: campo.get('T').isString() ? campo.get('T').asString() : '', valor });
            }
        }
    };
    const formulario = doc.getTrailer().get('Root').get('AcroForm');
    const campos = formulario.isDictionary() ? formulario.get('Fields') : null;
    if (campos?.isArray()) {
        recorrer(campos);
    }
    return encontrados;
}

const OID_ALGORITMO = { '2.16.840.1.101.3.4.2.1': 'sha256', '2.16.840.1.101.3.4.2.2': 'sha384', '2.16.840.1.101.3.4.2.3': 'sha512', '1.3.14.3.2.26': 'sha1' };
const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const OID_SIGNING_TIME = '1.2.840.113549.1.9.5';

// Lee el SignedData a mano: forge no sabe verificar PKCS#7
function leerCms(f, der) {
    const asn1 = f.asn1.fromDer(f.util.createBuffer(der), { strict: false, parseAllBytes: false });
    const datosFirmados = asn1.value[1].value[0];
    const partes = datosFirmados.value;
    const certificados = [];
    let infos = null;
    for (const parte of partes) {
        if (parte.tagClass === f.asn1.Class.CONTEXT_SPECIFIC && parte.type === 0) {
            for (const c of parte.value) {
                try {
                    certificados.push(f.pki.certificateFromAsn1(c));
                } catch {
                    // Certificados con claves que forge no entiende (curvas elípticas): se ignoran
                }
            }
        }
    }
    infos = partes.at(-1).value[0];
    const campos = infos.value;
    const atributos = campos.find((c) => c.tagClass === f.asn1.Class.CONTEXT_SPECIFIC && c.type === 0);
    const algoritmo = f.asn1.derToOid(campos[2].value[0].value);
    const firma = campos.at(-1).value;
    const emisorSerie = campos[1];
    return { certificados, atributos, algoritmo, firma, emisorSerie };
}

function atributo(f, atributos, oid) {
    const encontrado = atributos?.value.find((a) => f.asn1.derToOid(a.value[0].value) === oid);
    return encontrado?.value[1].value[0];
}

function fechaAsn1(f, nodo) {
    try {
        if (!nodo) {
            return null;
        }
        const fecha = nodo.type === f.asn1.Type.GENERALIZEDTIME ? f.asn1.generalizedTimeToDate(nodo.value) : f.asn1.utcTimeToDate(nodo.value);
        return fecha.toISOString();
    } catch {
        return null;
    }
}

function buscarFirmante(f, certificados, emisorSerie) {
    const serie = f.util.bytesToHex(emisorSerie.value[1].value).replace(/^0+/, '');
    return certificados.find((c) => c.serialNumber.replace(/^0+/, '') === serie) ?? certificados[0];
}

// ¿La cadena llega a una raíz de confianza española? (FNMT, DNIe)
function deConfianza(f, firmante, certificados, extra) {
    try {
        const raices = [...RAICES, ...extra].map((base64) => f.pki.certificateFromAsn1(f.asn1.fromDer(f.util.decode64(base64))));
        const almacen = f.pki.createCaStore(raices);
        const cadena = [firmante];
        let actual = firmante;
        for (let i = 0; i < 5; i++) {
            const padre = certificados.find((c) => c !== actual && actual.isIssuer(c));
            if (!padre) {
                break;
            }
            cadena.push(padre);
            actual = padre;
        }
        return f.pki.verifyCertificateChain(almacen, cadena, { validityCheckDate: null });
    } catch {
        return false;
    }
}

async function comprobarUna(f, bytes, { nombre, valor }, extra) {
    const rango = valor.get('ByteRange');
    const contenido = valor.get('Contents').asByteString();
    const r = [0, 1, 2, 3].map((i) => rango.get(i).asNumber());
    const resultado = { campo: nombre, nombre: valor.get('Name').isString() ? valor.get('Name').asString() : '', fecha: valor.get('M').isString() ? valor.get('M').asString() : '', motivo: valor.get('Reason').isString() ? valor.get('Reason').asString() : '', cubreTodo: r[2] + r[3] === bytes.length };
    try {
        const { certificados, atributos, algoritmo, firma, emisorSerie } = leerCms(f, latin1(contenido));
        const firmante = buscarFirmante(f, certificados, emisorSerie);
        const nombreMd = OID_ALGORITMO[algoritmo];
        if (!nombreMd || !firmante) {
            return { ...resultado, estado: 'desconocida' };
        }
        const md = () => f.md[nombreMd].create();
        const resumen = md();
        resumen.update(latin1(bytes.subarray(r[0], r[0] + r[1])));
        resumen.update(latin1(bytes.subarray(r[2], r[2] + r[3])));
        const esperado = atributo(f, atributos, OID_MESSAGE_DIGEST)?.value;
        const integra = esperado === resumen.digest().getBytes();
        // Los atributos firmados se firman como SET (etiqueta 0x31), no con la etiqueta [0] del mensaje
        const derAtributos = f.asn1.toDer(atributos).getBytes();
        const comoSet = String.fromCharCode(0x31) + derAtributos.slice(1);
        const mdAtributos = md();
        mdAtributos.update(comoSet);
        let firmaValida = false;
        try {
            firmaValida = firmante.publicKey.verify(mdAtributos.digest().getBytes(), firma);
        } catch {
            firmaValida = false;
        }
        const hora = atributo(f, atributos, OID_SIGNING_TIME);
        return {
            ...resultado,
            estado: integra && firmaValida ? 'valida' : 'rota',
            integra,
            firmaValida,
            fechaFirma: fechaAsn1(f, hora),
            certificado: resumenCertificado(firmante),
            confianza: deConfianza(f, firmante, certificados, extra)
        };
    } catch (error) {
        console.warn('No se pudo leer la firma:', error);
        return { ...resultado, estado: 'desconocida' };
    }
}

// Se comprueba sobre los bytes del archivo tal como llegó: el documento abierto puede tener cambios.
// raicesExtra (base64 DER) solo lo usan las pruebas, para tener una autoridad propia de confianza.
export async function verificar({ buffer, raicesExtra = [] }) {
    const bytes = new Uint8Array(buffer);
    const doc = mupdf.Document.openDocument(bytes, 'application/pdf');
    try {
        const campos = doc instanceof mupdf.PDFDocument ? camposDeFirma(doc) : [];
        if (!campos.length) {
            return [];
        }
        const f = await cargarForge();
        const resultados = [];
        for (const campo of campos) {
            resultados.push(await comprobarUna(f, bytes, campo, raicesExtra));
        }
        return resultados;
    } finally {
        doc.destroy();
    }
}
