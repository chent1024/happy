import * as React from 'react';
import { View, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';

const webStyle: any = {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    overflow: 'auto',
};

export const MermaidRenderer = React.memo((props: {
    content: string;
}) => {
    const [hasError, setHasError] = React.useState(false);
    const [svgContent, setSvgContent] = React.useState<string | null>(null);

    React.useEffect(() => {
        let isMounted = true;
        setHasError(false);
        setSvgContent(null);

        const renderMermaid = async () => {
            try {
                const mermaidModule: any = await import('mermaid');
                const mermaid = mermaidModule.default || mermaidModule;

                if (mermaid.initialize) {
                    mermaid.initialize({
                        startOnLoad: false,
                        theme: 'dark',
                    });
                }

                if (mermaid.render) {
                    const { svg } = await mermaid.render(
                        `mermaid-${Date.now()}`,
                        props.content
                    );

                    if (isMounted) {
                        setSvgContent(svg);
                    }
                }
            } catch (error) {
                if (isMounted) {
                    console.warn(`[Mermaid] ${t('markdown.mermaidRenderFailed')}: ${error instanceof Error ? error.message : String(error)}`);
                    setHasError(true);
                }
            }
        };

        void renderMermaid();

        return () => {
            isMounted = false;
        };
    }, [props.content]);

    if (hasError) {
        return (
            <View style={[style.container, style.errorContainer]}>
                <View style={style.errorContent}>
                    <Text style={style.errorText}>Mermaid diagram syntax error</Text>
                    <View style={style.codeBlock}>
                        <Text style={style.codeText}>{props.content}</Text>
                    </View>
                </View>
            </View>
        );
    }

    if (!svgContent) {
        return (
            <View style={[style.container, style.loadingContainer]}>
                <View style={style.loadingPlaceholder} />
            </View>
        );
    }

    return (
        <View style={style.container}>
            {/* @ts-ignore - Web only */}
            <div
                style={webStyle}
                dangerouslySetInnerHTML={{ __html: svgContent }}
            />
        </View>
    );
});

const style = StyleSheet.create((theme) => ({
    container: {
        marginVertical: 8,
        width: '100%',
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
    errorContainer: {
        backgroundColor: theme.colors.surfaceHighest,
        borderRadius: 8,
        padding: 16,
    },
    errorContent: {
        flexDirection: 'column',
        gap: 12,
    },
    errorText: {
        ...Typography.default('semiBold'),
        color: theme.colors.text,
        fontSize: 16,
    },
    codeBlock: {
        backgroundColor: theme.colors.surfaceHigh,
        borderRadius: 4,
        padding: 12,
    },
    codeText: {
        ...Typography.mono(),
        color: theme.colors.text,
        fontSize: 14,
        lineHeight: 20,
    },
}));
