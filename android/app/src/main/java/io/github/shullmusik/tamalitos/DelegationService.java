package io.github.shullmusik.tamalitos;

import com.google.androidbrowserhelper.playbilling.digitalgoods.DigitalGoodsRequestHandler;

/**
 * Expone Google Play Billing a la web (Digital Goods API) cuando la app corre como
 * Trusted Web Activity. La página usa window.getDigitalGoodsService(...) y
 * PaymentRequest con el método https://play.google.com/billing (ver js/core/billing.js).
 */
public class DelegationService extends com.google.androidbrowserhelper.trusted.DelegationService {
    @Override
    public void onCreate() {
        super.onCreate();
        registerExtraCommandHandler(new DigitalGoodsRequestHandler(getApplicationContext()));
    }
}
