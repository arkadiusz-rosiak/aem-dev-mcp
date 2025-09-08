import { 
  handleConfigurationList,
  handleConfigurationGet,
  handleConfigurationCreate,
  handleConfigurationUpdate,
  handleConfigurationDelete,
  handleConfigurationUnbind,
  configurationListTool,
  configurationGetTool,
  configurationCreateTool,
  configurationUpdateTool,
  configurationDeleteTool,
  configurationUnbindTool
} from '@/handlers/configuration-management.js';
import { AliasResolver } from '@/services/alias-resolver.js';
import { ParallelExecutor } from '@/services/parallel-executor.js';
import { AemHttpClient } from '@/services/http-client.js';
import { 
  AEMInstance, 
  OSGiConfiguration,
  ConfigurationOperationResult
} from '@/types/index.js';

jest.mock('@/services/alias-resolver.js');
jest.mock('@/services/parallel-executor.js');
jest.mock('@/services/http-client.js');
jest.mock('@/services/configuration-management.service.js');
jest.mock('@/utils/logger.js', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  }))
}));

describe('Configuration Management Handlers', () => {
  let mockResolver: jest.Mocked<AliasResolver>;
  let mockExecutor: jest.Mocked<ParallelExecutor>;
  let mockClient: jest.Mocked<AemHttpClient>;
  
  const testInstances: AEMInstance[] = [
    { url: 'http://test-author.example.com:4502', username: 'testuser', password: 'testpass' },
    { url: 'http://test-publish.example.com:4503', username: 'testuser', password: 'testpass' }
  ] as const;

  const mockConfigurations: OSGiConfiguration[] = [
    {
      pid: 'com.example.test.config',
      factoryPid: undefined,
      bundleLocation: 'example:com.example.test.bundle',
      properties: {
        'service.pid': { name: 'service.pid', value: 'com.example.test.config', type: 'String' },
        'timeout': { name: 'timeout', value: 30000, type: 'Long' },
        'enabled': { name: 'enabled', value: true, type: 'Boolean' }
      },
      description: 'Test configuration service'
    },
    {
      pid: 'com.example.http.config~factory',
      factoryPid: 'com.example.http.config',
      bundleLocation: 'example:com.example.http.bundle',
      properties: {
        'service.factoryPid': { name: 'service.factoryPid', value: 'com.example.http.config', type: 'String' },
        'port': { name: 'port', value: 8080, type: 'Integer' },
        'host': { name: 'host', value: 'localhost', type: 'String' }
      },
      description: 'HTTP factory configuration'
    }
  ];

  const mockConfigurationOperationResult: ConfigurationOperationResult = {
    success: true,
    configuration: mockConfigurations[0],
    message: 'Configuration operation completed successfully'
  };

  beforeEach(() => {
    mockResolver = new AliasResolver('') as jest.Mocked<AliasResolver>;
    mockExecutor = new ParallelExecutor() as jest.Mocked<ParallelExecutor>;
    mockClient = new AemHttpClient() as jest.Mocked<AemHttpClient>;
    
    jest.clearAllMocks();
  });

  describe('Tool Definitions', () => {
    it('should have correct configuration list tool definition', () => {
      expect(configurationListTool.name).toBe('aem_configuration_list');
      expect(configurationListTool.description).toContain('List OSGi configurations');
      expect(configurationListTool.inputSchema.properties).toHaveProperty('aliases');
      expect(configurationListTool.inputSchema.properties).toHaveProperty('instances');
      expect(configurationListTool.inputSchema.properties).toHaveProperty('pidFilter');
    });

    it('should have correct configuration get tool definition', () => {
      expect(configurationGetTool.name).toBe('aem_configuration_get');
      expect(configurationGetTool.description).toContain('Get a specific OSGi configuration');
      expect(configurationGetTool.inputSchema.properties).toHaveProperty('pid');
      expect(configurationGetTool.inputSchema.required).toContain('pid');
    });

    it('should have correct configuration create tool definition', () => {
      expect(configurationCreateTool.name).toBe('aem_configuration_create');
      expect(configurationCreateTool.description).toContain('Create a new OSGi configuration');
      expect(configurationCreateTool.inputSchema.properties).toHaveProperty('pid');
      expect(configurationCreateTool.inputSchema.properties).toHaveProperty('properties');
      expect(configurationCreateTool.inputSchema.required).toContain('pid');
      expect(configurationCreateTool.inputSchema.required).toContain('properties');
    });

    it('should have correct configuration update tool definition', () => {
      expect(configurationUpdateTool.name).toBe('aem_configuration_update');
      expect(configurationUpdateTool.description).toContain('Update an existing OSGi configuration');
      expect(configurationUpdateTool.inputSchema.properties).toHaveProperty('pid');
      expect(configurationUpdateTool.inputSchema.properties).toHaveProperty('properties');
    });

    it('should have correct configuration delete tool definition', () => {
      expect(configurationDeleteTool.name).toBe('aem_configuration_delete');
      expect(configurationDeleteTool.description).toContain('Delete an OSGi configuration');
      expect(configurationDeleteTool.inputSchema.properties).toHaveProperty('pid');
      expect(configurationDeleteTool.inputSchema.required).toContain('pid');
    });

    it('should have correct configuration unbind tool definition', () => {
      expect(configurationUnbindTool.name).toBe('aem_configuration_unbind');
      expect(configurationUnbindTool.description).toContain('Unbind an OSGi configuration');
      expect(configurationUnbindTool.inputSchema.properties).toHaveProperty('pid');
      expect(configurationUnbindTool.inputSchema.required).toContain('pid');
    });
  });

  describe('handleConfigurationList', () => {
    it('should handle instances parameter correctly', async () => {
      const args = { instances: [testInstances[0]] };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockConfigurations,
          duration: 200
        }
      ]);

      const result = await handleConfigurationList(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      expect(result.content[0].type).toBe('text');
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.total).toBe(1);
      expect(responseData.summary.successful).toBe(1);
      expect(Object.keys(responseData.results)).toContain('http://test-author.example.com:4502');
      expect(responseData.results['http://test-author.example.com:4502'].configurations).toHaveLength(2);
    });

    it('should handle aliases parameter correctly', async () => {
      const args = { aliases: ['test-author'] };
      
      mockResolver.resolveAlias.mockResolvedValueOnce({
        alias: 'test-author',
        instances: [testInstances[0]],
        resolved: true
      });

      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockConfigurations,
          duration: 200
        }
      ]);

      const result = await handleConfigurationList(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      expect(mockResolver.resolveAlias).toHaveBeenCalledWith('test-author');
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.successful).toBe(1);
    });

    it('should handle PID filter', async () => {
      const args = { 
        instances: [testInstances[0]], 
        pidFilter: 'com.example.test'
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: [mockConfigurations[0]], // Only test config
          duration: 200
        }
      ]);

      const result = await handleConfigurationList(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.results['http://test-author.example.com:4502'].configurations).toHaveLength(1);
      expect(responseData.results['http://test-author.example.com:4502'].configurations[0].pid).toBe('com.example.test.config');
    });

    it('should handle validation errors correctly', async () => {
      const invalidArgs = {}; // Missing both aliases and instances

      const result = await handleConfigurationList(invalidArgs, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Configuration list failed');
      expect(result.content[0].text).toContain('No instances to check after resolution');
    });
  });

  describe('handleConfigurationGet', () => {
    it('should handle get configuration correctly', async () => {
      const args = { 
        instances: [testInstances[0]], 
        pid: 'com.example.test.config'
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockConfigurations[0],
          duration: 150
        }
      ]);

      const result = await handleConfigurationGet(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.pid).toBe('com.example.test.config');
      expect(responseData.summary.successful).toBe(1);
      expect(responseData.results['http://test-author.example.com:4502'].configuration).toEqual(mockConfigurations[0]);
    });

    it('should handle missing PID validation error', async () => {
      const invalidArgs = { instances: [testInstances[0]] }; // Missing PID

      const result = await handleConfigurationGet(invalidArgs, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Configuration get failed');
      expect(result.content[0].text).toContain('Validation failed');
    });
  });

  describe('handleConfigurationCreate', () => {
    it('should handle create configuration correctly', async () => {
      const args = { 
        instances: [testInstances[0]], 
        pid: 'com.example.new.config',
        properties: {
          'timeout': { name: 'timeout', value: 5000, type: 'Long' },
          'enabled': { name: 'enabled', value: true, type: 'Boolean' }
        }
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockConfigurationOperationResult,
          duration: 300
        }
      ]);

      const result = await handleConfigurationCreate(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.operation).toBe('create');
      expect(responseData.summary.successful).toBe(1);
    });

    it('should handle factory configuration creation', async () => {
      const args = { 
        instances: [testInstances[0]], 
        pid: 'com.example.factory.config~instance1',
        factoryPid: 'com.example.factory.config',
        properties: {
          'name': { name: 'name', value: 'instance1', type: 'String' }
        }
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockConfigurationOperationResult,
          duration: 300
        }
      ]);

      const result = await handleConfigurationCreate(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.operation).toBe('create');
      expect(responseData.summary.successful).toBe(1);
    });
  });

  describe('handleConfigurationUpdate', () => {
    it('should handle update configuration correctly', async () => {
      const args = { 
        instances: [testInstances[0]], 
        pid: 'com.example.test.config',
        properties: {
          'timeout': { name: 'timeout', value: 60000, type: 'Long' },
          'enabled': { name: 'enabled', value: false, type: 'Boolean' }
        }
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockConfigurationOperationResult,
          duration: 250
        }
      ]);

      const result = await handleConfigurationUpdate(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.operation).toBe('update');
      expect(responseData.summary.successful).toBe(1);
    });

    it('should handle update validation errors', async () => {
      const invalidArgs = { 
        instances: [testInstances[0]], 
        pid: 'com.example.test.config'
        // Missing properties
      };

      const result = await handleConfigurationUpdate(invalidArgs, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Configuration update failed');
      expect(result.content[0].text).toContain('Validation failed');
    });
  });

  describe('handleConfigurationDelete', () => {
    it('should handle delete configuration correctly', async () => {
      const args = { 
        instances: [testInstances[0]], 
        pid: 'com.example.test.config'
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: { success: true, message: 'Configuration deleted successfully' },
          duration: 200
        }
      ]);

      const result = await handleConfigurationDelete(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.operation).toBe('delete');
      expect(responseData.summary.successful).toBe(1);
    });

    it('should handle delete failures gracefully', async () => {
      const args = { 
        instances: [testInstances[0]], 
        pid: 'nonexistent.config'
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: false,
          error: 'Configuration not found',
          duration: 100
        }
      ]);

      const result = await handleConfigurationDelete(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.failed).toBe(1);
      expect(responseData.results['http://test-author.example.com:4502'].success).toBe(false);
    });
  });

  describe('handleConfigurationUnbind', () => {
    it('should handle unbind configuration correctly', async () => {
      const args = { 
        instances: [testInstances[0]], 
        pid: 'com.example.test.config',
        bundleLocation: 'example:com.example.test.bundle'
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: { success: true, message: 'Configuration unbound successfully' },
          duration: 200
        }
      ]);

      const result = await handleConfigurationUnbind(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.operation).toBe('unbind');
      expect(responseData.summary.successful).toBe(1);
    });

    it('should handle unbind without bundle location', async () => {
      const args = { 
        instances: [testInstances[0]], 
        pid: 'com.example.test.config'
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: { success: true, message: 'Configuration unbound successfully' },
          duration: 200
        }
      ]);

      const result = await handleConfigurationUnbind(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.operation).toBe('unbind');
      expect(responseData.summary.successful).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle unexpected errors gracefully', async () => {
      const args = { instances: [testInstances[0]] };
      
      mockExecutor.executeOnInstances.mockRejectedValueOnce(new Error('Unexpected error'));

      const result = await handleConfigurationList(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Configuration list failed');
      expect(result.content[0].text).toContain('Unexpected error');
    });

    it('should handle malformed executor results', async () => {
      const args = { instances: [testInstances[0]] };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: false,
          error: 'Malformed data received',
          duration: 200
        }
      ]);

      const result = await handleConfigurationList(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.failed).toBe(1);
      expect(responseData.results['http://test-author.example.com:4502'].success).toBe(false);
    });

    it('should handle empty instances after resolution', async () => {
      const args = { aliases: ['nonexistent-alias'] };
      
      mockResolver.resolveAlias.mockResolvedValueOnce({
        alias: 'nonexistent-alias',
        instances: [],
        resolved: false,
        error: 'Alias not found'
      });

      const result = await handleConfigurationList(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No instances to check after resolution');
    });
  });
});