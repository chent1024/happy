const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

function packagePath(packageName) {
  return packageName.split('.').join(path.sep);
}

function writeIfChanged(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath) || fs.readFileSync(filePath, 'utf8') !== contents) {
    fs.writeFileSync(filePath, contents);
  }
}

function patchMainApplication(filePath) {
  let contents = fs.readFileSync(filePath, 'utf8');
  if (contents.includes('HappyTtsPackage()')) return;
  const marker = '// add(MyReactNativePackage())';
  contents = contents.includes(marker)
    ? contents.replace(marker, `${marker}\n          add(HappyTtsPackage())`)
    : contents.replace('PackageList(this).packages.apply {', 'PackageList(this).packages.apply {\n          add(HappyTtsPackage())');
  fs.writeFileSync(filePath, contents);
}

const TTS_SERVICE_ACTION = 'android.intent.action.TTS_SERVICE';
const DEFAULT_CATEGORY = 'android.intent.category.DEFAULT';
const NARRATION_MIN_FRAGMENT_LENGTH = 10;
const NARRATION_TARGET_FRAGMENT_LENGTH = 24;
const NARRATION_PREFERRED_MAX_LENGTH = 32;
const NARRATION_HARD_MAX_LENGTH = 36;
const STRONG_NARRATION_BOUNDARIES = new Set(['。', '!', '?', '！', '？', ';', '；', '\n']);
const SOFT_NARRATION_BOUNDARIES = new Set([',', '，', ':', '：', '、']);
const CLOSING_NARRATION_PUNCTUATION = new Set(['”', '’', '」', '』', '》', '）', ')', '】', '〕', '〉']);
const FILTERED_DECORATIVE_PUNCTUATION = new Set(['※', '§', '¶', '¤']);

function isFilteredNarrationCharacter(character) {
  const codePoint = character.codePointAt(0);
  const variationSelector = (codePoint >= 0xFE00 && codePoint <= 0xFE0F)
    || (codePoint >= 0xE0100 && codePoint <= 0xE01EF);
  return variationSelector
    || FILTERED_DECORATIVE_PUNCTUATION.has(character)
    || /[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Cn}\p{So}\p{Sk}\p{Me}]/u.test(character);
}

function normalizeNarrationText(text) {
  const normalized = text.normalize('NFKC').replace(/\r\n?/gu, '\n').replace(/\.{3,}/gu, '……');
  let output = '';
  let pendingSpace = false;
  for (const character of normalized) {
    if (character === '\n') {
      output = output.trimEnd();
      if (output && !output.endsWith('\n')) output += '\n';
      pendingSpace = false;
      continue;
    }
    if (/\s/u.test(character)) {
      pendingSpace = true;
      continue;
    }
    if (isFilteredNarrationCharacter(character)) continue;
    if (pendingSpace && output && !output.endsWith('\n')) output += ' ';
    pendingSpace = false;
    const previous = output.at(-1);
    if ((character === '!' || character === '?' || character === ',' || character === ':' || character === ';')
      && previous === character) continue;
    if ((character === '…' || character === '—')
      && previous === character && output.at(-2) === character) continue;
    output += character;
  }
  return output.trim();
}

function boundaryAfterClosingPunctuation(text, boundaryIndex, limit) {
  let cut = boundaryIndex + 1;
  while (cut < limit && CLOSING_NARRATION_PUNCTUATION.has(text[cut])) cut++;
  return cut;
}

function narrationBoundaryCandidates(text, boundaries) {
  const limit = Math.min(text.length, NARRATION_HARD_MAX_LENGTH);
  const candidates = [];
  for (let index = 0; index < limit; index++) {
    if (!boundaries.has(text[index])) continue;
    const cut = boundaryAfterClosingPunctuation(text, index, limit);
    const tailLength = text.length - cut;
    if (cut < NARRATION_MIN_FRAGMENT_LENGTH) continue;
    if (tailLength > 0
      && tailLength < NARRATION_MIN_FRAGMENT_LENGTH
      && text.length <= NARRATION_HARD_MAX_LENGTH + NARRATION_MIN_FRAGMENT_LENGTH) continue;
    if (!candidates.includes(cut)) candidates.push(cut);
  }
  return candidates;
}

function preferredNarrationBoundary(candidates) {
  return candidates.find((candidate) => candidate >= NARRATION_TARGET_FRAGMENT_LENGTH)
    ?? candidates.at(-1);
}

