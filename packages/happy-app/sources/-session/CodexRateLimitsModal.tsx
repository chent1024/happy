import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';

export type CodexRateLimitDetail = {
    id: string;
    label: string;
    remainingPercent: number;
    resetText: string;
    isTightest: boolean;
};

type CodexRateLimitsModalProps = {
    windows: CodexRateLimitDetail[];
    creditsLabel?: string | null;
    statusLabel?: string | null;
    onClose: () => void;
};

function getQuotaTone(remainingPercent: number, isHighlighted: boolean, theme: ReturnType<typeof useUnistyles>['theme']) {
    if (!isHighlighted) {
        return {
            color: theme.colors.textSecondary,
            backgroundColor: theme.colors.surfaceHigh,
            fillColor: theme.colors.textSecondary,
            borderColor: theme.colors.divider,
        };
    }
    if (remainingPercent <= 10) {
        return {
            color: theme.colors.textDestructive,
            backgroundColor: theme.dark ? 'rgba(255, 69, 58, 0.14)' : 'rgba(255, 59, 48, 0.10)',
            fillColor: theme.colors.textDestructive,
            borderColor: theme.colors.textDestructive,
        };
    }
    if (remainingPercent <= 25) {
        return {
            color: '#B35B00',
            backgroundColor: theme.dark ? 'rgba(255, 149, 0, 0.10)' : 'rgba(255, 149, 0, 0.06)',
            fillColor: '#FF9500',
            borderColor: '#FF9500',
        };
    }
    return {
        color: theme.colors.textSecondary,
        backgroundColor: theme.colors.surfaceHigh,
        fillColor: theme.colors.textSecondary,
        borderColor: theme.colors.divider,
    };
}

function ProgressBar(props: {
    percent: number;
    fillColor: string;
    height?: number;
}) {
    const { theme } = useUnistyles();
    return (
        <View
            style={{
                height: props.height ?? 6,
                borderRadius: (props.height ?? 6) / 2,
                backgroundColor: theme.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                overflow: 'hidden',
            }}
        >
            <View
                style={{
                    width: `${props.percent}%`,
                    minWidth: props.percent > 0 ? 4 : 0,
                    height: '100%',
                    borderRadius: (props.height ?? 6) / 2,
                    backgroundColor: props.fillColor,
                }}
            />
        </View>
    );
}

export function CodexRateLimitsModal(props: CodexRateLimitsModalProps) {
    const { theme } = useUnistyles();
    const { width } = useWindowDimensions();
    const tightestWindow = props.windows.find((window) => window.isTightest) ?? props.windows[0];
    const sortedWindows = React.useMemo(
        () => [...props.windows].sort((a, b) => a.remainingPercent - b.remainingPercent),
        [props.windows],
    );
    const modalWidth = Math.min(Math.max(width - 48, 280), 360);

    return (
        <View
            style={{
                width: modalWidth,
                borderRadius: 22,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.modal.border,
                overflow: 'hidden',
                shadowColor: theme.colors.shadow.color,
                shadowOffset: { width: 0, height: 14 },
                shadowOpacity: theme.dark ? 0.34 : 0.14,
                shadowRadius: 24,
                elevation: 12,
            }}
        >
            <View
                style={{
                    paddingHorizontal: 18,
                    paddingTop: 16,
                    paddingBottom: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.divider,
                }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                        <Text
                            style={[
                                Typography.default('semiBold'),
                                {
                                    color: theme.colors.text,
                                    fontSize: 19,
                                    lineHeight: 24,
                                },
                            ]}
                        >
                            Codex 剩余额度
                        </Text>
                        {tightestWindow && (
                            <Text
                                style={[
                                    Typography.default(),
                                    {
                                        color: theme.colors.textSecondary,
                                        fontSize: 13,
                                        lineHeight: 18,
                                        marginTop: 2,
                                    },
                                ]}
                            >
                                当前瓶颈：{tightestWindow.label} · {tightestWindow.remainingPercent}%
                            </Text>
                        )}
                    </View>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="关闭"
                        onPress={props.onClose}
                        style={({ pressed }) => ({
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surfaceHigh,
                        })}
                    >
                        <Ionicons name="close" size={17} color={theme.colors.textSecondary} />
                    </Pressable>
                </View>
            </View>

            <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, gap: 8 }}>
                {sortedWindows.map((window) => {
                    const tone = getQuotaTone(window.remainingPercent, window.isTightest, theme);
                    return (
                        <View
                            key={window.id}
                            style={{
                                paddingHorizontal: 12,
                                paddingVertical: 11,
                                borderRadius: 14,
                                backgroundColor: tone.backgroundColor,
                                borderWidth: 1,
                                borderColor: tone.borderColor,
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text
                                        style={[
                                            Typography.default('semiBold'),
                                            {
                                                color: theme.colors.text,
                                                fontSize: 15,
                                                lineHeight: 19,
                                            },
                                        ]}
                                    >
                                        {window.label}
                                    </Text>
                                    <Text
                                        style={[
                                            Typography.default(),
                                            {
                                                color: theme.colors.textSecondary,
                                                fontSize: 12,
                                                lineHeight: 16,
                                                marginTop: 1,
                                            },
                                        ]}
                                        numberOfLines={1}
                                    >
                                        {window.resetText}
                                    </Text>
                                </View>
                                <Text
                                    style={[
                                        Typography.default('semiBold'),
                                        {
                                            color: tone.color,
                                            fontSize: 25,
                                            lineHeight: 29,
                                            minWidth: 64,
                                            textAlign: 'right',
                                        },
                                    ]}
                                >
                                    {window.remainingPercent}%
                                </Text>
                            </View>
                            <View style={{ marginTop: 10 }}>
                                <ProgressBar percent={window.remainingPercent} fillColor={tone.fillColor} height={5} />
                            </View>
                        </View>
                    );
                })}

                {(props.creditsLabel || props.statusLabel) && (
                    <View
                        style={{
                            marginTop: 2,
                            paddingHorizontal: 2,
                            gap: 6,
                        }}
                    >
                        {props.creditsLabel && (
                            <Text
                                style={[
                                    Typography.default(),
                                    {
                                        color: theme.colors.textSecondary,
                                        fontSize: 12,
                                        lineHeight: 17,
                                    },
                                ]}
                            >
                                {props.creditsLabel}
                            </Text>
                        )}
                        {props.statusLabel && (
                            <Text
                                style={[
                                    Typography.default(),
                                    {
                                        color: theme.colors.textSecondary,
                                        fontSize: 12,
                                        lineHeight: 17,
                                    },
                                ]}
                            >
                                {props.statusLabel}
                            </Text>
                        )}
                    </View>
                )}
            </View>

        </View>
    );
}
