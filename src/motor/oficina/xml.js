// Fecha: 2026-10-12
// Ruta: /src/motor/oficina/xml.js
// Lector XML mínimo para los archivos de Office (.docx, .xlsx, .pptx)
// Devuelve un árbol de nodos { nombre, local, atributos, hijos } y ayudas para recorrerlo
// Notas: no usa DOMParser, así sirve igual dentro del worker y en las pruebas de Node.
//        Los nombres se comparan por su parte local ('a:t' y 't' son lo mismo), porque el prefijo
//        de espacio de nombres puede cambiar según el programa que guardó el archivo.
//        Los nodos de texto son { texto }; los que solo traen espacios se descartan.

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const RE_ATRIBUTO = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function decodificar(texto) {
    if (!texto.includes('&')) {
        return texto;
    }
    return texto.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (todo, entidad) => {
        if (entidad[0] === '#') {
            const codigo = entidad[1] === 'x' || entidad[1] === 'X' ? parseInt(entidad.slice(2), 16) : parseInt(entidad.slice(1), 10);
            return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : todo;
        }
        return ENTIDADES[entidad] ?? todo;
    });
}

const parteLocal = (nombre) => {
    const i = nombre.indexOf(':');
    return i < 0 ? nombre : nombre.slice(i + 1);
};

function crearElemento(nombre, cadenaAtributos) {
    const atributos = {};
    for (const m of cadenaAtributos.matchAll(RE_ATRIBUTO)) {
        atributos[m[1]] = decodificar(m[2] ?? m[3]);
    }
    return { nombre, local: parteLocal(nombre), atributos, hijos: [] };
}

// Fin de la etiqueta que empieza en 'desde': el '>' que no está dentro de comillas
function finEtiqueta(texto, desde) {
    let comilla = null;
    for (let i = desde; i < texto.length; i++) {
        const c = texto[i];
        if (comilla) {
            if (c === comilla) {
                comilla = null;
            }
        } else if (c === '"' || c === "'") {
            comilla = c;
        } else if (c === '>') {
            return i;
        }
    }
    return -1;
}

const saltarHasta = (texto, marca, desde) => {
    const i = texto.indexOf(marca, desde);
    return i < 0 ? texto.length : i + marca.length;
};

export function leerXml(texto) {
    const raiz = { nombre: '#documento', local: '#documento', atributos: {}, hijos: [] };
    const pila = [raiz];
    let i = 0;
    while (i < texto.length) {
        const abre = texto.indexOf('<', i);
        if (abre < 0) {
            break;
        }
        if (abre > i) {
            const trozo = texto.slice(i, abre);
            if (trozo.trim()) {
                pila.at(-1).hijos.push({ texto: decodificar(trozo) });
            }
        }
        if (texto.startsWith('<?', abre)) {
            i = saltarHasta(texto, '?>', abre);
        } else if (texto.startsWith('<!--', abre)) {
            i = saltarHasta(texto, '-->', abre);
        } else if (texto.startsWith('<![CDATA[', abre)) {
            const cierre = texto.indexOf(']]>', abre);
            pila.at(-1).hijos.push({ texto: texto.slice(abre + 9, cierre < 0 ? texto.length : cierre) });
            i = cierre < 0 ? texto.length : cierre + 3;
        } else if (texto.startsWith('<!', abre)) {
            i = saltarHasta(texto, '>', abre);
        } else {
            const cierra = finEtiqueta(texto, abre + 1);
            if (cierra < 0) {
                break;
            }
            const interior = texto.slice(abre + 1, cierra).trim();
            if (interior[0] === '/') {
                if (pila.length > 1) {
                    pila.pop();
                }
            } else {
                const autocierre = interior.endsWith('/');
                const cuerpo = autocierre ? interior.slice(0, -1) : interior;
                const espacio = cuerpo.search(/\s/);
                const elemento = crearElemento(espacio < 0 ? cuerpo : cuerpo.slice(0, espacio), espacio < 0 ? '' : cuerpo.slice(espacio));
                pila.at(-1).hijos.push(elemento);
                if (!autocierre) {
                    pila.push(elemento);
                }
            }
            i = cierra + 1;
        }
    }
    return raiz.hijos.find((h) => h.nombre) ?? raiz;
}

// ---- Ayudas (todas toleran un nodo inexistente)

export const hijos = (nodo, local) => (nodo?.hijos ?? []).filter((h) => h.local === local);

export const hijo = (nodo, local) => (nodo?.hijos ?? []).find((h) => h.local === local);

// Todos los descendientes con ese nombre, en orden de documento
export function buscar(nodo, local, salida = []) {
    for (const h of nodo?.hijos ?? []) {
        if (h.local === local) {
            salida.push(h);
        }
        if (h.hijos) {
            buscar(h, local, salida);
        }
    }
    return salida;
}

// Texto de todos los descendientes, saltando los elementos indicados (p. ej. la fonética 'rPh')
export function textoDe(nodo, saltar = null) {
    let texto = '';
    for (const h of nodo?.hijos ?? []) {
        if (h.texto !== undefined) {
            texto += h.texto;
        } else if (!saltar || !saltar.has(h.local)) {
            texto += textoDe(h, saltar);
        }
    }
    return texto;
}
