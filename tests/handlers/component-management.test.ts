import { 
  handleComponentList,
  handleComponentEnable,
  handleComponentDisable,
  handleComponentDetails,
  componentListTool,
  componentEnableTool,
  componentDisableTool,
  componentDetailsTool
} from '@/handlers/component-management.js';
import { AliasResolver } from '@/services/alias-resolver.js';
import { ParallelExecutor } from '@/services/parallel-executor.js';
import { AemHttpClient } from '@/services/http-client.js';
import { 
  AEMInstance, 
  OSGiComponent,
  ComponentOperationResult
} from '@/types/index.js';

jest.mock('@/services/alias-resolver.js');
jest.mock('@/services/parallel-executor.js');
jest.mock('@/services/http-client.js');
jest.mock('@/services/component-management.service.js');
jest.mock('@/utils/logger.js', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  }))
}));

describe('Component Management Handlers', () => {
  let mockResolver: jest.Mocked<AliasResolver>;
  let mockExecutor: jest.Mocked<ParallelExecutor>;
  let mockClient: jest.Mocked<AemHttpClient>;
  
  const testInstances: AEMInstance[] = [
    { url: 'http://test-author.example.com:4502', username: 'testuser', password: 'testpass' },
    { url: 'http://test-publish.example.com:4503', username: 'testuser', password: 'testpass' }
  ] as const;

  const mockComponents: OSGiComponent[] = [
    {
      id: 101,
      name: 'Test Component Service',
      pid: 'com.example.test.component',
      state: 'active',
      properties: {
        'service.id': 101,
        'service.pid': 'com.example.test.component',
        'component.name': 'Test Component Service'
      }
    },
    {
      id: 102,
      name: 'HTTP Client Component',
      pid: 'com.example.http.client.component',
      state: 'satisfied',
      properties: {
        'service.id': 102,
        'service.pid': 'com.example.http.client.component',
        'component.name': 'HTTP Client Component'
      }
    }
  ];

  const mockComponentOperationResult: ComponentOperationResult = {
    success: true,
    component: mockComponents[0],
    message: 'Component operation completed successfully'
  };


  beforeEach(() => {
    mockResolver = new AliasResolver('') as jest.Mocked<AliasResolver>;
    mockExecutor = new ParallelExecutor() as jest.Mocked<ParallelExecutor>;
    mockClient = new AemHttpClient() as jest.Mocked<AemHttpClient>;
    
    jest.clearAllMocks();
  });

  describe('Tool Definitions', () => {
    it('should have correct component list tool definition', () => {
      expect(componentListTool.name).toBe('aem_component_list');
      expect(componentListTool.description).toContain('List OSGi components');
      expect(componentListTool.inputSchema.properties).toHaveProperty('aliases');
      expect(componentListTool.inputSchema.properties).toHaveProperty('instances');
      expect(componentListTool.inputSchema.properties).toHaveProperty('stateFilter');
      expect(componentListTool.inputSchema.properties).toHaveProperty('nameFilter');
    });

    it('should have correct component enable tool definition', () => {
      expect(componentEnableTool.name).toBe('aem_component_enable');
      expect(componentEnableTool.description).toContain('Enable OSGi components');
      expect(componentEnableTool.inputSchema.properties).toHaveProperty('componentName');
      expect(componentEnableTool.inputSchema.properties).not.toHaveProperty('componentId');
      expect(componentEnableTool.inputSchema.required).toContain('componentName');
    });

    it('should have correct component disable tool definition', () => {
      expect(componentDisableTool.name).toBe('aem_component_disable');
      expect(componentDisableTool.description).toContain('Disable OSGi components');
    });

    it('should have correct component details tool definition', () => {
      expect(componentDetailsTool.name).toBe('aem_component_details');
      expect(componentDetailsTool.description).toContain('Get detailed information');
      expect(componentDetailsTool.inputSchema.properties).toHaveProperty('componentName');
      expect(componentDetailsTool.inputSchema.properties).not.toHaveProperty('componentId');
      expect(componentDetailsTool.inputSchema.required).toContain('componentName');
    });

  });

  describe('handleComponentList', () => {
    it('should handle instances parameter correctly', async () => {
      const args = { instances: [testInstances[0]] };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockComponents,
          duration: 200
        }
      ]);

      const result = await handleComponentList(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      expect(result.content[0].type).toBe('text');
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.total).toBe(1);
      expect(responseData.summary.successful).toBe(1);
      expect(Object.keys(responseData.results)).toContain('http://test-author.example.com:4502');
      expect(responseData.results['http://test-author.example.com:4502'].components).toHaveLength(2);
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
          data: mockComponents,
          duration: 200
        }
      ]);

      const result = await handleComponentList(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      expect(mockResolver.resolveAlias).toHaveBeenCalledWith('test-author');
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.successful).toBe(1);
    });

    it('should handle state and name filters', async () => {
      const args = { 
        instances: [testInstances[0]], 
        stateFilter: 'active',
        nameFilter: 'test'
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: [mockComponents[0]], // Only active test component
          duration: 200
        }
      ]);

      const result = await handleComponentList(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.results['http://test-author.example.com:4502'].components).toHaveLength(1);
      expect(responseData.results['http://test-author.example.com:4502'].components[0].state).toBe('active');
    });

    it('should handle validation errors correctly', async () => {
      const invalidArgs = {}; // Missing both aliases and instances

      const result = await handleComponentList(invalidArgs, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Component list failed');
      expect(result.content[0].text).toContain('Validation failed');
    });

    it('should handle executor failures gracefully', async () => {
      const args = { instances: [testInstances[0]] };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: false,
          error: 'Connection failed',
          duration: 5000
        }
      ]);

      const result = await handleComponentList(args, mockResolver, mockExecutor, mockClient);

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

      const result = await handleComponentList(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No instances to check after resolution');
    });
  });

  describe('handleComponentEnable', () => {
    it('should handle component enable with componentName', async () => {
      const args = { 
        instances: [testInstances[0]], 
        componentName: 'com.example.test.component'
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockComponentOperationResult,
          duration: 300
        }
      ]);

      const result = await handleComponentEnable(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.operation).toBe('enable');
      expect(responseData.summary.successful).toBe(1);
    });
  });

  describe('handleComponentDisable', () => {
    it('should handle component disable operation', async () => {
      const args = { 
        instances: [testInstances[0]], 
        componentName: 'com.example.test.component'
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockComponentOperationResult,
          duration: 300
        }
      ]);

      const result = await handleComponentDisable(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.operation).toBe('disable');
      expect(responseData.summary.successful).toBe(1);
    });
  });

  describe('handleComponentDetails', () => {
    it('should handle component details with componentName', async () => {
      const args = { 
        instances: [testInstances[0]], 
        componentName: 'com.example.test.component'
      };
      
      const mockComponentDetails = {
        id: 101,
        name: 'Test Component Service',
        state: 'active',
        pid: 'com.example.test.component',
        properties: {
          'Bundle': 'com.example.bundle (123)',
          'Service Type': 'singleton'
        }
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockComponentDetails,
          duration: 200
        }
      ]);

      const result = await handleComponentDetails(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.operation).toBe('details');
      expect(responseData.summary.successful).toBe(1);
      expect(responseData.results['http://test-author.example.com:4502'].success).toBe(true);
      expect(responseData.results['http://test-author.example.com:4502'].component).toEqual(mockComponentDetails);
    });

    it('should handle component details failures', async () => {
      const args = { 
        instances: [testInstances[0]], 
        componentName: 'nonexistent.component'
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: false,
          error: 'Component not found',
          duration: 100
        }
      ]);

      const result = await handleComponentDetails(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.failed).toBe(1);
      expect(responseData.results['http://test-author.example.com:4502'].success).toBe(false);
      expect(responseData.results['http://test-author.example.com:4502'].error).toBe('Component not found');
    });
  });

  describe('Component Operations - Common Tests', () => {
    it('should handle validation errors for missing component name', async () => {
      const invalidArgs = { 
        instances: [testInstances[0]]
        // Missing componentName
      };

      const result = await handleComponentEnable(invalidArgs, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Component enable failed');
      expect(result.content[0].text).toContain('Validation failed');
    });

    it('should handle operation failures', async () => {
      const args = { 
        instances: [testInstances[0]], 
        componentName: 'nonexistent.component'
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: false,
          error: 'Component not found',
          duration: 100
        }
      ]);

      const result = await handleComponentDisable(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.failed).toBe(1);
      expect(responseData.results['http://test-author.example.com:4502'].success).toBe(false);
    });
  });


  describe('Edge Cases', () => {
    it('should handle unexpected errors gracefully', async () => {
      const args = { instances: [testInstances[0]] };
      
      mockExecutor.executeOnInstances.mockRejectedValueOnce(new Error('Unexpected error'));

      const result = await handleComponentList(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Component list failed');
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

      const result = await handleComponentList(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.failed).toBe(1);
      expect(responseData.results['http://test-author.example.com:4502'].success).toBe(false);
    });

    it('should handle component details by exact name match (bug fix verification)', async () => {
      const args = { 
        instances: [testInstances[0]], 
        componentName: 'com.adobe.acs.commons.email.impl.EmailServiceImpl'
      };
      
      const mockComponentDetails = {
        id: 4075,
        name: 'com.adobe.acs.commons.email.impl.EmailServiceImpl',
        state: 'active',
        pid: 'com.adobe.acs.commons.email.impl.EmailServiceImpl',
        properties: {
          'Bundle': 'com.adobe.acs.commons (638)'
        }
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockComponentDetails,
          duration: 200
        }
      ]);

      const result = await handleComponentDetails(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.operation).toBe('details');
      expect(responseData.summary.successful).toBe(1);
      expect(responseData.results['http://test-author.example.com:4502'].component.name).toBe('com.adobe.acs.commons.email.impl.EmailServiceImpl');
      expect(responseData.results['http://test-author.example.com:4502'].component.id).toBe(4075);
    });

    it('should handle empty component name validation', async () => {
      const invalidArgs = { 
        instances: [testInstances[0]],
        componentName: ''
      };

      const result = await handleComponentEnable(invalidArgs, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Component enable failed');
      expect(result.content[0].text).toContain('Validation failed');
    });

    it('should handle whitespace-only component name validation', async () => {
      const invalidArgs = { 
        instances: [testInstances[0]],
        componentName: '   '
      };

      const result = await handleComponentDisable(invalidArgs, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Component disable failed');
      expect(result.content[0].text).toContain('Validation failed');
    });

    it('should handle component names with special characters', async () => {
      const args = { 
        instances: [testInstances[0]], 
        componentName: 'com.example.component-with_special.chars@domain'
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockComponentOperationResult,
          duration: 300
        }
      ]);

      const result = await handleComponentEnable(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.operation).toBe('enable');
      expect(responseData.summary.successful).toBe(1);
    });
  });
});