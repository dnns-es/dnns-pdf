// Fecha: 2026-10-12
// Ruta: /android/app/src/main/java/es/dnns/pdf/MainActivity.java
// Actividad principal de la app de Android de DNNS PDF
// Carga la web empaquetada y registra los plugins propios (archivos y actualizaciones)

package es.dnns.pdf;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(Archivos.class);      // abrir con, compartir, guardar e imprimir
        registerPlugin(Actualizador.class);  // versiones nuevas desde descargas.dnns.es
        super.onCreate(savedInstanceState);
    }
}
