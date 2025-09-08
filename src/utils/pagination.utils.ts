import { encoding_for_model } from 'tiktoken';
import type { PaginationResult } from '@/schemas/aem-logs.schemas.js';

export interface PaginationConfig {
  readonly MAX_TOKENS_PER_PAGE: number;
  readonly MODEL_NAME: string;
}

// Note: Using 'gpt-4' encoding as fallback for Claude Sonnet 4 token counting
// since tiktoken doesn't natively support Claude models. GPT-4 provides
// a reasonable approximation for token counting in English text.
export const DEFAULT_PAGINATION_CONFIG: PaginationConfig = {
  MAX_TOKENS_PER_PAGE: 20000,
  MODEL_NAME: 'gpt-4'
} as const;

export class TokenCountError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'TokenCountError';
  }
}

export function countTokens(text: string, config: PaginationConfig = DEFAULT_PAGINATION_CONFIG): number {
  let encoder;
  try {
    encoder = encoding_for_model(config.MODEL_NAME as any);
    const tokens = encoder.encode(text);
    return tokens.length;
  } catch (error) {
    throw new TokenCountError(`Failed to count tokens: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
  } finally {
    if (encoder) {
      encoder.free();
    }
  }
}

export function paginateLogLines(
  lines: readonly string[],
  requestedPage: number,
  config: PaginationConfig = DEFAULT_PAGINATION_CONFIG
): PaginationResult {
  if (requestedPage < 1) {
    throw new Error('Page number must be at least 1');
  }

  if (lines.length === 0) {
    return {
      paginatedLines: [],
      totalPages: 1,
      currentPage: 1,
      totalEntries: 0,
      entriesOnPage: 0
    };
  }

  let encoder;
  try {
    encoder = encoding_for_model(config.MODEL_NAME as any);
    
    const pages: string[][] = [];
    let currentPage: string[] = [];
    let currentTokens = 0;

    for (const line of lines) {
      const lineTokens = encoder.encode(line);
      const lineTokenCount = lineTokens.length;

      if (currentTokens + lineTokenCount > config.MAX_TOKENS_PER_PAGE && currentPage.length > 0) {
        pages.push([...currentPage]);
        currentPage = [];
        currentTokens = 0;
      }

      currentPage.push(line);
      currentTokens += lineTokenCount;
    }

    if (currentPage.length > 0) {
      pages.push([...currentPage]);
    }

    const totalPages = Math.max(pages.length, 1);
    const validPage = Math.min(requestedPage, totalPages);
    const pageData = pages[validPage - 1] || [];

    return {
      paginatedLines: pageData,
      totalPages,
      currentPage: validPage,
      totalEntries: lines.length,
      entriesOnPage: pageData.length
    };
  } catch (error) {
    throw new TokenCountError(
      `Failed to paginate log lines: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error
    );
  } finally {
    if (encoder) {
      encoder.free();
    }
  }
}

export function validatePaginationRequest(page: number, totalPages: number): void {
  if (page < 1) {
    throw new Error('Page number must be at least 1');
  }
  
  if (page > totalPages && totalPages > 0) {
    throw new Error(`Requested page ${page} exceeds total pages ${totalPages}`);
  }
}

export function estimateTokensForLines(lines: readonly string[], config: PaginationConfig = DEFAULT_PAGINATION_CONFIG): number {
  if (lines.length === 0) {
    return 0;
  }

  const sampleSize = Math.min(100, lines.length);
  const sampleLines = lines.slice(0, sampleSize);
  const sampleText = sampleLines.join('\n');
  const sampleTokens = countTokens(sampleText, config);
  
  const avgTokensPerLine = sampleTokens / sampleLines.length;
  return Math.ceil(avgTokensPerLine * lines.length);
}

export function canFitInSinglePage(lines: readonly string[], config: PaginationConfig = DEFAULT_PAGINATION_CONFIG): boolean {
  if (lines.length === 0) {
    return true;
  }
  
  const estimatedTokens = estimateTokensForLines(lines, config);
  return estimatedTokens <= config.MAX_TOKENS_PER_PAGE;
}