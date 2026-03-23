/**
 * Expo config plugin that applies Android-specific customizations.
 * These survive `expo prebuild --clean` since they're applied during generation.
 *
 * Handles:
 * - Release signing config (keystore from env vars, gracefully skipped if not set)
 * - Network security config (cleartext for local networks only)
 * - Gradle properties (R8 minification, architecture filter)
 * - POST_NOTIFICATIONS permission
 * - Location foreground service declaration
 * - versionCode from env var
 * - FOSS compliance (no dependency metadata, no GMS manifest entries)
 * - Reproducible build settings (no PNG crunching)
 */
const {
  withAndroidManifest,
  withAppBuildGradle,
  withGradleProperties,
  withDangerousMod,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Fix release signing config in build.gradle.
 * Uses env vars when available, falls back to debug keystore for unsigned builds.
 * F-Droid builds work without setting any env vars — the release buildType
 * simply uses the debug keystore, producing an unsigned-equivalent APK.
 */
function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    // Add release signing config inside existing signingConfigs block
    if (!contents.includes("signingConfigs.release")) {
      // Add release entry after debug entry in signingConfigs
      contents = contents.replace(
        /(signingConfigs\s*\{[\s\S]*?debug\s*\{[\s\S]*?\})([\s\S]*?\})/m,
        `$1
        release {
            storeFile file(System.getenv("RELEASE_KEYSTORE_PATH") ?: "debug.keystore")
            storePassword System.getenv("RELEASE_KEYSTORE_PASSWORD") ?: "android"
            keyAlias System.getenv("RELEASE_KEY_ALIAS") ?: "androiddebugkey"
            keyPassword System.getenv("RELEASE_KEY_PASSWORD") ?: "android"
        }
    }`
      );

      // Point release buildType to release signing config
      contents = contents.replace(
        /(release\s*\{[^}]*?)signingConfig\s+signingConfigs\.debug/,
        "$1signingConfig signingConfigs.release"
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });
}

/**
 * Set versionCode from VERSION_CODE env var (CI sets this from the tag).
 * Also disables dependency metadata block and PNG crunching for FOSS/reproducibility.
 */
function withVersionCode(config) {
  return withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    // Replace static versionCode with env-var-based one for CI
    contents = contents.replace(
      /versionCode\s+\d+/,
      `versionCode Integer.parseInt(System.getenv("VERSION_CODE") ?: "${config.android?.versionCode || 1}")`
    );

    // Disable dependency metadata (IzzyOnDroid/F-Droid requirement)
    // This blob is encrypted with a Google public key and cannot be verified by anyone else.
    // Insert inside the android.defaultConfig block (safe position for all Gradle versions)
    if (!contents.includes("dependenciesInfo")) {
      contents = contents.replace(
        /(buildTypes\s*\{)/,
        `dependenciesInfo {\n        includeInApk = false\n        includeInBundle = false\n    }\n    $1`
      );
    }

    // Disable PNG crunching — it's non-deterministic and breaks reproducible builds
    contents = contents.replace(
      /crunchPngs\s+enablePngCrunchInRelease\.toBoolean\(\)/,
      "crunchPngs false"
    );

    // Note: We do NOT use configurations.all { exclude group: 'com.google.android.gms' }
    // because blanket exclusion causes runtime ClassNotFoundException crashes.
    // Instead, the expo-location patch removes the only direct GMS dependency (play-services-location)
    // from expo-location's build.gradle. No other library in our dependency tree pulls in GMS,
    // so no GMS bytecode ends up in the APK.

    mod.modResults.contents = contents;
    return mod;
  });
}

/**
 * Add POST_NOTIFICATIONS permission and location foreground service to AndroidManifest
 */
function withLocationForegroundService(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;

    // Add POST_NOTIFICATIONS permission if missing
    const permissions = manifest["uses-permission"] || [];
    const hasPostNotif = permissions.some(
      (p) =>
        p.$?.["android:name"] === "android.permission.POST_NOTIFICATIONS"
    );
    if (!hasPostNotif) {
      permissions.push({
        $: { "android:name": "android.permission.POST_NOTIFICATIONS" },
      });
    }
    manifest["uses-permission"] = permissions;

    // Add foreground service for location if missing
    const app = manifest.application?.[0];
    if (app) {
      if (!app.service) app.service = [];

      // Remove GMS ModuleDependencies service injected by expo-image-picker (FOSS compliance)
      // Izzy's scanner flags /com/google/android/gms as NonFreeComp
      app.service = app.service.filter(
        (s) => s.$?.["android:name"] !== "com.google.android.gms.metadata.ModuleDependencies"
      );
      // Also add explicit removal via tools:node="remove" for manifest merger
      app.service.push({
        $: {
          "android:name": "com.google.android.gms.metadata.ModuleDependencies",
          "tools:node": "remove",
        },
      });

      const hasLocationService = app.service.some(
        (s) =>
          s.$?.["android:foregroundServiceType"] === "location"
      );

      if (!hasLocationService) {
        app.service.push({
          $: {
            "android:name":
              "expo.modules.location.services.LocationTaskService",
            "android:foregroundServiceType": "location",
            "android:exported": "false",
          },
        });
      }
    }

    return mod;
  });
}

