import * as React from 'react';
import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Modal } from '@/modal';
import { t } from '@/text';

type QrScannerModalProps = {
    onClose: () => void;
    onScanned: (data: string) => boolean | Promise<boolean>;
};

export function QrScannerModal({ onClose, onScanned }: QrScannerModalProps) {
    const [isProcessing, setIsProcessing] = React.useState(false);

    const handleBarcodeScanned = React.useCallback(async (result: BarcodeScanningResult) => {
        if (isProcessing) return;

        setIsProcessing(true);
        try {
            const shouldClose = await onScanned(result.data);
            if (shouldClose) {
                onClose();
            } else {
                setIsProcessing(false);
            }
        } catch (error) {
            console.error('Failed to process QR code', error);
            Modal.alert(t('common.error'), t('modals.invalidAuthUrl'), [{ text: t('common.ok') }]);
            setIsProcessing(false);
        }
    }, [isProcessing, onClose, onScanned]);

    const handleMountError = React.useCallback((event: { message: string }) => {
        console.warn('Failed to mount QR scanner camera', event);
        onClose();
        Modal.alert(t('common.error'), event.message || 'Failed to open camera scanner.', [{ text: t('common.ok') }]);
    }, [onClose]);

    return (
        <View style={styles.container}>
            <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={isProcessing ? undefined : handleBarcodeScanned}
                onMountError={handleMountError}
            />
            <View pointerEvents="none" style={styles.overlay}>
                <View style={styles.scanFrame} />
                <Text style={styles.hint}>{t('settings.scanQrCodeToAuthenticate')}</Text>
            </View>
            <Pressable style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: 320,
        height: 440,
        overflow: 'hidden',
        borderRadius: 16,
        backgroundColor: '#000',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    scanFrame: {
        width: 220,
        height: 220,
        borderWidth: 3,
        borderColor: '#fff',
        borderRadius: 18,
        backgroundColor: 'transparent',
    },
    hint: {
        marginTop: 20,
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
    },
    cancelButton: {
        position: 'absolute',
        right: 16,
        bottom: 16,
        minWidth: 88,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 22,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
    },
    cancelText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});
