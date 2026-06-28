const { execFileSync } = require('node:child_process');
const { withEntitlementsPlist } = require('expo/config-plugins');

const variant = process.env.APP_ENV || 'development';
const name = {
    development: "Happy (dev)",
    preview: "Happy (preview)",
    production: "Happy"
}[variant];
const bundleId = {
    development: "com.slopus.happy.dev",
    preview: "com.slopus.happy.preview",
    production: "com.ex3ndr.happy"
}[variant];
const iosBundleId = process.env.HAPPY_IOS_BUNDLE_ID || bundleId;
const consoleLoggingDefault = {
    development: true,
    preview: true,
    production: false,
}[variant];
const notificationPlugins = variant === 'development'
    ? []
    : [[
        "expo-notifications",
        {
            "enableBackgroundRemoteNotifications": true,
            "icon": "./sources/assets/images/icon-notification.png"
        }
    ]];

function git(args) {
    try {
        return execFileSync('git', args, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim() || undefined;
    } catch {
        return undefined;
    }
}

function loadBuildMetadata() {
    const commitSha =
        process.env.HAPPY_BUILD_COMMIT_SHA ||
        process.env.EAS_BUILD_GIT_COMMIT_HASH ||
        process.env.GITHUB_SHA ||
        git(['rev-parse', 'HEAD']);
    const commitTimestamp =
        process.env.HAPPY_BUILD_COMMIT_TIMESTAMP ||
        (commitSha
            ? git(['show', '-s', '--format=%cI', commitSha])
            : git(['show', '-s', '--format=%cI', 'HEAD']));

    return {
        commitSha,
        commitTimestamp,
    };
}

const buildMetadata = loadBuildMetadata();

function withDevelopmentPersonalTeamEntitlements(config) {
    if (variant !== 'development') {
        return config;
    }

    return withEntitlementsPlist(config, (config) => {
        delete config.modResults['aps-environment'];
        delete config.modResults['com.apple.developer.associated-domains'];
        return config;
    });
}

export default {
    expo: {
        name,
        slug: "happy",
        version: "1.7.0",
        orientation: "default",
        icon: "./sources/assets/images/icon.png",
        scheme: "happy",
        userInterfaceStyle: "automatic",
        ios: {
            supportsTablet: true,
            bundleIdentifier: iosBundleId,
            config: {
                usesNonExemptEncryption: false
            },
            infoPlist: {
                NSLocalNetworkUsageDescription: "Allow $(PRODUCT_NAME) to find and connect to local devices on your network.",
                NSBonjourServices: ["_http._tcp", "_https._tcp"],
                // ATS:
                // - NSAllowsLocalNetworking: lets HTTP fetches reach LAN
                //   addresses (e.g. self-hosted server at 192.168.x.y) without
                //   forcing TLS. Production cloud server is HTTPS, so the
                //   default policy still applies there.
                // - In dev/preview only, allow arbitrary HTTP loads so a
                //   developer pointing the app at their machine doesn't have
                //   to ship a TLS cert just to test attachment uploads.
                NSAppTransportSecurity: variant === 'production'
                    ? { NSAllowsLocalNetworking: true }
                    : { NSAllowsLocalNetworking: true, NSAllowsArbitraryLoads: true }
            },
            ...(variant === 'production' ? { associatedDomains: ["applinks:app.happy.engineering"] } : {})
        },
        android: {
            adaptiveIcon: {
                foregroundImage: "./sources/assets/images/icon-adaptive.png",
                monochromeImage: "./sources/assets/images/icon-monochrome.png",
                backgroundColor: "#18171C"
            },
            permissions: [
                "android.permission.ACCESS_NETWORK_STATE",
                "android.permission.POST_NOTIFICATIONS",
            ],
            blockedPermissions: [
                "android.permission.ACTIVITY_RECOGNITION",
                "android.permission.RECORD_AUDIO",
                // Not using external storage/media access for now — blocks Google Play photo/video permission declaration
                "android.permission.READ_EXTERNAL_STORAGE",
                "android.permission.WRITE_EXTERNAL_STORAGE",
                "android.permission.READ_MEDIA_IMAGES",
                "android.permission.READ_MEDIA_VIDEO",
            ],
            package: bundleId,
            googleServicesFile: "./google-services.json",
            intentFilters: variant === 'production' ? [
                {
                    "action": "VIEW",
                    "autoVerify": true,
                    "data": [
                        {
                            "scheme": "https",
                            "host": "app.happy.engineering",
                            "pathPrefix": "/"
                        }
                    ],
                    "category": ["BROWSABLE", "DEFAULT"]
                }
            ] : []
        },
        web: {
            bundler: "metro",
            output: "single",
            favicon: "./sources/assets/images/favicon.png"
        },
        plugins: [
            require("./plugins/withAndroidApkUpdate.js"),
            require("./plugins/withEinkCompatibility.js"),
            require("./plugins/withAndroidArm64Only.js"),
            [
                "expo-router",
                {
                    root: "./sources/app"
                }
            ],
            "expo-asset",
            "expo-localization",
            "expo-mail-composer",
            "expo-secure-store",
            "expo-web-browser",
            "react-native-vision-camera",
            "@more-tech/react-native-libsodium",
            [
                "expo-location",
                {
                    locationAlwaysAndWhenInUsePermission: "Allow $(PRODUCT_NAME) to improve AI quality by using your location.",
                    locationAlwaysPermission: "Allow $(PRODUCT_NAME) to improve AI quality by using your location.",
                    locationWhenInUsePermission: "Allow $(PRODUCT_NAME) to improve AI quality by using your location."
                }
            ],
            [
                "expo-calendar",
                {
                    "calendarPermission": "Allow $(PRODUCT_NAME) to access your calendar to improve AI quality."
                }
            ],
            [
                "expo-camera",
                {
                    cameraPermission: "Allow $(PRODUCT_NAME) to access your camera to scan QR codes and share photos with AI.",
                    recordAudioAndroid: false,
                }
            ],
            ...notificationPlugins,
            [
                'expo-splash-screen',
                {
                    ios: {
                        backgroundColor: "#F2F2F7",
                        dark: {
                            backgroundColor: "#1C1C1E",
                        }
                    },
                    android: {
                        image: "./sources/assets/images/splash-android-light.png",
                        backgroundColor: "#F5F5F5",
                        dark: {
                            image: "./sources/assets/images/splash-android-dark.png",
                            backgroundColor: "#1e1e1e",
                        }
                    }
                }
            ],
            withDevelopmentPersonalTeamEntitlements
        ],
        experiments: {
            typedRoutes: true
        },
        extra: {
            router: {
                root: "./sources/app"
            },
            eas: {
                projectId: "4558dd3d-cd5a-47cd-bad9-e591a241cc06"
            },
            app: {
                consoleLoggingDefault,
                buildCommitSha: buildMetadata.commitSha,
                buildCommitTimestamp: buildMetadata.commitTimestamp,
            }
        },
        owner: "bulkacorp"
    }
};
