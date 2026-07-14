import { describe, expect, it } from 'vitest';

const {
    bridgeSource,
    ensureTtsManifest,
    normalizeNarrationText,
    serviceSource,
    splitNarrationText,
} = require('../../plugins/withAndroidSystemTts');

describe('withAndroidSystemTts', () => {
    it('registers one default-matchable Android system TTS service and package query', () => {
        const manifest: any = {
            $: { package: 'com.example.happy' },
            application: [{ service: [] }],
        };

        ensureTtsManifest(manifest, 'com.example.happy');
        ensureTtsManifest(manifest, 'com.example.happy');

        expect(manifest.queries).toEqual([{
            intent: [{ action: [{ $: { 'android:name': 'android.intent.action.TTS_SERVICE' } }] }],
        }]);
        expect(manifest.application[0].service).toHaveLength(1);
        expect(manifest.application[0].service[0].$['android:permission'])
            .toBe('android.permission.BIND_TEXT_TO_SPEECH_ENGINE');
        expect(manifest['uses-permission']).toContainEqual({
            $: { 'android:name': 'android.permission.WAKE_LOCK' },
        });
    });

    it('uses the current Happy account only for bounded authenticated Qwen stream playback', () => {
        const source = serviceSource('com.example.happy');

        expect(source).toContain('/v1/machines/');
        expect(source).toContain('/tts/stream');
        expect(source).toContain('Authorization", "Bearer " + credentials.token');
        expect(source).toContain('private fun splitText(text: String)');
        expect(source).toContain('NARRATION_TARGET_FRAGMENT_LENGTH = 24');
        expect(source).toContain('NARRATION_PREFERRED_MAX_LENGTH = 32');
        expect(source).toContain('NARRATION_HARD_MAX_LENGTH = 36');
        expect(source).toContain('NARRATION_MIN_FRAGMENT_LENGTH = 10');
        expect(source).toContain('private fun normalizeNarrationText(text: String)');
        expect(source).toContain('private fun chooseNarrationBoundary(text: String)');
        expect(source).not.toContain('text.length <= 20');
        expect(source).toContain('json.optInt("sequence", -1) != nextSequence++');
        expect(source).not.toContain('callback.error(code); callback.done()');
        expect(source).toContain('activeConnections.toList().forEach { it.disconnect() }');
        expect(source).not.toContain('speech.platform.bing.com');
        expect(source).not.toContain('OfflineTts');
        expect(source).not.toContain('setEdgeVoice');
    });

    it('filters invisible, private-use, emoji, and decorative characters before synthesis', () => {
        expect(normalizeNarrationText('\u200B　第一章★★★\uE000\n\n他回来了！！！🙂🙂　'))
            .toBe('第一章\n他回来了!');
        expect(normalizeNarrationText('“你好……世界。”')).toBe('“你好……世界。”');
        expect(normalizeNarrationText('\u200B★★🙂\uE000')).toBe('');
        expect(normalizeNarrationText('❤️')).toBe('');
        expect(normalizeNarrationText('第★一章，他🙂回来了')).toBe('第一章,他回来了');

        const source = serviceSource('com.example.happy');
        expect(source).toContain('import java.text.Normalizer');
        expect(source).toContain('val text = normalizeNarrationText(rawText)');
        expect(source).toContain('Character.FORMAT');
        expect(source).toContain('Character.PRIVATE_USE');
        expect(source).toContain('Character.OTHER_SYMBOL');
    });

    it('keeps natural Chinese clauses together and avoids tiny or punctuation-leading fragments', () => {
        expect(splitNarrationText('别走！她猛地站起来，声音微微发颤，像是还有许多话没有说完。'))
            .toEqual(['别走！她猛地站起来，声音微微发颤，像是还有许多话没有说完。']);
        expect(splitNarrationText('雨停之后，长街尽头的灯一盏接一盏亮了起来，照见石板路上缓慢流动的水光。'))
            .toEqual(['雨停之后，长街尽头的灯一盏接一盏亮了起来，照见石板路上缓慢流动的水光。']);
        expect(splitNarrationText('他想了想，终于还是没有把那个藏了很多年的秘密告诉她，因为此刻并不是最好的时机。'))
            .toEqual(['他想了想，终于还是没有把那个藏了很多年的秘密告诉她，', '因为此刻并不是最好的时机。']);
        expect(splitNarrationText('甲'.repeat(39)).map((piece: string) => piece.length)).toEqual([29, 10]);

        const pieces = splitNarrationText(
            '他沉默了很久，最后只说：“我不会回去。”她转过身，沿着长街一直走进了深沉的夜色。',
        );
        expect(pieces.every((piece: string) => piece.length <= 36)).toBe(true);
        expect(pieces.slice(1).every((piece: string) => !/^[，。！？；：、”’」』）》】〕〉]/u.test(piece))).toBe(true);
        expect(pieces.join('')).toBe('他沉默了很久，最后只说：“我不会回去。”她转过身，沿着长街一直走进了深沉的夜色。');
    });

    it('forwards each validated relay chunk to Android before the fragment ends', () => {
        const source = serviceSource('com.example.happy');

        expect(source).toContain('private fun synthesizeStreaming(');
        expect(source).toContain('onAudio(sampleRateHz, bytes)');
        expect(source).toContain('if (!begin(sampleRateHz) || !writeAudio(bytes))');
        expect(source).not.toContain('ByteArrayOutputStream');
        expect(source).not.toContain('Executors.newSingleThreadExecutor()');
    });

    it('keeps each streamed fragment bounded and rejects an incomplete relay', () => {
        const source = serviceSource('com.example.happy');

        expect(source).toContain('streamedBytes + bytes.size > MAX_STREAMED_FRAGMENT_BYTES');
        expect(source).toContain('return started && streamedBytes > 0');
        expect(source).toContain('if (!synthesizeStreaming(');
    });

    it('finishes blank reader utterances without model work or a synthesis error', () => {
        const source = serviceSource('com.example.happy');

        expect(source).toContain('if (text.isEmpty()) {');
        expect(source).toContain('callback.start(24_000, AudioFormat.ENCODING_PCM_16BIT, 1)');
        expect(source).toContain('callback.done()');
        expect(source).not.toContain('if (text.isEmpty() || text.length > 10_000)');
    });

    it('keeps the CPU awake only while Android is awaiting or writing remote PCM', () => {
        const source = serviceSource('com.example.happy');

        expect(source).toContain('import android.os.PowerManager');
        expect(source).toContain('PowerManager.PARTIAL_WAKE_LOCK');
        expect(source).toContain('acquireSynthesisWakeLock()');
        expect(source).toContain('releaseSynthesisWakeLock()');
    });

    it('advertises Mandarin in the locale forms used by MIUI system TTS', () => {
        const source = serviceSource('com.example.happy');

        expect(source).toContain('arrayOf("zh", "CN", "")');
        expect(source).toContain('lang == "cmn"');
    });

    it('records redacted native synthesis milestones for physical device diagnosis', () => {
        const source = serviceSource('com.example.happy');

        expect(source).toContain('Log.i(TTS_LOG_TAG, "synthesize chars=" + rawText.length)');
        expect(source).toContain('Log.i(TTS_LOG_TAG, "normalized chars=" + text.length)');
        expect(source).toContain('Log.i(TTS_LOG_TAG, "stream http=" + responseCode)');
        expect(source).toContain('Log.i(TTS_LOG_TAG, "stream end chunks=" + nextSequence)');
        expect(source).not.toContain('"synthesize text=" + text');
    });

    it('tests the selected Mac by audibly exercising the registered Happy system TTS engine', () => {
        const source = bridgeSource('com.example.happy');

        expect(source).toContain('@ReactMethod fun testRemoteTts(promise: Promise)');
        expect(source).toContain('TextToSpeech(reactContext');
        expect(source).toContain('reactContext.packageName');
        expect(source).toContain('UtteranceProgressListener');
        expect(source).toContain('tts?.speak("这是 Happy 系统朗读测试。"');
        expect(source).toContain('override fun onDone(utteranceId: String?)');
        expect(source).toContain('TTS_TEST_TIMEOUT');
        expect(source).not.toContain('fun testRemoteTts(token: String');
    });
});
