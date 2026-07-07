import React from 'react';
import { View, Pressable, FlatList, Platform } from 'react-native';
import { Text } from '@/components/StyledText';
import { usePathname } from 'expo-router';
import { SessionListViewItem, SessionRowData, useSessionListViewData } from '@/sync/storage';
import { type SessionState } from '@/utils/sessionUtils';
import { ActiveSessionsGroupCompact } from './ActiveSessionsGroupCompact';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Typography } from '@/constants/Typography';
import { StatusDot } from './StatusDot';
import { StyleSheet } from 'react-native-unistyles';
import { useIsTablet } from '@/utils/responsive';
import { requestReview } from '@/utils/requestReview';
import { UpdateBanner } from './UpdateBanner';
import { layout } from './layout';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { SessionActionsAnchor, SessionActionsPopover } from './SessionActionsPopover';
import { useSessionActionAlert } from '@/hooks/useSessionQuickActions';
import { formatShortRelativeTime } from '@/utils/shortRelativeTime';
import { getSessionProjectGroupPath } from '@/sync/sessionListVisibility';
import { t } from '@/text';

const RECENT_SESSION_COUNT = 6;

type SessionsListDisplayItem =
    | { type: 'section-header'; section: 'recent' | 'projects' }
    | { type: 'recent-sessions'; sessions: SessionRowData[] }
    | { type: 'projects'; sessions: SessionRowData[] };

function sessionSubtitle(session: SessionRowData): string {
    if (!session.path) {
        return session.subtitle;
    }
    const projectPath = getSessionProjectGroupPath(session);
    return projectPath.split(/[/\\]/).filter(Boolean).pop() || session.subtitle;
}

