import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import type { CodexSessionSyncResult } from '@/sync/ops';

type CodexSyncSuccessResult = Extract<CodexSessionSyncResult, { type: 'success' }>;

const styles = StyleSheet.create((theme) => ({
    card: {
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 14,
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconBadge: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceHigh,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },
    copy: {
        flex: 1,
        minWidth: 0,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    title: {
        ...Typography.default('semiBold'),
        color: theme.colors.text,
        fontSize: 17,
        lineHeight: 22,
        flexShrink: 1,
    },
    pill: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: theme.dark ? 'rgba(43, 172, 204, 0.16)' : 'rgba(43, 172, 204, 0.12)',
    },
    pillText: {
        ...Typography.default('semiBold'),
        color: theme.colors.textLink,
        fontSize: 11,
        lineHeight: 14,
    },
    subtitle: {
        ...Typography.default('regular'),
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 20,
        marginTop: 3,
    },
    syncButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.button.primary.background,
    },
    syncButtonDisabled: {
        backgroundColor: theme.colors.surfaceHigh,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        borderTopColor: theme.colors.divider,
        paddingTop: 12,
        gap: 12,
    },
    footerText: {
        ...Typography.default('regular'),
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 18,
        flex: 1,
    },
    status: {
        ...Typography.default('semiBold'),
        color: theme.colors.success,
        fontSize: 13,
        lineHeight: 18,
    },
    statusMuted: {
        color: theme.colors.textSecondary,
    },
    resultModal: {
        width: '100%',
        maxWidth: 360,
        marginHorizontal: 24,
        borderRadius: 18,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: theme.dark ? 0.35 : 0.16,
        shadowRadius: 24,
        elevation: 8,
    },
    resultHeader: {
        paddingHorizontal: 20,
        paddingTop: 22,
        paddingBottom: 18,
        alignItems: 'center',
    },
    resultSuccessIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.dark ? 'rgba(50, 215, 75, 0.16)' : 'rgba(52, 199, 89, 0.13)',
        marginBottom: 14,
    },
    resultTitle: {
        ...Typography.default('semiBold'),
        color: theme.colors.text,
        fontSize: 21,
        lineHeight: 27,
        textAlign: 'center',
    },
    resultSubtitle: {
        ...Typography.default('regular'),
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
        marginTop: 6,
    },
    metrics: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 14,
        paddingBottom: 16,
        gap: 8,
    },
    metric: {
        width: '48.6%',
        borderRadius: 12,
        backgroundColor: theme.colors.surfaceHigh,
        paddingHorizontal: 12,
        paddingVertical: 11,
    },
    metricValue: {
        ...Typography.default('semiBold'),
        color: theme.colors.text,
        fontSize: 22,
        lineHeight: 27,
    },
    metricLabel: {
        ...Typography.default('regular'),
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
        marginTop: 2,
    },
    resultButton: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.divider,
        minHeight: 50,
        alignItems: 'center',
        justifyContent: 'center',
    },
    resultButtonPressed: {
        backgroundColor: theme.colors.surfacePressed,
    },
    resultButtonText: {
        ...Typography.default('semiBold'),
        color: theme.colors.textLink,
        fontSize: 17,
        lineHeight: 22,
    },
}));

export function CodexSyncActionCard(props: {
    disabled: boolean;
    isSyncing: boolean;
    isOnline: boolean;
    onPress: () => void;
}) {
    const { theme } = useUnistyles();
    const { disabled, isSyncing, isOnline, onPress } = props;
    const statusText = isSyncing ? t('codex.sync.syncing') : isOnline ? t('codex.sync.ready') : t('codex.sync.offline');

    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            android_ripple={{ color: theme.colors.surfaceRipple, borderless: false }}
            style={({ pressed }) => [
                styles.card,
                pressed && { backgroundColor: theme.colors.surfacePressedOverlay },
                disabled && !isSyncing && { opacity: 0.58 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('codex.sync.accessibilityLabel')}
        >
            <View style={styles.topRow}>
                <View style={styles.iconBadge}>
                    <Ionicons name="code-slash-outline" size={22} color={theme.colors.text} />
                </View>
                <View style={styles.copy}>
                    <View style={styles.titleRow}>
                        <Text style={styles.title} numberOfLines={1}>
                            {t('codex.sync.title')}
                        </Text>
                        <View style={styles.pill}>
                            <Text style={styles.pillText}>{t('codex.sync.manual')}</Text>
                        </View>
                    </View>
                    <Text style={styles.subtitle} numberOfLines={2}>
                        {t('codex.sync.subtitle')}
                    </Text>
                </View>
                <View style={[styles.syncButton, disabled && styles.syncButtonDisabled]}>
                    {isSyncing ? (
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    ) : (
                        <Ionicons
                            name="sync-outline"
                            size={21}
                            color={disabled ? theme.colors.textSecondary : theme.colors.button.primary.tint}
                        />
                    )}
                </View>
            </View>
            <View style={styles.footer}>
                <Text style={styles.footerText} numberOfLines={1}>
                    {t('codex.sync.footer')}
                </Text>
                <Text style={[styles.status, !isOnline && styles.statusMuted]}>
                    {statusText}
                </Text>
            </View>
        </Pressable>
    );
}

export function CodexSyncResultModal(props: {
    result: CodexSyncSuccessResult;
    onClose: () => void;
}) {
    const { theme } = useUnistyles();
    const { result, onClose } = props;
    const changed = result.imported + result.refreshed;
    const metrics = [
        { label: t('codex.sync.fetched'), value: result.fetched },
        { label: t('codex.sync.imported'), value: result.imported },
        { label: t('codex.sync.updated'), value: result.refreshed },
        { label: t('codex.sync.skipped'), value: result.skipped },
    ];

    return (
        <View style={styles.resultModal}>
            <View style={styles.resultHeader}>
                <View style={styles.resultSuccessIcon}>
                    <Ionicons name="checkmark" size={28} color={theme.colors.success} />
                </View>
                <Text style={styles.resultTitle}>{t('codex.sync.resultTitle')}</Text>
                <Text style={styles.resultSubtitle}>
                    {changed > 0
                        ? t('codex.sync.changedSummary', { count: changed })
                        : t('codex.sync.unchangedSummary')}
                </Text>
            </View>
            <View style={styles.metrics}>
                {metrics.map((metric) => (
                    <View key={metric.label} style={styles.metric}>
                        <Text style={styles.metricValue}>{metric.value}</Text>
                        <Text style={styles.metricLabel}>{metric.label}</Text>
                    </View>
                ))}
            </View>
            <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                    styles.resultButton,
                    pressed && styles.resultButtonPressed,
                ]}
                accessibilityRole="button"
            >
                <Text style={styles.resultButtonText}>{t('common.ok')}</Text>
            </Pressable>
        </View>
    );
}
