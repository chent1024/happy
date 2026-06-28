import type { EffortLevel, ModelMode } from './modelModeOptions';

const DEFAULT_MODEL_KEYS = new Set(['default', 'default model']);

export function compactModelSummary(modelMode: ModelMode | null | undefined): string | null {
    if (!modelMode) {
        return null;
    }

    const rawLabel = (modelMode.name || modelMode.key).trim();
    const rawKey = modelMode.key.trim();
    const comparable = rawLabel.toLowerCase();

    if (DEFAULT_MODEL_KEYS.has(comparable) || rawKey === 'default') {
        return 'default';
    }

    const gptMatch = rawLabel.match(/^gpt-(\d+(?:\.\d+)?)/i);
    if (gptMatch) {
        return gptMatch[1];
    }

    return rawLabel;
}

export function buildAgentInputModeSummary(opts: {
    permissionLabel: string | null;
    permissionModeKey: string;
    modelMode?: ModelMode | null;
    effortLevel?: EffortLevel | null;
}): string | null {
    const parts: string[] = [];
    const model = compactModelSummary(opts.modelMode);
    const isDefaultModel = opts.modelMode?.key === 'default';
    const effort = opts.effortLevel?.name?.trim() || opts.effortLevel?.key?.trim() || null;

    if (opts.permissionLabel && (opts.permissionModeKey !== 'default' || model || effort)) {
        parts.push(opts.permissionLabel);
    }
    if (model && (!isDefaultModel || opts.permissionLabel || effort)) {
        parts.push(model);
    }
    if (effort) {
        parts.push(effort);
    }

    return parts.length > 0 ? parts.join(' · ') : 'CLI';
}
