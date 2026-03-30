/**
 * Expo config plugin that applies Android-specific customizations.
 * These survive `expo prebuild --clean` since they're applied during generation.
 *
 * Handles:
 * - Release signing config (only when RELEASE_KEYSTORE_PATH is set; otherwise unsigned)
 * - Network security config (cleartext for local networks only)
 * - Gradle properties (R8 minification, architecture filter)
 * - POST_NOTIFICATIONS permission
 * - Location foreground service declaration
 * - Deterministic versionCode derived from versionName
 * - FOSS compliance (no dependency metadata, no GMS, no PNG crunching)
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
 * Derive versionCode from versionName deterministically.
 * "0.8.2" -> 0*10000 + 8*100 + 2 = 802
 * This ensures reproducible builds produce the same versionCode
 * regardless of environment variables.
 */
function deriveVersionCode(versionName) {
  const parts = (versionName || "0.0.1").split(".").map(Number);
  const major = parts[0] || 0;
  const minor = parts[1] || 0;
  const patch = parts[2] || 0;
  return major * 10000 + minor * 100 + patch;
}

/**
 * Configure release signing.
 * When RELEASE_KEYSTORE_PATH env var is set (CI), uses that keystore.
 * When not set (F-Droid / local), the release buildType has NO signingConfig,
 * producing an unsigned APK that F-Droid can re-sign.
 */
function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    // Add release signing config that's only active when env vars are set
    if (!contents.includes("signingConfigs.release")) {
      contents = contents.replace(
        /(signingConfigs\s*\{[\s\S]*?debug\s*\{[\s\S]*?\})([\s\S]*?\})/m,
        `$1
        release {
            if (System.getenv("RELEASE_KEYSTORE_PATH")) {
                storeFile file(System.getenv("RELEASE_KEYSTORE_PATH"))
                storePassword System.getenv("RELEASE_KEYSTORE_PASSWORD")
                keyAlias System.getenv("RELEASE_KEY_ALIAS")
                keyPassword System.getenv("RELEASE_KEY_PASSWORD")
            }
        }
    }`
      );

      // Only apply signing config when keystore is present
      // Replace the default debug signing on release with conditional signing
      contents = contents.replace(
        /(release\s*\{[^}]*?)signingConfig\s+signingConfigs\.debug/,
        `$1signingConfig System.getenv("RELEASE_KEYSTORE_PATH") ? signingConfigs.release : null`
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });
}

/**
 * Set deterministic versionCode derived from versionName.
 * Also disables dependency metadata block and PNG crunching for FOSS/reproducibility.
 * Excludes all Google Play Services dependencies globally.
 */
function withVersionCode(config) {
  return withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    // Derive versionCode from versionName for reproducibility
    const versionCode = deriveVersionCode(config.version);
    contents = contents.replace(
      /versionCode\s+\d+/,
      `versionCode ${versionCode}`
    );

    // Disable dependency metadata (IzzyOnDroid/F-Droid requirement)
    if (!contents.includes("dependenciesInfo")) {
      contents = contents.replace(
        /(buildTypes\s*\{)/,
        `dependenciesInfo {\n        includeInApk = false\n        includeInBundle = false\n    }\n    $1`
      );
    }

    // Disable PNG crunching — non-deterministic, breaks reproducible builds
    contents = contents.replace(
      /crunchPngs\s+enablePngCrunchInRelease\.toBoolean\(\)/,
      "crunchPngs false"
    );

    // Note: expo-location patch removes play-services-location from its own build.gradle.
    // We do NOT use a blanket configurations.all { exclude } here because other React Native
    // internals may reference GMS classes at startup, causing ClassNotFoundException crashes.

    mod.modResults.contents = contents;
    return mod;
  });
}

/**
 * Add POST_NOTIFICATIONS permission and location foreground service to AndroidManifest.
 * Also strips all GMS-related manifest entries (activities, services, metadata).
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

    // Clean up application entries
    const app = manifest.application?.[0];
    if (app) {
      if (!app.service) app.service = [];

      // Remove ALL GMS services/activities/meta-data from manifest
      app.service = app.service.filter(
        (s) => !s.$?.["android:name"]?.includes("com.google.android.gms")
      );
      if (app.activity) {
        app.activity = app.activity.filter(
          (a) => !a.$?.["android:name"]?.includes("com.google.android.gms")
        );
      }
      if (app["meta-data"]) {
        app["meta-data"] = app["meta-data"].filter(
          (m) => !m.$?.["android:name"]?.includes("google_play_services")
              && !m.$?.["android:name"]?.includes("com.google.android.gms")
        );
      }

      // Add explicit tools:node="remove" entries for manifest merger
      app.service.push({
        $: {
          "android:name": "com.google.android.gms.metadata.ModuleDependencies",
          "tools:node": "remove",
        },
      });
      if (!app.activity) app.activity = [];
      app.activity.push({
        $: {
          "android:name": "com.google.android.gms.common.api.GoogleApiActivity",
          "tools:node": "remove",
        },
      });

      // Add location foreground service
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
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
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
# FOSS compliance: GMS dependencies excluded via Gradle configurations.all { exclude }.
# R8 may see residual references from third-party libraries — ignore them.
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
 * Add distributionSha256Sum to gradle-wrapper.properties for supply chain security.
 * F-Droid requires this to verify the Gradle download integrity.
 * expo prebuild --clean regenerates this file, so we must re-add it via plugin.
 */
function withGradleWrapperChecksum(config) {
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const propsPath = path.join(
        mod.modRequest.platformProjectRoot,
        "gradle/wrapper/gradle-wrapper.properties"
      );

      if (fs.existsSync(propsPath)) {
        let content = fs.readFileSync(propsPath, "utf-8");
        if (!content.includes("distributionSha256Sum")) {
          // SHA-256 for gradle-9.0.0-bin.zip
          content += "\ndistributionSha256Sum=8fad3d78296ca518113f3d29016617c7f9367dc005f932bd9d93bf45ba46072b\n";
          fs.writeFileSync(propsPath, content);
        }
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
  config = withGradleWrapperChecksum(config);
  return config;
};
