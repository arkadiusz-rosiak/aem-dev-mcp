import { AliasResolver } from '@/services/alias-resolver';
import * as fs from 'node:fs';
import * as yaml from 'js-yaml';

jest.mock('node:fs', () => ({
  promises: {
    readFile: jest.fn()
  }
}));
jest.mock('js-yaml', () => ({
  load: jest.fn()
}));

describe('AliasResolver', () => {
  let resolver: AliasResolver;
  const mockYaml = yaml as jest.Mocked<typeof yaml>;

  beforeEach(() => {
    resolver = new AliasResolver('./test-config.yml');
    jest.clearAllMocks();
  });

  describe('resolveAlias', () => {
    it('should resolve alias to instances array', async () => {
      const mockConfig = {
        local: [
          { url: 'http://test.example.com:4502', username: 'testuser', password: 'testpass' }
        ]
      };

      (fs.promises.readFile as jest.Mock).mockResolvedValue('mock-yaml-content');
      mockYaml.load.mockReturnValue(mockConfig);

      const result = await resolver.resolveAlias('local');

      expect(result.resolved).toBe(true);
      expect(result.instances).toHaveLength(1);
      expect(result.instances[0]).toEqual({
        url: 'http://test.example.com:4502',
        username: 'testuser',
        password: 'testpass'
      });
    });

    it('should return error for non-existent alias', async () => {
      const mockConfig = {};

      (fs.promises.readFile as jest.Mock).mockResolvedValue('mock-yaml-content');
      mockYaml.load.mockReturnValue(mockConfig);

      const result = await resolver.resolveAlias('nonexistent');

      expect(result.resolved).toBe(false);
      expect(result.error).toContain("Alias 'nonexistent' not found");
    });

    it('should handle file read errors', async () => {
      (fs.promises.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

      const result = await resolver.resolveAlias('local');

      expect(result.resolved).toBe(false);
      expect(result.error).toContain('Failed to load configuration');
    });
  });

  describe('resolveMultipleAliases', () => {
    it('should resolve multiple aliases successfully', async () => {
      const mockConfig = {
        local: [{ url: 'http://test.example.com:4502', username: 'testuser', password: 'testpass' }],
        dev: [{ url: 'http://dev:4502', username: 'admin', password: 'dev-pass' }]
      };

      (fs.promises.readFile as jest.Mock).mockResolvedValue('mock-yaml-content');
      mockYaml.load.mockReturnValue(mockConfig);

      const result = await resolver.resolveMultipleAliases(['local', 'dev']);

      expect(result.resolved).toBe(true);
      expect(result.instances).toHaveLength(2);
    });

    it('should return error if any alias fails to resolve', async () => {
      const mockConfig = {
        local: [{ url: 'http://test.example.com:4502', username: 'testuser', password: 'testpass' }]
      };

      (fs.promises.readFile as jest.Mock).mockResolvedValue('mock-yaml-content');
      mockYaml.load.mockReturnValue(mockConfig);

      const result = await resolver.resolveMultipleAliases(['local', 'nonexistent']);

      expect(result.resolved).toBe(false);
      expect(result.error).toContain('nonexistent');
    });
  });

  describe('listAliases', () => {
    it('should return list of available aliases', async () => {
      const mockConfig = {
        local: [{ url: 'http://test.example.com:4502', username: 'testuser', password: 'testpass' }],
        dev: [{ url: 'http://dev:4502', username: 'admin', password: 'dev-pass' }]
      };

      (fs.promises.readFile as jest.Mock).mockResolvedValue('mock-yaml-content');
      mockYaml.load.mockReturnValue(mockConfig);

      const aliases = await resolver.listAliases();

      expect(aliases).toEqual(['local', 'dev']);
    });
  });
});