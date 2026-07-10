const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

function packageToPath(packageName) {
    return packageName.split('.').join(path.sep);
}

function patchMainActivity(filePath) {
    let contents = fs.readFileSync(filePath, 'utf8');
    const importLine = 'import androidx.core.view.WindowInsetsControllerCompat';
    const methodMarker = '  private fun applyLightStatusBarIcons() {';

    if (!contents.includes(importLine)) {
        contents = contents.replace(
            'import android.os.Bundle',
            `import android.os.Bundle\n${importLine}`
        );
    }

    if (!contents.includes(methodMarker)) {
        const method = `\n  private fun applyLightStatusBarIcons() {\n    WindowInsetsControllerCompat(window, window.decorView).isAppearanceLightStatusBars = true\n  }\n`;
        contents = contents.replace(
            '  /**\n   * Returns the name of the main component registered from JavaScript.',
            `${method}\n  /**\n   * Returns the name of the main component registered from JavaScript.`
        );
    }

    if (!contents.includes('applyLightStatusBarIcons()\n  }\n\n  override fun onWindowFocusChanged')) {
        contents = contents.replace(
            '  /**\n   * Returns the name of the main component registered from JavaScript.',
            `  override fun onWindowFocusChanged(hasFocus: Boolean) {\n    super.onWindowFocusChanged(hasFocus)\n    if (hasFocus) {\n      applyLightStatusBarIcons()\n    }\n  }\n\n  /**\n   * Returns the name of the main component registered from JavaScript.`
        );
    }

    fs.writeFileSync(filePath, contents);
}

module.exports = function withAndroidLightStatusBar(config) {
    return withDangerousMod(config, [
        'android',
        async (config) => {
            const packageName = config.android?.package;
            if (!packageName) {
                throw new Error('withAndroidLightStatusBar requires android.package');
            }

            const androidRoot = config.modRequest.platformProjectRoot;
            const mainActivity = path.join(
                androidRoot,
                'app/src/main/java',
                packageToPath(packageName),
                'MainActivity.kt'
            );
            patchMainActivity(mainActivity);
            return config;
        },
    ]);
};
