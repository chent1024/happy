export const DEFAULT_API_REQUEST_TIMEOUT_MS = 15_000;
export const DEFAULT_IDEMPOTENT_REQUEST_ATTEMPTS = 3;
export const DEFAULT_RETRY_BASE_DELAY_MS = 250;

export type RetryOptions = {
    attempts?: number;
    baseDelayMs?: number;
};

export interface HappyRequestInit extends RequestInit {
    retry?: false | RetryOptions;
    timeoutMs?: number;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type SleepLike = (ms: number) => Promise<void>;

type FetchWithRetryOptions = {
    fetchImpl?: FetchLike;
    sleep?: SleepLike;
    random?: () => number;
};

export function isIdempotentHttpMethod(method: string | undefined): boolean {
    const normalized = (method ?? 'GET').toUpperCase();
    return normalized === 'GET' || normalized === 'HEAD';
}

export function shouldRetryHttpStatus(status: number): boolean {
    return status === 408
        || status === 425
        || status === 429
        || status === 500
        || status === 502
        || status === 503
        || status === 504;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(attemptIndex: number, baseDelayMs: number, random: () => number): number {
    const exponential = baseDelayMs * Math.pow(2, Math.max(0, attemptIndex - 1));
    const jitter = Math.floor(baseDelayMs * random());
    return exponential + jitter;
}

function createAttemptInit(
    init: RequestInit,
    timeoutMs: number,
): { init: RequestInit; cleanup: () => void; timedOut: () => boolean } {
    if (timeoutMs <= 0) {
        return { init, cleanup: () => undefined, timedOut: () => false };
    }

    const controller = new AbortController();
    let didTimeout = false;
    const sourceSignal = init.signal;
    const onAbort = () => controller.abort();

    if (sourceSignal?.aborted) {
        controller.abort();
    } else {
        sourceSignal?.addEventListener('abort', onAbort, { once: true });
    }

    const timeout = setTimeout(() => {
        didTimeout = true;
        controller.abort();
    }, timeoutMs);

    return {
        init: {
            ...init,
            signal: controller.signal,
        },
        cleanup: () => {
            clearTimeout(timeout);
            sourceSignal?.removeEventListener('abort', onAbort);
        },
        timedOut: () => didTimeout,
    };
}

export async function fetchWithRetry(
    input: RequestInfo | URL,
    init: HappyRequestInit = {},
    options: FetchWithRetryOptions = {},
): Promise<Response> {
    const {
        retry,
        timeoutMs = DEFAULT_API_REQUEST_TIMEOUT_MS,
        ...requestInit
    } = init;
    const method = requestInit.method ?? 'GET';
    const retryOptions = retry === false ? undefined : retry;
    const canRetry = retry !== false && isIdempotentHttpMethod(method);
    const attempts = canRetry ? Math.max(1, retryOptions?.attempts ?? DEFAULT_IDEMPOTENT_REQUEST_ATTEMPTS) : 1;
    const baseDelayMs = retryOptions?.baseDelayMs !== undefined
        ? retryOptions.baseDelayMs
        : DEFAULT_RETRY_BASE_DELAY_MS;
    const fetchImpl = options.fetchImpl ?? fetch;
    const sleepImpl = options.sleep ?? sleep;
    const random = options.random ?? Math.random;

    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        const attemptInit = createAttemptInit(requestInit, timeoutMs);
        try {
            const response = await fetchImpl(input, attemptInit.init);
            attemptInit.cleanup();
            if (attempt >= attempts || !shouldRetryHttpStatus(response.status)) {
                return response;
            }
        } catch (error) {
            attemptInit.cleanup();
            lastError = error;
            if (requestInit.signal?.aborted && !attemptInit.timedOut()) {
                throw error;
            }
            if (attempt >= attempts) {
                throw error;
            }
        }

        await sleepImpl(getRetryDelayMs(attempt, baseDelayMs, random));
    }

    throw lastError instanceof Error ? lastError : new Error('Request failed');
}
