const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const MODULE_NAME = 'HappyApkUpdate';
const STATUS_EVENT = 'HappyApkUpdateStatus';

function ensureUsesPermission(manifest, permissionName) {
    const permissions = manifest.manifest['uses-permission'] ?? [];
    if (!permissions.some((permission) => permission.$?.['android:name'] === permissionName)) {
        permissions.push({ $: { 'android:name': permissionName } });
    }
    manifest.manifest['uses-permission'] = permissions;
}

function ensureProvider(application, packageName) {
    const providers = application.provider ?? [];
    const authority = `${packageName}.apkupdate.fileprovider`;
    const existing = providers.find((provider) => provider.$?.['android:authorities'] === authority);

    if (!existing) {
        providers.push({
            $: {
                'android:name': 'androidx.core.content.FileProvider',
                'android:authorities': authority,
                'android:exported': 'false',
                'android:grantUriPermissions': 'true',
            },
            'meta-data': [
                {
                    $: {
                        'android:name': 'android.support.FILE_PROVIDER_PATHS',
                        'android:resource': '@xml/apk_update_file_paths',
                    },
                },
            ],
        });
    }

    application.provider = providers;
}

function removeExpoUpdatesMetadata(application) {
    application['meta-data'] = (application['meta-data'] ?? []).filter((metadata) => {
        const name = metadata.$?.['android:name'];
        return typeof name !== 'string' || !name.startsWith('expo.modules.updates.');
    });
}

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
    if (contents.includes('HappyApkUpdatePackage()')) {
        return;
    }

    const commentedPackageMarker = '// add(MyReactNativePackage())';
    if (contents.includes(commentedPackageMarker)) {
        contents = contents.replace(
            commentedPackageMarker,
            `${commentedPackageMarker}\n          add(HappyApkUpdatePackage())`
        );
    } else {
        contents = contents.replace(
            'PackageList(this).packages.apply {',
            'PackageList(this).packages.apply {\n          add(HappyApkUpdatePackage())'
        );
    }

    fs.writeFileSync(filePath, contents);
}

