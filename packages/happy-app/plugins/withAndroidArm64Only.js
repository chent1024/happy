const { withGradleProperties } = require('@expo/config-plugins');

const ANDROID_ARCHITECTURES_PROPERTY = 'reactNativeArchitectures';
const ANDROID_ARM64_ARCHITECTURE = 'arm64-v8a';

const withAndroidArm64Only = (config) => {
  return withGradleProperties(config, (gradleConfig) => {
    const existingProperty = gradleConfig.modResults.find(
      (property) =>
        property.type === 'property' &&
        property.key === ANDROID_ARCHITECTURES_PROPERTY
    );

    if (existingProperty) {
      existingProperty.value = ANDROID_ARM64_ARCHITECTURE;
    } else {
      gradleConfig.modResults.push({
        type: 'property',
        key: ANDROID_ARCHITECTURES_PROPERTY,
        value: ANDROID_ARM64_ARCHITECTURE,
      });
    }

    return gradleConfig;
  });
};

module.exports = withAndroidArm64Only;
