// Fecha: 2026-10-12
// Ruta: /android/app/src/main/java/es/dnns/pdf/Archivos.java
// Puente de archivos entre Android y la web de DNNS PDF
// Recibe PDFs de «Abrir con» y «Compartir», guarda el PDF editado donde elija el usuario e imprime
// Notas: el PDF recibido se copia a la caché de la app y la web lo lee por el servidor local de
//        Capacitor (rápido, sin pasar megas en base64). Al guardar sí llega en base64 desde la web.
//        Nada sale del dispositivo: solo se usan los selectores y la impresión del propio Android.

package es.dnns.pdf;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "Archivos")
public class Archivos extends Plugin {

    private static final String CARPETA_RECIBIDOS = "recibidos";
    private static final String CARPETA_IMPRIMIR = "imprimir";

    private Intent intentPendiente;
    private byte[] bytesPorGuardar;

    @Override
    public void load() {
        // El PDF con el que se abrió la app: la web lo pide con archivoInicial() cuando está lista
        intentPendiente = getActivity().getIntent();
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        // App ya abierta (singleTask): el nuevo PDF se avisa a la web; si aún no escucha, se guarda el aviso
        new Thread(() -> {
            JSObject archivo = copiarDesde(intent);
            if (archivo != null) {
                notifyListeners("archivoRecibido", archivo, true);
            }
        }).start();
    }

    @PluginMethod
    public void archivoInicial(PluginCall call) {
        Intent intent = intentPendiente;
        intentPendiente = null;
        new Thread(() -> {
            JSObject archivo = copiarDesde(intent);
            call.resolve(archivo != null ? archivo : new JSObject());
        }).start();
    }

    /** Copia el PDF del intent a la caché y devuelve { ruta, nombre }, o null si el intent no trae un PDF. */
    private JSObject copiarDesde(Intent intent) {
        Uri uri = uriDe(intent);
        if (uri == null) {
            return null;
        }
        try {
            File carpeta = vaciar(new File(getContext().getCacheDir(), CARPETA_RECIBIDOS));
            String nombre = nombreDe(uri);
            File destino = new File(carpeta, "documento.pdf");
            ContentResolver resolver = getContext().getContentResolver();
            try (InputStream in = resolver.openInputStream(uri); OutputStream out = new FileOutputStream(destino)) {
                copiar(in, out);
            }
            JSObject r = new JSObject();
            r.put("ruta", destino.getAbsolutePath());
            r.put("nombre", nombre);
            return r;
        } catch (Exception e) {
            return null;
        }
    }

    @SuppressWarnings("deprecation")
    private static Uri uriDe(Intent intent) {
        if (intent == null) {
            return null;
        }
        if (Intent.ACTION_VIEW.equals(intent.getAction())) {
            return intent.getData();
        }
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            return Build.VERSION.SDK_INT >= 33
                    ? intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class)
                    : (Uri) intent.getParcelableExtra(Intent.EXTRA_STREAM);
        }
        return null;
    }

    private String nombreDe(Uri uri) {
        String nombre = null;
        if ("content".equals(uri.getScheme())) {
            try (Cursor c = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    nombre = c.getString(0);
                }
            } catch (Exception ignorada) {
                // Algunas apps no dan el nombre: se usa el genérico
            }
        } else {
            nombre = uri.getLastPathSegment();
        }
        if (nombre == null || nombre.isEmpty()) {
            nombre = "documento.pdf";
        }
        // Los documentos, textos e imágenes conservan su nombre: la web los convierte a PDF
        return nombre.toLowerCase().matches(".*\\.(pdf|docx|xlsx|pptx|rtf|txt|py|bmp|jpe?g|png)$") ? nombre : nombre + ".pdf";
    }

    // ---- Guardar: el usuario elige carpeta y nombre con el selector del sistema

    @PluginMethod
    public void guardar(PluginCall call) {
        String nombre = call.getString("nombre", "documento.pdf");
        String datos = call.getString("datos");
        if (datos == null) {
            call.reject("Faltan los datos del PDF.");
            return;
        }
        bytesPorGuardar = Base64.decode(datos, Base64.DEFAULT);
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/pdf");
        intent.putExtra(Intent.EXTRA_TITLE, nombre);
        startActivityForResult(call, intent, "alElegirDestino");
    }

    @ActivityCallback
    private void alElegirDestino(PluginCall call, ActivityResult resultado) {
        byte[] bytes = bytesPorGuardar;
        bytesPorGuardar = null;
        JSObject r = new JSObject();
        if (resultado.getResultCode() != Activity.RESULT_OK || resultado.getData() == null || bytes == null) {
            r.put("guardado", false);
            call.resolve(r);
            return;
        }
        Uri destino = resultado.getData().getData();
        new Thread(() -> {
            // "wt": si el usuario elige un archivo existente, se sustituye entero
            try (OutputStream out = getContext().getContentResolver().openOutputStream(destino, "wt")) {
                out.write(bytes);
                r.put("guardado", true);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("No se pudo guardar el archivo.");
            }
        }).start();
    }

    // ---- Imprimir: se manda el PDF tal cual al sistema de impresión de Android (calidad completa)

    @PluginMethod
    public void imprimir(PluginCall call) {
        String nombre = call.getString("nombre", "documento.pdf");
        String datos = call.getString("datos");
        if (datos == null) {
            call.reject("Faltan los datos del PDF.");
            return;
        }
        try {
            File carpeta = vaciar(new File(getContext().getCacheDir(), CARPETA_IMPRIMIR));
            File pdf = new File(carpeta, "imprimir.pdf");
            try (OutputStream out = new FileOutputStream(pdf)) {
                out.write(Base64.decode(datos, Base64.DEFAULT));
            }
            getActivity().runOnUiThread(() -> {
                PrintManager impresion = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                impresion.print(nombre, new AdaptadorPdf(pdf, nombre), null);
                call.resolve();
            });
        } catch (Exception e) {
            call.reject("No se pudo preparar la impresión.");
        }
    }

    /** Entrega el PDF ya hecho al sistema de impresión, sin volver a maquetarlo. */
    private static class AdaptadorPdf extends PrintDocumentAdapter {
        private final File pdf;
        private final String nombre;

        AdaptadorPdf(File pdf, String nombre) {
            this.pdf = pdf;
            this.nombre = nombre;
        }

        @Override
        public void onLayout(PrintAttributes antes, PrintAttributes ahora, CancellationSignal cancelar,
                             LayoutResultCallback callback, Bundle extras) {
            if (cancelar.isCanceled()) {
                callback.onLayoutCancelled();
                return;
            }
            PrintDocumentInfo info = new PrintDocumentInfo.Builder(nombre)
                    .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                    .build();
            callback.onLayoutFinished(info, !ahora.equals(antes));
        }

        @Override
        public void onWrite(PageRange[] paginas, ParcelFileDescriptor destino, CancellationSignal cancelar,
                            WriteResultCallback callback) {
            try (InputStream in = new FileInputStream(pdf);
                 OutputStream out = new FileOutputStream(destino.getFileDescriptor())) {
                copiar(in, out);
                callback.onWriteFinished(new PageRange[] { PageRange.ALL_PAGES });
            } catch (Exception e) {
                callback.onWriteFailed(e.getMessage());
            }
        }
    }

    // ---- Utilidades

    private static File vaciar(File carpeta) {
        File[] dentro = carpeta.listFiles();
        if (dentro != null) {
            for (File f : dentro) {
                f.delete();
            }
        }
        carpeta.mkdirs();
        return carpeta;
    }

    private static void copiar(InputStream in, OutputStream out) throws Exception {
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n);
        }
    }
}
