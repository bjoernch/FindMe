/**
 * Expo config plugin that applies Android-specific customizations.
 * These survive `expo prebuild --clean` since they're applied during generation.
 *
 * Handles:
 * - Release signing config (keystore from env vars)
 * - Network security config (cleartext for local networks only)
 * - Gradle properties (R8 minification, architecture filter)
 * - POST_NOTIFICATIONS permission
 * - Location foreground service declaration
 * - versionCode from env var
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
 * Expo's default template already has a signingConfigs block with only debug.
 * We add a release config and point the release buildType to it.
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
 * Also disables dependency metadata and excludes all GMS/Firebase for FOSS compliance.
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
    if (!contents.includes("dependenciesInfo")) {
      contents = contents.replace(
        /(android\s*\{)/,
        `$1
    dependenciesInfo {
        includeInApk = false
        includeInBundle = false
    }`
      );
    }

    // Exclude all Google Play Services / GMS / Firebase dependencies globally (FOSS compliance)
    // This prevents any transitive dependency from pulling in proprietary Google libraries
    if (!contents.includes("exclude group: 'com.google.android.gms'")) {
      contents = contents.replace(
        /^(dependencies\s*\{)/m,
        `// Exclude all Google Play Services / GMS dependencies globally (FOSS compliance)
configurations.all {
    exclude group: 'com.google.android.gms'
    exclude group: 'com.google.firebase'
    exclude group: 'com.google.android.play'
}

$1`
      );
    }

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
      "android.enablePngCrunchInReleaseBuilds": "true",
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
 * GMS JARs are excluded via Gradle configurations.all { exclude }, but R8 needs
 * -dontwarn to not fail on residual references from third-party libraries.
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
# FOSS compliance: GMS is excluded via Gradle configurations.all { exclude }.
# Tell R8 to ignore any residual references to GMS classes.
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
 * Patch the React Native Gradle plugin to pin react_native_dev_server_ip to localhost.
 * Without this, the plugin calls getHostIpAddress() which returns a machine-specific IP,
 * making builds non-reproducible across different environments.
 * See: https://github.com/nicclaj/nicclaj.github.io/blob/main/_posts/2024-12-10-reproducible-apks-with-react-native.md
 */
function withReproducibleDevServerIp(config) {
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const ktFile = path.join(
        mod.modRequest.projectRoot,
        "node_modules/@react-native/gradle-plugin/react-native-gradle-plugin/src/main/kotlin/com/facebook/react/utils/AgpConfiguratorUtils.kt"
      );

      if (fs.existsSync(ktFile)) {
        let content = fs.readFileSync(ktFile, "utf-8");

        // Replace getHostIpAddress() call with static "localhost"
        // Original: resValue(type = "string", name = "ReactNativeDevServerIP", value = getHostIpAddress())
        if (content.includes("getHostIpAddress()")) {
          content = content.replace(
            /value\s*=\s*getHostIpAddress\(\)/g,
            'value = "localhost"'
          );
          fs.writeFileSync(ktFile, content);
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
  // Note: withReproducibleDevServerIp disabled for now — patching RN Gradle plugin
  // Kotlin source at build time causes runtime crashes. Will revisit when RN 0.85
  // includes the upstream fix (facebook/react-native#47loading).
  return config;
};
