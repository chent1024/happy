import { describe, expect, it } from 'vitest';
import { qwenNarrationConfiguration } from './run';

describe('daemon Qwen narration configuration', () => {
  it('uses Serena as the active narrator voice', () => {
    expect(qwenNarrationConfiguration).toMatchObject({
      narratorProfileId: 'serena',
      voiceProfiles: [
        {
          id: 'serena',
          label: '温柔温暖中文女声旁白',
          providerVoiceId: 'Serena',
        },
      ],
    });
  });
});
