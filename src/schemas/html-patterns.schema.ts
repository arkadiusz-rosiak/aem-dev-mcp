export interface HTMLPatternMatcher {
  readonly pattern: RegExp;
  readonly transform: (match: RegExpMatchArray) => number;
}

export const createHTMLMatcher = (
  pattern: RegExp, 
  transform: (match: RegExpMatchArray) => number
): HTMLPatternMatcher => ({
  pattern,
  transform
});

export const parseCommaSeparatedNumber = (value: string): number => 
  parseInt(value.replace(/,/g, ''), 10);

export const HTML_PATTERNS = {
  heapMemory: createHTMLMatcher(
    /Heap Memory Usage.*?(\d+(?:,\d+)*)\s*of\s*(\d+(?:,\d+)*)/s,
    (match) => parseCommaSeparatedNumber(match[1])
  ),
  heapMemoryMax: createHTMLMatcher(
    /Heap Memory Usage.*?(\d+(?:,\d+)*)\s*of\s*(\d+(?:,\d+)*)/s,
    (match) => parseCommaSeparatedNumber(match[2])
  ),
  nonHeapMemory: createHTMLMatcher(
    /Non-Heap Memory Usage.*?(\d+(?:,\d+)*)\s*of\s*(\d+(?:,\d+)*)/s,
    (match) => parseCommaSeparatedNumber(match[1])
  ),
  nonHeapMemoryMax: createHTMLMatcher(
    /Non-Heap Memory Usage.*?(\d+(?:,\d+)*)\s*of\s*(\d+(?:,\d+)*)/s,
    (match) => parseCommaSeparatedNumber(match[2])
  ),
  liveThreads: createHTMLMatcher(
    /Live threads:\s*(\d+)/,
    (match) => parseInt(match[1], 10)
  ),
  runnableThreads: createHTMLMatcher(
    /RUNNABLE.*?(\d+)/,
    (match) => parseInt(match[1], 10)
  ),
  blockedThreads: createHTMLMatcher(
    /BLOCKED.*?(\d+)/,
    (match) => parseInt(match[1], 10)
  ),
  waitingThreads: createHTMLMatcher(
    /WAITING.*?(\d+)/,
    (match) => parseInt(match[1], 10)
  ),
  timedWaitingThreads: createHTMLMatcher(
    /TIMED_WAITING.*?(\d+)/,
    (match) => parseInt(match[1], 10)
  ),
  deadlockedThreads: createHTMLMatcher(
    /Deadlocked threads:\s*(\d+)/,
    (match) => parseInt(match[1], 10)
  ),
  averageResponseTime: createHTMLMatcher(
    /Average.*?(\d+(?:\.\d+)?)\s*ms/,
    (match) => parseFloat(match[1])
  ),
  activeRequests: createHTMLMatcher(
    /Active Requests.*?(\d+)/,
    (match) => parseInt(match[1], 10)
  ),
  queuedRequests: createHTMLMatcher(
    /Queued Requests.*?(\d+)/,
    (match) => parseInt(match[1], 10)
  ),
  errorRate: createHTMLMatcher(
    /Error Rate.*?(\d+(?:\.\d+)?)%/,
    (match) => parseFloat(match[1])
  )
} as const;

export const extractFromHTML = (html: string, matcher: HTMLPatternMatcher): number => {
  const match = html.match(matcher.pattern);
  return match ? matcher.transform(match) : 0;
};