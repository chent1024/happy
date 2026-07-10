import React from 'react';
import { NativeModules, Platform, StatusBar } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

type HappySystemBarModule = {
    setDarkIcons: (enabled: boolean) => void;
};

const happySystemBar = NativeModules.HappySystemBar as HappySystemBarModule | undefined;

export const StatusBarProvider = React.memo(() => {
    const { theme } = useUnistyles();
    const barStyle = theme.dark ? 'light-content' : 'dark-content';
    const backgroundColor = theme.colors.groupped.background;

    React.useEffect(() => {
        if (Platform.OS === 'web') {
            return;
        }

        StatusBar.setBarStyle(barStyle, true);
        if (Platform.OS === 'android') {
            StatusBar.setBackgroundColor(backgroundColor, true);
            StatusBar.setTranslucent(false);
            happySystemBar?.setDarkIcons(!theme.dark);
        }
    }, [barStyle, backgroundColor, theme.dark]);

    return (
        <StatusBar
            animated={true}
            barStyle={barStyle}
            backgroundColor={backgroundColor}
            translucent={false}
        />
    );
});