function packageSource(packageName) {
    return `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class HappyApkUpdatePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(HappyApkUpdateModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;
}

function moduleSource(packageName) {
    return `package ${packageName}

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors

class HappyApkUpdateModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private val executor = Executors.newSingleThreadExecutor()
  private val downloadManager: DownloadManager
    get() = reactContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

  override fun getName(): String = "${MODULE_NAME}"

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by NativeEventEmitter.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required by NativeEventEmitter.
  }

  @ReactMethod
  fun getInstallPermissionInfo(promise: Promise) {
    val result = Arguments.createMap()
    result.putBoolean("canInstall", canInstallPackages())
    result.putBoolean("requiresSettings", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
    promise.resolve(result)
  }

  @ReactMethod
  fun openInstallPermissionSettings(promise: Promise) {
    try {
      openInstallSettings()
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("OPEN_SETTINGS_FAILED", error)
    }
  }

  @ReactMethod
  fun installApk(apkUrl: String, promise: Promise) {
    if (!canInstallPackages()) {
      emitStatus("permission-required", 0.0, "Allow Happy to install app updates, then tap update again.", null)
      try {
        openInstallSettings()
      } catch (_: Exception) {
      }
      promise.resolve(false)
      return
    }

    try {
      val file = updateFile()
      if (file.exists()) {
        file.delete()
      }

      val request = DownloadManager.Request(Uri.parse(apkUrl))
        .setTitle("Happy update")
        .setDescription("Downloading update package")
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        .setAllowedOverMetered(true)
        .setAllowedOverRoaming(true)
        .setDestinationUri(Uri.fromFile(file))

      val downloadId = downloadManager.enqueue(request)
      emitStatus("queued", 0.0, "Update download started.", null)
      executor.execute {
        pollDownload(downloadId, file)
      }
      promise.resolve(true)
    } catch (error: Exception) {
      emitStatus("error", 0.0, error.message ?: "Failed to start update download.", null)
      promise.reject("APK_DOWNLOAD_FAILED", error)
    }
  }

  private fun pollDownload(downloadId: Long, file: File) {
    val query = DownloadManager.Query().setFilterById(downloadId)

    while (true) {
      downloadManager.query(query)?.use { cursor ->
        if (!cursor.moveToFirst()) {
          emitStatus("error", 0.0, "Update download was not found.", null)
          return
        }

        val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
        val downloaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
        val total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
        val progress = if (total > 0L) downloaded.toDouble() / total.toDouble() else 0.0

        when (status) {
          DownloadManager.STATUS_SUCCESSFUL -> {
            emitStatus("installing", 1.0, "Opening Android installer.", mapOf("downloadedBytes" to downloaded, "totalBytes" to total))
            openInstaller(file)
            return
          }
          DownloadManager.STATUS_FAILED -> {
            val reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
            emitStatus("error", progress, "Update download failed: $reason", mapOf("downloadedBytes" to downloaded, "totalBytes" to total))
            return
          }
          DownloadManager.STATUS_PAUSED -> {
            emitStatus("paused", progress, "Update download paused.", mapOf("downloadedBytes" to downloaded, "totalBytes" to total))
          }
          else -> {
            emitStatus("downloading", progress, "Downloading update package.", mapOf("downloadedBytes" to downloaded, "totalBytes" to total))
          }
        }
      }

      Thread.sleep(1000)
    }
  }

  private fun updateFile(): File {
    val directory = reactContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: reactContext.cacheDir
    return File(directory, "happy-update-${'$'}{UUID.randomUUID()}.apk")
  }

  private fun canInstallPackages(): Boolean {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || reactContext.packageManager.canRequestPackageInstalls()
  }

  private fun openInstallSettings() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
      .setData(Uri.parse("package:${'$'}{reactContext.packageName}"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    reactContext.startActivity(intent)
  }

  private fun openInstaller(file: File) {
    if (!file.exists()) {
      emitStatus("error", 0.0, "Downloaded APK file is missing.", null)
      return
    }

    val uri = FileProvider.getUriForFile(
      reactContext,
      "${'$'}{reactContext.packageName}.apkupdate.fileprovider",
      file
    )
    val intent = Intent(Intent.ACTION_VIEW)
      .setDataAndType(uri, "application/vnd.android.package-archive")
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)

    try {
      reactContext.startActivity(intent)
    } catch (error: Exception) {
      emitStatus("error", 1.0, error.message ?: "Failed to open Android installer.", null)
    }
  }

  private fun emitStatus(status: String, progress: Double, message: String, extra: Map<String, Long>?) {
    val payload: WritableMap = Arguments.createMap()
    payload.putString("status", status)
    payload.putDouble("progress", progress)
    payload.putString("message", message)
    extra?.forEach { (key, value) -> payload.putDouble(key, value.toDouble()) }

    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("${STATUS_EVENT}", payload)
  }
}
`;
}

function filePathsXml() {
    return `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
  <external-files-path name="apk_updates" path="Download/" />
  <cache-path name="cache" path="." />
</paths>
`;
}

module.exports = function withAndroidApkUpdate(config) {
    config = withAndroidManifest(config, (config) => {
        const packageName = config.android?.package ?? config.modResults.manifest.$?.package;
        if (!packageName) {
            throw new Error('withAndroidApkUpdate requires android.package');
        }

        ensureUsesPermission(config.modResults, 'android.permission.REQUEST_INSTALL_PACKAGES');

        const application = config.modResults.manifest.application?.[0];
        if (!application) {
            throw new Error('withAndroidApkUpdate could not find Android application node');
        }
        removeExpoUpdatesMetadata(application);
        ensureProvider(application, packageName);

        return config;
    });

    return withDangerousMod(config, [
        'android',
        async (config) => {
            const packageName = config.android?.package;
            if (!packageName) {
                throw new Error('withAndroidApkUpdate requires android.package');
            }

            const androidRoot = config.modRequest.platformProjectRoot;
            const packageDir = path.join(androidRoot, 'app/src/main/java', packageToPath(packageName));
            writeFileIfChanged(path.join(packageDir, 'HappyApkUpdatePackage.kt'), packageSource(packageName));
            writeFileIfChanged(path.join(packageDir, 'HappyApkUpdateModule.kt'), moduleSource(packageName));
            writeFileIfChanged(path.join(androidRoot, 'app/src/main/res/xml/apk_update_file_paths.xml'), filePathsXml());
            patchMainApplication(path.join(packageDir, 'MainApplication.kt'));

            return config;
        },
    ]);
};
