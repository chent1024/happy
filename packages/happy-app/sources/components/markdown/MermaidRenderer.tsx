import * as React from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

export const MermaidRenderer = React.memo((props: {
    content: string;
}) => {
    const { theme } = useUnistyles();
    const [dimensions, setDimensions] = React.useState({ width: 0, height: 200 });

    const onLayout = React.useCallback((event: any) => {
        const { width } = event.nativeEvent.layout;
        setDimensions(prev => ({ ...prev, width }));
    }, []);

    // Pass mermaid content via JSON to prevent XSS from HTML interpolation
    const mermaidContent = JSON.stringify(props.content);
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
            <style>
                body {
                    margin: 0;
                    padding: 16px;
                    background-color: ${theme.colors.surfaceHighest};
                }
                #mermaid-container {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    width: 100%;
                }
                #mermaid-container svg {
                    max-width: 100%;
                    height: auto;
                }
                .error {
                    color: #ff6b6b;
                    font-family: monospace;
                    white-space: pre-wrap;
                }
            </style>
        </head>
        <body>
            <div id="mermaid-container"></div>
            <script>
                (async function() {
                    const content = ${mermaidContent};
                    const container = document.getElementById('mermaid-container');
                    
                    try {
                        mermaid.initialize({
                            startOnLoad: false,
                            theme: 'dark'
                        });
                        
                        const { svg } = await mermaid.render('mermaid-diagram', content);
                        container.innerHTML = svg;
                    } catch (error) {
                        container.innerHTML = '<div class="error">Diagram error: ' + 
                            (error.message || String(error)).replace(/</g, '&lt;').replace(/>/g, '&gt;') + 
                            '</div>';
                    }
                })();
            </script>
        </body>
        </html>
    `;

    return (
        <View style={style.container} onLayout={onLayout}>
            <View style={[style.innerContainer, { height: dimensions.height }]}>
                <WebView
                    source={{ html }}
                    style={{ flex: 1 }}
                    scrollEnabled={false}
                    onMessage={(event) => {
                        const data = JSON.parse(event.nativeEvent.data);
                        if (data.type === 'dimensions') {
                            setDimensions(prev => ({
                                ...prev,
                                height: Math.max(prev.height, data.height)
                            }));
                        }
                    }}
                />
            </View>
        </View>
    );
});

const style = StyleSheet.create((theme) => ({
    container: {
        marginVertical: 8,
        width: '100%',
    },
    innerContainer: {
        width: '100%',
        backgroundColor: theme.colors.surfaceHighest,
        borderRadius: 8,
    },
    loadingContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        height: 100,
    },
    loadingPlaceholder: {
        width: 200,
        height: 20,
        backgroundColor: theme.colors.divider,
        borderRadius: 4,
    },
}));
