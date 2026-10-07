# Releasing Pathlings

How a version goes from `main` to the App Store and Google Play. Native builds only run in GitHub Actions (the cloud dev container cannot reach `dl.google.com`).

## Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | every push / PR | typecheck, lint, unit tests, level validation, web build, Playwright e2e |
| `android.yml` | push to `main` / `claude/**` | debug APK + (unsigned) release AAB as artifacts |
| `ios.yml` | push to `main` / `claude/**` | simulator build + unsigned device build |
| `release.yml` | tag `v*` or manual | **signed** AAB → Google Play *internal testing* (draft); **signed** archive → App Store Connect (TestFlight). Each signing / upload step runs only when its secrets exist; without them it produces unsigned builds and stays green. |

## Versioning

- The version lives in `package.json` only (`1.0.0`). Android reads it in `android/app/build.gradle`; iOS gets it with `npm run version:sync` (writes `MARKETING_VERSION`; a unit test fails if the two drift).
- Build numbers come from CI: `VERSION_CODE` (Android) and `CURRENT_PROJECT_VERSION` (iOS) = the workflow run number, so every upload is unique.
- `SIM_VERSION` (`src/core/version.ts`) is a different thing: bump it only when simulation results change (see CLAUDE.md).

## Cutting a release

1. `main` is green on `ci.yml`, `android.yml` and `ios.yml`.
2. Bump `version` in `package.json`, run `npm run version:sync`, update store texts / screenshots if needed (`npm run build && npm run store:frames`), commit.
3. Tag and push: `git tag v1.0.0 && git push origin v1.0.0`.
4. `release.yml` uploads:
   - Android: a draft release on the **internal testing** track → promote in Play Console (internal → closed → production).
   - iOS: a build in **TestFlight** → attach it to the App Store version in App Store Connect and submit for review.
5. After approval: release manually (both consoles), then update `docs/HANDOFF.md`.

## Secrets and variables (owner)

Repository → Settings → Secrets and variables → Actions.

| Name | Kind | What |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | secret | upload keystore (`base64 -w0 upload.jks`) – keep the original file and passwords somewhere safe; Play App Signing holds the real app signing key |
| `ANDROID_KEYSTORE_PASSWORD` | secret | keystore password |
| `ANDROID_KEY_ALIAS` | secret | key alias |
| `ANDROID_KEY_PASSWORD` | secret | key password |
| `PLAY_SERVICE_ACCOUNT_JSON` | secret | Google Cloud service account JSON with the "Release manager" role in Play Console |
| `ASC_KEY_ID` | secret | App Store Connect API key id (Users and Access → Integrations → Keys, role *App Manager*) |
| `ASC_ISSUER_ID` | secret | issuer id shown on the same page |
| `ASC_KEY_P8_BASE64` | secret | the `.p8` file, base64 |
| `APPLE_TEAM_ID` | secret | 10-character team id (Membership details) |
| `REVENUECAT_IOS_KEY` | variable | RevenueCat public **Apple** SDK key (`appl_…`) – public, not a secret |
| `REVENUECAT_ANDROID_KEY` | variable | RevenueCat public **Google** SDK key (`goog_…`) |

Without the RevenueCat keys the app builds fine but shows purchases as unavailable ("available in the app"), so set them before the first store upload.

Create the upload keystore once:

```sh
keytool -genkeypair -v -keystore upload.jks -alias pathlings -keyalg RSA -keysize 4096 -validity 10000
```

## Checklists

- `docs/APP-STORE-CHECKLIST.md`
- `docs/PLAY-STORE-CHECKLIST.md`
- Privacy answers: `docs/store-privacy-answers.md`; store texts: `docs/store/listing.json`; screenshots: `docs/store/screenshots/`.
