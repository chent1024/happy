export function compactStyleList<T>(styles: Array<T | false | null | undefined>): T[] {
    return styles.filter(Boolean) as T[];
}
