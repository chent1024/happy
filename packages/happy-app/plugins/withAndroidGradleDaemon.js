const { withGradleProperties } = require('@expo/config-plugins');

const GRADLE_DAEMON_IDLE_TIMEOUT_PROPERTY = 'org.gradle.daemon.idletimeout';
const TEN_MINUTES_MS = '600000';

const upsertGradleProperty = (properties, key, value) => {
    const existingProperty = properties.find(
        (property) => property.type === 'property' && property.key === key
    );

    if (existingProperty) {
        existingProperty.value = value;
        return;
    }

    properties.push({
        type: 'property',
        key,
        value,
    });
};

const withAndroidGradleDaemon = (config) => {
    return withGradleProperties(config, (gradleConfig) => {
        upsertGradleProperty(
            gradleConfig.modResults,
            GRADLE_DAEMON_IDLE_TIMEOUT_PROPERTY,
            TEN_MINUTES_MS
        );

        return gradleConfig;
    });
};

module.exports = withAndroidGradleDaemon;
module.exports.upsertGradleProperty = upsertGradleProperty;
