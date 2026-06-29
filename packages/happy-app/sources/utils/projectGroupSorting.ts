export interface ProjectGroupSortInput {
    displayPath: string;
}

export type ProjectGroupSortEntry<T extends ProjectGroupSortInput = ProjectGroupSortInput> = readonly [
    projectPath: string,
    projectGroup: T,
];

export function compareProjectGroupsByStablePath<T extends ProjectGroupSortInput>(
    [projectPathA, a]: ProjectGroupSortEntry<T>,
    [projectPathB, b]: ProjectGroupSortEntry<T>,
) {
    return a.displayPath.localeCompare(b.displayPath) || projectPathA.localeCompare(projectPathB);
}
