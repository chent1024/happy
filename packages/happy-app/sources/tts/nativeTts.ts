import { NativeModules, Platform } from 'react-native';
import { TtsStatusResultSchema, type TtsRuntimeStatus } from '@slopus/happy-wire';
import { TokenStorage } from '@/auth/tokenStorage';
import { getServerUrl } from '@/sync/serverConfig';

type HappyTtsBridge = {
    configureRemoteTts(endpoint: string, machineId: string, token: string): Promise<void>;
    clearRemoteTts(): Promise<void>;
    testRemoteTts(): Promise<void>;
};

function bridge(): HappyTtsBridge {
    if (Platform.OS !== 'android' || !NativeModules.HappyTtsBridge) {
        throw new Error('Mac 高品质朗读仅支持已安装最新 Happy Android 版本的设备。');
    }
    return NativeModules.HappyTtsBridge as HappyTtsBridge;
}

/** Gives the Android system service the existing Happy login for one selected Mac. */
export async function configureNativeMacTts(machineId: string): Promise<void> {
    const credentials = await TokenStorage.getCredentials();
    const endpoint = getServerUrl();
    if (!credentials || !endpoint.startsWith('https://')) {
        throw new Error('请先将 Happy 连接到 HTTPS 的自托管地址（推荐当前 Mac 的 Tailscale 地址）。');
    }
    await bridge().configureRemoteTts(endpoint, machineId, credentials.token);
}

export async function clearNativeMacTts(): Promise<void> {
    await bridge().clearRemoteTts();
}

/** Reads current provider state through the normal account and selected-machine relay. */
export async function fetchMacTtsStatus(machineId: string): Promise<TtsRuntimeStatus> {
    const credentials = await TokenStorage.getCredentials();
    if (!credentials || !machineId.trim()) throw new Error('无法读取 Qwen3 状态');

    try {
        const response = await fetch(
            `${getServerUrl()}/v1/machines/${encodeURIComponent(machineId)}/tts/status`,
            { headers: { Authorization: `Bearer ${credentials.token}` } },
        );
        const result = TtsStatusResultSchema.safeParse(await response.json());
        if (!response.ok || !result.success || result.data.type !== 'success') {
            throw new Error('invalid status');
        }
        return result.data.status;
    } catch {
        throw new Error('无法读取 Qwen3 状态');
    }
}

/** Verifies the encrypted Android engine configuration through the selected Happy machine. */
export async function testNativeMacTts(): Promise<void> {
    await bridge().testRemoteTts();
}
