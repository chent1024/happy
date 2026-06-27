import * as React from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeviceType, useHeaderHeight, useIsTablet } from '@/utils/responsive';
import { layout } from '@/components/layout';
import { useUnistyles } from 'react-native-unistyles';

interface ChatHeaderViewProps {
    title: string;
    /** Project folder name (last path segment) */
    folderName?: string;
    /** Extra path segment appended to the title with a separator (used for the file-view overlay). */
    extraPathSegment?: string;
    /** Optional content rendered at the right edge of the header (used by file-view / diff overlays). */
    rightSlot?: React.ReactNode;
    onTitlePress?: () => void;
    onBackPress?: () => void;
    backgroundColor?: string;
    tintColor?: string;
    isConnected?: boolean;
}

export const ChatHeaderView: React.FC<ChatHeaderViewProps> = ({
    title,
    rightSlot,
    onTitlePress,
    onBackPress,
}) => {
    const { theme } = useUnistyles();
    const insets = useSafeAreaInsets();
    const deviceType = useDeviceType();
    const baseHeaderHeight = useHeaderHeight();
    const headerHeight = deviceType === 'phone' && Platform.OS !== 'web'
        ? Math.min(baseHeaderHeight, 48)
        : baseHeaderHeight;
    const isTablet = useIsTablet();
    const showBackButton = !isTablet && !!onBackPress;

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: theme.colors.header.background }]}>
            <View style={styles.contentWrapper}>
                <View style={[styles.content, { height: headerHeight }]}>
                    {showBackButton && (
                        <Pressable onPress={onBackPress} hitSlop={8} style={styles.backButton}>
                            <ThinBackIcon color={theme.colors.header.tint} />
                        </Pressable>
                    )}
                    <Pressable
                        style={styles.titleContainer}
                        onPress={onTitlePress}
                        disabled={!onTitlePress}
                    >
                        <Text
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            style={[styles.title, { color: theme.colors.header.tint }]}
                        >
                            {title}
                        </Text>
                    </Pressable>
                    {rightSlot ? (
                        <View style={styles.rightSlot}>
                            {rightSlot}
                        </View>
                    ) : null}
                </View>
            </View>
        </View>
    );
};

function ThinBackIcon(props: { color: string }) {
    return (
        <Svg width={28} height={28} viewBox="0 0 28 28">
            <Path
                d="M17 6.5L9.5 14L17 21.5"
                fill="none"
                stroke={props.color}
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        zIndex: 100,
    },
    contentWrapper: {
        width: '100%',
        alignItems: 'center',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        width: '100%',
        maxWidth: layout.headerMaxWidth,
    },
    titleContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'flex-start',
        minWidth: 0,
        marginLeft: 8,
    },
    title: {
        fontSize: 16,
        lineHeight: 22,
        fontWeight: '600',
    },
    rightSlot: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginLeft: 12,
        flexShrink: 0,
    },
    backButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: -8,
        flexShrink: 0,
    },
});
