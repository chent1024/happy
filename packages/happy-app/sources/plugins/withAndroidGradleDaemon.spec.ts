import { describe, expect, it } from 'vitest';

const {
    upsertGradleProperty,
} = require('../../plugins/withAndroidGradleDaemon');

describe('withAndroidGradleDaemon', () => {
    it('adds the ten-minute daemon idle timeout to generated Gradle properties', () => {
        const properties: any[] = [];

        upsertGradleProperty(properties, 'org.gradle.daemon.idletimeout', '600000');

        expect(properties).toEqual([
            {
                type: 'property',
                key: 'org.gradle.daemon.idletimeout',
                value: '600000',
            },
        ]);
    });

    it('updates an existing timeout without creating duplicate properties', () => {
        const properties = [
            {
                type: 'property',
                key: 'org.gradle.daemon.idletimeout',
                value: '10800000',
            },
        ];

        upsertGradleProperty(properties, 'org.gradle.daemon.idletimeout', '600000');

        expect(properties).toHaveLength(1);
        expect(properties[0].value).toBe('600000');
    });
});
