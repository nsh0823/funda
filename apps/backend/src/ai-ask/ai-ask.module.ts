import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Quiz } from '../roadmap/entities/quiz.entity';

import { AiQuestionAnswer } from './entities/ai-question-answer.entity';
import { AiAskController } from './ai-ask.controller';
import { AiAskService } from './ai-ask.service';
import { AiAskClovaService } from './ai-ask-clova.service';
import { AiAskGeminiService } from './ai-ask-gemini.service';
import { AiAskHuggingFaceService } from './ai-ask-huggingface.service';
import { AiAskPromptService } from './ai-ask-prompt.service';
import { AiAskProviderService } from './ai-ask-provider.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiQuestionAnswer, Quiz]),
    ThrottlerModule.forRoot([
      {
        ttl: 3600000, // 1시간
        limit: 10, // 요청 제한
      },
    ]),
  ],
  controllers: [AiAskController],
  providers: [
    AiAskService,
    AiAskPromptService,
    AiAskClovaService,
    AiAskGeminiService,
    AiAskHuggingFaceService,
    AiAskProviderService,
  ],
})
export class AiAskModule {}
