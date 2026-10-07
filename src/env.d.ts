/** Build-time configuration (public values only; set in CI from repository variables). */
interface ImportMetaEnv {
  /** RevenueCat public SDK key for the App Store build. */
  readonly VITE_REVENUECAT_IOS_KEY?: string;
  /** RevenueCat public SDK key for the Play Store build. */
  readonly VITE_REVENUECAT_ANDROID_KEY?: string;
}
