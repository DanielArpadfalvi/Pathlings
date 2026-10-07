import {
  type CustomerInfo,
  PRODUCT_CATEGORY,
  PURCHASES_ERROR_CODE,
  Purchases,
  type PurchasesStoreProduct,
} from '@revenuecat/purchases-capacitor';
import {
  ENTITLEMENTS,
  type EntitlementId,
  PRODUCT_IDS,
  type StoreBackend,
  StoreError,
} from './purchases';

/**
 * RevenueCat store backend (T8.1), used on iOS / Android only. Anonymous app user id (no login,
 * no personal data: the store privacy label stays "Data Not Collected"). The public SDK key comes
 * from the build environment; without one the store is reported unavailable.
 */

function active(info: CustomerInfo): EntitlementId[] {
  return ENTITLEMENTS.filter((id) => info.entitlements.active[id] !== undefined);
}

function storeError(e: unknown): StoreError {
  const err = e as { code?: string; userCancelled?: boolean | null; message?: string };
  if (err.userCancelled || err.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
    return new StoreError('cancelled');
  }
  if (err.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return new StoreError('pending');
  if (
    err.code === PURCHASES_ERROR_CODE.NETWORK_ERROR ||
    err.code === PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR
  ) {
    return new StoreError('offline');
  }
  return new StoreError('failed', err.message ?? 'store error');
}

export function createRevenueCatBackend(apiKey: string | undefined): StoreBackend {
  const products = new Map<EntitlementId, PurchasesStoreProduct>();
  const wrap = async <T>(job: () => Promise<T>): Promise<T> => {
    try {
      return await job();
    } catch (e) {
      throw e instanceof StoreError ? e : storeError(e);
    }
  };
  return {
    available: !!apiKey,
    configure: () =>
      wrap(async () => {
        if (!apiKey) throw new StoreError('unavailable');
        await Purchases.configure({ apiKey });
      }),
    prices: () =>
      wrap(async () => {
        const { products: list } = await Purchases.getProducts({
          productIdentifiers: Object.values(PRODUCT_IDS),
          type: PRODUCT_CATEGORY.NON_SUBSCRIPTION,
        });
        const out: Partial<Record<EntitlementId, string>> = {};
        for (const id of ENTITLEMENTS) {
          const p = list.find((x) => x.identifier === PRODUCT_IDS[id]);
          if (p) {
            products.set(id, p);
            out[id] = p.priceString;
          }
        }
        return out;
      }),
    active: () => wrap(async () => active((await Purchases.getCustomerInfo()).customerInfo)),
    buy: (id) =>
      wrap(async () => {
        const product = products.get(id);
        if (!product) throw new StoreError('offline', 'product not loaded');
        const r = await Purchases.purchaseStoreProduct({ product });
        return active(r.customerInfo);
      }),
    restore: () => wrap(async () => active((await Purchases.restorePurchases()).customerInfo)),
  };
}
