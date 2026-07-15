import * as React from 'react';
import { Modal } from '@/modal';
import { syncCodexSessionsForMachines } from '@/sync/ops';
import { useAllMachines } from '@/sync/storage';
import { t } from '@/text';
import { isMachineOnline } from '@/utils/machineUtils';
import {
    CodexSessionListRefreshStatus,
    createCodexSessionListRefreshStatus,
    scheduleCodexSessionListRefreshStatusDismiss,
} from './codexSessionListRefresh';

export function useCodexSessionListRefresh(): {
    isRefreshing: boolean;
    refreshStatus: CodexSessionListRefreshStatus | null;
    refresh: () => Promise<void>;
} {
    const machines = useAllMachines();
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [refreshStatus, setRefreshStatus] = React.useState<CodexSessionListRefreshStatus | null>(null);
    const refreshInFlight = React.useRef(false);
    const onlineMachineIds = React.useMemo(
        () => machines.filter(isMachineOnline).map((machine) => machine.id),
        [machines],
    );

    React.useEffect(() => {
        if (!refreshStatus) return;
        return scheduleCodexSessionListRefreshStatusDismiss(() => setRefreshStatus(null));
    }, [refreshStatus]);

    const refresh = React.useCallback(async () => {
        if (refreshInFlight.current) return;
        refreshInFlight.current = true;
        setRefreshStatus(null);
        setIsRefreshing(true);
        try {
            const result = await syncCodexSessionsForMachines(onlineMachineIds);
            setRefreshStatus(createCodexSessionListRefreshStatus(result));
            if (result.type === 'error') {
                Modal.alert(t('common.error'), t('codex.sync.failed'));
            } else if (result.type === 'partial') {
                Modal.alert(
                    t('common.error'),
                    t('codex.sync.partialFailed', { failed: result.failed, machines: result.machines }),
                );
            }
        } catch {
            setRefreshStatus({ type: 'error' });
            Modal.alert(t('common.error'), t('codex.sync.failed'));
        } finally {
            refreshInFlight.current = false;
            setIsRefreshing(false);
        }
    }, [onlineMachineIds]);

    return { isRefreshing, refreshStatus, refresh };
}
