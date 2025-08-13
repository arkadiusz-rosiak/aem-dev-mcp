import { BundleManagementService } from '@/services/bundle-management.service.js';
import { AemHttpClient } from '@/services/http-client.js';
import {
  AEMInstance,
  BundleState,
  OSGI_ERROR_CODES,
  BundleInstallRequest
} from '@/types/index.js';
import { createTimeout } from '@/utils/type-factories.js';

jest.mock('@/services/http-client.js');
jest.mock('@/utils/logger.js');

describe('BundleManagementService', () => {
  let bundleService: BundleManagementService;
  let mockHttpClient: jest.Mocked<AemHttpClient>;
  let testInstance: AEMInstance;

  beforeEach(() => {
    mockHttpClient = new AemHttpClient() as jest.Mocked<AemHttpClient>;
    bundleService = new BundleManagementService(mockHttpClient);
    testInstance = {
      url: 'http://test-author.example.com:4502',
      username: 'testuser',
      password: 'testpass'
    } as const;
    
    jest.clearAllMocks();
  });

  describe('listBundles', () => {
    const mockBundleResponse = {
      status: 'Bundle information: 654 bundles in total, 646 bundles active, 7 bundles active fragments, 1 bundle installed.',
      s: [654, 646, 7, 0, 1],
      data: [
        {
          id: 0,
          name: 'System Bundle',
          fragment: false,
          stateRaw: 32,
          state: 'Active',
          version: '6.0.2',
          symbolicName: 'com.example.system.framework',
          category: ''
        },
        {
          id: 174,
          name: 'HTTP Client',
          fragment: false,
          stateRaw: 32,
          state: 'Active',
          version: '1.1.3',
          symbolicName: 'com.example.http.client',
          category: ''
        },
        {
          id: 175,
          name: 'Test Fragment Bundle',
          fragment: true,
          stateRaw: 4,
          state: 'Fragment',
          version: '1.0.0',
          symbolicName: 'test.fragment',
          category: 'test'
        },
        {
          id: 176,
          name: 'Installed Bundle',
          fragment: false,
          stateRaw: 2,
          state: 'Installed',
          version: '1.0.0',
          symbolicName: 'test.installed',
          category: 'test'
        }
      ]
    };

    it('should list all bundles successfully', async () => {
      jest.spyOn(bundleService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: mockBundleResponse
      });

      const result = await bundleService.listBundles(testInstance);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(4);
        expect(result.data[0]).toEqual({
          id: 0,
          name: 'System Bundle',
          symbolicName: 'com.example.system.framework',
          version: '6.0.2',
          state: 'Active',
          category: '',
          stateRaw: 32,
          fragment: false,
          imported: false
        });
      }
      expect(bundleService['makeAuthenticatedRequest']).toHaveBeenCalledWith(
        testInstance,
        '/system/console/bundles.json',
        'GET',
        undefined,
        expect.any(Number),
        'Bundle console unavailable',
        'Authentication required for bundle console'
      );
    });

    it('should filter bundles by state', async () => {
      jest.spyOn(bundleService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: mockBundleResponse
      });

      const result = await bundleService.listBundles(testInstance, 'Active');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data.every(bundle => bundle.state === 'Active')).toBe(true);
      }
    });

    it('should filter bundles by name', async () => {
      jest.spyOn(bundleService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: mockBundleResponse
      });

      const result = await bundleService.listBundles(testInstance, undefined, 'test');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data.every(bundle => 
          bundle.name.toLowerCase().includes('test') || 
          bundle.symbolicName.toLowerCase().includes('test')
        )).toBe(true);
      }
    });

    it('should handle authentication error', async () => {
      jest.spyOn(bundleService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: false,
        error: {
          code: OSGI_ERROR_CODES.PERMISSION_DENIED,
          message: 'Authentication failed'
        }
      });

      const result = await bundleService.listBundles(testInstance);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.PERMISSION_DENIED);
      }
    });

    it('should handle invalid bundle data', async () => {
      jest.spyOn(bundleService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: { status: 'ok' }
      });

      const result = await bundleService.listBundles(testInstance);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.OPERATION_FAILED);
        expect(result.error.message).toBe('Invalid bundle data received');
      }
    });

    it('should handle network error', async () => {
      const networkError = new Error('Network error');
      jest.spyOn(bundleService as any, 'makeAuthenticatedRequest').mockRejectedValue(networkError);

      const result = await bundleService.listBundles(testInstance);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.OPERATION_FAILED);
      }
    });
  });

  describe('startBundle', () => {
    it('should start bundle successfully', async () => {
      const bundleId = 123;
      
      jest.spyOn(bundleService as any, 'makeAuthenticatedRequest')
        .mockResolvedValueOnce({
          success: true,
          data: {}
        });

      jest.spyOn(bundleService, 'listBundles').mockResolvedValue({
        success: true,
        data: [{
          id: bundleId,
          name: 'Test Bundle',
          symbolicName: 'test.bundle',
          version: '1.0.0',
          state: 'Active' as BundleState,
          stateRaw: 32,
          fragment: false,
          imported: false,
          category: 'test'
        }],
        duration: 100
      });

      const result = await bundleService.startBundle(testInstance, bundleId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.bundle?.id).toBe(bundleId);
        expect(result.data.bundle?.state).toBe('Active');
      }
      expect(bundleService['makeAuthenticatedRequest']).toHaveBeenCalledWith(
        testInstance,
        `/system/console/bundles/${bundleId}`,
        'POST',
        'action=start',
        expect.any(Number),
        'Bundle start failed',
        'Authentication required'
      );
    });

    it('should handle bundle not found', async () => {
      const bundleId = 999;
      
      jest.spyOn(bundleService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: false,
        error: {
          code: OSGI_ERROR_CODES.BUNDLE_NOT_FOUND,
          message: 'Bundle not found'
        }
      });

      const result = await bundleService.startBundle(testInstance, bundleId);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.BUNDLE_NOT_FOUND);
      }
    });
  });

  describe('stopBundle', () => {
    it('should stop bundle successfully', async () => {
      const bundleId = 123;
      
      jest.spyOn(bundleService as any, 'makeAuthenticatedRequest')
        .mockResolvedValueOnce({
          success: true,
          data: {}
        });

      jest.spyOn(bundleService, 'listBundles').mockResolvedValue({
        success: true,
        data: [{
          id: bundleId,
          name: 'Test Bundle',
          symbolicName: 'test.bundle',
          version: '1.0.0',
          state: 'Resolved' as BundleState,
          stateRaw: 4,
          fragment: false,
          imported: false,
          category: 'test'
        }],
        duration: 100
      });

      const result = await bundleService.stopBundle(testInstance, bundleId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.bundle?.state).toBe('Resolved');
      }
    });
  });

  describe('restartBundle', () => {
    it('should restart bundle successfully', async () => {
      const bundleId = 123;
      
      jest.spyOn(bundleService as any, 'makeAuthenticatedRequest')
        .mockResolvedValue({ success: true, data: {} });

      jest.spyOn(bundleService, 'listBundles')
        .mockResolvedValueOnce({
          success: true,
          data: [{
            id: bundleId,
            name: 'Test Bundle',
            symbolicName: 'test.bundle',
            version: '1.0.0',
            state: 'Resolved' as BundleState,
            stateRaw: 4,
            fragment: false,
            imported: false,
            category: 'test'
          }],
          duration: 100
        })
        .mockResolvedValueOnce({
          success: true,
          data: [{
            id: bundleId,
            name: 'Test Bundle',
            symbolicName: 'test.bundle',
            version: '1.0.0',
            state: 'Active' as BundleState,
            stateRaw: 32,
            fragment: false,
            imported: false,
            category: 'test'
          }],
          duration: 100
        });

      const result = await bundleService.restartBundle(testInstance, bundleId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.bundle?.state).toBe('Active');
        expect(result.data.message).toBe('Bundle restarted successfully');
      }
    });

    it('should handle stop failure during restart', async () => {
      const bundleId = 123;
      
      jest.spyOn(bundleService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: false,
        error: {
          code: OSGI_ERROR_CODES.OPERATION_FAILED,
          message: 'Bundle stop failed'
        }
      });

      const result = await bundleService.restartBundle(testInstance, bundleId);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.OPERATION_FAILED);
      }
    });
  });

  describe('installBundle', () => {
    it('should install bundle from URL successfully', async () => {
      const installRequest: Omit<BundleInstallRequest, 'instanceAlias'> = {
        bundleUrl: 'https://example.com/bundle.jar',
        start: true,
        startLevel: 20,
        refresh: true
      };

      jest.spyOn(bundleService as any, 'makeAuthenticatedRequest')
        .mockResolvedValueOnce({
          success: true,
          data: 'Installation successful'
        });

      jest.spyOn(bundleService, 'listBundles').mockResolvedValue({
        success: true,
        data: [{
          id: 200,
          name: 'Newly Installed Bundle',
          symbolicName: 'new.bundle',
          version: '1.0.0',
          state: 'Active' as BundleState,
          stateRaw: 32,
          fragment: false,
          imported: false,
          category: 'test'
        }],
        duration: 100
      });

      const result = await bundleService.installBundle(testInstance, installRequest);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.bundle?.id).toBe(200);
        expect(result.data.message).toBe('Bundle installed successfully');
      }
    });

    it('should install bundle from file successfully', async () => {
      const bundleFile = Buffer.from('PK\x03\x04test bundle content');
      const installRequest: Omit<BundleInstallRequest, 'instanceAlias'> = {
        bundleFile,
        start: true
      };

      jest.spyOn(bundleService as any, 'makeAuthenticatedRequest')
        .mockResolvedValueOnce({
          success: true,
          data: 'Installation successful'
        });

      jest.spyOn(bundleService, 'listBundles').mockResolvedValue({
        success: true,
        data: [{
          id: 201,
          name: 'File Installed Bundle',
          symbolicName: 'file.bundle',
          version: '1.0.0',
          state: 'Active' as BundleState,
          stateRaw: 32,
          fragment: false,
          imported: false,
          category: 'test'
        }],
        duration: 100
      });

      const result = await bundleService.installBundle(testInstance, installRequest);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.bundle?.id).toBe(201);
      }
    });

    it('should handle invalid bundle file format', async () => {
      const bundleFile = Buffer.from('invalid content');
      const installRequest: Omit<BundleInstallRequest, 'instanceAlias'> = {
        bundleFile
      };

      const result = await bundleService.installBundle(testInstance, installRequest);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.INVALID_BUNDLE_FORMAT);
        expect(result.error.message).toBe('Bundle file must be a valid JAR/ZIP archive');
      }
    });

    it('should handle empty bundle file', async () => {
      const bundleFile = Buffer.alloc(0);
      const installRequest: Omit<BundleInstallRequest, 'instanceAlias'> = {
        bundleFile
      };

      const result = await bundleService.installBundle(testInstance, installRequest);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.INVALID_BUNDLE_FORMAT);
        expect(result.error.message).toBe('Bundle file is empty');
      }
    });

    it('should handle bundle with missing dependencies', async () => {
      const installRequest: Omit<BundleInstallRequest, 'instanceAlias'> = {
        bundleUrl: 'https://example.com/bundle-with-deps.jar'
      };

      jest.spyOn(bundleService as any, 'makeAuthenticatedRequest')
        .mockResolvedValueOnce({
          success: true,
          data: 'Installation successful'
        });

      jest.spyOn(bundleService, 'listBundles').mockResolvedValue({
        success: true,
        data: [{
          id: 202,
          name: 'Bundle With Missing Deps',
          symbolicName: 'missing.deps.bundle',
          version: '1.0.0',
          state: 'Installed' as BundleState,
          stateRaw: 2,
          fragment: false,
          imported: false,
          category: 'test'
        }],
        duration: 100
      });

      const result = await bundleService.installBundle(testInstance, installRequest);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.MISSING_DEPENDENCY);
        expect(result.error.message).toContain('Bundle installed but has missing dependencies');
      }
    });

    it('should require either bundleUrl or bundleFile', async () => {
      const installRequest: Omit<BundleInstallRequest, 'instanceAlias'> = {};

      const result = await bundleService.installBundle(testInstance, installRequest);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.INVALID_BUNDLE_FORMAT);
        expect(result.error.message).toBe('Either bundleUrl or bundleFile must be provided');
      }
    });
  });


  describe('custom configuration', () => {
    it('should use custom configuration when provided', () => {
      const customConfig = {
        timeout: createTimeout(30000),
        installTimeout: createTimeout(60000),
        maxBundleSize: 200 * 1024 * 1024,
        actionDelayMs: 2000
      };

      const customService = new BundleManagementService(mockHttpClient, customConfig);
      expect(customService).toBeInstanceOf(BundleManagementService);
    });
  });

  describe('edge cases', () => {
    it('should handle malformed bundle data gracefully', async () => {
      jest.spyOn(bundleService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: {
          data: [
            { id: 'not-a-number', name: 123, symbolicName: null },
            { id: 456, symbolicName: 'valid.bundle' },
            null,
            undefined,
            'not-an-object'
          ]
        }
      });

      const result = await bundleService.listBundles(testInstance);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(456);
      }
    });

    it('should handle bundle size validation', async () => {
      const largeBundleFile = Buffer.alloc(200 * 1024 * 1024);
      largeBundleFile[0] = 0x50;
      largeBundleFile[1] = 0x4B;
      largeBundleFile[2] = 0x03;
      largeBundleFile[3] = 0x04;
      
      const installRequest: Omit<BundleInstallRequest, 'instanceAlias'> = {
        bundleFile: largeBundleFile
      };

      const result = await bundleService.installBundle(testInstance, installRequest);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.INVALID_BUNDLE_FORMAT);
        expect(result.error.message).toContain('Bundle file too large');
      }
    });
  });
});