function chooseNarrationBoundary(text) {
  const strongBoundary = preferredNarrationBoundary(
    narrationBoundaryCandidates(text, STRONG_NARRATION_BOUNDARIES),
  );
  if (strongBoundary != null) return strongBoundary;
  const softBoundary = preferredNarrationBoundary(
    narrationBoundaryCandidates(text, SOFT_NARRATION_BOUNDARIES),
  );
  if (softBoundary != null) return softBoundary;

  let cut = Math.min(NARRATION_PREFERRED_MAX_LENGTH, text.length);
  if (text.length > NARRATION_HARD_MAX_LENGTH
    && text.length - cut < NARRATION_MIN_FRAGMENT_LENGTH) {
    cut = Math.min(NARRATION_HARD_MAX_LENGTH, text.length - NARRATION_MIN_FRAGMENT_LENGTH);
  }
  const limit = Math.min(NARRATION_HARD_MAX_LENGTH, text.length);
  while (cut < limit && (STRONG_NARRATION_BOUNDARIES.has(text[cut])
    || SOFT_NARRATION_BOUNDARIES.has(text[cut])
    || CLOSING_NARRATION_PUNCTUATION.has(text[cut]))) cut++;
  return cut;
}

function splitNarrationText(text) {
  if (text.length <= NARRATION_HARD_MAX_LENGTH) return text ? [text] : [];
  const output = [];
  let remaining = text;
  while (remaining.length > NARRATION_HARD_MAX_LENGTH) {
    const cut = chooseNarrationBoundary(remaining);
    const piece = remaining.slice(0, cut).trim();
    if (piece) output.push(piece);
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) output.push(remaining);
  return output;
}

function hasNamedEntry(entries, name) {
  return entries.some((entry) => entry.$?.['android:name'] === name);
}

function ensureTtsQuery(manifest) {
  const queries = manifest.queries ?? [];
  const hasTtsQuery = queries.some((query) => query.intent?.some((intent) =>
    hasNamedEntry(intent.action ?? [], TTS_SERVICE_ACTION),
  ));
  if (!hasTtsQuery) {
    queries.push({
      intent: [{
        action: [{ $: { 'android:name': TTS_SERVICE_ACTION } }],
      }],
    });
  }
  manifest.queries = queries;
}

function ensureTtsService(application) {
  const services = application.service ?? [];
  let service = services.find((candidate) => candidate.$?.['android:name'] === '.HappyTextToSpeechService');
  if (!service) {
    service = { $: { 'android:name': '.HappyTextToSpeechService' } };
    services.push(service);
  }

  service.$ = {
    ...service.$,
    'android:exported': 'true',
    'android:permission': 'android.permission.BIND_TEXT_TO_SPEECH_ENGINE',
    'android:label': 'Happy',
  };

  const filters = service['intent-filter'] ?? [];
  let ttsFilter = filters.find((filter) => hasNamedEntry(filter.action ?? [], TTS_SERVICE_ACTION));
  if (!ttsFilter) {
    ttsFilter = { action: [{ $: { 'android:name': TTS_SERVICE_ACTION } }] };
    filters.push(ttsFilter);
  }
  const categories = ttsFilter.category ?? [];
  if (!hasNamedEntry(categories, DEFAULT_CATEGORY)) {
    categories.push({ $: { 'android:name': DEFAULT_CATEGORY } });
  }
  ttsFilter.category = categories;
  service['intent-filter'] = filters;

  const metadata = service['meta-data'] ?? [];
  if (!hasNamedEntry(metadata, 'android.speech.tts')) {
    metadata.push({
      $: {
        'android:name': 'android.speech.tts',
        'android:resource': '@xml/happy_tts_engine',
      },
    });
  }
  service['meta-data'] = metadata;
  application.service = services;
}

function ensureTtsManifest(manifest, packageName) {
    const application = manifest.application?.[0];
    if (!packageName || !application) throw new Error('withAndroidSystemTts requires Android package and application');
    const permissions = manifest['uses-permission'] ?? [];
    if (!hasNamedEntry(permissions, 'android.permission.WAKE_LOCK')) {
        permissions.push({ $: { 'android:name': 'android.permission.WAKE_LOCK' } });
    }
    manifest['uses-permission'] = permissions;
    ensureTtsQuery(manifest);
    ensureTtsService(application);
}

