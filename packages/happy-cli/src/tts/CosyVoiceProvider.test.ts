import { afterEach, describe, expect, it, vi } from 'vitest';
import { CosyVoiceProvider } from './CosyVoiceProvider';

describe('CosyVoiceProvider', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('reports unavailable when no local sidecar URL is configured', async () => {
        await expect(new CosyVoiceProvider().status()).resolves.toEqual({
            available: false,
            provider: 'cosyvoice',
            modelRevision: null,
        });
    });

    it('only accepts loopback sidecars and reports their model readiness truthfully', async () => {
        expect(() => new CosyVoiceProvider('http://192.168.1.2:5000')).toThrow(/loopback/i);
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            data: [{ id: 'mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit' }],
        }), { status: 200 })));

        await expect(new CosyVoiceProvider(
            'http://127.0.0.1:8876',
            'mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit',
        ).status()).resolves.toEqual({
            available: true,
            provider: 'cosyvoice',
            modelRevision: 'mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit',
        });
    });

    it('forwards the first Qwen PCM chunk before the sidecar stream completes', async () => {
        const bodies: string[] = [];
        let finishStream!: () => void;
        const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
            if (typeof init?.body === 'string') bodies.push(init.body);
            return new Response(new ReadableStream({
                start(controller) {
                    controller.enqueue(Uint8Array.from([100, 0]));
                    finishStream = () => {
                        controller.enqueue(Uint8Array.from([101, 0]));
                        controller.close();
                    };
                },
            }), { status: 200, headers: { 'x-happy-sample-rate-hz': '24000' } });
        });
        vi.stubGlobal('fetch', fetchMock);
        const chunks: Buffer[] = [];
        const provider = new CosyVoiceProvider(
            'http://127.0.0.1:8876',
            'mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit',
        );

        const synthesis = provider.synthesizeStream!({
            text: '这是一次完整测试。', locale: 'zh-CN', rate: 1, voiceId: 'Uncle_Fu',
            signal: new AbortController().signal,
            onChunk: ({ pcm16le }) => chunks.push(pcm16le),
        });

        await vi.waitFor(() => expect(chunks).toEqual([Buffer.from([100, 0])]));
        finishStream();
        await synthesis;

        expect(chunks).toEqual([Buffer.from([100, 0]), Buffer.from([101, 0])]);
        expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8876/v1/audio/speech', expect.objectContaining({
            body: expect.stringContaining('"model":"mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit"'),
        }));
        expect(bodies).toHaveLength(1);
        expect(bodies[0]).toContain('"lang_code":"Chinese"');
        expect(bodies[0]).toContain('"temperature":0');
        expect(bodies[0]).toContain('"top_p":1');
        expect(bodies[0]).toContain('"top_k":50');
        expect(bodies[0]).toContain('"repetition_penalty":1.35');
        expect(bodies[0]).toContain('"stream":true');
        expect(bodies[0]).toContain('"streaming_interval":0.4');
    });

    it('cancels the sidecar stream when downstream rejects the first PCM chunk', async () => {
        let cancelled = false;
        vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
            start(controller) {
                controller.enqueue(Uint8Array.from([100, 0]));
            },
            cancel() {
                cancelled = true;
            },
        }), { status: 200 })));
        const provider = new CosyVoiceProvider(
            'http://127.0.0.1:8876',
            'mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit',
        );

        await expect(provider.synthesizeStream!({
            text: '测试。', locale: 'zh-CN', rate: 1, voiceId: 'Dylan',
            signal: new AbortController().signal,
            onChunk: () => { throw new Error('downstream closed'); },
        })).rejects.toThrow('downstream closed');
        expect(cancelled).toBe(true);
    });

    it('keeps the same repetition guard on the manager recovery attempt', async () => {
        let body = '';
        vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
            body = String(init?.body ?? '');
            return new Response(Uint8Array.from([1, 2]), { status: 200 });
        }));
        const provider = new CosyVoiceProvider(
            'http://127.0.0.1:8876',
            'mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit',
        );

        await provider.synthesizeStream!({
            text: '测试。', locale: 'zh-CN', rate: 1, voiceId: 'Eric', attempt: 2,
            signal: new AbortController().signal, onChunk: vi.fn(),
        });

        expect(JSON.parse(body)).toMatchObject({ repetition_penalty: 1.35 });
    });

    it('bounds very short Qwen narration before it can enter a long generation tail', async () => {
        let body = '';
        vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
            body = String(init?.body ?? '');
            return new Response(Uint8Array.from([1, 2]), { status: 200 });
        }));
        const provider = new CosyVoiceProvider(
            'http://127.0.0.1:8876',
            'mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit',
        );

        await provider.synthesizeStream!({
            text: '章节', locale: 'zh-CN', rate: 1, voiceId: 'Uncle_Fu',
            signal: new AbortController().signal, onChunk: vi.fn(),
        });

        expect(JSON.parse(body)).toMatchObject({
            max_tokens: 72,
            repetition_penalty: 1.35,
        });
    });

    it('uses deterministic speaker sampling for adjacent narration sentences', async () => {
        const bodies: Array<Record<string, unknown>> = [];
        vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
            bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
            return new Response(Uint8Array.from([1, 2]), { status: 200 });
        }));
        const provider = new CosyVoiceProvider(
            'http://127.0.0.1:8876',
            'mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit',
        );

        for (const text of ['他抬头看向窗外。', '远处的灯火慢慢亮起。']) {
            await provider.synthesizeStream!({
                text, locale: 'zh-CN', rate: 1, voiceId: 'Uncle_Fu',
                signal: new AbortController().signal, onChunk: vi.fn(),
            });
        }

        expect(bodies).toHaveLength(2);
        expect(bodies).toEqual(bodies.map((body) => expect.objectContaining({
            voice: 'Uncle_Fu',
            temperature: 0,
            repetition_penalty: 1.35,
        })));
    });

    it('does not send style instructions to the 0.6B CustomVoice model that cannot render them', async () => {
        const bodies: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
            if (typeof init?.body === 'string') bodies.push(init.body);
            return new Response(Uint8Array.from([1, 2]), { status: 200 });
        }));
        const provider = new CosyVoiceProvider(
            'http://127.0.0.1:8876',
            'mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit',
            '用成熟、有感情的方式朗读。',
        );

        await provider.synthesizeStream!({
            text: '测试。', locale: 'zh-CN', rate: 1, voiceId: 'Eric',
            signal: new AbortController().signal, onChunk: vi.fn(),
        });

        expect(bodies).toHaveLength(1);
        expect(bodies[0]).not.toContain('"instruct"');
    });

    it('bounds medium narration fragments without falling back to the old 120-token floor', async () => {
        let body = '';
        vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
            body = typeof init?.body === 'string' ? init.body : '';
            return new Response(Uint8Array.from([1, 2]), { status: 200 });
        }));
        const provider = new CosyVoiceProvider(
            'http://127.0.0.1:8876',
            'mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit',
        );

        await provider.synthesizeStream!({
            text: '一二三四五六七', locale: 'zh-CN', rate: 1, voiceId: 'Uncle_Fu',
            signal: new AbortController().signal, onChunk: vi.fn(),
        });

        expect(JSON.parse(body)).toMatchObject({ max_tokens: 96 });
    });

    it('reserves eight acoustic tokens per character for the longest Android fragment', async () => {
        let body = '';
        vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
            body = typeof init?.body === 'string' ? init.body : '';
            return new Response(Uint8Array.from([1, 2]), { status: 200 });
        }));
        const provider = new CosyVoiceProvider(
            'http://127.0.0.1:8876',
            'mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit',
        );

        await provider.synthesizeStream!({
            text: '一二三四五六七八九十一二三四五六七八九十',
            locale: 'zh-CN',
            rate: 1,
            voiceId: 'Eric',
            signal: new AbortController().signal,
            onChunk: vi.fn(),
        });

        expect(JSON.parse(body)).toMatchObject({ max_tokens: 160 });
    });

    it('keeps a configured style instruction for CustomVoice models that support it', async () => {
        const bodies: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
            if (typeof init?.body === 'string') bodies.push(init.body);
            return new Response(Uint8Array.from([1, 2]), { status: 200 });
        }));
        const provider = new CosyVoiceProvider(
            'http://127.0.0.1:8876',
            'mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit',
            '用成熟、有感情的方式朗读。',
        );

        await provider.synthesizeStream!({
            text: '测试。', locale: 'zh-CN', rate: 1, voiceId: 'Uncle_Fu',
            signal: new AbortController().signal, onChunk: vi.fn(),
        });

        expect(bodies).toHaveLength(1);
        expect(bodies[0]).toContain('"instruct":"用成熟、有感情的方式朗读。"');
    });

    it('rejects an incomplete PCM16 transport frame at EOF', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
            start(controller) {
                controller.enqueue(Uint8Array.from([1]));
                controller.close();
            },
        }), { status: 200 })));
        const provider = new CosyVoiceProvider('http://127.0.0.1:8876', 'mlx-community/qwen3');

        await expect(provider.synthesizeStream!({
            text: '测试。', locale: 'zh-CN', rate: 1, voiceId: 'Uncle_Fu',
            signal: new AbortController().signal, onChunk: vi.fn(),
        })).rejects.toThrow(/PCM16/i);
    });

    it('rejects a complete but inaudible PCM16 sidecar response', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.alloc(48_000), { status: 200 })));
        const provider = new CosyVoiceProvider('http://127.0.0.1:8876', 'mlx-community/qwen3');

        await expect(provider.synthesizeStream!({
            text: '测试。', locale: 'zh-CN', rate: 1, voiceId: 'Eric',
            signal: new AbortController().signal, onChunk: vi.fn(),
        })).rejects.toThrow(/inaudible/i);
    });

    it('recovers a deterministic generation ceiling by buffering two shorter halves before playback', async () => {
        const originalText = '甲乙丙丁戊己';
        const ceilingPcm = Buffer.alloc(96 * 1_920 * 2);
        for (let offset = 0; offset < ceilingPcm.length; offset += 2) {
            ceilingPcm.writeInt16LE(100, offset);
        }
        const bodies: Array<{ input: string; max_tokens: number; repetition_penalty: number }> = [];
        let responseIndex = 0;
        vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
            bodies.push(JSON.parse(String(init?.body)));
            responseIndex++;
            return new Response(responseIndex === 1 ? ceilingPcm : Buffer.from([100, 0]), { status: 200 });
        }));
        const provider = new CosyVoiceProvider(
            'http://127.0.0.1:8876',
            'mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit',
        );

        await expect(provider.synthesize({
            text: originalText, locale: 'zh-CN', rate: 1, voiceId: 'Eric',
        })).resolves.toEqual({
            sampleRateHz: 24_000,
            pcm16le: Buffer.from([100, 0, 100, 0]),
        });
        expect(bodies).toEqual([
            { input: originalText, max_tokens: 96, repetition_penalty: 1.35 },
            { input: originalText.slice(0, 3), max_tokens: 72, repetition_penalty: 1.35 },
            { input: originalText.slice(3), max_tokens: 72, repetition_penalty: 1.35 },
        ].map((expected) => expect.objectContaining(expected)));
    });

    it('rejects audible Qwen PCM that ends exactly at the generation ceiling', async () => {
        const ceilingPcm = Buffer.alloc(160 * 1_920 * 2);
        for (let offset = 0; offset < ceilingPcm.length; offset += 2) {
            ceilingPcm.writeInt16LE(100, offset);
        }
        vi.stubGlobal('fetch', vi.fn(async () => new Response(ceilingPcm, { status: 200 })));
        const provider = new CosyVoiceProvider(
            'http://127.0.0.1:8876',
            'mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit',
        );

        await expect(provider.synthesizeStream!({
            text: '一二三四五六七八九十一二三四五六七八九十',
            locale: 'zh-CN',
            rate: 1,
            voiceId: 'Eric',
            signal: new AbortController().signal,
            onChunk: vi.fn(),
        })).rejects.toThrow(/generation ceiling/i);
    });

    it('recovers a Qwen generation ceiling by splitting once at a natural boundary', async () => {
        const text = '一二三四五六七八九十，甲乙丙丁戊己庚辛壬';
        const ceilingPcm = Buffer.alloc(text.length * 8 * 1_920 * 2);
        for (let offset = 0; offset < ceilingPcm.length; offset += 2) {
            ceilingPcm.writeInt16LE(100, offset);
        }
        const bodies: Array<{ input: string }> = [];
        vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
            bodies.push(JSON.parse(String(init?.body)) as { input: string });
            return new Response(bodies.length === 1 ? ceilingPcm : Uint8Array.from([1, 2]), { status: 200 });
        }));
        const provider = new CosyVoiceProvider(
            'http://127.0.0.1:8876',
            'mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit',
        );

        await expect(provider.synthesize({
            text, locale: 'zh-CN', rate: 1, voiceId: 'Eric',
        })).resolves.toEqual({
            sampleRateHz: 24_000,
            pcm16le: Buffer.from([1, 2, 1, 2]),
        });

        expect(bodies).toHaveLength(3);
        expect(bodies.slice(1).map((body) => body.input)).toEqual([
            '一二三四五六七八九十，',
            '甲乙丙丁戊己庚辛壬',
        ]);
    });

    it('recovers when one first-level Qwen fallback fragment also reaches its ceiling', async () => {
        const text = '一二三四五六七八九十甲乙丙丁戊己庚辛壬癸';
        const requestedInputs: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body)) as { input: string; max_tokens: number };
            requestedInputs.push(body.input);
            const shouldReachCeiling = body.input === text || body.input === text.slice(0, 10);
            if (!shouldReachCeiling) return new Response(Buffer.from([100, 0]), { status: 200 });
            const pcm = Buffer.alloc(body.max_tokens * 1_920 * 2);
            for (let offset = 0; offset < pcm.length; offset += 2) pcm.writeInt16LE(100, offset);
            return new Response(pcm, { status: 200 });
        }));
        const provider = new CosyVoiceProvider(
            'http://127.0.0.1:8876',
            'mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit',
        );

        await expect(provider.synthesize({
            text, locale: 'zh-CN', rate: 1, voiceId: 'Eric',
        })).resolves.toMatchObject({
            sampleRateHz: 24_000,
            pcm16le: Buffer.from([100, 0, 100, 0, 100, 0]),
        });
        expect(requestedInputs).toEqual([
            text,
            text.slice(0, 10),
            text.slice(0, 5),
            text.slice(5, 10),
            text.slice(10),
        ]);
    });

    it('propagates Android cancellation into a buffered sidecar request', async () => {
        let fetchSignal: AbortSignal | undefined;
        vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
            fetchSignal = init?.signal ?? undefined;
            return new Response(Uint8Array.from([1, 2]), { status: 200 });
        }));
        const controller = new AbortController();
        const provider = new CosyVoiceProvider('http://127.0.0.1:8876', 'mlx-community/qwen3');

        await provider.synthesizeStream!({
            text: '测试。', locale: 'zh-CN', rate: 1, voiceId: 'Uncle_Fu',
            signal: controller.signal, onChunk: vi.fn(),
        });
        controller.abort();

        expect(fetchSignal?.aborted).toBe(true);
    });
});
