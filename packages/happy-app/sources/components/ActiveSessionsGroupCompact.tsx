import React from 'react';
import { View, Pressable, Platform, ScrollView, type GestureResponderEvent } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Text } from '@/components/StyledText';
import { Machine } from '@/sync/storageTypes';
import { SessionRowData } from '@/sync/storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { type SessionState, formatPathRelativeToHome, formatLastSeen } from '@/utils/sessionUtils';
import { Typography } from '@/constants/Typography';
import { StatusDot } from './StatusDot';
import { useAllMachines, useSessionGitStatus } from '@/sync/storage';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { useHappyAction } from '@/hooks/useHappyAction';
import { HappyError } from '@/utils/errors';
import { SessionActionsAnchor, SessionActionsPopover } from './SessionActionsPopover';
import { useSessionActionAlert } from '@/hooks/useSessionQuickActions';
import { sessionArchiveWithStop } from '@/sync/ops';
import { getSessionProjectGroupPath } from '@/sync/sessionListVisibility';
import { isWorktreePath, getRepoPath, getWorktreeName } from '@/utils/worktree';
import { useNewSessionDraft } from '@/hooks/useNewSessionDraft';
import { useRouter } from 'expo-router';
import { compareSessionsByRecency, getSessionRecencyTime } from '@/utils/sessionRecency';
import { formatShortRelativeTime } from '@/utils/shortRelativeTime';

const STATUS_CONFIG: Record<SessionState, { color: string; dotColor: string; isPulsing: boolean; isConnected: boolean }> = {
    disconnected: { color: '#999', dotColor: '#999', isPulsing: false, isConnected: false },
    thinking: { color: '#007AFF', dotColor: '#007AFF', isPulsing: true, isConnected: true },
    waiting: { color: '#34C759', dotColor: '#34C759', isPulsing: false, isConnected: true },
    permission_required: { color: '#FF9500', dotColor: '#FF9500', isPulsing: true, isConnected: true },
};

const PROJECT_VISIBLE_SESSION_COUNT = 3;
const PROJECT_SESSION_ROW_HEIGHT = 52;

interface ActiveSessionsGroupProps {
    sessions: SessionRowData[];
    selectedSessionId?: string;
    collapsed?: boolean;
}

/**
 * Hook to get git display info for a section header:
 * branch name, line changes, and worktree status.
 */
function useSectionGitInfo(sessionId: string) {
    const gitStatus = useSessionGitStatus(sessionId);

    return React.useMemo(() => {
        if (!gitStatus || gitStatus.lastUpdatedAt === 0) {
            return { branch: null, linesAdded: 0, linesRemoved: 0, hasChanges: false };
        }
        return {
            branch: gitStatus.branch,
            linesAdded: gitStatus.unstagedLinesAdded,
            linesRemoved: gitStatus.unstagedLinesRemoved,
            hasChanges: gitStatus.unstagedLinesAdded > 0 || gitStatus.unstagedLinesRemoved > 0,
        };
    }, [gitStatus]);
}

function getProjectInitial(name: string) {
    const match = name.trim().match(/[A-Za-z0-9]/u);
    return match ? match[0].toLocaleUpperCase() : '?';
}

const ProjectInitialAvatar = React.memo(({ name, size }: { name: string; size: number }) => {
    const styles = stylesheet;
    const initial = React.useMemo(() => getProjectInitial(name), [name]);

    return (
        <View style={[styles.projectInitialAvatar, { width: size, height: size, borderRadius: size / 2 }]}>
            <Text style={styles.projectInitialText} numberOfLines={1}>
                {initial}
            </Text>
        </View>
    );
});

