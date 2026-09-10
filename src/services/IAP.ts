import type { ProductId } from '../core/types';

export interface StoreProduct {
  id: ProductId;
  /** localized price string, e.g. "1,99 €" */
  price: string;
  title: string;
}

export type PurchaseResult = { ok: true; product: ProductId } | { ok: false; reason: 'cancelled' | 'error' | 'unavailable'; message?: string };

export interface IAPService {
  init(): Promise<void>;
  products(): StoreProduct[];
  purchase(id: ProductId): Promise<PurchaseResult>;
  restore(): Promise<ProductId[]>;
  readonly available: boolean;
}

/** App Store product identifiers (must match App Store Connect / RevenueCat). */
export const PRODUCT_IDS: Record<ProductId, string> = {
  revive_3: 'com.fehmilay.carlane.revive3',
  revive_10: 'com.fehmilay.carlane.revive10',
  coins_s: 'com.fehmilay.carlane.coins.s',
  coins_m: 'com.fehmilay.carlane.coins.m',
  coins_l: 'com.fehmilay.carlane.coins.l',
  coins_xl: 'com.fehmilay.carlane.coins.xl',
  tank_pack: 'com.fehmilay.carlane.tankpack',
  legend_pass: 'com.fehmilay.carlane.legendpass',
  unlock_all: 'com.fehmilay.carlane.unlockall',
};

const FALLBACK_PRICES: Record<ProductId, string> = {
  revive_3: '0,99 €', revive_10: '2,49 €', coins_s: '0,99 €', coins_m: '2,99 €', coins_l: '5,99 €', coins_xl: '11,99 €',
  tank_pack: '4,99 €', legend_pass: '6,99 €', unlock_all: '14,99 €',
};

/** Web / simulator implementation: shows a fake confirmation and always succeeds. */
export class MockIAPService implements IAPService {
  readonly available = true;
  async init(): Promise<void> { /* nothing */ }
  products(): StoreProduct[] { return (Object.keys(PRODUCT_IDS) as ProductId[]).map((id) => ({ id, price: FALLBACK_PRICES[id], title: id })); }
  async purchase(id: ProductId): Promise<PurchaseResult> {
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true, product: id };
  }
  async restore(): Promise<ProductId[]> { return []; }
}

/**
 * iOS implementation via RevenueCat (StoreKit 2). Configure the API key below.
 * Falls back to the mock behaviour if RevenueCat is not configured / not on native.
 */
export class RevenueCatIAPService implements IAPService {
  available = false;
  private list: StoreProduct[] = [];
  private rc: typeof import('@revenuecat/purchases-capacitor') | null = null;
  constructor(private apiKey: string) {}
  async init(): Promise<void> {
    try {
      const cap = await import('@capacitor/core');
      if (!cap.Capacitor.isNativePlatform()) return;
      this.rc = await import('@revenuecat/purchases-capacitor');
      await this.rc.Purchases.configure({ apiKey: this.apiKey });
      const res = await this.rc.Purchases.getProducts({ productIdentifiers: Object.values(PRODUCT_IDS) });
      const byStore = new Map(res.products.map((p) => [p.identifier, p]));
      this.list = (Object.keys(PRODUCT_IDS) as ProductId[]).map((id) => {
        const p = byStore.get(PRODUCT_IDS[id]);
        return { id, price: p?.priceString ?? FALLBACK_PRICES[id], title: p?.title ?? id };
      });
      this.available = true;
    } catch (e) {
      console.warn('[IAP] RevenueCat unavailable', e);
      this.available = false;
    }
  }
  products(): StoreProduct[] {
    return this.list.length ? this.list : (Object.keys(PRODUCT_IDS) as ProductId[]).map((id) => ({ id, price: FALLBACK_PRICES[id], title: id }));
  }
  async purchase(id: ProductId): Promise<PurchaseResult> {
    if (!this.rc || !this.available) return { ok: false, reason: 'unavailable' };
    try {
      const res = await this.rc.Purchases.getProducts({ productIdentifiers: [PRODUCT_IDS[id]] });
      const prod = res.products[0];
      if (!prod) return { ok: false, reason: 'unavailable' };
      await this.rc.Purchases.purchaseStoreProduct({ product: prod });
      return { ok: true, product: id };
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string; userCancelled?: boolean };
      if (err?.userCancelled || String(err?.code) === '1') return { ok: false, reason: 'cancelled' };
      return { ok: false, reason: 'error', message: err?.message };
    }
  }
  async restore(): Promise<ProductId[]> {
    if (!this.rc || !this.available) return [];
    try {
      const info = await this.rc.Purchases.restorePurchases();
      const owned = new Set(info.customerInfo.allPurchasedProductIdentifiers);
      return (Object.keys(PRODUCT_IDS) as ProductId[]).filter((id) => owned.has(PRODUCT_IDS[id]) && !id.startsWith('revive') && !id.startsWith('coins'));
    } catch { return []; }
  }
}

/** Pick the right implementation at boot. */
export async function createIAP(): Promise<IAPService> {
  const key = (import.meta as unknown as { env: Record<string, string | undefined> }).env?.VITE_REVENUECAT_IOS_KEY;
  try {
    const cap = await import('@capacitor/core');
    if (cap.Capacitor.isNativePlatform() && key) return new RevenueCatIAPService(key);
  } catch { /* web */ }
  return new MockIAPService();
}
