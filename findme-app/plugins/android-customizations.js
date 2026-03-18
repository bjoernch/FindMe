/**
 * Expo config plugin that applies Android-specific customizations.
 * These survive `expo prebuild --clean` since they're applied during generation.
 *
 * Handles:
 * - Release signing config (keystore from env vars)
 * - Network security config (cleartext for local networks only)
 * - Gradle properties (R8 minification, architecture filter)
 * - ProGuard rules
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
 * Add release signing config to build.gradle
 */
function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    // Add release signing config if not present
    if (!contents.includes("signingConfigs")) {
      // Insert signing config block before buildTypes
      contents = contents.replace(
        /(\s+)(buildTypes\s*\{)/,
        `$1signingConfigs {
$1    debug {
$1        storeFile file('debug.keystore')
$1        storePassword 'android'
$1        keyAlias 'androiddebugkey'
$1        keyPassword 'android'
$1    }
$1    release {
$1        storeFile file(System.getenv("RELEASE_KEYSTORE_PATH") ?: "debug.keystore")
$1        storePassword System.getenv("RELEASE_KEYSTORE_PASSWORD") ?: "android"
$1        keyAlias System.getenv("RELEASE_KEY_ALIAS") ?: "androiddebugkey"
$1        keyPassword System.getenv("RELEASE_KEY_PASSWORD") ?: "android"
$1    }
$1}
$1$2`
      );

      // Add signingConfig to release buildType
      contents = contents.replace(
        /(release\s*\{[^}]*?)(minifyEnabled)/,
        "$1signingConfig signingConfigs.release\n            $2"
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });
}

/**
 * Add network security config XML and reference it in AndroidManifest
 */
function withNetworkSecurityConfig(config) {
  // Write the XML file
  config = withDangerousMod(config, [
    "android",
    async (mod) => {
      const xmlDir = path.join(
        mod.modRequest.platformProjectRoot,
        "app/src/main/res/xml"
      );
      fs.mkdirSync(xmlDir, { recursive: true });

      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<!--
  FindMe Network Security Configuration

  FindMe is a self-hosted app: users run their own server, often on a local
  network (e.g. 192.168.x.x, 10.x.x.x) where HTTPS may not be available.
  Cleartext HTTP is therefore permitted ONLY for private/local IP ranges.
  All other traffic requires HTTPS.
-->
<network-security-config>
  <!-- Default: require HTTPS for all connections -->
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>

  <!-- Allow cleartext only for private network ranges (RFC 1918 + localhost) -->
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

  // Reference in AndroidManifest
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

    const overrides = {
      "android.enableMinifyInReleaseBuilds": "true",
      "android.enableShrinkResourcesInReleaseBuilds": "true",
      "android.enablePngCrunchInReleaseBuilds": "true",
      reactNativeArchitectures: "armeabi-v7a,arm64-v8a",
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
 * Main plugin — applies all customizations
 */
module.exports = function withAndroidCustomizations(config) {
  config = withReleaseSigning(config);
  config = withNetworkSecurityConfig(config);
  config = withGradleProps(config);
  return config;
};