function packageSource(packageName) {
  return `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class HappyTtsPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(HappyTtsBridgeModule(reactContext))
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
`;
}

function bridgeSource(packageName) {
  return `package ${packageName}

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.util.Locale
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import org.json.JSONObject

data class HappyTtsCredentials(val endpoint: String, val machineId: String, val token: String)

/** Package-private encrypted storage. Its value is never returned to JS. */
object HappyTtsCredentialStore {
  private const val PREFS = "happy_tts"
  private const val VALUE = "credentials"
  private const val KEY_ALIAS = "happy_tts_credentials_v1"

  fun save(context: Context, endpoint: String, machineId: String, token: String) {
    val json = JSONObject().put("endpoint", endpoint).put("machineId", machineId).put("token", token).toString()
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val payload = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(json.toByteArray(StandardCharsets.UTF_8)), Base64.NO_WRAP)
    prefs(context).edit().putString(VALUE, payload).commit()
  }

  fun load(context: Context): HappyTtsCredentials? {
    return try {
      val parts = prefs(context).getString(VALUE, null)?.split(":", limit = 2) ?: return null
      if (parts.size != 2) return null
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key(), javax.crypto.spec.GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
      val json = JSONObject(String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8))
      HappyTtsCredentials(json.getString("endpoint"), json.getString("machineId"), json.getString("token"))
    } catch (_: Exception) { null }
  }

  fun clear(context: Context) { prefs(context).edit().remove(VALUE).commit() }
  private fun prefs(context: Context): SharedPreferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val existing = store.getKey(KEY_ALIAS, null) as? SecretKey
    if (existing != null) return existing
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    return generator.generateKey()
  }
}

class HappyTtsBridgeModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "HappyTtsBridge"
  @ReactMethod fun configureRemoteTts(endpoint: String, machineId: String, token: String, promise: Promise) {
    try {
      if (!endpoint.startsWith("https://") || machineId.isBlank() || token.isBlank()) throw IllegalArgumentException("A HTTPS Happy server, machine, and existing account are required")
      HappyTtsCredentialStore.save(reactContext, endpoint.removeSuffix("/"), machineId, token)
      promise.resolve(null)
    } catch (error: Exception) { promise.reject("TTS_CONFIGURE_FAILED", error) }
  }
  @ReactMethod fun clearRemoteTts(promise: Promise) {
    try { HappyTtsCredentialStore.clear(reactContext); promise.resolve(null) } catch (error: Exception) { promise.reject("TTS_CLEAR_FAILED", error) }
  }
  @ReactMethod fun testRemoteTts(promise: Promise) {
    if (HappyTtsCredentialStore.load(reactContext) == null) {
      promise.reject("TTS_TEST_NOT_CONFIGURED", "Happy TTS has not been configured")
      return
    }
    val handler = Handler(Looper.getMainLooper())
    val finished = AtomicBoolean(false)
    val utteranceId = "happy-tts-test-" + UUID.randomUUID()
    var tts: TextToSpeech? = null
    lateinit var timeout: Runnable
    fun finish(errorCode: String? = null, message: String? = null) {
      if (!finished.compareAndSet(false, true)) return
      handler.post {
        handler.removeCallbacks(timeout)
        tts?.shutdown()
        if (errorCode == null) promise.resolve(null) else promise.reject(errorCode, message)
      }
    }
    timeout = Runnable { finish("TTS_TEST_TIMEOUT", "Happy system TTS playback timed out") }
    handler.post {
      try {
        tts = TextToSpeech(reactContext, { status ->
          if (status != TextToSpeech.SUCCESS) {
            finish("TTS_TEST_INIT_FAILED", "Happy system TTS could not initialize")
            return@TextToSpeech
          }
          tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = Unit
            override fun onDone(utteranceId: String?) = finish()
            override fun onError(utteranceId: String?) = finish("TTS_TEST_PLAYBACK_FAILED", "Happy system TTS playback failed")
            override fun onError(utteranceId: String?, errorCode: Int) = onError(utteranceId)
          })
          val language = tts?.setLanguage(Locale.SIMPLIFIED_CHINESE) ?: TextToSpeech.LANG_NOT_SUPPORTED
          if (language < TextToSpeech.LANG_AVAILABLE) {
            finish("TTS_TEST_LANGUAGE_UNAVAILABLE", "Happy system TTS Chinese voice is unavailable")
            return@TextToSpeech
          }
          if (tts?.speak("这是 Happy 系统朗读测试。", TextToSpeech.QUEUE_FLUSH, null, utteranceId) != TextToSpeech.SUCCESS) {
            finish("TTS_TEST_START_FAILED", "Happy system TTS playback could not start")
          }
        }, reactContext.packageName)
        handler.postDelayed(timeout, 30_000)
      } catch (error: Exception) {
        finish("TTS_TEST_FAILED", error.message ?: "Happy system TTS test failed")
      }
    }
  }
  @ReactMethod fun refreshToken(token: String, promise: Promise) {
    try {
      val existing = HappyTtsCredentialStore.load(reactContext)
      if (existing != null && token.isNotBlank()) HappyTtsCredentialStore.save(reactContext, existing.endpoint, existing.machineId, token)
      promise.resolve(null)
    } catch (error: Exception) { promise.reject("TTS_TOKEN_REFRESH_FAILED", error) }
  }
}
`;
}