// Section header: avatar | path + branch + tree icon + line changes | + button
const SectionHeader = React.memo(({
    session,
    projectPath,
    displayPath,
    onToggle,
}: {
    session: SessionRowData;
    projectPath: string;
    displayPath: string;
    onToggle: () => void;
}) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const router = useRouter();
    const draft = useNewSessionDraft();

    const isWorktree = isWorktreePath(projectPath);
    const repoPath = isWorktree ? getRepoPath(projectPath) : projectPath;
    const repoDisplayPath = isWorktree
        ? formatPathRelativeToHome(repoPath, session.homeDir ?? undefined)
        : displayPath;
    const repoFolderName = repoPath.split(/[/\\]/).filter(Boolean).pop() || repoDisplayPath;
    const worktreeName = isWorktree ? getWorktreeName(projectPath) : null;

    const gitInfo = useSectionGitInfo(session.id);
    const branchName = worktreeName || gitInfo.branch;
    const hasBranch = !!branchName;

    const handleAdd = React.useCallback((event: GestureResponderEvent) => {
        event.stopPropagation();
        const machineId = session.machineId;
        if (machineId) {
            draft.setMachineId(machineId);
        }
        const pathToSet = formatPathRelativeToHome(repoPath, session.homeDir ?? undefined);
        draft.setPath(pathToSet);
        draft.setSessionType(isWorktree ? 'worktree' : 'simple');
        draft.setWorktreeKey(isWorktree ? projectPath : null);
        router.navigate('/new');
    }, [session.machineId, session.homeDir, repoPath, isWorktree, projectPath, draft, router]);

    const [isHovered, setIsHovered] = React.useState(false);

    return (
        <Pressable
            style={hasBranch ? styles.sectionHeader : styles.sectionHeaderSingleLine}
            onPress={onToggle}
            // @ts-ignore - Web only events
            onMouseEnter={() => setIsHovered(true)}
            // @ts-ignore - Web only events
            onMouseLeave={() => setIsHovered(false)}
            accessibilityRole="button"
            accessibilityLabel="折叠或展开项目会话"
        >
            {/* Avatar — vertically centered */}
            <View style={styles.sectionHeaderAvatar}>
                <ProjectInitialAvatar name={repoFolderName} size={24} />
            </View>

            {/* Path + branch */}
            <View style={styles.sectionHeaderContent}>
                <Text style={styles.sectionHeaderPath} numberOfLines={1}>
                    {repoFolderName}
                </Text>
                {hasBranch && (
                    <View style={styles.branchRow}>
                        <Text style={styles.branchText} numberOfLines={1}>
                            {branchName}
                        </Text>
                        {isWorktree && (
                            <MaterialCommunityIcons
                                name="tree"
                                size={11}
                                color={theme.colors.textSecondary}
                                style={styles.worktreeIcon}
                            />
                        )}
                        {gitInfo.linesAdded > 0 && (
                            <Text style={styles.addedText}>+{gitInfo.linesAdded}</Text>
                        )}
                        {gitInfo.linesRemoved > 0 && (
                            <Text style={styles.removedText}>-{gitInfo.linesRemoved}</Text>
                        )}
                    </View>
                )}
            </View>

            {/* + button — vertically centered, large hit area; desktop: hover-only */}
            <Pressable
                onPress={handleAdd}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                style={[styles.addButton, { opacity: Platform.OS !== 'web' || isHovered ? 1 : 0 }]}
                accessibilityRole="button"
                accessibilityLabel="在当前项目新建会话"
            >
                <Ionicons name="add-outline" size={16} color={theme.colors.textSecondary} />
            </Pressable>
        </Pressable>
    );
});

// Full-width separator between machine groups: ——— 🖥 name ———
const MachineSeparator = React.memo(({ machineName, machineId }: { machineName: string; machineId: string }) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const router = useRouter();

    const handlePress = React.useCallback(() => {
        router.navigate(`/machine/${machineId}` as any);
    }, [router, machineId]);

    return (
        <Pressable onPress={handlePress} style={styles.machineSeparator} hitSlop={{ top: 8, bottom: 8 }}>
            <View style={styles.machineSeparatorLine} />
            <Ionicons name="desktop-outline" size={11} color={theme.colors.textSecondary} style={{ marginHorizontal: 6 }} />
            <Text style={styles.machineSeparatorText} numberOfLines={1}>
                {machineName}
            </Text>
            <View style={styles.machineSeparatorLine} />
        </Pressable>
    );
});

