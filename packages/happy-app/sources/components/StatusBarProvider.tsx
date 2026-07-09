import React from 'react';
import { Platform, StatusBar } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';


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
        }
    }, [barStyle, backgroundColor]);

    return (
        <StatusBar
            animated={true}
            barStyle={barStyle}
            backgroundColor={backgroundColor}
            translucent={false}
        />
    );
});
