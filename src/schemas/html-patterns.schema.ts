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
    /'Overall Heap Memory Usage':'.*?used = (\d+)/,
    (match) => parseInt(match[1], 10)
  ),
  heapMemoryMax: createHTMLMatcher(
    /'Overall Heap Memory Usage':'.*?max = (\d+)/,
    (match) => parseInt(match[1], 10)
  ),
  nonHeapMemory: createHTMLMatcher(
    /'Overall Non-Heap Memory Usage':'.*?used = (\d+)/,
    (match) => parseInt(match[1], 10)
  ),
  nonHeapMemoryMax: createHTMLMatcher(
    /'Overall Non-Heap Memory Usage':'.*?max = (-?\d+)/,
    (match) => {
      const value = parseInt(match[1], 10);
      return value < 0 ? 0 : value;
    }
  ),
  liveThreads: createHTMLMatcher(
    /Status:[\s&nbsp;]*(\d+)[\s&nbsp;]*threads/,
    (match) => parseInt(match[1], 10)
  ),
  aliveThreads: createHTMLMatcher(
    /(\d+)[\s&nbsp;]*alive/,
    (match) => parseInt(match[1], 10)
  ),
  daemonThreads: createHTMLMatcher(
    /(\d+)[\s&nbsp;]*daemon/,
    (match) => parseInt(match[1], 10)
  ),
  interruptedThreads: createHTMLMatcher(
    /(\d+)[\s&nbsp;]*interrupted/,
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