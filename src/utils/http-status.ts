export const isSuccess = (status: number): boolean => 
  status >= 200 && status < 300;

export const isRedirect = (status: number): boolean => 
  status >= 300 && status < 400;

export const isOk = (status: number): boolean => 
  status === 200;

export const isAuthError = (status: number): boolean => 
  status === 401 || status === 403;

export const isNotFound = (status: number): boolean => 
  status === 404;

export const isClientError = (status: number): boolean => 
  status >= 400 && status < 500;

export const isServerError = (status: number): boolean => 
  status >= 500;

export const isRetryableError = (status: number): boolean => 
  status === 408 || status === 429 || isServerError(status);

export const isSuccessOrRedirect = (status: number): boolean => 
  isSuccess(status) || isRedirect(status);