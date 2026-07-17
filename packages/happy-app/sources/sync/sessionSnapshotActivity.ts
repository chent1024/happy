export type SessionSnapshotActivity = {
    active: boolean;
    activeAt: number;
};

export type RealtimeSessionActivity = SessionSnapshotActivity & {
    thinking: boolean;
    thinkingAt: number;
};

export function mergeSessionSnapshotActivity(
    snapshot: SessionSnapshotActivity,
    current?: RealtimeSessionActivity,
): RealtimeSessionActivity {
    const hasNewerRealtimeActivity = current && current.activeAt > snapshot.activeAt;
    const active = hasNewerRealtimeActivity ? current.active : snapshot.active;
    const activeAt = hasNewerRealtimeActivity ? current.activeAt : snapshot.activeAt;

    if (!active) {
        return { active, activeAt, thinking: false, thinkingAt: 0 };
    }

    return {
        active,
        activeAt,
        thinking: current?.active ? current.thinking : false,
        thinkingAt: current?.active ? current.thinkingAt : 0,
    };
}
