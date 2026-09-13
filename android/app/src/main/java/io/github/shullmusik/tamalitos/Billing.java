package io.github.shullmusik.tamalitos;

import android.app.Activity;
import android.webkit.WebView;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import org.json.JSONObject;

import java.util.Collections;
import java.util.List;

/**
 * Google Play Billing (librería 8.x) para el producto único "tamalitos_pro".
 * Los resultados se entregan a la web llamando TM.billing.nativeResult({...})
 * y TM.billing.nativeDetails({...}) — ver js/core/billing.js.
 */
public class Billing implements PurchasesUpdatedListener {
    static final String SKU = "tamalitos_pro";

    private final Activity act;
    private final WebView web;
    private final BillingClient client;
    private ProductDetails product;

    Billing(Activity activity, WebView webView) {
        act = activity;
        web = webView;
        client = BillingClient.newBuilder(activity)
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .build();
    }

    private void connect(Runnable then) {
        if (client.isReady()) { then.run(); return; }
        client.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult r) {
                if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) then.run();
                else result(false, null, "Google Play no está disponible en este teléfono", false);
            }
            @Override public void onBillingServiceDisconnected() { /* se reconecta en la siguiente llamada */ }
        });
    }

    /** Precio y título reales desde Play → TM.billing.nativeDetails({price,title}) | null */
    void details() {
        connect(() -> queryProduct(() -> {
            if (product == null) { js("TM.billing.nativeDetails(null)"); return; }
            ProductDetails.OneTimePurchaseOfferDetails o = product.getOneTimePurchaseOfferDetails();
            String price = o != null ? o.getFormattedPrice() : "";
            js("TM.billing.nativeDetails({price:" + JSONObject.quote(price) + ",title:" + JSONObject.quote(product.getTitle()) + "})");
        }));
    }

    private void queryProduct(Runnable then) {
        if (product != null) { then.run(); return; }
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(Collections.singletonList(
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(SKU)
                    .setProductType(BillingClient.ProductType.INAPP)
                    .build()))
            .build();
        client.queryProductDetailsAsync(params, (r, result) -> {
            List<ProductDetails> list = result.getProductDetailsList();
            if (r.getResponseCode() == BillingClient.BillingResponseCode.OK && !list.isEmpty()) product = list.get(0);
            act.runOnUiThread(then);
        });
    }

    /** Abre la hoja de pago de Google Play. */
    void buy() {
        connect(() -> queryProduct(() -> {
            if (product == null) { result(false, null, "El producto Pro aún no está publicado en Google Play", false); return; }
            BillingFlowParams flow = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(
                    BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product).build()))
                .build();
            BillingResult r = client.launchBillingFlow(act, flow);
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) result(false, null, "No se pudo abrir el pago (" + r.getResponseCode() + ")", false);
        }));
    }

    /** Compras previas con la misma cuenta de Google (reinstalación / otro teléfono). */
    void restore(boolean notify) {
        connect(() -> client.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
            (r, purchases) -> {
                if (r.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null && handle(purchases)) return;
                if (notify) result(false, null, "No encontramos una compra con esta cuenta de Google", false);
            }));
    }

    @Override
    public void onPurchasesUpdated(BillingResult r, List<Purchase> purchases) {
        if (r.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
            if (!handle(purchases)) result(false, null, "La compra quedó pendiente; se activará al confirmarse", false);
        } else if (r.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            result(false, null, null, true);
        } else {
            result(false, null, "No se pudo completar la compra (" + r.getResponseCode() + ")", false);
        }
    }

    /** Activa Pro si hay una compra del SKU; la reconoce (acknowledge) si hace falta. */
    private boolean handle(List<Purchase> purchases) {
        for (Purchase p : purchases) {
            if (!p.getProducts().contains(SKU) || p.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
            if (!p.isAcknowledged()) {
                client.acknowledgePurchase(
                    AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build(),
                    br -> { /* si falla, Play reintenta en la siguiente consulta */ });
            }
            String token = p.getPurchaseToken();
            result(true, token.substring(0, Math.min(24, token.length())), null, false);
            return true;
        }
        return false;
    }

    private void result(boolean ok, String token, String error, boolean cancelled) {
        js("TM.billing.nativeResult({ok:" + ok
            + ",token:" + (token == null ? "null" : JSONObject.quote(token))
            + ",error:" + (error == null ? "null" : JSONObject.quote(error))
            + ",cancelled:" + cancelled + "})");
    }

    private void js(String code) {
        act.runOnUiThread(() -> web.evaluateJavascript("window.TM && TM.billing && " + code, null));
    }
}
