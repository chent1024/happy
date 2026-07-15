import { describe, expect, it } from 'vitest';
import { qwenNarrationConfiguration } from './run';

describe('daemon Qwen narration configuration', () => {
  it('uses the fixed magnetic emotional clone as the active narrator voice', () => {
    expect(qwenNarrationConfiguration).toMatchObject({
      narratorProfileId: 'magnetic_emotional',
      voiceProfiles: [
        {
          id: 'magnetic_emotional',
          label: '磁性高情感中文男声旁白',
          providerVoiceId: 'magnetic_emotional',
        },
      ],
    });
  });
});
