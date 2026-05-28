import { AiProviderType, AiQuestionAnswer } from './entities/ai-question-answer.entity';
import { AiAskService } from './ai-ask.service';
import { AiAskProviderService } from './ai-ask-provider.service';

describe('AiAskService', () => {
  const createService = (provider: 'clova' | 'gemini' | 'huggingface') =>
    new AiAskService(
      {} as never,
      {} as never,
      {
        getProviderType: jest.fn(() => provider),
      } as unknown as AiAskProviderService,
    );

  it('huggingface 제공자를 저장용 enum으로 매핑한다', () => {
    const service = createService('huggingface');

    const result = (
      service as unknown as { resolveProviderType: () => AiQuestionAnswer['provider'] }
    ).resolveProviderType();

    expect(result).toBe(AiProviderType.HUGGINGFACE);
  });

  it('gemini 제공자를 저장용 enum으로 매핑한다', () => {
    const service = createService('gemini');

    const result = (
      service as unknown as { resolveProviderType: () => AiQuestionAnswer['provider'] }
    ).resolveProviderType();

    expect(result).toBe(AiProviderType.GEMINI);
  });
});
