import { describe, expect, it } from 'vitest';
import { compactStyleList } from './compactStyleList';

describe('compactStyleList', () => {
    it('removes falsy style entries and preserves style object order', () => {
        const base = { padding: 8 };
        const pressed = { opacity: 0.7 };
        const result = compactStyleList([base, false, null, undefined, pressed]);

        expect(result).toEqual([base, pressed]);
    });
});
