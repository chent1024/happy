import { TokenStorage, AuthCredentials } from '@/auth/tokenStorage';
import { clearPersistence, clearRegisteredPushToken, loadRegisteredPushToken } from '@/sync/persistence';
import { unregisterPushToken } from '@/sync/apiPush';

export interface LogoutResult {
    credentialsRemoved: boolean;
}

export async function clearAuthSession(credentials: AuthCredentials | null): Promise<LogoutResult> {
    const registeredPushToken = credentials ? loadRegisteredPushToken() : null;
    if (credentials && registeredPushToken) {
        try {
            await unregisterPushToken(credentials, registeredPushToken);
        } catch (error) {
            console.log('Failed to unregister push token during logout:', error);
        } finally {
            clearRegisteredPushToken();
        }
    }

    clearPersistence();
    const credentialsRemoved = await TokenStorage.removeCredentials();
    if (!credentialsRemoved) {
        console.warn('Failed to remove credentials during logout');
    }

    return { credentialsRemoved };
}
