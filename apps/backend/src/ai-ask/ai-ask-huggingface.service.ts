import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Quiz } from '../roadmap/entities/quiz.entity';

import { AiAskPromptService } from './ai-ask-prompt.service';
import { DEFAULT_AI_PARAMS } from './clova.constants';

type HuggingFaceMessageRole = 'system' | 'user' | 'assistant';

interface HuggingFaceMessage {
  role: HuggingFaceMessageRole;
  content: string;
}

interface HuggingFaceChatRequest {
  model: string;
  messages: HuggingFaceMessage[];
  temperature: number;
  top_p: number;
  max_tokens: number;
  stop?: string[];
  stream: boolean;
}

const DEFAULT_HUGGING_FACE_API_URL = 'https://router.huggingface.co/v1/chat/completions';
const DEFAULT_HUGGING_FACE_API_MODEL = 'Qwen/Qwen2.5-7B-Instruct:fastest';

@Injectable()
export class AiAskHuggingFaceService {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly model: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly promptService: AiAskPromptService,
  ) {
    const key = this.configService.get<string>('HUGGING_FACE_API_KEY');
    const url = this.configService.get<string>('HUGGING_FACE_API_URL');
    const model = this.configService.get<string>('HUGGING_FACE_API_MODEL');

    this.apiKey = key ?? '';
    this.apiUrl = url ?? DEFAULT_HUGGING_FACE_API_URL;
    this.model = model ?? DEFAULT_HUGGING_FACE_API_MODEL;
  }

  /**
   * 퀴즈와 사용자 질문을 바탕으로 Hugging Face Inference Providers에 단일 응답을 요청한다.
   *
   * @param quiz 퀴즈 엔티티
   * @param userQuestion 사용자 질문
   * @returns AI 답변 텍스트
   */
  async requestAnswer(quiz: Quiz, userQuestion: string): Promise<string> {
    this.validateApiKey();

    const prompt = this.promptService.buildPrompt(quiz, userQuestion);
    const apiRequest = this.buildApiRequest(prompt.system, prompt.user, false);
    const { controller, timeoutId } = this.createTimeoutController(20000);

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(apiRequest),
      signal: controller.signal,
    }).finally(() => {
      clearTimeout(timeoutId);
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new BadRequestException(`Hugging Face 호출 실패: ${response.status} ${errorText}`);
    }

    const json = await response.json();
    return this.extractContent(json);
  }

  /**
   * 퀴즈와 사용자 질문을 바탕으로 Hugging Face 스트리밍 응답을 받는다.
   *
   * @param quiz 퀴즈 엔티티
   * @param userQuestion 사용자 질문
   * @param onChunk 스트리밍 조각을 받을 콜백
   * @returns 최종 AI 답변 텍스트
   */
  async requestAnswerStream(
    quiz: Quiz,
    userQuestion: string,
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    this.validateApiKey();

    const prompt = this.promptService.buildPrompt(quiz, userQuestion);
    const apiRequest = this.buildApiRequest(prompt.system, prompt.user, true);
    const { controller, timeoutId } = this.createTimeoutController(20000);

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(apiRequest),
      signal: controller.signal,
    }).finally(() => {
      clearTimeout(timeoutId);
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => '');
      throw new BadRequestException(
        `Hugging Face 스트리밍 호출 실패: ${response.status} ${errorText}`,
      );
    }

    return this.parseSseStream(response, onChunk);
  }

  /**
   * OpenAI 호환 Chat Completions 응답에서 실제 텍스트를 추출한다.
   *
   * @param raw 응답 JSON
   * @returns 추출된 텍스트
   */
  private extractContent(raw: unknown): string {
    const object = raw as Record<string, unknown>;
    const choices = object?.choices as Array<Record<string, unknown>> | undefined;
    const firstChoice = choices?.[0];
    const message = firstChoice?.message as Record<string, unknown> | undefined;
    const delta = firstChoice?.delta as Record<string, unknown> | undefined;

    const messageContent = message?.content;
    if (typeof messageContent === 'string' && messageContent.length > 0) {
      return messageContent;
    }

    const deltaContent = delta?.content;
    if (typeof deltaContent === 'string' && deltaContent.length > 0) {
      return deltaContent;
    }

    return '';
  }

  /**
   * Hugging Face SSE 스트림을 읽어 조각을 누적하고 콜백으로 전달한다.
   *
   * @param response 스트리밍 응답
   * @param onChunk 조각 수신 콜백
   * @returns 전체 합산 텍스트
   */
  private async parseSseStream(
    response: Response,
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    if (!response.body) {
      throw new BadRequestException('스트리밍 응답을 읽을 수 없습니다.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const chunk = this.extractStreamChunk(line);
        if (chunk.length === 0) {
          continue;
        }

        fullContent += chunk;
        onChunk(chunk);
      }
    }

    const remaining = buffer + decoder.decode();
    for (const line of remaining.split('\n')) {
      const chunk = this.extractStreamChunk(line);
      if (chunk.length === 0) {
        continue;
      }

      fullContent += chunk;
      onChunk(chunk);
    }

    return fullContent;
  }

  /**
   * 스트리밍 응답 한 줄에서 실제 텍스트 조각을 추출한다.
   *
   * @param line SSE 한 줄
   * @returns 추출된 텍스트 조각
   */
  private extractStreamChunk(line: string): string {
    const trimmedLine = line.trim();
    if (!trimmedLine.startsWith('data:')) {
      return '';
    }

    const data = trimmedLine.substring(5).trim();
    if (data.length === 0 || data === '[DONE]' || data.includes('[DONE]')) {
      return '';
    }

    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;
      return this.extractContent(parsed);
    } catch {
      return '';
    }
  }

  /**
   * Hugging Face OpenAI 호환 Chat Completions 요청 바디를 구성한다.
   *
   * @param systemPrompt 시스템 프롬프트
   * @param userPrompt 사용자 질문 프롬프트
   * @param stream 스트리밍 여부
   * @returns 요청 바디
   */
  private buildApiRequest(
    systemPrompt: string,
    userPrompt: string,
    stream: boolean,
  ): HuggingFaceChatRequest {
    const request: HuggingFaceChatRequest = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: DEFAULT_AI_PARAMS.temperature,
      top_p: DEFAULT_AI_PARAMS.topP,
      max_tokens: DEFAULT_AI_PARAMS.maxTokens,
      stream,
    };

    if (DEFAULT_AI_PARAMS.stopBefore.length > 0) {
      request.stop = DEFAULT_AI_PARAMS.stopBefore;
    }

    return request;
  }

  /**
   * 외부 API 요청이 오래 걸릴 때를 대비해 타임아웃 컨트롤러를 만든다.
   *
   * @param ms 타임아웃 밀리초
   * @returns abort controller와 타이머 ID
   */
  private createTimeoutController(ms: number): {
    controller: AbortController;
    timeoutId: NodeJS.Timeout;
  } {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ms);
    return { controller, timeoutId };
  }

  /**
   * API 키 누락을 조기에 확인하기 위한 가드.
   */
  private validateApiKey(): void {
    if (this.apiKey.length === 0) {
      throw new BadRequestException('HUGGING_FACE_API_KEY가 설정되지 않았습니다.');
    }
  }
}
