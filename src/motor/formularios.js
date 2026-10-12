// Fecha: 2026-10-12
// Ruta: /src/motor/formularios.js
// Formularios dentro del worker de MuPDF
// Lista los campos de cada página, cambia sus valores, crea y borra campos (texto y casilla) y aplana el formulario
// Notas: corre dentro del worker; recibe la función que da el documento abierto. Todo pasa por el journal
//        de MuPDF (se puede deshacer, también aplanar). El id de un campo es el número de objeto de su widget.
//        Coordenadas en puntos PDF con origen arriba a la izquierda, como el resto del visor.

import * as mupdf from 'mupdf';

// Tipo de MuPDF -> nombre que usa la interfaz
const TIPOS = { text: 'texto', checkbox: 'casilla', radiobutton: 'opcion', combobox: 'desplegable', listbox: 'lista', button: 'boton', signature: 'firma' };
const FUENTE = 'Helv';
const LADO_CASILLA = 14;
const FLAG_MULTILINEA = 4096;
const ALTO_PARA_MULTILINEA = 30;
// Apariencias de la casilla: marco gris, y la marca cuando está activada
const MARCO_CASILLA = '0.45 0.45 0.45 RG 1 w 0.5 0.5 13 13 re S';
const MARCA_CASILLA = '0 0 0 RG 1.6 w 3 7 m 6 4 l 11 11 l S';

