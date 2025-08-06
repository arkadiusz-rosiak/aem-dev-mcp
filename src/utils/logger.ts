export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  private level: LogLevel;
  
  constructor(level: LogLevel = 'info') {
    this.level = process.env.MCP_AEM_LOG_LEVEL as LogLevel || level;
  }
  
  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
    
    return levels[level] >= levels[this.level];
  }
  
  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    if (!this.shouldLog(level)) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context
    };
    
    console.log(JSON.stringify(logEntry));
  }
  
  debug(message: string, context?: Record<string, any>): void {
    this.log('debug', message, context);
  }
  
  info(message: string, context?: Record<string, any>): void {
    this.log('info', message, context);
  }
  
  warn(message: string, context?: Record<string, any>): void {
    this.log('warn', message, context);
  }
  
  error(message: string, context?: Record<string, any>): void {
    this.log('error', message, context);
  }
}