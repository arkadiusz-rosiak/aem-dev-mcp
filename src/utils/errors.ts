import { MCPToolResult } from '@/types.js';

export function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createErrorResponse(
  error: unknown,
  requestId?: string
): MCPToolResult {
  const errorMessage = extractErrorMessage(error);
  
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        error: errorMessage,
        requestId,
        timestamp: new Date().toISOString()
      }, null, 2)
    }],
    isError: true
  };
}

