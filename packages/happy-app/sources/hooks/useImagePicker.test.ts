import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    platform: { OS: 'ios' },
    requestMediaLibraryPermissionsAsync: vi.fn(),
    launchImageLibraryAsync: vi.fn(),
    manipulateAsync: vi.fn(),
    generateThumbhash: vi.fn(),
}));

vi.mock('react-native', () => ({
    Platform: mocks.platform,
}));

vi.mock('expo-image-picker', () => ({
    requestMediaLibraryPermissionsAsync: mocks.requestMediaLibraryPermissionsAsync,
    launchImageLibraryAsync: mocks.launchImageLibraryAsync,
}));

vi.mock('expo-image-manipulator', () => ({
    SaveFormat: { JPEG: 'jpeg' },
    manipulateAsync: mocks.manipulateAsync,
}));

vi.mock('@/modal', () => ({
    Modal: { alert: vi.fn() },
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('@/utils/thumbhash', () => ({
    generateThumbhash: mocks.generateThumbhash,
}));

import { normalizePickedAssetForUpload, requestImagePickerPermission } from './useImagePicker';
import { Modal } from '@/modal';

describe('normalizePickedAssetForUpload', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.platform.OS = 'ios';
    });

    it('normalizes iOS image picker assets to JPEG before upload', async () => {
        mocks.manipulateAsync.mockResolvedValue({
            uri: 'file:///tmp/ImageManipulator/IMG_9824.jpg',
            width: 4032,
            height: 3024,
        });

        const normalized = await normalizePickedAssetForUpload({
            uri: 'file:///tmp/IMG_9824.HEIC',
            width: 4032,
            height: 3024,
            fileName: 'IMG_9824.HEIC',
            fileSize: 2_701_533,
        });

        expect(mocks.manipulateAsync).toHaveBeenCalledWith(
            'file:///tmp/IMG_9824.HEIC',
            [],
            { compress: expect.any(Number), format: 'jpeg' },
        );
        expect(normalized).toEqual({
            uri: 'file:///tmp/ImageManipulator/IMG_9824.jpg',
            mimeType: 'image/jpeg',
            name: 'IMG_9824.jpg',
            width: 4032,
            height: 3024,
        });
    });
});

describe('requestImagePickerPermission', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.platform.OS = 'ios';
    });

    it('requests photo library permission on iOS', async () => {
        mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });

        await expect(requestImagePickerPermission('ios')).resolves.toBe(true);

        expect(mocks.requestMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
        expect(Modal.alert).not.toHaveBeenCalled();
    });

    it('shows the permission hint when iOS photo access is denied', async () => {
        mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'denied' });

        await expect(requestImagePickerPermission('ios')).resolves.toBe(false);

        expect(mocks.requestMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
        expect(Modal.alert).toHaveBeenCalledWith(
            'imageUpload.permissionTitle',
            'imageUpload.permissionMessage',
            [{ text: 'common.ok' }],
        );
    });

    it('does not request media permissions on Android because the app uses the system picker', async () => {
        await expect(requestImagePickerPermission('android')).resolves.toBe(true);

        expect(mocks.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
        expect(Modal.alert).not.toHaveBeenCalled();
    });
});
