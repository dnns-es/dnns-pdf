// Fecha: 2026-10-12
// Ruta: /android/app/src/main/java/es/dnns/pdf/Actualizador.java
// Actualización de la app de Android desde descargas.dnns.es
// Notas: mismo actualizador probado en OberDomo y Koberlet.
//
// Android no deja sustituir una app en silencio: se descarga, se comprueba y se
// abre el instalador del sistema, donde el usuario confirma.
// Qué protege de un APK falso, por orden de importancia:
//   1. La FIRMA: se compara el certificado del APK descargado con el de la app
//      instalada. Si no es el mismo (o no se puede leer), se borra y no se instala.
//   2. El origen fijo: solo https://descargas.dnns.es/.
//   3. La huella sha256 del latest.json (pilla descargas a medias).
// Y no se instala una versión más vieja que la puesta.

package es.dnns.pdf;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "Actualizador")
public class Actualizador extends Plugin {

    private static final String ORIGEN = "https://descargas.dnns.es/";
    private static final String LATEST = ORIGEN + "63lwb88n0c/dnnspdf/latest.json";

    /** Versión instalada de verdad (la del APK, no la que diga el JavaScript). */
    @PluginMethod
    public void version(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject r = new JSObject();
            r.put("version", info.versionName);
            r.put("versionCode", info.versionCode);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("No se pudo leer la versión instalada.");
        }
    }

    /** Lee el latest.json desde aquí (nativo): así no depende de CORS ni de la CSP del WebView. */
    @PluginMethod
    public void consultar(PluginCall call) {
        new Thread(() -> {
            try {
                HttpURLConnection con = (HttpURLConnection) new URL(LATEST).openConnection();
                con.setConnectTimeout(15000);
                con.setReadTimeout(15000);
                con.setUseCaches(false);
                try (InputStream in = con.getInputStream()) {
                    java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[4096];
                    int n;
                    while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                    call.resolve(new JSObject(b.toString("UTF-8")));
                } finally {
                    con.disconnect();
                }
            } catch (Exception e) {
                call.reject("No se pudo consultar si hay actualización.");
            }
        }).start();
    }

    /** Descarga el APK, comprueba huella y firma, y abre el instalador del sistema. */
    @PluginMethod
    public void instalar(PluginCall call) {
        final String url = call.getString("url");
        final String sha = call.getString("sha256") == null ? null : call.getString("sha256").toLowerCase();
        if (url == null || sha == null) { call.reject("Faltan datos de la actualización."); return; }
        if (!url.startsWith(ORIGEN)) { call.reject("Ese paquete no viene del servidor de DNNS; no se descarga."); return; }

        new Thread(() -> {
            try {
                File destino = new File(getContext().getCacheDir(), "actualizacion/dnnspdf.apk");
                destino.getParentFile().mkdirs();
                descargar(url, destino);
                String real = huella(destino);
                if (!real.equals(sha)) { destino.delete(); call.reject("La huella del paquete descargado no cuadra: se ha descartado."); return; }
                String motivo = porQueNoEsNuestro(destino);
                if (motivo != null) { destino.delete(); call.reject(motivo); return; }

                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", destino);
                Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
                intent.setData(uri);
                intent.setFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                intent.putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true);
                getContext().startActivity(intent);
                JSObject r = new JSObject();
                r.put("lanzado", true);
                call.resolve(r);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "No se pudo descargar la actualización.");
            }
        }).start();
    }

    private void descargar(String url, File destino) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setConnectTimeout(20000);
        con.setReadTimeout(60000);
        try {
            if (con.getResponseCode() != 200) throw new Exception("El servidor respondió " + con.getResponseCode() + ".");
            try (InputStream in = con.getInputStream(); OutputStream out = new FileOutputStream(destino)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
        } finally {
            con.disconnect();
        }
    }

    /** null si el APK es de esta app, con la misma firma y no más viejo; si no, el motivo. */
    @SuppressWarnings("deprecation")
    private String porQueNoEsNuestro(File apk) throws Exception {
        PackageManager pm = getContext().getPackageManager();
        // Las dos formas de leer la firma: algunos Android no rellenan signingInfo al leer un APK de disco.
        int banderas = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? (PackageManager.GET_SIGNING_CERTIFICATES | PackageManager.GET_SIGNATURES)
                : PackageManager.GET_SIGNATURES;
        PackageInfo bajado = pm.getPackageArchiveInfo(apk.getAbsolutePath(), banderas);
        if (bajado == null) return "El fichero descargado no es un paquete de Android válido.";
        PackageInfo puesto = pm.getPackageInfo(getContext().getPackageName(), banderas);
        if (!getContext().getPackageName().equals(bajado.packageName)) return "Ese paquete es de otra aplicación; no se instala.";
        List<String> fb = certificados(bajado), fp = certificados(puesto);
        if (fb.isEmpty() || fp.isEmpty()) return "No se ha podido leer la firma del paquete; no se instala.";
        if (!fb.equals(fp)) return "El paquete descargado está firmado con otra clave: NO es de DNNS. Se ha borrado.";
        if (bajado.versionCode < puesto.versionCode) return "Ese paquete es más viejo que el instalado; no se instala.";
        return null;
    }

    @SuppressWarnings("deprecation")
    private List<String> certificados(PackageInfo info) throws Exception {
        Signature[] firmas = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && info.signingInfo != null) firmas = info.signingInfo.getApkContentsSigners();
        if (firmas == null || firmas.length == 0) firmas = info.signatures;
        List<String> r = new ArrayList<>();
        if (firmas == null) return r;
        MessageDigest d = MessageDigest.getInstance("SHA-256");
        for (Signature s : firmas) r.add(hex(d.digest(s.toByteArray())));
        Collections.sort(r);
        return r;
    }

    private String huella(File f) throws Exception {
        MessageDigest d = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) d.update(buf, 0, n);
        }
        return hex(d.digest());
    }

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }
}
