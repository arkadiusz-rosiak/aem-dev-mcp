import { 
  paginateLogLines, 
  countTokens, 
  TokenCountError
} from '@/utils/pagination.utils.js';

jest.mock('tiktoken', () => ({
  encoding_for_model: jest.fn(() => ({
    encode: jest.fn((text: string) => new Array(text.length).fill(0)),
    free: jest.fn()
  }))
}));

describe('pagination.utils', () => {
  describe('countTokens', () => {
    it('should count tokens for text', () => {
      const text = 'Hello world';
      const result = countTokens(text);
      expect(result).toBe(text.length);
    });

    it('should handle empty text', () => {
      const result = countTokens('');
      expect(result).toBe(0);
    });

    it('should throw TokenCountError on encoding failure', () => {
      const mockEncoding = require('tiktoken');
      mockEncoding.encoding_for_model.mockImplementationOnce(() => {
        throw new Error('Encoding failed');
      });

      expect(() => countTokens('test')).toThrow(TokenCountError);
    });
  });

  describe('paginateLogLines', () => {
    const shortLines = ['Line 1', 'Line 2', 'Line 3'];
    
    it('should paginate log lines correctly', () => {
      const result = paginateLogLines(shortLines, 1);
      
      expect(result.currentPage).toBe(1);
      expect(result.totalEntries).toBe(3);
      expect(result.entriesOnPage).toBe(3);
      expect(result.paginatedLines).toEqual(shortLines);
    });

    it('should handle empty lines', () => {
      const result = paginateLogLines([], 1);
      
      expect(result.currentPage).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.totalEntries).toBe(0);
      expect(result.entriesOnPage).toBe(0);
      expect(result.paginatedLines).toEqual([]);
    });

    it('should throw error for invalid page number', () => {
      expect(() => paginateLogLines(shortLines, 0)).toThrow('Page number must be at least 1');
      expect(() => paginateLogLines(shortLines, -1)).toThrow('Page number must be at least 1');
    });

    it('should handle page beyond available pages', () => {
      const result = paginateLogLines(shortLines, 2);
      
      expect(result.currentPage).toBe(2);
      expect(result.totalPages).toBe(1);
      expect(result.paginatedLines).toEqual([]);
      expect(result.entriesOnPage).toBe(0);
    });

    it('should split lines across multiple pages when token limit is exceeded', () => {
      const mockEncoding = require('tiktoken');
      mockEncoding.encoding_for_model.mockImplementation(() => ({
        encode: jest.fn((text: string) => {
          if (text === 'Long line that exceeds token limit') {
            return new Array(15000).fill(0);
          }
          return new Array(100).fill(0);
        }),
        free: jest.fn()
      }));

      const longLines = [
        'Long line that exceeds token limit',
        'Another long line that exceeds token limit',
        'Third line'
      ];

      const result = paginateLogLines(longLines, 1);
      
      expect(result.totalPages).toBeGreaterThan(1);
      expect(result.currentPage).toBe(1);
      expect(result.paginatedLines.length).toBeLessThan(longLines.length);
    });
  });
});