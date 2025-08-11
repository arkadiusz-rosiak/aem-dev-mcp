import { ComponentManagementService } from '@/services/component-management.service.js';
import { AemHttpClient } from '@/services/http-client.js';
import {
  AEMInstance,
  ComponentState,
  OSGI_ERROR_CODES
} from '@/types/index.js';
import { createTimeout } from '@/utils/type-factories.js';

jest.mock('@/services/http-client.js');
jest.mock('@/utils/logger.js');

describe('ComponentManagementService', () => {
  let componentService: ComponentManagementService;
  let mockHttpClient: jest.Mocked<AemHttpClient>;
  let testInstance: AEMInstance;

  beforeEach(() => {
    mockHttpClient = new AemHttpClient() as jest.Mocked<AemHttpClient>;
    componentService = new ComponentManagementService(mockHttpClient);
    testInstance = {
      url: 'http://test-author.example.com:4502',
      username: 'testuser',
      password: 'testpass'
    } as const;
    
    jest.clearAllMocks();
  });

  describe('listComponents', () => {
    const mockComponentResponse = {
      data: [
        {
          id: 1,
          bundleId: 638,
          name: 'com.example.web.headers.impl.ExpiresHeaderFilter',
          state: 'no config',
          stateRaw: -1,
          pid: 'com.example.web.headers.impl.ExpiresHeaderFilter',
          configurable: 'com.example.web.headers.impl.ExpiresHeaderFilter',
          props: {
            'service.pid': 'com.example.web.headers.impl.ExpiresHeaderFilter',
            'component.name': 'ExpiresHeaderFilter'
          }
        },
        {
          id: 2,
          bundleId: 652,
          name: 'com.testcompany.app.core.api.authoronly.AuthorOnly',
          state: 'active',
          stateRaw: 1,
          pid: 'com.testcompany.app.core.api.authoronly.AuthorOnly',
          props: {
            'service.pid': 'com.testcompany.app.core.api.authoronly.AuthorOnly'
          }
        },
        {
          id: 3,
          bundleId: 638,
          name: 'com.example.search.commons.impl.NodeExistsPredicateEvaluator',
          state: 'disabled',
          stateRaw: 0,
          pid: 'com.example.search.commons.impl.NodeExistsPredicateEvaluator',
          props: {}
        },
        {
          id: 4,
          bundleId: 250,
          name: 'com.example.server.ssl.internal.SslConnectorFactory',
          state: 'satisfied',
          stateRaw: 2,
          pid: 'com.example.server.ssl.internal.SslConnectorFactory',
          configurable: 'com.example.server.ssl.internal.SslConnectorFactory',
          props: {
            'service.ranking': 100
          }
        }
      ]
    };

    it('should list all components successfully', async () => {
      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: mockComponentResponse
      });

      const result = await componentService.listComponents(testInstance);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(4);
        expect(result.data[0]).toEqual({
          id: 1,
          name: 'com.example.web.headers.impl.ExpiresHeaderFilter',
          state: 'unsatisfied',
          pid: 'com.example.web.headers.impl.ExpiresHeaderFilter',
          properties: {
            'service.pid': 'com.example.web.headers.impl.ExpiresHeaderFilter',
            'component.name': 'ExpiresHeaderFilter'
          }
        });
      }
      expect(componentService['makeAuthenticatedRequest']).toHaveBeenCalledWith(
        testInstance,
        '/system/console/components.json',
        'GET',
        undefined,
        expect.any(Number),
        'Component console unavailable',
        'Authentication required for component console'
      );
    });

    it('should filter components by state', async () => {
      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: mockComponentResponse
      });

      const result = await componentService.listComponents(testInstance, 'active');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].state).toBe('active');
      }
    });

    it('should filter components by name', async () => {
      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: mockComponentResponse
      });

      const result = await componentService.listComponents(testInstance, undefined, 'example');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        expect(result.data.every(component => 
          component.name.toLowerCase().includes('example') ||
          (component.pid && component.pid.toLowerCase().includes('example'))
        )).toBe(true);
      }
    });

    it('should handle authentication error', async () => {
      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: false,
        error: {
          code: OSGI_ERROR_CODES.PERMISSION_DENIED,
          message: 'Authentication failed'
        }
      });

      const result = await componentService.listComponents(testInstance);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.PERMISSION_DENIED);
      }
    });

    it('should handle invalid component data', async () => {
      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: { status: 'ok' }
      });

      const result = await componentService.listComponents(testInstance);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.OPERATION_FAILED);
        expect(result.error.message).toBe('Invalid component data received');
      }
    });

    it('should handle network error', async () => {
      const networkError = new Error('Network error');
      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockRejectedValue(networkError);

      const result = await componentService.listComponents(testInstance);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.OPERATION_FAILED);
      }
    });
  });

  describe('enableComponent', () => {
    it('should enable component successfully', async () => {
      const componentId = 123;
      
      const mockComponent = {
        id: componentId,
        name: 'test.component',
        state: 'disabled' as ComponentState,
        pid: 'test.component.pid',
        properties: {}
      };

      const mockEnabledComponent = {
        ...mockComponent,
        state: 'active' as ComponentState
      };

      jest.spyOn(componentService, 'listComponents')
        .mockResolvedValueOnce({
          success: true,
          data: [mockComponent],
          duration: 50
        })
        .mockResolvedValueOnce({
          success: true,
          data: [mockEnabledComponent],
          duration: 50
        });

      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: {}
      });

      const result = await componentService.enableComponent(testInstance, componentId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.component?.state).toBe('active');
      }
      expect(componentService['makeAuthenticatedRequest']).toHaveBeenCalledWith(
        testInstance,
        `/system/console/components/${componentId}`,
        'POST',
        'action=enable',
        expect.any(Number),
        'Component enable failed',
        'Authentication required'
      );
    });

    it('should handle component not found', async () => {
      const componentId = 999;
      
      jest.spyOn(componentService, 'listComponents')
        .mockResolvedValue({
          success: true,
          data: [],
          duration: 50
        });

      const result = await componentService.enableComponent(testInstance, componentId);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.COMPONENT_NOT_FOUND);
        expect(result.error.message).toBe(`Component ${componentId} not found`);
      }
    });
  });

  describe('disableComponent', () => {
    it('should disable component successfully', async () => {
      const componentId = 123;
      
      const mockComponent = {
        id: componentId,
        name: 'test.component',
        state: 'active' as ComponentState,
        pid: 'test.component.pid',
        properties: {}
      };

      const mockDisabledComponent = {
        ...mockComponent,
        state: 'disabled' as ComponentState
      };

      jest.spyOn(componentService, 'listComponents')
        .mockResolvedValueOnce({
          success: true,
          data: [mockComponent],
          duration: 50
        })
        .mockResolvedValueOnce({
          success: true,
          data: [mockDisabledComponent],
          duration: 50
        });

      jest.spyOn(componentService, 'getComponentDetails').mockResolvedValue({
        success: true,
        data: mockComponent,
        duration: 50
      });

      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: {}
      });

      const result = await componentService.disableComponent(testInstance, componentId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.component?.state).toBe('disabled');
      }
    });
  });

  describe('getComponentDetails', () => {
    it('should get component details successfully', async () => {
      const componentId = 123;
      const mockComponentDetails = {
        id: componentId,
        bundleId: 638,
        name: 'test.detailed.component',
        state: 'active',
        stateRaw: 1,
        pid: 'test.detailed.component.pid',
        configurable: 'test.detailed.component.pid',
        props: {
          'service.pid': 'test.detailed.component.pid',
          'component.description': 'A detailed test component'
        }
      };

      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: mockComponentDetails
      });

      const result = await componentService.getComponentDetails(testInstance, componentId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(componentId);
        expect(result.data.name).toBe('test.detailed.component');
        expect(result.data.state).toBe('active');
      }
      expect(componentService['makeAuthenticatedRequest']).toHaveBeenCalledWith(
        testInstance,
        `/system/console/components/${componentId}.json`,
        'GET',
        undefined,
        expect.any(Number),
        'Component details unavailable',
        'Authentication required'
      );
    });

    it('should handle component not found for details', async () => {
      const componentId = 999;
      
      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: false,
        error: {
          code: OSGI_ERROR_CODES.BUNDLE_NOT_FOUND,
          message: 'Component not found'
        }
      });

      const result = await componentService.getComponentDetails(testInstance, componentId);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.COMPONENT_NOT_FOUND);
        expect(result.error.message).toBe(`Component ${componentId} not found`);
      }
    });

    it('should handle invalid component details data', async () => {
      const componentId = 123;
      
      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: { invalidData: true }
      });

      const result = await componentService.getComponentDetails(testInstance, componentId);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.OPERATION_FAILED);
        expect(result.error.message).toBe('Invalid component data received');
      }
    });
  });

  describe('performBulkComponentOperation', () => {
    it('should perform bulk enable operation successfully', async () => {
      const componentIds = [123, 124, 125];
      
      const mockComponents = componentIds.map(id => ({
        id,
        name: `test.component.${id}`,
        state: 'disabled' as ComponentState,
        pid: `test.component.${id}.pid`,
        properties: {}
      }));

      const mockEnabledComponents = mockComponents.map(comp => ({
        ...comp,
        state: 'active' as ComponentState
      }));

      jest.spyOn(componentService, 'listComponents')
        .mockResolvedValue({
          success: true,
          data: mockComponents,
          duration: 50
        });

      let callCount = 0;
      jest.spyOn(componentService, 'enableComponent')
        .mockImplementation(async () => ({
          success: true,
          data: {
            success: true,
            component: mockEnabledComponents[callCount++],
            message: 'Component enable completed successfully'
          },
          duration: 100
        }));

      const result = await componentService.performBulkComponentOperation(testInstance, componentIds, 'enable');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.successCount).toBe(3);
        expect(result.data.failureCount).toBe(0);
      }
    });

    it('should perform bulk disable operation successfully', async () => {
      const componentIds = [123, 124];
      
      const mockComponents = componentIds.map(id => ({
        id,
        name: `test.component.${id}`,
        state: 'active' as ComponentState,
        pid: `test.component.${id}.pid`,
        properties: {}
      }));

      let callCount = 0;
      jest.spyOn(componentService, 'disableComponent')
        .mockImplementation(async () => ({
          success: true,
          data: {
            success: true,
            component: { ...mockComponents[callCount++], state: 'disabled' as ComponentState },
            message: 'Component disable completed successfully'
          },
          duration: 100
        }));

      const result = await componentService.performBulkComponentOperation(testInstance, componentIds, 'disable');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.successCount).toBe(2);
        expect(result.data.failureCount).toBe(0);
      }
    });

    it('should handle mixed success/failure in bulk operation', async () => {
      const componentIds = [123, 124, 125];
      
      jest.spyOn(componentService, 'enableComponent')
        .mockResolvedValueOnce({
          success: true,
          data: {
            success: true,
            component: {
              id: 123,
              name: 'test.component.123',
              state: 'active' as ComponentState,
              pid: 'test.component.123.pid',
              properties: {}
            },
            message: 'Component enabled'
          },
          duration: 100
        })
        .mockResolvedValueOnce({
          success: false,
          error: {
            code: OSGI_ERROR_CODES.COMPONENT_NOT_FOUND,
            message: 'Component not found'
          },
          duration: 50
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            success: true,
            component: {
              id: 125,
              name: 'test.component.125',
              state: 'active' as ComponentState,
              pid: 'test.component.125.pid',
              properties: {}
            },
            message: 'Component enabled'
          },
          duration: 100
        });

      const result = await componentService.performBulkComponentOperation(testInstance, componentIds, 'enable');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.successCount).toBe(2);
        expect(result.data.failureCount).toBe(1);
        expect(result.data.results.find(r => !r.success)).toBeDefined();
      }
    });
  });

  describe('findComponentsByName', () => {
    it('should find components by name successfully', async () => {
      const mockComponents = [
        {
          id: 1,
          name: 'com.example.test.component',
          state: 'active' as ComponentState,
          pid: 'com.example.test.component',
          properties: {}
        },
        {
          id: 2,
          name: 'com.testcompany.test.service',
          state: 'disabled' as ComponentState,
          pid: 'com.testcompany.test.service',
          properties: {}
        },
        {
          id: 3,
          name: 'other.component',
          state: 'satisfied' as ComponentState,
          pid: 'example.related.pid',
          properties: {}
        }
      ];

      jest.spyOn(componentService, 'listComponents')
        .mockResolvedValue({
          success: true,
          data: mockComponents,
          duration: 100
        });

      const result = await componentService.findComponentsByName(testInstance, ['example', 'test']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        expect(result.data.every(component =>
          component.name.includes('example') || component.name.includes('test') ||
          (component.pid && (component.pid.includes('example') || component.pid.includes('test')))
        )).toBe(true);
      }
    });

    it('should handle list components failure', async () => {
      jest.spyOn(componentService, 'listComponents')
        .mockResolvedValue({
          success: false,
          error: {
            code: OSGI_ERROR_CODES.OPERATION_FAILED,
            message: 'Failed to list components'
          },
          duration: 50
        });

      const result = await componentService.findComponentsByName(testInstance, ['test']);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.OPERATION_FAILED);
      }
    });
  });

  describe('custom configuration', () => {
    it('should use custom configuration when provided', () => {
      const customConfig = {
        timeout: createTimeout(30000),
        maxBulkOperations: 100,
        actionDelayMs: 2000
      };

      const customService = new ComponentManagementService(mockHttpClient, customConfig);
      expect(customService).toBeInstanceOf(ComponentManagementService);
    });
  });

  describe('edge cases', () => {
    it('should handle malformed component data gracefully', async () => {
      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: {
          data: [
            { id: 123, name: 'valid.component' },
            { id: null, name: 'invalid.component' },
            { name: 'missing.id.component' },
            null,
            undefined,
            'not-an-object',
            { id: 456, name: 'another.valid.component' }
          ]
        }
      });

      const result = await componentService.listComponents(testInstance);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].id).toBe(123);
        expect(result.data[1].id).toBe(456);
      }
    });

    it('should handle component state mapping correctly', async () => {
      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: {
          data: [
            { id: 1, name: 'test.component.1', state: 'active' },
            { id: 2, name: 'test.component.2', state: 'invalid-state' },
            { id: 3, name: 'test.component.3' },
            { id: 4, name: 'test.component.4', state: null }
          ]
        }
      });

      const result = await componentService.listComponents(testInstance);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].state).toBe('active');
        expect(result.data[1].state).toBe('unsatisfied');
        expect(result.data[2].state).toBe('unsatisfied');
        expect(result.data[3].state).toBe('unsatisfied');
      }
    });
  });
});