export function ActiveSessionsGroupCompact({ sessions, selectedSessionId, collapsed = false }: ActiveSessionsGroupProps) {
    const styles = stylesheet;
    const machines = useAllMachines();

    const machinesMap = React.useMemo(() => {
        const map: Record<string, Machine> = {};
        machines.forEach(machine => {
            map[machine.id] = machine;
        });
        return map;
    }, [machines]);

    // Group sessions by machine, then by project within each machine
    const { machineGroups, hasMultipleMachines } = React.useMemo(() => {
        const unknownText = t('status.unknown');
        const byMachine = new Map<string, {
            machineId: string;
            machineName: string;
            projects: Map<string, {
                displayPath: string;
                sessions: SessionRowData[];
            }>;
        }>();

        sessions.forEach(session => {
            const machineId = session.machineId || unknownText;
            const machine = machineId !== unknownText ? machinesMap[machineId] : null;
            const machineName = machine?.metadata?.displayName ||
                machine?.metadata?.host ||
                (machineId !== unknownText ? machineId : `<${unknownText}>`);

            let machineGroup = byMachine.get(machineId);
            if (!machineGroup) {
                machineGroup = { machineId, machineName, projects: new Map() };
                byMachine.set(machineId, machineGroup);
            }

            const projectPath = getSessionProjectGroupPath(session);
            let projectGroup = machineGroup.projects.get(projectPath);
            if (!projectGroup) {
                const displayPath = formatPathRelativeToHome(projectPath, session.homeDir ?? undefined);
                projectGroup = { displayPath, sessions: [] };
                machineGroup.projects.set(projectPath, projectGroup);
            }

            projectGroup.sessions.push(session);
        });

        byMachine.forEach(machineGroup => {
            machineGroup.projects.forEach(projectGroup => {
                projectGroup.sessions.sort(compareSessionsByRecency);
            });
        });

        const sorted = Array.from(byMachine.values()).sort((a, b) =>
            a.machineName.localeCompare(b.machineName)
        );

        return { machineGroups: sorted, hasMultipleMachines: byMachine.size > 1 };
    }, [sessions, machinesMap]);

    const projectKeys = React.useMemo(() => {
        const keys: string[] = [];
        machineGroups.forEach(machineGroup => {
            machineGroup.projects.forEach((_projectGroup, projectPath) => {
                keys.push(`${machineGroup.machineId}:${projectPath}`);
            });
        });
        return keys;
    }, [machineGroups]);

    const [collapsedProjectKeys, setCollapsedProjectKeys] = React.useState<Set<string>>(() => new Set());
    const projectKeysRef = React.useRef(projectKeys);

    React.useEffect(() => {
        projectKeysRef.current = projectKeys;
    }, [projectKeys]);

    React.useEffect(() => {
        setCollapsedProjectKeys(collapsed ? new Set(projectKeysRef.current) : new Set());
    }, [collapsed]);

    React.useEffect(() => {
        setCollapsedProjectKeys(prev => {
            const validKeys = new Set(projectKeys);
            let changed = false;
            const next = new Set<string>();
            prev.forEach(key => {
                if (validKeys.has(key)) {
                    next.add(key);
                } else {
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [projectKeys]);

    const handleToggleProject = React.useCallback((projectKey: string) => {
        setCollapsedProjectKeys(prev => {
            const next = new Set(prev);
            if (next.has(projectKey)) {
                next.delete(projectKey);
            } else {
                next.add(projectKey);
            }
            return next;
        });
    }, []);

    return (
        <View style={styles.container}>
            {machineGroups.map(machineGroup => {
                const sortedProjects = Array.from(machineGroup.projects.entries()).sort(([, a], [, b]) => {
                    const aUpdatedAt = a.sessions[0]?.updatedAt ?? 0;
                    const bUpdatedAt = b.sessions[0]?.updatedAt ?? 0;
                    return bUpdatedAt - aUpdatedAt || a.displayPath.localeCompare(b.displayPath);
                });

                return (
                    <React.Fragment key={machineGroup.machineId}>
                        {hasMultipleMachines && (
                            <MachineSeparator
                                machineName={machineGroup.machineName}
                                machineId={machineGroup.machineId}
                            />
                        )}
                        {sortedProjects.map(([projectPath, projectGroup]) => {
                            const firstSession = projectGroup.sessions[0];
                            if (!firstSession) return null;
                            const projectKey = `${machineGroup.machineId}:${projectPath}`;
                            const projectCollapsed = collapsedProjectKeys.has(projectKey);
                            const hasScrollableSessions = projectGroup.sessions.length > PROJECT_VISIBLE_SESSION_COUNT;

                            return (
                                <View key={projectPath} style={styles.projectCard}>
                                    <SectionHeader
                                        session={firstSession}
                                        projectPath={projectPath}
                                        displayPath={projectGroup.displayPath}
                                        onToggle={() => handleToggleProject(projectKey)}
                                    />
                                    {!projectCollapsed && (
                                        <View style={styles.projectSessionsContainer}>
                                            <ScrollView
                                                nestedScrollEnabled
                                                showsVerticalScrollIndicator={hasScrollableSessions}
                                                style={hasScrollableSessions ? styles.projectSessionsScroll : undefined}
                                            >
                                                {projectGroup.sessions.map((session, index) => (
                                                    <CompactSessionRow
                                                        key={session.id}
                                                        session={session}
                                                        selected={selectedSessionId === session.id}
                                                        showBorder={index < projectGroup.sessions.length - 1}
                                                    />
                                                ))}
                                            </ScrollView>
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                    </React.Fragment>
                );
            })}
        </View>
    );
}

// Compact session row with status dot indicator
const CompactSessionRow = React.memo(({ session, selected, showBorder }: { session: SessionRowData; selected?: boolean; showBorder?: boolean }) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const baseStatus = STATUS_CONFIG[session.state];
    // Override to solid blue when session has unread results
    const status = session.hasUnread
        ? { ...baseStatus, color: '#007AFF', dotColor: '#007AFF', isPulsing: false, isConnected: baseStatus.isConnected }
        : baseStatus;
    const navigateToSession = useNavigateToSession();
    const swipeableRef = React.useRef<Swipeable | null>(null);
    const swipeEnabled = Platform.OS !== 'web';
    const [actionsAnchor, setActionsAnchor] = React.useState<SessionActionsAnchor | null>(null);

    const [archivingSession, performArchive] = useHappyAction(async () => {
        const result = await sessionArchiveWithStop({
            sessionId: session.id,
            machineId: session.machineId,
            requireStop: status.isConnected,
        });
        if (!result.success) {
            throw new HappyError(result.message || t('sessionInfo.failedToArchiveSession'), false);
        }
    });

    const handleArchive = React.useCallback(() => {
        swipeableRef.current?.close();
        performArchive();
    }, [performArchive]);

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
    const shortTimeText = formatShortRelativeTime(getSessionRecencyTime(session));
    const statusText = session.hasUnread
        ? t('status.unread')
        : session.state === 'thinking'
            ? t('status.activeNow')
            : session.state === 'permission_required'
                ? t('status.permissionRequired')
                : session.state === 'waiting' && session.hasDraft
                    ? '草稿'
                    : null;

    const renderLeadingIndicator = () => {
        let indicator: React.ReactNode = null;

        if (session.hasUnread) {
            indicator = <StatusDot color={status.dotColor} isPulsing={false} />;
        } else if (session.state === 'waiting' && session.hasDraft) {
            indicator = (
                <Ionicons
                    name="create-outline"
                    size={14}
                    color={theme.colors.textSecondary}
                />
            );
        } else if (session.state === 'permission_required' || session.state === 'thinking') {
            indicator = <StatusDot color={status.dotColor} isPulsing={status.isPulsing} />;
        }

        return (
            <View style={styles.leadingIndicatorSlot}>
                {indicator}
            </View>
        );
    };

    const itemContent = (
        <Pressable
            style={[
                styles.sessionRow,
                showBorder && styles.sessionRowWithBorder,
                selected && styles.sessionRowSelected
            ]}
            onPress={handlePress}
            {...menuProps}
        >
            <View style={styles.sessionContent}>
                <View style={styles.sessionTopRow}>
                    <View style={styles.sessionTitleRow}>
                        {renderLeadingIndicator()}

                        <Text
                            style={[
                                styles.sessionTitle,
                                status.isConnected ? styles.sessionTitleConnected : styles.sessionTitleDisconnected
                            ]}
                            numberOfLines={1}
                        >
                            {session.name}
                        </Text>
                    </View>
                    <Text style={styles.sessionTimeText} numberOfLines={1}>
                        {shortTimeText}
                    </Text>
                </View>
                {statusText && (
                    <Text style={[styles.sessionStatusText, { color: status.color }]} numberOfLines={1}>
                        {statusText}
                    </Text>
                )}
            </View>
        </Pressable>
    );

    if (!swipeEnabled) {
        return (
            <>
                {itemContent}
                <SessionActionsPopover
                    anchor={actionsAnchor}
                    onClose={() => setActionsAnchor(null)}
                    sessionId={session.id}
                    visible={!!actionsAnchor}
                />
            </>
        );
    }

    const renderRightActions = () => (
        <Pressable
            style={styles.swipeAction}
            onPress={handleArchive}
            disabled={archivingSession}
        >
            <Ionicons name="archive-outline" size={20} color="#FFFFFF" />
            <Text style={styles.swipeActionText} numberOfLines={2}>
                {t('sessionInfo.archiveSession')}
            </Text>
        </Pressable>
    );

    return (
        <Swipeable
            ref={swipeableRef}
            renderRightActions={renderRightActions}
            overshootRight={false}
            enabled={!archivingSession}
        >
            {itemContent}
        </Swipeable>
    );
});

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        backgroundColor: theme.colors.groupped.background,
        paddingTop: 8,
    },
    // Section header styles
    sectionHeader: {
        paddingTop: 12,
        paddingBottom: Platform.select({ ios: 8, default: 10 }),
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
    },
    sectionHeaderSingleLine: {
        paddingTop: 12,
        paddingBottom: Platform.select({ ios: 8, default: 10 }),
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
    },
    sectionHeaderAvatar: {
        marginRight: 10,
    },
    projectInitialAvatar: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.text,
    },
    projectInitialText: {
        ...Typography.default('semiBold'),
        color: theme.colors.groupped.background,
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '700',
    },
    sectionHeaderContent: {
        flex: 1,
        justifyContent: 'center',
        minWidth: 0,
    },
    sectionHeaderPath: {
        ...Typography.default('regular'),
        color: theme.colors.groupped.sectionTitle,
        fontSize: 15,
        lineHeight: 20,
        letterSpacing: 0,
        fontWeight: '500',
        flexShrink: 1,
    },
    branchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 1,
    },
    branchText: {
        fontSize: 12,
        lineHeight: 16,
        color: theme.colors.textSecondary,
        ...Typography.default('regular'),
        flexShrink: 1,
    },
    worktreeIcon: {
        marginLeft: 4,
    },
    addedText: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '600',
        color: theme.colors.gitAddedText,
        marginLeft: 6,
    },
    removedText: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '600',
        color: theme.colors.gitRemovedText,
        marginLeft: 3,
    },
    addButton: {
        width: 26,
        height: 26,
        marginLeft: 8,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.groupped.background,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    // Machine separator styles
    machineSeparator: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Platform.select({ ios: 32, default: 24 }),
        paddingTop: 8,
        paddingBottom: 0,
    },
    machineSeparatorLine: {
        flex: 1,
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.divider,
    },
    machineSeparatorText: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        ...Typography.default('regular'),
        marginRight: 4,
    },
    // Project card styles
    projectCard: {
        backgroundColor: theme.colors.surface,
        marginTop: 4,
        marginBottom: 10,
        marginHorizontal: Platform.select({ ios: 18, default: 14 }),
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        overflow: 'hidden',
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: theme.colors.shadow.opacity * 0.7,
        shadowRadius: 2,
        elevation: 1,
    },
    projectSessionsContainer: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.divider,
    },
    projectSessionsScroll: {
        height: PROJECT_SESSION_ROW_HEIGHT * PROJECT_VISIBLE_SESSION_COUNT,
    },
    // Session row styles
    sessionRow: {
        height: PROJECT_SESSION_ROW_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15,
        backgroundColor: theme.colors.surface,
    },
    sessionRowWithBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
    },
    sessionRowSelected: {
        backgroundColor: theme.colors.surfaceSelected,
    },
    sessionContent: {
        flex: 1,
        justifyContent: 'center',
        minWidth: 0,
    },
    sessionTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    sessionTitleRow: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        minWidth: 0,
    },
    sessionTitle: {
        fontSize: 15,
        lineHeight: 20,
        flex: 1,
        ...Typography.default('regular'),
    },
    sessionTimeText: {
        marginLeft: 10,
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
        ...Typography.default('regular'),
    },
    sessionStatusText: {
        marginTop: 1,
        marginLeft: 20,
        fontSize: 11,
        lineHeight: 15,
        ...Typography.default('regular'),
    },
    sessionTitleConnected: {
        color: theme.colors.text,
    },
    sessionTitleDisconnected: {
        color: theme.colors.textSecondary,
    },
    leadingIndicatorSlot: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 12,
        height: 16,
        marginRight: 8,
    },
    swipeAction: {
        width: 112,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.status.error,
    },
    swipeActionText: {
        marginTop: 4,
        fontSize: 12,
        color: '#FFFFFF',
        textAlign: 'center',
        ...Typography.default('semiBold'),
    },
}));
