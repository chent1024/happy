import { useCallback, useEffect, useState } from 'react';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { storage } from '@/sync/storage';
import { useShallow } from 'zustand/react/shallow';
import { openExternalUrl } from '@/utils/openExternalUrl';

export type NativeUpdateInstallStatus =
    | 'idle'
    | 'queued'
    | 'downloading'
    | 'paused'
    | 'permission-required'
    | 'installing'
    | 'error';

export interface NativeUpdateInstallState {
    status: NativeUpdateInstallStatus;
    progress: number;
    message?: string;
    downloadedBytes?: number;
    totalBytes?: number;
}

interface HappyApkUpdateModule {
    installApk: (url: string) => Promise<boolean>;
    openInstallPermissionSettings: () => Promise<void>;
    addListener: (eventName: string) => void;
    removeListeners: (count: number) => void;
}

const happyApkUpdate = NativeModules.HappyApkUpdate as HappyApkUpdateModule | undefined;
const updateEmitter = happyApkUpdate ? new NativeEventEmitter(happyApkUpdate) : null;

export function useNativeUpdate() {
    const nativeUpdateStatus = storage(useShallow((state) => state.nativeUpdateStatus));
    const updateUrl = nativeUpdateStatus?.updateUrl || null;
    const [installState, setInstallState] = useState<NativeUpdateInstallState>({
        status: 'idle',
        progress: 0,
    });

    useEffect(() => {
        if (!updateEmitter) {
            return;
        }

        const subscription = updateEmitter.addListener('HappyApkUpdateStatus', (event: NativeUpdateInstallState) => {
            setInstallState({
                status: event.status,
                progress: event.progress ?? 0,
                message: event.message,
                downloadedBytes: event.downloadedBytes,
                totalBytes: event.totalBytes,
            });
        });

        return () => {
            subscription.remove();
        };
    }, []);

    const installUpdate = useCallback(async () => {
        if (!updateUrl) {
            return;
        }

        if (Platform.OS === 'android' && happyApkUpdate) {
            await happyApkUpdate.installApk(updateUrl);
            return;
        }

        await openExternalUrl(updateUrl);
    }, [updateUrl]);

    return {
        updateUrl,
        installState,
        installUpdate,
    };
}
