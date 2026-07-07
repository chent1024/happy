export type ProjectAccordionSelection = string | null | undefined;

export function resolveExpandedProjectKey(
    projectKeys: string[],
    selectedProjectKey: ProjectAccordionSelection,
    collapsed: boolean,
): string | null {
    if (collapsed) {
        return null;
    }
    if (selectedProjectKey === null) {
        return null;
    }
    if (selectedProjectKey && projectKeys.includes(selectedProjectKey)) {
        return selectedProjectKey;
    }
    return projectKeys[0] ?? null;
}

export function toggleExpandedProjectKey(
    currentProjectKey: string | null,
    toggledProjectKey: string,
): string | null {
    return currentProjectKey === toggledProjectKey ? null : toggledProjectKey;
}
