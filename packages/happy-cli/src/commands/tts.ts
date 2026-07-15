import axios from 'axios';
import chalk from 'chalk';
import { configuration } from '@/configuration';
import { readCredentials, readSettings } from '@/persistence';

type PendingRequest = { id: string; label: string; createdAt: string };

export async function approveLatestTtsClient(): Promise<{ label: string }> {
    const [credentials, settings] = await Promise.all([readCredentials(), readSettings()]);
    if (!credentials) throw new Error('Happy is not authenticated. Run happy auth login first.');
    if (!settings.machineId) throw new Error('This Happy installation has no machine ID.');

    const headers = { authorization: `Bearer ${credentials.token}` };
    const pending = await axios.get<{ requests: PendingRequest[] }>(
        `${configuration.serverUrl}/v1/tts/auth/pending`,
        { headers, params: { machineId: settings.machineId }, timeout: 10_000 },
    );
    const request = pending.data.requests[0];
    if (!request) throw new Error('No pending yuedu TTS pairing request. Open yuedu once and try again.');
    await axios.post(
        `${configuration.serverUrl}/v1/tts/auth/approve`,
        { requestId: request.id, machineId: settings.machineId },
        { headers, timeout: 10_000 },
    );
    return { label: request.label };
}

export async function handleTtsCommand(args: string[]): Promise<void> {
    const subcommand = args[0];
    if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
        console.log(`${chalk.bold('happy tts')} - TTS client pairing\n\nUsage:\n  happy tts approve    Approve the newest yuedu pairing request`);
        return;
    }
    if (subcommand !== 'approve') throw new Error(`Unknown TTS subcommand: ${subcommand}`);
    const result = await approveLatestTtsClient();
    console.log(chalk.green(`✓ Approved TTS client: ${result.label}`));
    console.log(chalk.gray('  Return to yuedu and start reading; no connection settings are required.'));
}
