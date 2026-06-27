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

function getQuotaTone(remainingPercent: number, theme: ReturnType<typeof useUnistyles>['theme']) {
    if (remainingPercent <= 10) {
        return {
            color: theme.colors.textDestructive,
            backgroundColor: theme.dark ? 'rgba(255, 69, 58, 0.14)' : 'rgba(255, 59, 48, 0.10)',
            fillColor: theme.colors.textDestructive,
        };
    }
    if (remainingPercent <= 30) {
        return {
            color: '#B35B00',
            backgroundColor: theme.dark ? 'rgba(255, 149, 0, 0.16)' : 'rgba(255, 149, 0, 0.12)',
            fillColor: '#FF9500',
        };
    }
    return {
        color: theme.colors.textSecondary,
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
        fillColor: theme.colors.textSecondary,
    };
}

export function CodexRateLimitsModal(props: CodexRateLimitsModalProps) {
    const { theme } = useUnistyles();
    const { width } = useWindowDimensions();
    const tightestWindow = props.windows.find((window) => window.isTightest) ?? props.windows[0];
    const modalWidth = Math.min(Math.max(width - 40, 280), 380);

    return (
        <View
            style={{
                width: modalWidth,
                borderRadius: 24,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.modal.border,
                overflow: 'hidden',
                shadowColor: theme.colors.shadow.color,
                shadowOffset: { width: 0, height: 18 },
                shadowOpacity: theme.dark ? 0.38 : 0.16,
                shadowRadius: 28,
                elevation: 12,
            }}
        >
            <View
                style={{
                    paddingHorizontal: 20,
                    paddingTop: 18,
                    paddingBottom: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.divider,
                }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                        <Text
                            style={[
                                Typography.default('semiBold'),
                                {
                                    color: theme.colors.text,
                                    fontSize: 20,
                                    lineHeight: 26,
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
                                当前最低 {tightestWindow.label} {tightestWindow.remainingPercent}%
                            </Text>
                        )}
                    </View>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="关闭"
                        onPress={props.onClose}
                        style={({ pressed }) => ({
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surfaceHigh,
                        })}
                    >
                        <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
                    </Pressable>
                </View>
            </View>

            <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 18, gap: 10 }}>
                {props.windows.map((window) => {
                    const tone = getQuotaTone(window.remainingPercent, theme);

                    return (
                        <View
                            key={window.id}
                            style={{
                                padding: 14,
                                borderRadius: 16,
                                backgroundColor: window.isTightest ? tone.backgroundColor : theme.colors.surfaceHigh,
                                borderWidth: 1,
                                borderColor: window.isTightest ? tone.fillColor : theme.colors.divider,
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <View style={{ flex: 1 }}>
                                    <Text
                                        style={[
                                            Typography.default('semiBold'),
                                            {
                                                color: theme.colors.text,
                                                fontSize: 15,
                                                lineHeight: 20,
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
                                                lineHeight: 17,
                                                marginTop: 2,
                                            },
                                        ]}
                                    >
                                        {window.resetText}
                                    </Text>
                                </View>
                                <Text
                                    style={[
                                        Typography.default('semiBold'),
                                        {
                                            color: tone.color,
                                            fontSize: 24,
                                            lineHeight: 30,
                                        },
                                    ]}
                                >
                                    {window.remainingPercent}%
                                </Text>
                            </View>
                            <View
                                style={{
                                    height: 6,
                                    borderRadius: 3,
                                    backgroundColor: theme.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                                    marginTop: 12,
                                    overflow: 'hidden',
                                }}
                            >
                                <View
                                    style={{
                                        width: `${window.remainingPercent}%`,
                                        minWidth: window.remainingPercent > 0 ? 4 : 0,
                                        height: '100%',
                                        borderRadius: 3,
                                        backgroundColor: tone.fillColor,
                                    }}
                                />
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
