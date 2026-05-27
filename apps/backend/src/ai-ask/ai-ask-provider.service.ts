import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Quiz } from '../roadmap/entities/quiz.entity';

import { AiAskClovaService } from './ai-ask-clova.service';
import { AiAskGeminiService } from './ai-ask-gemini.service';
import { AiAskHuggingFaceService } from './ai-ask-huggingface.service';

export type AiProviderType = 'clova' | 'gemini' | 'huggingface';

/**
 * 환경 설정에 따라 AI 제공자를 선택해 호출한다.
 */
@Injectable()
export class AiAskProviderService {
  private readonly provider: AiProviderType;

  constructor(
    private readonly configService: ConfigService,
    private readonly clovaService: AiAskClovaService,
    private readonly geminiService: AiAskGeminiService,
    private readonly huggingFaceService: AiAskHuggingFaceService,
  ) {
    const rawProvider = this.configService.get<string>('AI_PROVIDER') ?? 'clova';
    this.provider = this.normalizeProvider(rawProvider);
  }

  async requestAnswer(quiz: Quiz, userQuestion: string): Promise<string> {
    if (this.provider === 'gemini') {
      return this.geminiService.requestAnswer(quiz, userQuestion);
    }

    if (this.provider === 'huggingface') {
      return this.huggingFaceService.requestAnswer(quiz, userQuestion);
    }

    return this.clovaService.requestAnswer(quiz, userQuestion);
  }

  async requestAnswerStream(
    quiz: Quiz,
    userQuestion: string,
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    if (this.provider === 'gemini') {
      return this.geminiService.requestAnswerStream(quiz, userQuestion, onChunk);
    }

    if (this.provider === 'huggingface') {
      return this.huggingFaceService.requestAnswerStream(quiz, userQuestion, onChunk);
    }

    return this.clovaService.requestAnswerStream(quiz, userQuestion, onChunk);
  }

  getProviderType(): AiProviderType {
    return this.provider;
  }

  private normalizeProvider(value: string): AiProviderType {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'clova' || trimmed === 'gemini' || trimmed === 'huggingface') {
      return trimmed;
    }

    throw new BadRequestException(`지원하지 않는 AI_PROVIDER 값입니다: ${value}`);
  }
}