function serviceSource(packageName) {
  return `package ${packageName}

import android.media.AudioFormat
import android.os.PowerManager
import android.speech.tts.SynthesisCallback
import android.speech.tts.SynthesisRequest
import android.speech.tts.TextToSpeech
import android.speech.tts.TextToSpeechService
import android.util.Base64
import android.util.Log
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.text.Normalizer
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicInteger
import org.json.JSONObject

class HappyTextToSpeechService : TextToSpeechService() {
  private companion object {
    const val TTS_LOG_TAG = "HappySystemTts"
    private const val MAX_STREAMED_FRAGMENT_BYTES = 4 * 1024 * 1024
    private const val SYNTHESIS_WAKE_LOCK_TIMEOUT_MS = 95_000L
    private const val NARRATION_MIN_FRAGMENT_LENGTH = ${NARRATION_MIN_FRAGMENT_LENGTH}
    private const val NARRATION_TARGET_FRAGMENT_LENGTH = ${NARRATION_TARGET_FRAGMENT_LENGTH}
    private const val NARRATION_PREFERRED_MAX_LENGTH = ${NARRATION_PREFERRED_MAX_LENGTH}
    private const val NARRATION_HARD_MAX_LENGTH = ${NARRATION_HARD_MAX_LENGTH}
  }
  private val cancellationId = AtomicLong(0)
  private val activeConnections = ConcurrentHashMap.newKeySet<HttpURLConnection>()
  private val activeSynthesisRequests = AtomicInteger(0)
  private val synthesisWakeLock by lazy {
    (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK, "happy:system-tts",
    )
  }

  override fun onGetLanguage(): Array<String> = arrayOf("zh", "CN", "")
  override fun onIsLanguageAvailable(lang: String?, country: String?, variant: String?): Int =
    if (lang == "zho" || lang == "chi" || lang == "zh" || lang == "cmn") TextToSpeech.LANG_COUNTRY_AVAILABLE else TextToSpeech.LANG_NOT_SUPPORTED
  override fun onLoadLanguage(lang: String?, country: String?, variant: String?): Int = onIsLanguageAvailable(lang, country, variant)
  override fun onStop() {
    cancellationId.incrementAndGet()
    activeConnections.toList().forEach { it.disconnect() }
    activeConnections.clear()
  }
  override fun onDestroy() {
    activeSynthesisRequests.set(0)
    releaseSynthesisWakeLock()
    super.onDestroy()
  }

  override fun onSynthesizeText(request: SynthesisRequest, callback: SynthesisCallback) {
    val requestId = cancellationId.incrementAndGet()
    val rawText = request.charSequenceText?.toString()?.trim().orEmpty()
    Log.i(TTS_LOG_TAG, "synthesize chars=" + rawText.length)
    fun cancelled() = cancellationId.get() != requestId
    fun finishError(code: Int) {
      if (!cancelled()) callback.error(code)
    }
    fun finishEmpty() {
      callback.start(24_000, AudioFormat.ENCODING_PCM_16BIT, 1)
      callback.done()
    }
    if (rawText.isEmpty()) {
      finishEmpty()
      return
    }
    if (rawText.length > 10_000) { finishError(TextToSpeech.ERROR_INVALID_REQUEST); return }
    val text = normalizeNarrationText(rawText)
    Log.i(TTS_LOG_TAG, "normalized chars=" + text.length)
    if (text.isEmpty()) {
      finishEmpty()
      return
    }
    val credentials = HappyTtsCredentialStore.load(this)
    if (credentials == null) {
      Log.w(TTS_LOG_TAG, "credentials unavailable")
      finishError(TextToSpeech.ERROR_NOT_INSTALLED_YET); return
    }
    acquireSynthesisWakeLock()
    var started = false
    fun begin(sampleRate: Int): Boolean {
      if (started) return true
      if (callback.start(sampleRate, AudioFormat.ENCODING_PCM_16BIT, 1) != TextToSpeech.SUCCESS) return false
      started = true
      return true
    }
    fun writeAudio(audio: ByteArray): Boolean {
      val maxBufferSize = (callback.maxBufferSize.coerceAtLeast(2) / 2) * 2
      var offset = 0
      while (offset < audio.size && !cancelled()) {
        val size = minOf(maxBufferSize, audio.size - offset)
        val result = callback.audioAvailable(audio, offset, size)
        if (result == TextToSpeech.STOPPED || result == TextToSpeech.ERROR) return false
        offset += size
      }
      return !cancelled()
    }
    try {
      for (piece in splitText(text)) {
        if (!synthesizeStreaming(
            credentials, piece, request.language ?: "zh-CN", request.speechRate / 100f, requestId,
          ) { sampleRateHz, bytes ->
            if (!begin(sampleRateHz) || !writeAudio(bytes)) {
              false
            } else {
              true
            }
          }
        ) {
          throw IllegalStateException("TTS fragment unavailable")
        }
      }
      if (started && !cancelled()) callback.done() else if (!cancelled()) finishError(TextToSpeech.ERROR_SYNTHESIS)
    } catch (_: Exception) {
      Log.w(TTS_LOG_TAG, "synthesize failed")
      if (!cancelled()) finishError(TextToSpeech.ERROR_SYNTHESIS)
    } finally {
      releaseSynthesisWakeLock()
    }
  }

  private fun acquireSynthesisWakeLock() {
    if (activeSynthesisRequests.getAndIncrement() == 0 && !synthesisWakeLock.isHeld) {
      synthesisWakeLock.acquire(SYNTHESIS_WAKE_LOCK_TIMEOUT_MS)
    }
  }

  private fun releaseSynthesisWakeLock() {
    if (activeSynthesisRequests.decrementAndGet() <= 0) {
      activeSynthesisRequests.set(0)
      if (synthesisWakeLock.isHeld) synthesisWakeLock.release()
    }
  }

  private fun synthesizeStreaming(
    credentials: HappyTtsCredentials,
    text: String,
    locale: String,
    rate: Float,
    requestId: Long,
    onAudio: (Int, ByteArray) -> Boolean,
  ): Boolean {
    val connection = (URL(credentials.endpoint + "/v1/machines/" + java.net.URLEncoder.encode(credentials.machineId, "UTF-8") + "/tts/stream").openConnection() as HttpURLConnection)
    setActiveConnection(connection, requestId)
    try {
      connection.requestMethod = "POST"
      connection.connectTimeout = 10_000
      connection.readTimeout = 90_000
      connection.doOutput = true
      connection.setRequestProperty("Authorization", "Bearer " + credentials.token)
      connection.setRequestProperty("Content-Type", "application/json")
      connection.outputStream.use { OutputStreamWriter(it, StandardCharsets.UTF_8).use { writer ->
        writer.write(JSONObject().put("requestId", java.util.UUID.randomUUID().toString()).put("text", text).put("locale", locale).put("rate", rate.coerceIn(0.5f, 2f)).toString())
      } }
      val responseCode = connection.responseCode
      Log.i(TTS_LOG_TAG, "stream http=" + responseCode)
      if (responseCode !in 200..299) return false
      var started = false
      var sampleRateHz = 0
      var nextSequence = 0
      var streamedBytes = 0
      connection.inputStream.bufferedReader().use { reader ->
        while (cancellationId.get() == requestId) {
          val line = reader.readLine() ?: break
          if (line.isBlank()) continue
          val json = JSONObject(line)
          when (json.optString("type")) {
            "start" -> {
              if (started) return false
              sampleRateHz = json.getInt("sampleRateHz")
              if (sampleRateHz !in 8_000..96_000) return false
              started = true
            }
            "chunk" -> {
              val bytes = Base64.decode(json.getString("pcm16leBase64"), Base64.DEFAULT)
              if (!started || json.optInt("sequence", -1) != nextSequence++ || bytes.isEmpty() || bytes.size % 2 != 0 || streamedBytes + bytes.size > MAX_STREAMED_FRAGMENT_BYTES) return false
              if (streamedBytes == 0) Log.i(TTS_LOG_TAG, "stream first audio bytes=" + bytes.size)
              if (!onAudio(sampleRateHz, bytes)) return false
              streamedBytes += bytes.size
            }
            "end" -> {
              Log.i(TTS_LOG_TAG, "stream end chunks=" + nextSequence)
              return started && streamedBytes > 0
            }
            "error" -> {
              Log.w(TTS_LOG_TAG, "stream terminal error")
              return false
            }
            else -> return false
          }
        }
      }
      return false
    } finally { clearActiveConnection(connection) }
  }

  private fun setActiveConnection(connection: HttpURLConnection, requestId: Long) {
    synchronized(this) {
      if (cancellationId.get() != requestId) { connection.disconnect(); throw IllegalStateException("TTS stopped") }
      activeConnections.add(connection)
    }
  }

  private fun clearActiveConnection(connection: HttpURLConnection) {
    activeConnections.remove(connection)
    connection.disconnect()
  }

  private fun isFilteredNarrationCodePoint(codePoint: Int): Boolean {
    val type = Character.getType(codePoint)
    val variationSelector = codePoint in 0xFE00..0xFE0F || codePoint in 0xE0100..0xE01EF
    return variationSelector ||
      codePoint == '※'.code || codePoint == '§'.code || codePoint == '¶'.code || codePoint == '¤'.code ||
      type == Character.CONTROL.toInt() || type == Character.FORMAT.toInt() ||
      type == Character.PRIVATE_USE.toInt() || type == Character.SURROGATE.toInt() ||
      type == Character.UNASSIGNED.toInt() || type == Character.OTHER_SYMBOL.toInt() ||
      type == Character.MODIFIER_SYMBOL.toInt() || type == Character.ENCLOSING_MARK.toInt()
  }

  private fun normalizeNarrationText(text: String): String {
    val normalized = Normalizer.normalize(text, Normalizer.Form.NFKC)
      .replace(Regex("\\\\.{3,}"), "……")
      .replace("\\r\\n", "\\n").replace('\\r', '\\n')
    val output = StringBuilder()
    var index = 0
    var pendingSpace = false
    while (index < normalized.length) {
      val codePoint = normalized.codePointAt(index)
      index += Character.charCount(codePoint)
      if (codePoint == '\\n'.code) {
        while (output.isNotEmpty() && output.last() == ' ') output.deleteCharAt(output.length - 1)
        if (output.isNotEmpty() && output.last() != '\\n') output.append('\\n')
        pendingSpace = false
        continue
      }
      if (Character.isWhitespace(codePoint)) {
        pendingSpace = true
        continue
      }
      if (isFilteredNarrationCodePoint(codePoint)) continue
      if (pendingSpace && output.isNotEmpty() && output.last() != '\\n') output.append(' ')
      pendingSpace = false
      val repeatedPause = output.isNotEmpty() && output.last().code == codePoint &&
        (codePoint == '!'.code || codePoint == '?'.code || codePoint == ','.code || codePoint == ':'.code || codePoint == ';'.code)
      val excessiveLongPause = output.length >= 2 && output.last().code == codePoint && output[output.length - 2].code == codePoint &&
        (codePoint == '…'.code || codePoint == '—'.code)
      if (!repeatedPause && !excessiveLongPause) output.appendCodePoint(codePoint)
    }
    return output.toString().trim()
  }

  private fun isStrongNarrationBoundary(character: Char): Boolean =
    character == '。' || character == '!' || character == '?' || character == '！' ||
      character == '？' || character == ';' || character == '；' || character == '\\n'

  private fun isSoftNarrationBoundary(character: Char): Boolean =
    character == ',' || character == '，' || character == ':' || character == '：' || character == '、'

  private fun isClosingNarrationPunctuation(character: Char): Boolean =
    character == '”' || character == '’' || character == '」' || character == '』' ||
      character == '》' || character == '）' || character == ')' || character == '】' ||
      character == '〕' || character == '〉'

  private fun narrationBoundaryCandidates(text: String, strong: Boolean): List<Int> {
    val limit = minOf(text.length, NARRATION_HARD_MAX_LENGTH)
    val candidates = mutableListOf<Int>()
    for (index in 0 until limit) {
      val boundary = if (strong) isStrongNarrationBoundary(text[index]) else isSoftNarrationBoundary(text[index])
      if (!boundary) continue
      var cut = index + 1
      while (cut < limit && isClosingNarrationPunctuation(text[cut])) cut++
      val tailLength = text.length - cut
      if (cut < NARRATION_MIN_FRAGMENT_LENGTH) continue
      if (tailLength in 1 until NARRATION_MIN_FRAGMENT_LENGTH &&
        text.length <= NARRATION_HARD_MAX_LENGTH + NARRATION_MIN_FRAGMENT_LENGTH) continue
      if (!candidates.contains(cut)) candidates.add(cut)
    }
    return candidates
  }

  private fun preferredNarrationBoundary(candidates: List<Int>): Int? =
    candidates.firstOrNull { it >= NARRATION_TARGET_FRAGMENT_LENGTH } ?: candidates.lastOrNull()

  private fun chooseNarrationBoundary(text: String): Int {
    preferredNarrationBoundary(narrationBoundaryCandidates(text, true))?.let { return it }
    preferredNarrationBoundary(narrationBoundaryCandidates(text, false))?.let { return it }
    var cut = minOf(NARRATION_PREFERRED_MAX_LENGTH, text.length)
    if (text.length > NARRATION_HARD_MAX_LENGTH && text.length - cut < NARRATION_MIN_FRAGMENT_LENGTH) {
      cut = minOf(NARRATION_HARD_MAX_LENGTH, text.length - NARRATION_MIN_FRAGMENT_LENGTH)
    }
    val limit = minOf(NARRATION_HARD_MAX_LENGTH, text.length)
    while (cut < limit && (isStrongNarrationBoundary(text[cut]) ||
        isSoftNarrationBoundary(text[cut]) || isClosingNarrationPunctuation(text[cut]))) cut++
    return cut
  }

  private fun splitText(text: String): List<String> {
    if (text.length <= NARRATION_HARD_MAX_LENGTH) return if (text.isEmpty()) emptyList() else listOf(text)
    val output = mutableListOf<String>()
    var remaining = text
    while (remaining.length > NARRATION_HARD_MAX_LENGTH) {
      val cut = chooseNarrationBoundary(remaining)
      remaining.substring(0, cut).trim().takeIf { it.isNotEmpty() }?.let { output.add(it) }
      remaining = remaining.substring(cut).trimStart()
    }
    if (remaining.isNotEmpty()) output.add(remaining)
    return output
  }
}
`;
}

