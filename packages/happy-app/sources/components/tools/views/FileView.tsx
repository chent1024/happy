/**
 * View for 'file' tool calls (image attachments sent by user).
 * Downloads and decrypts the encrypted blob via apiAttachments + sessionBlobKey,
 * then renders the full image inline with the thumbhash as placeholder.
 *
 * Always renders inline when a ref is present — if dimensions are missing
 * (older messages, iOS picker that didn't report w/h), a default 4:3 aspect
 * ratio is used until the actual image lands and contentFit shows it.
 */
import * as React from 'react';
import { View, Text, Platform, Pressable, Modal as RNModal, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ToolViewProps } from './_all';
import { z } from 'zod';
import { useAttachmentImage } from '@/hooks/useAttachmentImage';
import { thumbhashToDataUri } from '@/utils/thumbhash';

const fileInputSchema = z.object({
    ref: z.string(),
    name: z.string(),
    size: z.number().optional(),
    image: z.object({
        width: z.number(),
        height: z.number(),
        thumbhash: z.string().optional(),
    }).optional(),
});

const BORDER_RADIUS = 16;
const MAX_IMAGE_WIDTH = 180;
const MAX_IMAGE_HEIGHT = 240;
const DEFAULT_ASPECT = 4 / 3; // when wire-format omits image{} dimensions

export const FileView = React.memo<ToolViewProps>(({ tool, sessionId }) => {
    const { theme } = useUnistyles();
    const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
    const [previewVisible, setPreviewVisible] = React.useState(false);
    const parsed = fileInputSchema.safeParse(tool.input);
    if (!parsed.success) return null;

    const { image, ref } = parsed.data;

    const placeholder = React.useMemo(() => {
        if (!image?.thumbhash) return undefined;
        const uri = thumbhashToDataUri(image.thumbhash);
        return uri ? { uri } : undefined;
    }, [image?.thumbhash]);

    const { uri, error } = useAttachmentImage(sessionId ?? '', sessionId ? ref : undefined);

    // Pick display dimensions. Real w/h drives the aspect ratio when present,
    // but a missing image{} block (older messages, iOS picker that didn't
    // report dimensions) shouldn't downgrade to a compact filename row —
    // the user attached an image, render it inline. Default to 4:3 at the
    // bubble's max width; expo-image's contentFit="cover" handles the
    // mismatch once the real image arrives.
    const aspect = image && image.width > 0 && image.height > 0
        ? image.width / image.height
        : DEFAULT_ASPECT;
    let displayW = Math.min(image?.width && image.width > 0 ? image.width : MAX_IMAGE_WIDTH, MAX_IMAGE_WIDTH);
    let displayH = displayW / aspect;
    if (displayH > MAX_IMAGE_HEIGHT) {
        displayH = MAX_IMAGE_HEIGHT;
        displayW = displayH * aspect;
    }

    return (
        <View style={styles.inlineContainer}>
            <Pressable
                disabled={!uri}
                onPress={() => setPreviewVisible(true)}
                style={({ pressed }) => [
                    styles.inlineWrapper,
                    { borderColor: theme.colors.divider, backgroundColor: theme.colors.surfaceHighest },
                    pressed && uri ? styles.inlineWrapperPressed : null,
                ]}
            >
                <Image
                    source={uri ? { uri } : undefined}
                    placeholder={placeholder}
                    style={[{ width: displayW, height: displayH }, styles.inlineImage]}
                    contentFit="contain"
                    transition={150}
                />
                {error && !uri && (
                    <View style={[styles.errorOverlay, { backgroundColor: theme.colors.surfaceHigh }]}>
                        <Ionicons name="alert-circle-outline" size={20} color={theme.colors.textSecondary} />
                    </View>
                )}
            </Pressable>
            <RNModal
                visible={previewVisible && !!uri}
                transparent
                animationType="fade"
                onRequestClose={() => setPreviewVisible(false)}
            >
                <View style={styles.previewRoot}>
                    <Pressable
                        style={styles.previewBackdrop}
                        onPress={() => setPreviewVisible(false)}
                    >
                        <Image
                            source={uri ? { uri } : undefined}
                            placeholder={placeholder}
                            style={[
                                styles.previewImage,
                                {
                                    width: viewportWidth,
                                    height: viewportHeight,
                                },
                            ]}
                            contentFit="contain"
                            transition={150}
                        />
                    </Pressable>
                    <Pressable
                        onPress={() => setPreviewVisible(false)}
                        hitSlop={12}
                        style={styles.previewCloseButton}
                    >
                        <Ionicons name="close" size={22} color="#fff" />
                    </Pressable>
                </View>
            </RNModal>
        </View>
    );
});

const styles = StyleSheet.create(() => ({
    inlineContainer: {
        width: '100%',
        paddingLeft: 16,
        paddingRight: 8,
        paddingTop: 2,
        paddingBottom: 12,
        alignItems: 'flex-end',
    },
    inlineWrapper: {
        borderRadius: BORDER_RADIUS,
        borderWidth: 1,
        overflow: 'hidden',
        alignSelf: 'flex-end',
        position: 'relative',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOpacity: 0.08,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
            },
            android: {
                elevation: 2,
            },
            default: {},
        }),
    },
    inlineWrapperPressed: {
        opacity: 0.86,
    },
    inlineImage: {
        borderRadius: BORDER_RADIUS,
    },
    errorOverlay: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    previewRoot: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.94)',
    },
    previewBackdrop: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    previewImage: {
        flexShrink: 0,
    },
    previewCloseButton: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 54 : 28,
        right: 18,
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.18)',
    },
}));
