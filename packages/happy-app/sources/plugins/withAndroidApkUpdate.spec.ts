import { describe, expect, it } from 'vitest';

const { ensureProvider } = require('../../plugins/withAndroidApkUpdate');

describe('withAndroidApkUpdate', () => {
    it('replaces a stale Happy update provider when prebuild switches Android variants', () => {
        const application: any = {
            provider: [
                {
                    $: {
                        'android:name': 'androidx.core.content.FileProvider',
                        'android:authorities': 'com.slopus.happy.dev.apkupdate.fileprovider',
                    },
                },
                {
                    $: {
                        'android:name': 'androidx.core.content.FileProvider',
                        'android:authorities': 'com.ex3ndr.happy.other.fileprovider',
                    },
                },
            ],
        };

        ensureProvider(application, 'com.ex3ndr.happy');
        ensureProvider(application, 'com.ex3ndr.happy');

        expect(application.provider.map((provider: any) => provider.$['android:authorities'])).toEqual([
            'com.ex3ndr.happy.other.fileprovider',
            'com.ex3ndr.happy.apkupdate.fileprovider',
        ]);
    });
});
