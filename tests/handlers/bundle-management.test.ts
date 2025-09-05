import { 
  handleBundleList,
  handleBundleStart,
  handleBundleStop,
  handleBundleRefresh,
  handleBundleRestart,
  handleBundleDetails,
  bundleListTool,
  bundleStartTool,
  bundleStopTool,
  bundleRefreshTool,
  bundleUninstallTool,
  bundleRestartTool,
  bundleDetailsTool
} from '@/handlers/bundle-management.js';
import { AliasResolver } from '@/services/alias-resolver.js';
import { ParallelExecutor } from '@/services/parallel-executor.js';
import { AemHttpClient } from '@/services/http-client.js';
import { 
  AEMInstance, 
  OSGiBundle,
  OSGiBundleDetails,
  BundleOperationResult,
  BundleDetailsResult
} from '@/types/index.js';

jest.mock('@/services/alias-resolver.js');
jest.mock('@/services/parallel-executor.js');
jest.mock('@/services/http-client.js');
jest.mock('@/services/bundle-management.service.js');
jest.mock('@/utils/logger.js', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  }))
}));

describe('Bundle Management Handlers', () => {
  let mockResolver: jest.Mocked<AliasResolver>;
  let mockExecutor: jest.Mocked<ParallelExecutor>;
  let mockClient: jest.Mocked<AemHttpClient>;
  
  const testInstances: AEMInstance[] = [
    { url: 'http://test-author.example.com:4502', username: 'testuser', password: 'testpass' },
    { url: 'http://test-publish.example.com:4503', username: 'testuser', password: 'testpass' }
  ] as const;

  const mockBundles: OSGiBundle[] = [
    {
      id: 1,
      name: 'System Framework',
      symbolicName: 'com.example.system.framework',
      version: '1.0.0',
      state: 'Active',
      stateRaw: 32,
      fragment: false,
      imported: false,
      category: 'system'
    },
    {
      id: 2,
      name: 'HTTP Client Bundle',
      symbolicName: 'com.example.http.client',
      version: '1.1.3',
      state: 'Active',
      stateRaw: 32,
      fragment: false,
      imported: false,
      category: 'network'
    }
  ];

  const mockBundleOperationResult: BundleOperationResult = {
    success: true,
    bundle: mockBundles[0],
    message: 'Bundle operation completed successfully'
  };

  const mockBundleDetails: OSGiBundleDetails = {
    id: 123,
    name: 'Test Detailed Bundle',
    symbolicName: 'test.detailed.bundle',
    version: '1.0.0',
    state: 'Active',
    stateRaw: 32,
    fragment: false,
    imported: false,
    category: 'test',
    description: 'A test bundle with detailed information',
    vendor: 'Test Vendor',
    location: 'file:/opt/aem/bundles/test.jar',
    lastModified: 1640995200000,
    startLevel: 20,
    exportedPackages: [
      { name: 'com.test.api', version: '1.0.0' },
      { name: 'com.test.util', version: '1.0.0' }
    ],
    importedPackages: [
      { name: 'org.slf4j', version: '1.7.0' }
    ],
    requiredBundles: [
      { symbolicName: 'org.slf4j.api', version: '1.7.0', optional: false, resolved: true }
    ],
    providedServices: [
      { id: 234, interfaces: ['com.test.api.TestService'], properties: { 'service.ranking': 100 } }
    ],
    usedServices: [
      { id: 123, interfaces: ['org.slf4j.LoggerFactory'], providingBundle: 45 }
    ]
  };

  const mockBundleDetailsResult: BundleDetailsResult = {
    success: true,
    bundleDetails: mockBundleDetails,
    message: 'Bundle details retrieved successfully'
  };


  beforeEach(() => {
    mockResolver = new AliasResolver('') as jest.Mocked<AliasResolver>;
    mockExecutor = new ParallelExecutor() as jest.Mocked<ParallelExecutor>;
    mockClient = new AemHttpClient() as jest.Mocked<AemHttpClient>;
    
    jest.clearAllMocks();
  });

  describe('Tool Definitions', () => {
    it('should have correct bundle list tool definition', () => {
      expect(bundleListTool.name).toBe('aem_bundle_list');
      expect(bundleListTool.description).toContain('List OSGi bundles');
      expect(bundleListTool.inputSchema.properties).toHaveProperty('aliases');
      expect(bundleListTool.inputSchema.properties).toHaveProperty('instances');
      expect(bundleListTool.inputSchema.properties).toHaveProperty('stateFilter');
      expect(bundleListTool.inputSchema.properties).toHaveProperty('nameFilter');
    });

    it('should have correct bundle start tool definition', () => {
      expect(bundleStartTool.name).toBe('aem_bundle_start');
      expect(bundleStartTool.description).toContain('Start OSGi bundles');
      expect(bundleStartTool.inputSchema.properties).toHaveProperty('bundleId');
      expect(bundleStartTool.inputSchema.properties).toHaveProperty('symbolicName');
    });

    it('should have correct bundle stop tool definition', () => {
      expect(bundleStopTool.name).toBe('aem_bundle_stop');
      expect(bundleStopTool.description).toContain('Stop OSGi bundles');
    });

    it('should have correct bundle refresh tool definition', () => {
      expect(bundleRefreshTool.name).toBe('aem_bundle_refresh');
      expect(bundleRefreshTool.description).toContain('Refresh OSGi bundles');
    });

    it('should have correct bundle uninstall tool definition', () => {
      expect(bundleUninstallTool.name).toBe('aem_bundle_uninstall');
      expect(bundleUninstallTool.description).toContain('Uninstall OSGi bundles');
    });

    it('should have correct bundle restart tool definition', () => {
      expect(bundleRestartTool.name).toBe('aem_bundle_restart');
      expect(bundleRestartTool.description).toContain('Restart OSGi bundles');
      expect(bundleRestartTool.inputSchema.properties).toHaveProperty('bundleId');
      expect(bundleRestartTool.inputSchema.properties).toHaveProperty('symbolicName');
    });

    it('should have correct bundle details tool definition', () => {
      expect(bundleDetailsTool.name).toBe('aem_bundle_details');
      expect(bundleDetailsTool.description).toContain('Get detailed information about OSGi bundles');
      expect(bundleDetailsTool.inputSchema.properties).toHaveProperty('bundleId');
      expect(bundleDetailsTool.inputSchema.properties).toHaveProperty('symbolicName');
      expect(bundleDetailsTool.inputSchema.properties).toHaveProperty('aliases');
      expect(bundleDetailsTool.inputSchema.properties).toHaveProperty('instances');
    });

  });

  describe('handleBundleList', () => {
    it('should handle instances parameter correctly', async () => {
      const args = { instances: [testInstances[0]] };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockBundles,
          duration: 200
        }
      ]);

      const result = await handleBundleList(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      expect(result.content[0].type).toBe('text');
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.total).toBe(1);
      expect(responseData.summary.successful).toBe(1);
      expect(Object.keys(responseData.results)).toContain('http://test-author.example.com:4502');
      expect(responseData.results['http://test-author.example.com:4502'].bundles).toHaveLength(2);
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
          data: mockBundles,
          duration: 200
        }
      ]);

      const result = await handleBundleList(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      expect(mockResolver.resolveAlias).toHaveBeenCalledWith('test-author');
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.successful).toBe(1);
    });

    it('should handle state and name filters', async () => {
      const args = { 
        instances: [testInstances[0]], 
        stateFilter: 'Active',
        nameFilter: 'system'
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: [mockBundles[0]], // Only system bundle
          duration: 200
        }
      ]);

      const result = await handleBundleList(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.results['http://test-author.example.com:4502'].bundles).toHaveLength(1);
      expect(responseData.results['http://test-author.example.com:4502'].bundles[0].category).toBe('system');
    });

    it('should handle validation errors correctly', async () => {
      const invalidArgs = {}; // Missing both aliases and instances

      const result = await handleBundleList(invalidArgs, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Bundle list failed');
      expect(result.content[0].text).toContain('No instances to check after resolution');
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

      const result = await handleBundleList(args, mockResolver, mockExecutor, mockClient);

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

      const result = await handleBundleList(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No instances to check after resolution');
    });
  });

  describe('handleBundleStart', () => {
    it('should handle bundle start with bundleId', async () => {
      const args = { 
        instances: [testInstances[0]], 
        bundleId: 123
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockBundleOperationResult,
          duration: 300
        }
      ]);

      const result = await handleBundleStart(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.operation).toBe('start');
      expect(responseData.summary.successful).toBe(1);
      expect(responseData.results['http://test-author.example.com:4502'].success).toBe(true);
    });

    it('should handle bundle start with symbolicName', async () => {
      const args = { 
        instances: [testInstances[0]], 
        symbolicName: 'com.example.test.bundle'
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockBundleOperationResult,
          duration: 300
        }
      ]);

      const result = await handleBundleStart(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.operation).toBe('start');
      expect(responseData.summary.successful).toBe(1);
    });
  });

  describe('handleBundleStop', () => {
    it('should handle bundle stop operation', async () => {
      const args = { 
        instances: [testInstances[0]], 
        bundleId: 123
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockBundleOperationResult,
          duration: 300
        }
      ]);

      const result = await handleBundleStop(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.operation).toBe('stop');
      expect(responseData.summary.successful).toBe(1);
    });
  });

  describe('Bundle Operations - Common Tests', () => {
    it('should handle validation errors for missing bundle identifier', async () => {
      const invalidArgs = { 
        instances: [testInstances[0]]
        // Missing both bundleId and symbolicName
      };

      const result = await handleBundleStart(invalidArgs, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Bundle start failed');
      expect(result.content[0].text).toContain('Validation failed');
    });

    it('should handle operation failures', async () => {
      const args = { 
        instances: [testInstances[0]], 
        bundleId: 999
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: false,
          error: 'Bundle not found',
          duration: 100
        }
      ]);

      const result = await handleBundleRefresh(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.failed).toBe(1);
      expect(responseData.results['http://test-author.example.com:4502'].success).toBe(false);
    });
  });


  describe('handleBundleRestart', () => {
    it('should handle bundle restart with bundleId', async () => {
      const args = { 
        instances: [testInstances[0]], 
        bundleId: 123
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: { ...mockBundleOperationResult, message: 'Bundle restarted successfully' },
          duration: 500
        }
      ]);

      const result = await handleBundleRestart(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.operation).toBe('restart');
      expect(responseData.summary.successful).toBe(1);
      expect(responseData.results['http://test-author.example.com:4502'].success).toBe(true);
      expect(responseData.results['http://test-author.example.com:4502'].message).toBe('Bundle restarted successfully');
    });

    it('should handle bundle restart with symbolicName', async () => {
      const args = { 
        instances: [testInstances[0]], 
        symbolicName: 'com.example.test.bundle'
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: { ...mockBundleOperationResult, message: 'Bundle restarted successfully' },
          duration: 500
        }
      ]);

      const result = await handleBundleRestart(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.operation).toBe('restart');
      expect(responseData.summary.successful).toBe(1);
    });

    it('should handle restart validation errors', async () => {
      const invalidArgs = { 
        instances: [testInstances[0]]
        // Missing both bundleId and symbolicName
      };

      const result = await handleBundleRestart(invalidArgs, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Bundle restart failed');
      expect(result.content[0].text).toContain('Validation failed');
    });

    it('should handle restart operation failures', async () => {
      const args = { 
        instances: [testInstances[0]], 
        bundleId: 999
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: false,
          error: 'Bundle restart failed',
          duration: 300
        }
      ]);

      const result = await handleBundleRestart(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.failed).toBe(1);
      expect(responseData.results['http://test-author.example.com:4502'].success).toBe(false);
    });
  });

  describe('handleBundleDetails', () => {
    it('should handle bundle details with bundleId', async () => {
      const args = { 
        instances: [testInstances[0]], 
        bundleId: 123
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockBundleDetailsResult,
          duration: 400
        }
      ]);

      const result = await handleBundleDetails(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.operation).toBe('bundle_details');
      expect(responseData.summary.successful).toBe(1);
      expect(responseData.results['http://test-author.example.com:4502'].success).toBe(true);
      expect(responseData.results['http://test-author.example.com:4502'].bundleDetails).toBeDefined();
      expect(responseData.results['http://test-author.example.com:4502'].bundleDetails.id).toBe(123);
      expect(responseData.results['http://test-author.example.com:4502'].bundleDetails.name).toBe('Test Detailed Bundle');
    });

    it('should handle bundle details with symbolicName', async () => {
      const args = { 
        instances: [testInstances[0]], 
        symbolicName: 'test.detailed.bundle'
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockBundleDetailsResult,
          duration: 400
        }
      ]);

      const result = await handleBundleDetails(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.operation).toBe('bundle_details');
      expect(responseData.summary.successful).toBe(1);
      expect(responseData.results['http://test-author.example.com:4502'].bundleDetails.symbolicName).toBe('test.detailed.bundle');
    });

    it('should handle bundle details validation errors', async () => {
      const invalidArgs = { 
        instances: [testInstances[0]]
        // Missing both bundleId and symbolicName
      };

      const result = await handleBundleDetails(invalidArgs, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Bundle details retrieval failed');
      expect(result.content[0].text).toContain('Validation failed');
    });

    it('should handle bundle not found for details', async () => {
      const args = { 
        instances: [testInstances[0]], 
        bundleId: 999
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: false,
          error: 'Bundle 999 not found',
          duration: 200
        }
      ]);

      const result = await handleBundleDetails(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.failed).toBe(1);
      expect(responseData.results['http://test-author.example.com:4502'].success).toBe(false);
    });

    it('should handle multiple instances for bundle details', async () => {
      const args = { 
        instances: testInstances, 
        bundleId: 123
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockBundleDetailsResult,
          duration: 400
        },
        {
          instanceUrl: 'http://test-publish.example.com:4503',
          success: true,
          data: mockBundleDetailsResult,
          duration: 450
        }
      ]);

      const result = await handleBundleDetails(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.total).toBe(2);
      expect(responseData.summary.successful).toBe(2);
      expect(responseData.summary.failed).toBe(0);
      expect(Object.keys(responseData.results)).toHaveLength(2);
    });

    it('should handle partial failures in bundle details', async () => {
      const args = { 
        instances: testInstances, 
        bundleId: 123
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockBundleDetailsResult,
          duration: 400
        },
        {
          instanceUrl: 'http://test-publish.example.com:4503',
          success: false,
          error: 'Connection timeout',
          duration: 5000
        }
      ]);

      const result = await handleBundleDetails(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.total).toBe(2);
      expect(responseData.summary.successful).toBe(1);
      expect(responseData.summary.failed).toBe(1);
      expect(responseData.results['http://test-author.example.com:4502'].success).toBe(true);
      expect(responseData.results['http://test-publish.example.com:4503'].success).toBe(false);
    });

    it('should handle detailed bundle information structure', async () => {
      const args = { 
        instances: [testInstances[0]], 
        bundleId: 123
      };
      
      mockExecutor.executeOnInstances.mockResolvedValueOnce([
        {
          instanceUrl: 'http://test-author.example.com:4502',
          success: true,
          data: mockBundleDetailsResult,
          duration: 400
        }
      ]);

      const result = await handleBundleDetails(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      const bundleDetails = responseData.results['http://test-author.example.com:4502'].bundleDetails;
      
      expect(bundleDetails.description).toBe('A test bundle with detailed information');
      expect(bundleDetails.vendor).toBe('Test Vendor');
      expect(bundleDetails.exportedPackages).toHaveLength(2);
      expect(bundleDetails.importedPackages).toHaveLength(1);
      expect(bundleDetails.providedServices).toHaveLength(1);
      expect(bundleDetails.usedServices).toHaveLength(1);
      expect(bundleDetails.startLevel).toBe(20);
    });
  });

  describe('Edge Cases', () => {
    it('should handle unexpected errors gracefully', async () => {
      const args = { instances: [testInstances[0]] };
      
      mockExecutor.executeOnInstances.mockRejectedValueOnce(new Error('Unexpected error'));

      const result = await handleBundleList(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Bundle list failed');
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

      const result = await handleBundleList(args, mockResolver, mockExecutor, mockClient);

      expect(result.isError).toBe(false);
      
      const responseData = JSON.parse(result.content[0].text!);
      expect(responseData.summary.failed).toBe(1);
      expect(responseData.results['http://test-author.example.com:4502'].success).toBe(false);
    });

    it('should handle network timeouts in new handlers', async () => {
      const args = { instances: [testInstances[0]], bundleId: 123 };
      
      mockExecutor.executeOnInstances.mockRejectedValueOnce(new Error('Network timeout'));

      const resultRestart = await handleBundleRestart(args, mockResolver, mockExecutor, mockClient);
      expect(resultRestart.isError).toBe(true);
      expect(resultRestart.content[0].text).toContain('Bundle restart failed');

      const resultDetails = await handleBundleDetails(args, mockResolver, mockExecutor, mockClient);
      expect(resultDetails.isError).toBe(true);
      expect(resultDetails.content[0].text).toContain('Bundle details retrieval failed');
    });
  });
});