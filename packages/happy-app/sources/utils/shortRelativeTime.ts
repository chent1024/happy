export function formatShortRelativeTime(timestamp: number, now: number = Date.now()) {
    const diffMs = Math.max(0, now - timestamp);
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);

    if (diffMinutes < 1) {
        return 'now';
    }
    if (diffMinutes < 60) {
        return `${diffMinutes}m`;
    }
    if (diffHours < 24) {
        return `${diffHours}h`;
    }
    if (diffDays < 7) {
        return `${diffDays}d`;
    }
    return `${diffWeeks}w`;
}
