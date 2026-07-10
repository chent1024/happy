const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

function packageToPath(packageName) {
    return packageName.split('.').join(path.sep);
}

function writeFileIfChanged(filePath, contents) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath) || fs.readFileSync(filePath, 'utf8') !== contents) {
        fs.writeFileSync(filePath, contents);
    }
}

function patchMainApplication(filePath) {
    let contents = fs.readFileSync(filePath, 'utf8');
    if (contents.includes('HappySystemBarPackage()')) {
        return;
    }

    const marker = 'add(HappyApkUpdatePackage())';
    contents = contents.includes(marker)
        ? contents.replace(marker, `${marker}\n          add(HappySystemBarPackage())`)
        : contents.replace(
            'PackageList(this).packages.apply {',
            'PackageList(this).packages.apply {\n          add(HappySystemBarPackage())'
        );
    fs.writeFileSync(filePath, contents);
}

function packageSource(packageName) {
    return `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class HappySystemBarPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(HappySystemBarModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
`;
}

function moduleSource(packageName) {
    return `package ${packageName}

import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class HappySystemBarModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "HappySystemBar"

  @ReactMethod
  fun setDarkIcons(enabled: Boolean) {
    val activity = reactContext.currentActivity ?: return
    activity.runOnUiThread {
      val window = activity.window
      WindowInsetsControllerCompat(window, window.decorView).isAppearanceLightStatusBars = enabled
      try {
        val windowClass = window.javaClass
        val darkModeFlag = windowClass.getField("EXTRA_FLAG_STATUS_BAR_DARK_MODE").getInt(null)
        val setExtraFlags = windowClass.getMethod("setExtraFlags", Int::class.javaPrimitiveType!!, Int::class.javaPrimitiveType!!)
        setExtraFlags.invoke(window, if (enabled) darkModeFlag else 0, darkModeFlag)
      } catch (_: Exception) {
        // Standard Android appearance flags above remain the fallback on non-MIUI devices.
      }
    }
  }
}
`;
}

module.exports = function withAndroidSystemBarAppearance(config) {
    return withDangerousMod(config, ['android', async (config) => {
        const packageName = config.android?.package;
        if (!packageName) {
            throw new Error('withAndroidSystemBarAppearance requires android.package');
        }

        const sourceRoot = path.join(
            config.modRequest.platformProjectRoot,
            'app/src/main/java',
            packageToPath(packageName)
        );
        writeFileIfChanged(path.join(sourceRoot, 'HappySystemBarPackage.kt'), packageSource(packageName));
        writeFileIfChanged(path.join(sourceRoot, 'HappySystemBarModule.kt'), moduleSource(packageName));
        patchMainApplication(path.join(sourceRoot, 'MainApplication.kt'));
        return config;
    }]);
};
