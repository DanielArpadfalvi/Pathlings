# Store privacy answers (T9.2)

Answers for App Store Connect (App Privacy, age rating) and Google Play Console (Data safety, content rating). Privacy policy URL: `docs/site/privacy.html` (publish it, e.g. GitHub Pages, and paste the URL into both consoles).

## What the app does with data (facts the answers rest on)

| Area | Fact | Where in the code |
|---|---|---|
| Analytics / crash reporting / ads | None. No such SDK in `package.json`; `tests/unit/dependencyAudit.test.ts` fails if one is added. | – |
| Accounts / login | None. | – |
| Progress, settings, my levels, draft | Stored only on the device (Capacitor Preferences / localStorage). | `src/platform/storage.ts`, `src/platform/capacitor.ts` |
| Level codes | Leave the device only when the player shares them (clipboard / share sheet). Contain the level, title, optional nickname the player typed, solution. | `src/core/code/levelCode.ts` |
| Network | Only RevenueCat (purchase validation), and the stores themselves. | `src/platform/revenuecat.ts` |
| Purchases | RevenueCat gets the store receipt and a random anonymous app user ID (we never call `logIn`, no email/name). | `src/platform/revenuecat.ts` |

## ⚠️ Owner decision: "Data Not Collected" vs. RevenueCat

The plan (`docs/PLAN.md` §2) targets the **"Data Not Collected"** label. Apple and Google count data that a third-party SDK sends off the device, and RevenueCat sends purchase receipts plus an anonymous ID to its servers. RevenueCat's own guidance is to declare **Purchases → Purchase History** (App Functionality, not linked to the user's identity, not used for tracking) and, depending on configuration, **Identifiers → User ID**/Device ID.

Two honest options:

1. **Keep RevenueCat** (recommended for reliability: receipt validation, restore across devices, refunds). Use the declarations in the "with RevenueCat" columns below. The label will read *"Data Not Linked to You: Purchases"* instead of "Data Not Collected".
2. **Keep "Data Not Collected"**: replace the RevenueCat backend with on-device StoreKit 2 / Play Billing validation (only `src/platform/revenuecat.ts` changes; the `Purchases` interface and the game stay the same). Then every answer below is "No".

Until the owner decides, the answers below assume option 1.

## Apple – App Privacy

| Question | With RevenueCat (option 1) | Without (option 2) |
|---|---|---|
| Do you or your third-party partners collect data from this app? | Yes | No |
| Contact info, Health, Financial info, Location, Sensitive info, Contacts, User content, Browsing/Search history, Diagnostics, Usage data, Other | Not collected | Not collected |
| Identifiers | User ID: **not collected** (we never set one). Device ID: not collected (RevenueCat's anonymous ID is app-generated; RevenueCat states it does not read the IDFA unless the app enables it – we do not). | Not collected |
| Purchases → Purchase History | Collected · **App Functionality** · **Not linked** to identity · **Not used for tracking** | Not collected |
| Tracking (ATT) | No tracking, no `NSUserTrackingUsageDescription` | Same |

Other App Store Connect settings:
- In-app purchases `pathlings_full_game` and `pathlings_supporter`: **Non-Consumable**, **Family Sharing ON** for both.
- Export compliance: uses only exempt encryption (`ITSAppUsesNonExemptEncryption = NO` in Info.plist).

## Google Play – Data safety

| Question | With RevenueCat (option 1) | Without (option 2) |
|---|---|---|
| Does your app collect or share any of the required user data types? | Yes | No |
| Financial info → Purchase history | **Collected**, not shared · purpose: App functionality · processed ephemerally: no · required (purchases cannot work without it) | – |
| All other data types | Not collected | Not collected |
| Is all user data encrypted in transit? | Yes (HTTPS) | – |
| Can users request data deletion? | Yes: no account exists; uninstalling deletes local data; RevenueCat data can be deleted on request via the contact link in the privacy policy (owner handles it in the RevenueCat dashboard). | – |
| Ads | No ads | No ads |
| Target audience | All ages; not primarily directed at children (do **not** opt into the Families program unless the owner wants it – it adds SDK requirements) | Same |

## Age rating

Content: cartoon pixel creatures walk, dig and build; when one fails it disappears in a small puff of leaves (falling, water, lava, a trap). No blood, no injuries shown, no weapons, no text chat, no user-generated content shared through the app (codes are shared outside the app by the player), no gambling, no purchases of random items.

| Store | Answer | Expected rating |
|---|---|---|
| Apple – Cartoon or Fantasy Violence | **None** (recommended: creatures vanish in a leaf puff, nothing harmful is depicted). If the owner prefers the cautious answer, choose *Infrequent/Mild* – the rating then rises one step. | 4+ |
| Apple – all other content descriptors | None | |
| Apple – Unrestricted web access / user-generated content / messaging | No / No / No | |
| Apple – In-app purchases | Yes | |
| Google (IARC questionnaire) – Violence | "No" to realistic violence; if asked about cartoon characters being harmed: mild, non-graphic | PEGI 3 / ESRB Everyone / USK 0 |
| Google – Users can interact / share content | No in-app sharing between users (codes leave via the OS share sheet) | |
| Google – Digital purchases | Yes | |

## Dependency audit

`tests/unit/dependencyAudit.test.ts` scans `package.json` and `package-lock.json` for analytics, crash-reporting, advertising and attribution SDKs (Firebase, Crashlytics, Sentry, Bugsnag, AdMob, AppLovin, Unity Ads, Amplitude, Mixpanel, Segment, AppsFlyer, Adjust, Branch, Facebook SDK, …) and fails the build if one appears. Current runtime dependencies: Capacitor core + official plugins (app, clipboard, haptics, preferences, share, splash-screen, status-bar), RevenueCat, PixiJS, Preact, fflate.
