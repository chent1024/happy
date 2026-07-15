import React from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { Text } from '@/components/StyledText';
import { usePathname } from 'expo-router';
import { SessionListViewItem, SessionRowData, useSessionListViewData } from '@/sync/storage';
import { ActiveSessionsGroupCompact } from './ActiveSessionsGroupCompact';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Typography } from '@/constants/Typography';
import { StyleSheet } from 'react-native-unistyles';
import { useIsTablet } from '@/utils/responsive';
import { requestReview } from '@/utils/requestReview';
import { UpdateBanner } from './UpdateBanner';
import { layout } from './layout';
import { t } from '@/text';
import { useCodexSessionListRefresh } from '@/hooks/useCodexSessionListRefresh';
import { CodexSessionListRefreshStatus } from '@/hooks/codexSessionListRefresh';
import { Ionicons } from '@expo/vector-icons';
import { useUnistyles } from 'react-native-unistyles';

type SessionsListDisplayItem =
    | { type: 'section-header'; section: 'projects' }
    | { type: 'projects'; sessions: SessionRowData[] };

interface SessionsListDisplayData {
    items: SessionsListDisplayItem[];
}

function buildDisplayData(data: SessionListViewItem[]): SessionsListDisplayData {
    const projectSessions: SessionRowData[] = [];

    for (const item of data) {
        if (item.type === 'active-sessions') {
            for (const session of item.sessions) {
                projectSessions.push(session);
            }
        }
    }

    const displayItems: SessionsListDisplayItem[] = [];

    if (projectSessions.length > 0) {
        displayItems.push({ type: 'section-header', section: 'projects' });
        displayItems.push({ type: 'projects', sessions: projectSessions });
    }

    return { items: displayItems };
}

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'stretch',
        backgroundColor: theme.colors.groupped.background,
    },
    contentContainer: {
        flex: 1,
        maxWidth: layout.maxWidth,
    },
    projectList: {
        flex: 1,
    },
    headerSection: {
        backgroundColor: theme.colors.groupped.background,
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 8,
    },
    headerText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.groupped.sectionTitle,
        letterSpacing: 0.1,
        ...Typography.default('semiBold'),
    },
    refreshStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: 16,
        marginTop: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
    },
    refreshStatusText: {
        flex: 1,
        fontSize: 13,
        ...Typography.default(),
    },
}));

function getRefreshStatusText(status: CodexSessionListRefreshStatus): string {
    switch (status.type) {
        case 'changed':
            return `${t('codex.sync.resultTitle')}: ${t('codex.sync.imported')} ${status.imported} · ${t('codex.sync.updated')} ${status.refreshed} · ${t('codex.sync.archived')} ${status.archived}`;
        case 'unchanged':
            return t('codex.sync.unchangedSummary');
        case 'partial':
            return t('codex.sync.partialFailed', { failed: status.failed, machines: status.machines });
        case 'error':
            return t('codex.sync.failed');
    }
}

interface SessionsListProps {
    activeSessionsCollapsed?: boolean;
    emptyComponent?: React.ReactElement;
}

export function SessionsList({ activeSessionsCollapsed = false, emptyComponent }: SessionsListProps) {
    const styles = stylesheet;
    const safeArea = useSafeAreaInsets();
    const data = useSessionListViewData();
    const pathname = usePathname();
    const isTablet = useIsTablet();
    const { theme } = useUnistyles();
    const { isRefreshing, refreshStatus, refresh } = useCodexSessionListRefresh();
    // Selection is derived once from pathname so the data array stays stable
    // across navigations. This keeps FlatList virtualization intact: only
    // the previously- and newly-selected rows re-render, instead of the
    // whole visible window.
    const selectedSessionId = React.useMemo<string | undefined>(() => {
        if (!isTablet) return undefined;
        if (!pathname.startsWith('/session/')) return undefined;
        return pathname.split('/')[2];
    }, [isTablet, pathname]);

    // Request review
    React.useEffect(() => {
        if (data && data.length > 0) {
            requestReview();
        }
    }, [data && data.length > 0]);

    const displayData = React.useMemo<SessionsListDisplayData>(
        () => data ? buildDisplayData(data) : { items: [] },
        [data],
    );

    const keyExtractor = React.useCallback((item: SessionsListDisplayItem, index: number) => {
        switch (item.type) {
            case 'section-header': return `section-header-${item.section}-${index}`;
            case 'projects': return 'projects';
        }
    }, []);

    const renderItem = React.useCallback(({ item }: { item: SessionsListDisplayItem }) => {
        switch (item.type) {
            case 'section-header':
                return (
                    <View style={styles.headerSection}>
                        <Text style={styles.headerText}>
                            {t('sessionList.projects')}
                        </Text>
                    </View>
                );

            case 'projects':
                return (
                    <ActiveSessionsGroupCompact
                        sessions={item.sessions}
                        selectedSessionId={selectedSessionId}
                        collapsed={activeSessionsCollapsed}
                    />
                );
        }
    }, [selectedSessionId, activeSessionsCollapsed]);


    const HeaderComponent = React.useCallback(() => {
        const isFailure = refreshStatus?.type === 'error';
        const isPartial = refreshStatus?.type === 'partial';
        const color = isFailure
            ? theme.colors.textDestructive
            : isPartial
                ? theme.colors.warning
                : theme.colors.success;
        return (
            <>
                <UpdateBanner />
                {refreshStatus && (
                    <View
                        style={[styles.refreshStatus, { backgroundColor: `${color}18` }]}
                        accessible
                        accessibilityRole="alert"
                        accessibilityLiveRegion="polite"
                    >
                        <Ionicons
                            name={isFailure ? 'alert-circle' : isPartial ? 'warning' : 'checkmark-circle'}
                            size={18}
                            color={color}
                        />
                        <Text style={[styles.refreshStatusText, { color }]}>
                            {getRefreshStatusText(refreshStatus)}
                        </Text>
                    </View>
                )}
            </>
        );
    }, [refreshStatus, styles.refreshStatus, styles.refreshStatusText, theme.colors]);

    // Early return if no data yet — placed AFTER all hooks so the hook order is
    // identical on every render (Rules of Hooks). Returning before the
    // useCallback hooks above would change the hook count when `data` flips from
    // null to a populated array on a mounted instance ("Rendered more hooks than
    // during the previous render").
    if (!data) {
        return (
            <View style={styles.container} />
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.contentContainer}>
                <FlatList
                    style={styles.projectList}
                    data={displayData.items}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    extraData={`${selectedSessionId ?? ''}:${activeSessionsCollapsed ? 'collapsed' : 'expanded'}`}
                    contentContainerStyle={{
                        flexGrow: 1,
                        paddingBottom: safeArea.bottom + 24,
                        maxWidth: layout.maxWidth,
                    }}
                    ListHeaderComponent={HeaderComponent}
                    ListEmptyComponent={emptyComponent}
                    refreshControl={(
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={refresh}
                        />
                    )}
                    windowSize={5}
                    maxToRenderPerBatch={8}
                    initialNumToRender={10}
                />
            </View>
        </View>
    );
}
