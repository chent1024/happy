export type IncomingMessageSeqAction = 'append' | 'fetch' | 'ignore';

export function getIncomingMessageSeqAction(
    currentLastSeq: number | undefined,
    incomingSeq: number,
): IncomingMessageSeqAction {
    if (currentLastSeq === undefined) {
        return 'fetch';
    }
    if (incomingSeq <= currentLastSeq) {
        return 'ignore';
    }
    if (incomingSeq === currentLastSeq + 1) {
        return 'append';
    }
    return 'fetch';
}
