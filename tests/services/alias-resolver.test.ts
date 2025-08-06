import { AliasResolver } from '../../src/services/alias-resolver.js';
import * as fs from 'node:fs';
import * as yaml from 'js-yaml';

jest.mock('node:fs');
jest.mock('js-yaml');

describe('AliasResolver', () => {
  let resolver: AliasResolver;
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockYaml = yaml as jest.Mocked<typeof yaml>;

  beforeEach(() => {
    resolver = new AliasResolver('./test-config.yml');
    jest.clearAllMocks();
  });

  describe('resolveAlias', () => {
    it('should resolve alias to instances array', async () => {
      const mockConfig = {
        local: [
          { url: 'http://localhost:4502', username: 'admin', password: 'admin' }
        ]
      };

      mockFs.promises.readFile.mockResolvedValue('mock-yaml-content');
      mockYaml.load.mockReturnValue(mockConfig);

      const result = await resolver.resolveAlias('local');

      expect(result.resolved).toBe(true);
      expect(result.instances).toHaveLength(1);
      expect(result.instances[0]).toEqual({
        url: 'http://localhost:4502',
        username: 'admin',
        password: 'admin'
      });
    });

    it('should return error for non-existent alias', async () => {
      const mockConfig = {};

      mockFs.promises.readFile.mockResolvedValue('mock-yaml-content');
      mockYaml.load.mockReturnValue(mockConfig);

      const result = await resolver.resolveAlias('nonexistent');

      expect(result.resolved).toBe(false);
      expect(result.error).toContain("Alias 'nonexistent' not found");
    });

    it('should handle file read errors', async () => {
      mockFs.promises.readFile.mockRejectedValue(new Error('File not found'));

      const result = await resolver.resolveAlias('local');

      expect(result.resolved).toBe(false);
      expect(result.error).toContain('Failed to load configuration');
    });
  });

  describe('resolveMultipleAliases', () => {
    it('should resolve multiple aliases successfully', async () => {
      const mockConfig = {
        local: [{ url: 'http://localhost:4502', username: 'admin', password: 'admin' }],
        dev: [{ url: 'http://dev:4502', username: 'admin', password: 'dev-pass' }]
      };

      mockFs.promises.readFile.mockResolvedValue('mock-yaml-content');
      mockYaml.load.mockReturnValue(mockConfig);

      const result = await resolver.resolveMultipleAliases(['local', 'dev']);

      expect(result.resolved).toBe(true);
      expect(result.instances).toHaveLength(2);
    });

    it('should return error if any alias fails to resolve', async () => {
      const mockConfig = {
        local: [{ url: 'http://localhost:4502', username: 'admin', password: 'admin' }]
      };

      mockFs.promises.readFile.mockResolvedValue('mock-yaml-content');
      mockYaml.load.mockReturnValue(mockConfig);

      const result = await resolver.resolveMultipleAliases(['local', 'nonexistent']);

      expect(result.resolved).toBe(false);
      expect(result.error).toContain('nonexistent');
    });
  });

  describe('listAliases', () => {
    it('should return list of available aliases', async () => {
      const mockConfig = {
        local: [{ url: 'http://localhost:4502', username: 'admin', password: 'admin' }],
        dev: [{ url: 'http://dev:4502', username: 'admin', password: 'dev-pass' }]
      };

      mockFs.promises.readFile.mockResolvedValue('mock-yaml-content');
      mockYaml.load.mockReturnValue(mockConfig);

      const aliases = await resolver.listAliases();

      expect(aliases).toEqual(['local', 'dev']);
    });
  });
});