package io.github.shullmusik.tamalitos;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * App independiente: la web de Tamalitos viaja DENTRO del APK (assets/www) y se muestra
 * en un WebView. No necesita el sitio en línea ni conexión para funcionar.
 *
 * El WebView sirve los archivos desde https://appassets.androidplatform.net/assets/www/
 * (origen seguro: localStorage estable).
 * Lo que un WebView no hace por sí solo se resuelve con el puente `TamalitosNative`:
 * guardar archivos (diálogo "Guardar como"), abrir WhatsApp y tomar la foto de un ticket.
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final String BASE = "https://" + HOST + "/assets/www/";
    static final int REQ_SAVE = 41, REQ_PICK = 42;

    WebView web;
    WebViewAssetLoader loader;
    String pendingContent;
    ValueCallback<Uri[]> pendingChooser;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);            // localStorage: aquí viven todos los datos
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setBackgroundColor(Color.parseColor("#E8890C"));

        loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return loader.shouldInterceptRequest(r.getUrl());
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;     // navegación interna
                openExternal(u.toString());                       // wa.me, enlaces de pago…
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            /** <input type="file"> → restaurar respaldo. */
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (pendingChooser != null) pendingChooser.onReceiveValue(null);
                pendingChooser = cb;
                try {
                    Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("*/*");
                    startActivityForResult(Intent.createChooser(i, "Elegir respaldo"), REQ_PICK);
                    return true;
                } catch (ActivityNotFoundException e) {
                    pendingChooser = null;
                    return false;
                }
            }
        });

        web.addJavascriptInterface(new Bridge(), "TamalitosNative");

        if (savedInstanceState == null) web.loadUrl(BASE + "index.html" + viewParam(getIntent()));
        else web.restoreState(savedInstanceState);
    }

    /** Accesos directos del ícono: tamalitos://ventas → index.html?v=ventas */
    static String viewParam(Intent intent) {
        Uri d = intent != null ? intent.getData() : null;
        return d != null && d.getHost() != null ? "?v=" + d.getHost() : "";
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        Uri d = intent.getData();
        if (d != null && d.getHost() != null) js("TM.app && TM.app.setView('" + d.getHost() + "')");
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    /** Botón atrás: cierra la hoja abierta si la hay; si no, la app pasa a segundo plano. */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.TM && TM.ui && TM.ui.backHandled) ? TM.ui.backHandled() : false", value -> {
            if (!"true".equals(value)) moveTaskToBack(true);
        });
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_SAVE) {
            if (res == RESULT_OK && data != null && data.getData() != null && pendingContent != null) {
                try (OutputStream os = getContentResolver().openOutputStream(data.getData())) {
                    if (os != null) os.write(pendingContent.getBytes(StandardCharsets.UTF_8));
                    js("TM.ui && TM.ui.toast('Archivo guardado')");
                } catch (Exception e) {
                    js("TM.ui && TM.ui.toast('No se pudo guardar el archivo')");
                }
            }
            pendingContent = null;
        } else if (req == REQ_PICK && pendingChooser != null) {
            pendingChooser.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            pendingChooser = null;
        }
    }

    void openExternal(String url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
        catch (ActivityNotFoundException e) { js("TM.ui && TM.ui.toast('No hay una app para abrir ese enlace')"); }
    }

    void js(String code) { runOnUiThread(() -> web.evaluateJavascript(code, null)); }

    /** Puente JS ↔ Android. Todo lo que toca la UI vuelve al hilo principal. */
    class Bridge {
        @JavascriptInterface
        public String version() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
            catch (Exception e) { return "?"; }
        }

        /** Descargas (respaldo .json, historial .csv): diálogo del sistema "Guardar como". */
        @JavascriptInterface
        public void saveFile(String name, String mime, String content) {
            pendingContent = content;
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType(mime != null && !mime.isEmpty() ? mime.split(";")[0] : "application/octet-stream");
            i.putExtra(Intent.EXTRA_TITLE, name);
            runOnUiThread(() -> {
                try { startActivityForResult(i, REQ_SAVE); }
                catch (ActivityNotFoundException e) { js("TM.ui && TM.ui.toast('Este teléfono no tiene selector de archivos')"); }
            });
        }

        /** window.print() no existe en WebView: se usa el gestor de impresión (Guardar como PDF). */
        @JavascriptInterface
        public void print() {
            runOnUiThread(() -> {
                PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                PrintDocumentAdapter adapter = web.createPrintDocumentAdapter("Tamalitos");
                pm.print("Reporte Tamalitos", adapter, new PrintAttributes.Builder().build());
            });
        }

        @JavascriptInterface
        public void openExternal(String url) { runOnUiThread(() -> MainActivity.this.openExternal(url)); }

    }
}