module.exports = function withAndroidSystemTts(config) {
  config = withAndroidManifest(config, (config) => {
    const packageName = config.android?.package ?? config.modResults.manifest.$?.package;
    ensureTtsManifest(config.modResults.manifest, packageName);
    return config;
  });
  return withDangerousMod(config, ['android', async (config) => {
    const packageName = config.android?.package;
    if (!packageName) throw new Error('withAndroidSystemTts requires android.package');
    const root = config.modRequest.platformProjectRoot;
    const dir = path.join(root, 'app/src/main/java', packagePath(packageName));
    writeIfChanged(path.join(dir, 'HappyTtsPackage.kt'), packageSource(packageName));
    writeIfChanged(path.join(dir, 'HappyTtsBridgeModule.kt'), bridgeSource(packageName));
    writeIfChanged(path.join(dir, 'HappyTextToSpeechService.kt'), serviceSource(packageName));
    writeIfChanged(path.join(root, 'app/src/main/res/xml/happy_tts_engine.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<tts-engine xmlns:android="http://schemas.android.com/apk/res/android" android:settingsActivity="${packageName}.MainActivity" />\n`);
    patchMainApplication(path.join(dir, 'MainApplication.kt'));
    return config;
}]);
};

module.exports.ensureTtsManifest = ensureTtsManifest;
module.exports.normalizeNarrationText = normalizeNarrationText;
module.exports.serviceSource = serviceSource;
module.exports.bridgeSource = bridgeSource;
module.exports.splitNarrationText = splitNarrationText;