export function crearModuloFormularios(exigirDocumento, marcarCambio) {
    function conPagina(numero, trabajo) {
        const pagina = exigirDocumento().loadPage(numero);
        try {
            return trabajo(pagina);
        } finally {
            pagina.destroy();
        }
    }

    function enOperacion(nombre, trabajo) {
        const doc = exigirDocumento();
        doc.beginOperation(nombre);
        try {
            const resultado = trabajo(doc);
            marcarCambio();
            return resultado;
        } finally {
            doc.endOperation();
        }
    }

    function buscar(pagina, id) {
        const widget = pagina.getWidgets().find((w) => w.getObject().asIndirect() === id);
        if (!widget) {
            throw new Error(`No existe el campo ${id}`);
        }
        return widget;
    }

    // Nombre del estado «activado» de una casilla u opción: la clave de /AP /N que no es Off
    function estadoActivo(widget) {
        const normal = widget.getObject().get('AP').get('N');
        let activo = 'Yes';
        if (normal.isDictionary()) {
            normal.forEach((valor, clave) => {
                if (clave !== 'Off') {
                    activo = clave;
                }
            });
        }
        return activo;
    }

    function resumen(widget) {
        const tipo = TIPOS[widget.getFieldType()] ?? 'otro';
        const datos = {
            id: widget.getObject().asIndirect(),
            tipo,
            nombre: widget.getName(),
            etiqueta: widget.getLabel() || '',
            rect: widget.getRect(),
            valor: widget.getValue(),
            soloLectura: widget.isReadOnly(),
            multilinea: widget.isMultiline(),
            password: widget.isPassword(),
            maxLen: widget.getMaxLen()
        };
        if (tipo === 'casilla' || tipo === 'opcion') {
            const estado = widget.getObject().get('AS');
            datos.estado = estadoActivo(widget);
            datos.marcada = !estado.isNull() && estado.asName() !== 'Off';
        }
        if (tipo === 'desplegable' || tipo === 'lista') {
            datos.opciones = widget.getOptions();
        }
        return datos;
    }

    function acroForm(doc) {
        return doc.getTrailer().get('Root').get('AcroForm');
    }

    // Un PDF sin formulario no tiene /AcroForm: se crea con la fuente Helvetica para los campos de texto
    function asegurarAcroForm(doc) {
        const root = doc.getTrailer().get('Root');
        let acro = root.get('AcroForm');
        if (acro.isNull()) {
            acro = doc.addObject(doc.newDictionary());
            root.put('AcroForm', acro);
        }
        if (acro.get('Fields').isNull()) {
            acro.put('Fields', doc.newArray());
        }
        if (acro.get('DR').isNull()) {
            acro.put('DR', doc.newDictionary());
        }
        if (acro.get('DR').get('Font').isNull()) {
            acro.get('DR').put('Font', doc.newDictionary());
        }
        if (acro.get('DR').get('Font').get(FUENTE).isNull()) {
            const fuente = doc.addObject(doc.newDictionary());
            fuente.put('Type', doc.newName('Font'));
            fuente.put('Subtype', doc.newName('Type1'));
            fuente.put('BaseFont', doc.newName('Helvetica'));
            fuente.put('Encoding', doc.newName('WinAnsiEncoding'));
            acro.get('DR').get('Font').put(FUENTE, fuente);
        }
        if (acro.get('DA').isNull()) {
            acro.put('DA', doc.newString(`/${FUENTE} 0 Tf 0 g`));
        }
        return acro;
    }

    // campo1, campo2... sin chocar con los nombres que ya haya
    function nombreLibre(acro, base) {
        const usados = new Set();
        acro.get('Fields').forEach((campo) => {
            const nombre = campo.get('T');
            if (!nombre.isNull()) {
                usados.add(nombre.asString());
            }
        });
        let n = 1;
        while (usados.has(`${base}${n}`)) {
            n++;
        }
        return `${base}${n}`;
    }

    function prepararCasilla(doc, anotacion, [x, y]) {
        const objeto = anotacion.getObject();
        objeto.put('FT', doc.newName('Btn'));
        objeto.put('V', doc.newName('Off'));
        objeto.put('AS', doc.newName('Off'));
        anotacion.setRect([x, y, x + LADO_CASILLA, y + LADO_CASILLA]);
        const caja = [0, 0, LADO_CASILLA, LADO_CASILLA];
        anotacion.setAppearance(null, 'Off', mupdf.Matrix.identity, caja, doc.newDictionary(), MARCO_CASILLA);
        anotacion.setAppearance(null, 'Yes', mupdf.Matrix.identity, caja, doc.newDictionary(), `${MARCO_CASILLA} ${MARCA_CASILLA}`);
    }

    function prepararTexto(doc, anotacion, rect) {
        const objeto = anotacion.getObject();
        const alto = rect[3] - rect[1];
        objeto.put('FT', doc.newName('Tx'));
        objeto.put('V', doc.newString(''));
        // Letra proporcional al alto del campo; los altos van en varias líneas
        const letra = alto > ALTO_PARA_MULTILINEA ? 10 : Math.max(7, Math.min(12, alto * 0.6));
        objeto.put('DA', doc.newString(`/${FUENTE} ${letra.toFixed(1)} Tf 0 g`));
        if (alto > ALTO_PARA_MULTILINEA) {
            objeto.put('Ff', FLAG_MULTILINEA);
        }
        const aspecto = doc.newDictionary();
        aspecto.put('BC', [0.45, 0.45, 0.45]);
        aspecto.put('BG', [1, 1, 1]);
        objeto.put('MK', aspecto);
        anotacion.setRect(rect);
    }

    return {
        // Hay campos que rellenar (el PDF trae /AcroForm con campos)
        hay() {
            const acro = acroForm(exigirDocumento());
            return !acro.isNull() && !acro.get('Fields').isNull() && acro.get('Fields').length > 0;
        },

        listar({ pagina }) {
            return conPagina(pagina, (p) => p.getWidgets().map(resumen));
        },

        // valor: texto u opción elegida; en casillas y opciones, true/false
        cambiar({ pagina, id, valor }) {
            return enOperacion('formulario', () => conPagina(pagina, (p) => {
                const widget = buscar(p, id);
                const tipo = TIPOS[widget.getFieldType()];
                if (tipo === 'texto') {
                    widget.setTextValue(String(valor ?? ''));
                } else if (tipo === 'desplegable' || tipo === 'lista') {
                    widget.setChoiceValue(String(valor ?? ''));
                } else if ((tipo === 'casilla' || tipo === 'opcion') && Boolean(valor) !== resumen(widget).marcada) {
                    widget.toggle();
                }
                // Regenera la apariencia del campo con el valor nuevo
                p.update();
                return resumen(widget);
            }));
        },

        // tipo: 'texto' (rect completo) o 'casilla' (solo importa la esquina superior izquierda del rect)
        crear({ pagina, tipo, rect, nombre }) {
            return enOperacion('crear campo', (doc) => {
                const acro = asegurarAcroForm(doc);
                const nombreFinal = nombre || nombreLibre(acro, tipo === 'casilla' ? 'casilla' : 'campo');
                return conPagina(pagina, (p) => {
                    const anotacion = p.createAnnotation('Widget');
                    const objeto = anotacion.getObject();
                    objeto.put('T', doc.newString(nombreFinal));
                    objeto.put('F', 4);
                    if (tipo === 'casilla') {
                        prepararCasilla(doc, anotacion, rect);
                    } else {
                        prepararTexto(doc, anotacion, rect);
                    }
                    acro.get('Fields').push(objeto);
                    p.update();
                    return resumen(buscar(p, objeto.asIndirect()));
                });
            });
        },

        borrar({ pagina, id }) {
            return enOperacion('borrar campo', (doc) => conPagina(pagina, (p) => {
                const widget = buscar(p, id);
                const campos = acroForm(doc).get('Fields');
                for (let i = campos.length - 1; i >= 0; i--) {
                    if (campos.get(i).asIndirect() === id) {
                        campos.delete(i);
                    }
                }
                p.deleteAnnotation(widget);
                return true;
            }));
        },

        // Los campos pasan a ser contenido fijo de la página (ya no se pueden editar)
        aplanar() {
            return enOperacion('aplanar', (doc) => {
                doc.bake(false, true);
                return true;
            });
        }
    };
}