function buildDisplayData(data: SessionListViewItem[]): SessionsListDisplayItem[] {
    const sessionsById = new Map<string, SessionRowData>();
    const projectSessions: SessionRowData[] = [];

    for (const item of data) {
        if (item.type === 'active-sessions') {
            for (const session of item.sessions) {
                sessionsById.set(session.id, session);
                projectSessions.push(session);
            }
        } else if (item.type === 'session') {
            sessionsById.set(item.session.id, item.session);
        }
    }

    const recentSessions = Array.from(sessionsById.values())
        .sort((a, b) => b.recencyAt - a.recencyAt)
        .slice(0, RECENT_SESSION_COUNT);

    const displayData: SessionsListDisplayItem[] = [];
    if (recentSessions.length > 0) {
        displayData.push({ type: 'section-header', section: 'recent' });
        displayData.push({ type: 'recent-sessions', sessions: recentSessions });
    }

    if (projectSessions.length > 0) {
        displayData.push({ type: 'section-header', section: 'projects' });
        displayData.push({ type: 'projects', sessions: projectSessions });
    }

    return displayData;
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
    recentList: {
        marginHorizontal: 16,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    recentSessionRow: {
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        backgroundColor: theme.colors.surface,
    },
    recentSessionRowWithBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
    },
    recentSessionRowSelected: {
        backgroundColor: theme.colors.surfaceSelected,
    },
    recentStatusSlot: {
        width: 12,
        alignItems: 'center',
        marginRight: 10,
    },
    recentSessionContent: {
        flex: 1,
        minWidth: 0,
        paddingVertical: 8,
    },
    recentSessionTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    recentSessionTitle: {
        flex: 1,
        fontSize: 15,
        lineHeight: 20,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    recentSessionTime: {
        marginLeft: 10,
        fontSize: 12,
        lineHeight: 16,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    recentSessionSubtitle: {
        marginTop: 1,
        fontSize: 12,
        lineHeight: 16,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
}));

interface SessionsListProps {
    activeSessionsCollapsed?: boolean;
}

export function SessionsList({ activeSessionsCollapsed = false }: SessionsListProps) {
    const styles = stylesheet;
    const safeArea = useSafeAreaInsets();
    const data = useSessionListViewData();
    const pathname = usePathname();
    const isTablet = useIsTablet();
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

    const displayData = React.useMemo(() => data ? buildDisplayData(data) : [], [data]);

    const keyExtractor = React.useCallback((item: SessionsListDisplayItem, index: number) => {
        switch (item.type) {
            case 'section-header': return `section-header-${item.section}-${index}`;
            case 'recent-sessions': return 'recent-sessions';
            case 'projects': return 'projects';
        }
    }, []);

    const renderItem = React.useCallback(({ item, index }: { item: SessionsListDisplayItem, index: number }) => {
        switch (item.type) {
            case 'section-header':
                return (
                    <View style={styles.headerSection}>
                        <Text style={styles.headerText}>
                            {item.section === 'recent' ? t('sessionList.recent') : t('sessionList.projects')}
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

            case 'recent-sessions':
                return (
                    <View style={styles.recentList}>
                        {item.sessions.map((session, sessionIndex) => (
                            <RecentSessionRow
                                key={session.id}
                                session={session}
                                selected={session.id === selectedSessionId}
                                showBorder={sessionIndex < item.sessions.length - 1}
                            />
                        ))}
                    </View>
                );
        }
    }, [selectedSessionId, activeSessionsCollapsed]);


    // Remove this section as we'll use FlatList for all items now


    const HeaderComponent = React.useCallback(() => {
        return (
            <UpdateBanner />
        );
    }, []);

    // Footer removed - all sessions now shown inline

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
                    data={displayData}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    extraData={`${selectedSessionId ?? ''}:${activeSessionsCollapsed ? 'collapsed' : 'expanded'}`}
                    contentContainerStyle={{ paddingBottom: safeArea.bottom + 128, maxWidth: layout.maxWidth }}
                    ListHeaderComponent={HeaderComponent}
                    windowSize={5}
                    maxToRenderPerBatch={8}
                    initialNumToRender={10}
                />
            </View>
        </View>
    );
}

const STATUS_CONFIG: Record<SessionState, { color: string; dotColor: string; isPulsing: boolean; isConnected: boolean }> = {
    disconnected: { color: '#999', dotColor: '#999', isPulsing: false, isConnected: false },
    thinking: { color: '#007AFF', dotColor: '#007AFF', isPulsing: true, isConnected: true },
    waiting: { color: '#34C759', dotColor: '#34C759', isPulsing: false, isConnected: true },
    permission_required: { color: '#FF9500', dotColor: '#FF9500', isPulsing: true, isConnected: true },
};

const RecentSessionRow = React.memo(({ session, selected, showBorder }: {
    session: SessionRowData;
    selected?: boolean;
    showBorder?: boolean;
}) => {
    const styles = stylesheet;
    const navigateToSession = useNavigateToSession();
    const [actionsAnchor, setActionsAnchor] = React.useState<SessionActionsAnchor | null>(null);
    const baseStatus = STATUS_CONFIG[session.state];
    // Override to solid blue when session has unread results
    const status = session.hasUnread
        ? { ...baseStatus, color: '#007AFF', dotColor: '#007AFF', isPulsing: false, isConnected: baseStatus.isConnected }
        : baseStatus;
    const shortTimeText = formatShortRelativeTime(session.recencyAt);
    const subtitle = sessionSubtitle(session);

    const handlePress = React.useCallback(() => {
        navigateToSession(session.id);
    }, [navigateToSession, session.id]);

    const handleContextMenu = React.useCallback((event: any) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        setActionsAnchor({
            type: 'point',
            x: event.nativeEvent.clientX ?? event.nativeEvent.pageX ?? 0,
            y: event.nativeEvent.clientY ?? event.nativeEvent.pageY ?? 0,
        });
    }, []);

    const showActionAlert = useSessionActionAlert(session.id);
    const menuProps = Platform.OS === 'web' ? {
        onContextMenu: handleContextMenu,
    } as any : {
        onLongPress: showActionAlert,
    };

    return (
        <>
            <Pressable
                style={[
                    styles.recentSessionRow,
                    showBorder && styles.recentSessionRowWithBorder,
                    selected && styles.recentSessionRowSelected,
                ]}
                onPress={handlePress}
                {...menuProps}
            >
                <View style={styles.recentStatusSlot}>
                    <StatusDot color={status.dotColor} isPulsing={status.isPulsing} size={7} />
                </View>
                <View style={styles.recentSessionContent}>
                    <View style={styles.recentSessionTopRow}>
                        <Text style={styles.recentSessionTitle} numberOfLines={1}>
                            {session.name}
                        </Text>
                        <Text style={styles.recentSessionTime} numberOfLines={1}>
                            {shortTimeText}
                        </Text>
                    </View>
                    <Text style={styles.recentSessionSubtitle} numberOfLines={1}>
                        {subtitle}
                    </Text>
                </View>
            </Pressable>
            {Platform.OS === 'web' && (
                <SessionActionsPopover
                    anchor={actionsAnchor}
                    onClose={() => setActionsAnchor(null)}
                    sessionId={session.id}
                    visible={!!actionsAnchor}
                />
            )}
        </>
    );
});
