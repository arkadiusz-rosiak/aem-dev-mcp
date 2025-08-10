import { OSGiError, OSGI_ERROR_CODES } from '@/types/index.js';

export function createOSGiError(
  code: OSGI_ERROR_CODES,
  message: string,
  details?: unknown
): OSGiError {
  return {
    code,
    message,
    details,
    retry: code === OSGI_ERROR_CODES.NETWORK_TIMEOUT
  };
}

export function classifyOSGiError(error: unknown): OSGiError {
  if (error && typeof error === 'object') {
    if ('code' in error) {
      const errorCode = (error as { code: string }).code;
      
      if (['ECONNREFUSED', 'EHOSTUNREACH', 'ETIMEDOUT'].includes(errorCode)) {
        return createOSGiError(
          OSGI_ERROR_CODES.NETWORK_TIMEOUT,
          `Network error: ${errorCode}`,
          { originalError: error }
        );
      }
    }
    
    if ('response' in error) {
      const response = (error as { response: { status?: number } }).response;
      if (response?.status === 401 || response?.status === 403) {
        return createOSGiError(
          OSGI_ERROR_CODES.PERMISSION_DENIED,
          `Authentication error: HTTP ${response.status}`,
          { originalError: error }
        );
      }
      if (response?.status && response.status >= 500) {
        return createOSGiError(
          OSGI_ERROR_CODES.OPERATION_FAILED,
          `Server error: HTTP ${response.status}`,
          { originalError: error }
        );
      }
    }
  }
  
  const message = error instanceof Error ? error.message : String(error);
  return createOSGiError(OSGI_ERROR_CODES.OPERATION_FAILED, message, { originalError: error });
}