/**
 * Add network security config XML and reference it in AndroidManifest
 */
function withNetworkSecurityConfig(config) {
  config = withDangerousMod(config, [
    "android",
    async (mod) => {
      const xmlDir = path.join(
        mod.modRequest.platformProjectRoot,
        "app/src/main/res/xml"
      );
      fs.mkdirSync(xmlDir, { recursive: true });

      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="true">localhost</domain>
    <domain includeSubdomains="true">10.0.0.0</domain>
    <domain includeSubdomains="true">172.16.0.0</domain>
    <domain includeSubdomains="true">192.168.0.0</domain>
  </domain-config>
</network-security-config>`;

      fs.writeFileSync(
        path.join(xmlDir, "network_security_config.xml"),
        xmlContent
      );
      return mod;
    },
  ]);

  config = withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application?.[0];
    if (app) {
      app.$["android:networkSecurityConfig"] =
        "@xml/network_security_config";
    }
    return mod;
  });

  return config;
}


/**
 * Set gradle.properties for R8, architectures, etc.
 */
function withGradleProps(config) {
  return withGradleProperties(config, (mod) => {
    const props = mod.modResults;

    const unusedFonts = [
      "AntDesign.ttf", "Entypo.ttf", "EvilIcons.ttf", "Feather.ttf",
      "FontAwesome.ttf", "FontAwesome5_Brands.ttf", "FontAwesome5_Regular.ttf",
      "FontAwesome5_Solid.ttf", "FontAwesome6_Brands.ttf", "FontAwesome6_Regular.ttf",
      "FontAwesome6_Solid.ttf", "Fontisto.ttf", "Foundation.ttf",
      "MaterialIcons.ttf", "Octicons.ttf", "SimpleLineIcons.ttf", "Zocial.ttf",
    ].map((f) => `**/fonts/${f}`).join(",");

    const overrides = {
      "android.enableMinifyInReleaseBuilds": "true",
      "android.enableShrinkResourcesInReleaseBuilds": "true",
      "android.enablePngCrunchInReleaseBuilds": "false",
      "android.enableBundleCompression": "true",
      "expo.useLegacyPackaging": "true",
      "android.packagingOptions.excludes": unusedFonts,
      reactNativeArchitectures: "arm64-v8a",
    };

    for (const [key, value] of Object.entries(overrides)) {
      const idx = props.findIndex(
        (p) => p.type === "property" && p.key === key
      );
      if (idx >= 0) {
        props[idx] = { type: "property", key, value };
      } else {
        props.push({ type: "property", key, value });
      }
    }

    mod.modResults = props;
    return mod;
  });
}

/**
 * Add proguard rules for FOSS compliance — tell R8 to ignore missing GMS classes.
 * expo-location patch removes the direct dependency, but some third-party libraries
 * may still have compile-time references to GMS classes. R8 needs -dontwarn for those.
 */
function withProguardGmsIgnore(config) {
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const proguardPath = path.join(
        mod.modRequest.platformProjectRoot,
        "app/proguard-rules.pro"
      );

      let content = "";
      if (fs.existsSync(proguardPath)) {
        content = fs.readFileSync(proguardPath, "utf-8");
      }

      const gmsRules = `
# FOSS compliance: expo-location patch removes play-services-location dependency.
# R8 may still see residual references from third-party libraries — ignore them.
-dontwarn com.google.android.gms.**
-dontwarn com.google.firebase.**
-dontwarn com.google.android.play.**`;

      if (!content.includes("-dontwarn com.google.android.gms.**")) {
        content += "\n" + gmsRules + "\n";
        fs.writeFileSync(proguardPath, content);
      }

      return mod;
    },
  ]);
}

/**
 * Main plugin — applies all customizations
 */
module.exports = function withAndroidCustomizations(config) {
  config = withReleaseSigning(config);
  config = withVersionCode(config);
  config = withLocationForegroundService(config);
  config = withNetworkSecurityConfig(config);
  config = withGradleProps(config);
  config = withProguardGmsIgnore(config);
  return config;
};
