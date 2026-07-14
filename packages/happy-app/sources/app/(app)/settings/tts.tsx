import { Stack } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as React from 'react';
import { Platform, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUnistyles } from 'react-native-unistyles';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { Modal } from '@/modal';
import { useAllMachines, useLocalSettingMutable } from '@/sync/storage';
import type { Machine } from '@/sync/storageTypes';
import type { TtsRuntimeStatus } from '@slopus/happy-wire';
import { configureNativeMacTts, fetchMacTtsStatus, testNativeMacTts } from '@/tts/nativeTts';

function runtimeStatusLabel(tts?: TtsRuntimeStatus | null): string {
    if (!tts) return '在线 · 正在读取 Qwen3 状态';
    if (tts.state === 'ready') return '在线 · Qwen3 模型已就绪';
    if (tts.state === 'busy') return '在线 · 正在合成上一段';
    if (tts.state === 'provider_unavailable') return '在线 · Qwen3 模型未就绪';
    return '在线 · Qwen3 状态暂不可用';
}

function runtimeSubtitle(machine: Machine, liveStatus?: TtsRuntimeStatus | null): string {
    if (!machine.active) return '离线 · 无法朗读';
    return runtimeStatusLabel(liveStatus ?? machine.daemonState?.tts);
}

function diagnosticsSubtitle(status: TtsRuntimeStatus | null, error: string | null): string {
    if (error) return error;
    if (!status) return '正在通过当前 Happy 账号读取所选 Mac 状态';
    const diagnostics = status.diagnostics;
    if (!diagnostics) return `最近错误：${status.lastError ?? '无'}`;
    return `等待队列 ${diagnostics.pendingRequests} · 预音频重试 ${diagnostics.preAudioRetries} · 最近错误 ${diagnostics.lastFailure ?? '无'}`;
}

export default function QwenTtsSettingsScreen() {
    const { theme } = useUnistyles();
    const machines = useAllMachines({ includeOffline: true });
    const [machineId, setMachineId] = useLocalSettingMutable('qwenTtsMachineId');
    const [saving, setSaving] = React.useState<string | null>(null);
    const [testing, setTesting] = React.useState(false);
    const [liveStatus, setLiveStatus] = React.useState<TtsRuntimeStatus | null>(null);
    const [statusError, setStatusError] = React.useState<string | null>(null);

    const refreshStatus = React.useCallback(async (selectedMachineId = machineId) => {
        if (!selectedMachineId) {
            setLiveStatus(null);
            setStatusError(null);
            return;
        }
        try {
            setLiveStatus(await fetchMacTtsStatus(selectedMachineId));
            setStatusError(null);
        } catch (error) {
            setLiveStatus(null);
            setStatusError(error instanceof Error ? error.message : '无法读取 Qwen3 状态');
        }
    }, [machineId]);

    useFocusEffect(React.useCallback(() => {
        void refreshStatus();
    }, [refreshStatus]));

    const selectMachine = React.useCallback(async (nextMachineId: string) => {
        setSaving(nextMachineId);
        try {
            await configureNativeMacTts(nextMachineId);
            setMachineId(nextMachineId);
            await refreshStatus(nextMachineId);
        } catch (error) {
            Modal.alert('无法配置 Qwen3 朗读', error instanceof Error ? error.message : '请确认 Happy 已连接到当前 Mac 的 HTTPS 地址。');
        } finally {
            setSaving(null);
        }
    }, [refreshStatus, setMachineId]);

    const testSelectedMachine = React.useCallback(async () => {
        if (!machineId) {
            Modal.alert('请先选择设备', '先选择运行 Qwen3 的当前 Mac，再进行连接测试。');
            return;
        }
        setTesting(true);
        try {
            await testNativeMacTts();
            await refreshStatus();
            Modal.alert('朗读测试成功', 'Android 已使用 Happy 系统 TTS 完整播放测试句。请回到阅读软件开始朗读。');
        } catch (error) {
            Modal.alert('Qwen3 连接测试失败', error instanceof Error ? error.message : '请确认所选 Mac 在线且 Qwen3 模型已就绪。');
        } finally {
            setTesting(false);
        }
    }, [machineId, refreshStatus]);

    return (
        <ItemList>
            <Stack.Screen options={{ title: 'Qwen3 高品质朗读' }} />
            <ItemGroup title="工作方式">
                <Item
                    title="当前 Mac 上的 Qwen3 8-bit"
                    subtitle="手机只播放音频；小说文本经当前 Happy 账号发送给已选择的 Mac，不使用 Edge，也不在手机端推理。"
                    icon={<Ionicons name="laptop-outline" size={29} color={theme.colors.header.tint} />}
                    showChevron={false}
                />
                <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                    <Text style={{ color: theme.colors.textSecondary }}>
                        在系统“文字转语音输出”中选择 Happy，再在下方选择运行 Qwen3 的在线设备。设备离线或模型未就绪时，朗读会失败而不会切换到其他服务。
                    </Text>
                </View>
            </ItemGroup>
            <ItemGroup title="Qwen3 推理设备">
                {machines.length === 0 ? (
                    <Item title="没有可用设备" subtitle="请先让运行 Happy daemon 的 Mac 在线。" showChevron={false} />
                ) : machines.map((machine) => (
                    <Item
                        key={machine.id}
                        title={machine.metadata?.host ?? 'Happy 设备'}
                        subtitle={runtimeSubtitle(machine, machineId === machine.id ? liveStatus : null)}
                        detail={machineId === machine.id ? '已选' : undefined}
                        selected={machineId === machine.id}
                        disabled={Platform.OS !== 'android' || !machine.active}
                        loading={saving === machine.id}
                        onPress={() => void selectMachine(machine.id)}
                    />
                ))}
            </ItemGroup>
            {machineId ? (
                <ItemGroup title="运行状态">
                    <Item
                        title={liveStatus ? runtimeStatusLabel(liveStatus) : 'Qwen3 状态'}
                        subtitle={diagnosticsSubtitle(liveStatus, statusError)}
                        icon={<Ionicons name="pulse-outline" size={29} color={theme.colors.header.tint} />}
                        showChevron={false}
                    />
                </ItemGroup>
            ) : null}
            <ItemGroup title="连接测试">
                <Item
                    title="测试当前 Mac"
                    subtitle="调用 Happy 系统 TTS 实际播放一句测试语音；只有 Android 播放完成才算成功。"
                    icon={<Ionicons name="checkmark-circle-outline" size={29} color={theme.colors.header.tint} />}
                    disabled={Platform.OS !== 'android' || !machineId}
                    loading={testing}
                    onPress={() => void testSelectedMachine()}
                />
            </ItemGroup>
        </ItemList>
    );
}
