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
            'bundleId': 638,
            'configurable': 'com.example.web.headers.impl.ExpiresHeaderFilter',
            'stateRaw': -1
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
      const componentName = 'test.component';
      
      const mockComponent = {
        id: 123,
        name: componentName,
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
          data: [mockEnabledComponent],
          duration: 50
        });

      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: {}
      });

      const result = await componentService.enableComponent(testInstance, componentName);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.component?.state).toBe('active');
      }
      expect(componentService['makeAuthenticatedRequest']).toHaveBeenCalledWith(
        testInstance,
        `/system/console/components/${encodeURIComponent(componentName)}`,
        'POST',
        'action=enable',
        expect.any(Number),
        'Component enable failed',
        'Authentication required'
      );
    });

    it('should handle component not found', async () => {
      const componentName = 'nonexistent.component';
      
      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: false,
        error: {
          code: OSGI_ERROR_CODES.BUNDLE_NOT_FOUND,
          message: 'Component not found'
        }
      });

      const result = await componentService.enableComponent(testInstance, componentName);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.COMPONENT_NOT_FOUND);
        expect(result.error.message).toBe(`Component ${componentName} not found`);
      }
    });
  });

  describe('disableComponent', () => {
    it('should disable component successfully', async () => {
      const componentName = 'test.component';
      
      const mockComponent = {
        id: 123,
        name: componentName,
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
          data: [mockDisabledComponent],
          duration: 50
        });

      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: {}
      });

      const result = await componentService.disableComponent(testInstance, componentName);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.component?.state).toBe('disabled');
      }
    });
  });

  describe('getComponentDetails', () => {
    it('should get component details successfully', async () => {
      const componentName = 'test.detailed.component';
      const mockComponent = {
        id: 123,
        name: componentName,
        state: 'active' as ComponentState,
        pid: 'test.detailed.component.pid',
        properties: {}
      };

      jest.spyOn(componentService, 'listComponents').mockResolvedValue({
        success: true,
        data: [mockComponent],
        duration: 50
      });

      const result = await componentService.getComponentDetails(testInstance, componentName);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(123);
        expect(result.data.name).toBe(componentName);
        expect(result.data.state).toBe('active');
      }
    });

    it('should handle component not found for details', async () => {
      const componentName = 'nonexistent.component';
      
      jest.spyOn(componentService, 'listComponents').mockResolvedValue({
        success: true,
        data: [],
        duration: 50
      });

      const result = await componentService.getComponentDetails(testInstance, componentName);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.COMPONENT_NOT_FOUND);
        expect(result.error.message).toBe(`Component '${componentName}' not found`);
      }
    });

    it('should handle list components failure', async () => {
      const componentName = 'test.component';
      
      jest.spyOn(componentService, 'listComponents').mockResolvedValue({
        success: false,
        error: {
          code: OSGI_ERROR_CODES.OPERATION_FAILED,
          message: 'Failed to list components'
        },
        duration: 50
      });

      const result = await componentService.getComponentDetails(testInstance, componentName);

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
            { id: 123, name: 'valid.component', bundleId: 100 },
            { id: null, name: 'invalid.component', bundleId: 101 },
            { name: 'missing.id.component', bundleId: 102 },
            null,
            undefined,
            'not-an-object',
            { id: 456, name: 'another.valid.component', bundleId: 103 }
          ]
        }
      });

      const result = await componentService.listComponents(testInstance);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(4);
        expect(result.data[0].id).toBe(123);
        expect(result.data[1]).not.toHaveProperty('id'); // Component with id: null shouldn't have id field
        expect(result.data[2]).not.toHaveProperty('id'); // Component without id shouldn't have id field  
        expect(result.data[3].id).toBe(456);
      }
    });

    it('should handle component state mapping correctly', async () => {
      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: {
          data: [
            { id: 1, name: 'test.component.1', state: 'active', bundleId: 100 },
            { id: 2, name: 'test.component.2', state: 'invalid-state', bundleId: 101 },
            { id: 3, name: 'test.component.3', bundleId: 102 },
            { id: 4, name: 'test.component.4', state: null, bundleId: 103 }
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

  describe('Component Name Operations', () => {
    it('should enable component by exact name match', async () => {
      const componentName = 'com.example.test.ExactMatchComponent';
      
      const mockComponent = {
        id: 100,
        name: componentName,
        state: 'active' as ComponentState,
        pid: componentName,
        properties: {}
      };

      jest.spyOn(componentService, 'listComponents')
        .mockResolvedValueOnce({
          success: true,
          data: [mockComponent],
          duration: 50
        });

      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: {}
      });

      const result = await componentService.enableComponent(testInstance, componentName);

      expect(result.success).toBe(true);
      expect(componentService['makeAuthenticatedRequest']).toHaveBeenCalledWith(
        testInstance,
        `/system/console/components/${encodeURIComponent(componentName)}`,
        'POST',
        'action=enable',
        expect.any(Number),
        'Component enable failed',
        'Authentication required'
      );
    });

    it('should disable component with special characters in name', async () => {
      const componentName = 'com.example.component-with_special.chars@domain';
      
      const mockComponent = {
        id: 200,
        name: componentName,
        state: 'disabled' as ComponentState,
        pid: componentName,
        properties: {}
      };

      jest.spyOn(componentService, 'listComponents')
        .mockResolvedValueOnce({
          success: true,
          data: [mockComponent],
          duration: 50
        });

      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: {}
      });

      const result = await componentService.disableComponent(testInstance, componentName);

      expect(result.success).toBe(true);
      expect(componentService['makeAuthenticatedRequest']).toHaveBeenCalledWith(
        testInstance,
        `/system/console/components/${encodeURIComponent(componentName)}`,
        'POST',
        'action=disable',
        expect.any(Number),
        'Component disable failed',
        'Authentication required'
      );
    });

    it('should find component details by PID when name not found', async () => {
      const componentPid = 'com.example.test.component.pid';
      
      const mockComponent = {
        id: 300,
        name: 'different.name',
        state: 'active' as ComponentState,
        pid: componentPid,
        properties: {}
      };

      jest.spyOn(componentService, 'listComponents').mockResolvedValue({
        success: true,
        data: [mockComponent],
        duration: 50
      });

      const result = await componentService.getComponentDetails(testInstance, componentPid);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pid).toBe(componentPid);
        expect(result.data.id).toBe(300);
      }
    });

    it('should handle HTTP 404 response correctly', async () => {
      const componentName = 'nonexistent.component';
      
      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: false,
        error: {
          code: OSGI_ERROR_CODES.BUNDLE_NOT_FOUND,
          message: 'Component not found'
        }
      });

      const result = await componentService.enableComponent(testInstance, componentName);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.COMPONENT_NOT_FOUND);
        expect(result.error.message).toBe(`Component ${componentName} not found`);
      }
    });

    it('should handle components with Unicode characters in names', async () => {
      const componentName = 'com.example.component.ñáme-üñícode';
      
      const mockComponent = {
        id: 400,
        name: componentName,
        state: 'active' as ComponentState,
        pid: componentName,
        properties: {}
      };

      jest.spyOn(componentService, 'listComponents')
        .mockResolvedValueOnce({
          success: true,
          data: [mockComponent],
          duration: 50
        });

      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: {}
      });

      const result = await componentService.enableComponent(testInstance, componentName);

      expect(result.success).toBe(true);
      expect(componentService['makeAuthenticatedRequest']).toHaveBeenCalledWith(
        testInstance,
        `/system/console/components/${encodeURIComponent(componentName)}`,
        'POST',
        'action=enable',
        expect.any(Number),
        'Component enable failed',
        'Authentication required'
      );
    });

    it('should handle component operation failure during HTTP request', async () => {
      const componentName = 'com.example.failing.component';
      
      jest.spyOn(componentService as any, 'makeAuthenticatedRequest')
        .mockResolvedValueOnce({
          success: false,
          error: {
            code: OSGI_ERROR_CODES.OPERATION_FAILED,
            message: 'Internal server error during component operation'
          }
        });

      const result = await componentService.disableComponent(testInstance, componentName);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.OPERATION_FAILED);
        expect(result.error.message).toBe('Internal server error during component operation');
      }
    });

    it('should handle component not found after successful operation', async () => {
      const componentName = 'com.example.disappearing.component';
      
      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: {}
      });

      jest.spyOn(componentService, 'listComponents').mockResolvedValue({
        success: true,
        data: [], // Component disappeared after operation
        duration: 50
      });

      const result = await componentService.enableComponent(testInstance, componentName);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.COMPONENT_NOT_FOUND);
        expect(result.error.message).toBe(`Component '${componentName}' not found after operation`);
      }
    });
  });

  describe('URL Encoding Tests', () => {
    it('should properly encode component names with spaces', async () => {
      const componentName = 'component name with spaces';
      
      const mockComponent = {
        id: 500,
        name: componentName,
        state: 'active' as ComponentState,
        pid: componentName,
        properties: {}
      };

      jest.spyOn(componentService, 'listComponents')
        .mockResolvedValueOnce({
          success: true,
          data: [mockComponent],
          duration: 50
        });

      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: {}
      });

      const result = await componentService.enableComponent(testInstance, componentName);

      expect(result.success).toBe(true);
      expect(componentService['makeAuthenticatedRequest']).toHaveBeenCalledWith(
        testInstance,
        `/system/console/components/${encodeURIComponent(componentName)}`,
        'POST',
        'action=enable',
        expect.any(Number),
        'Component enable failed',
        'Authentication required'
      );
      
      // Verify actual encoded URL
      const expectedEncodedUrl = `/system/console/components/component%20name%20with%20spaces`;
      expect(componentService['makeAuthenticatedRequest']).toHaveBeenCalledWith(
        expect.anything(),
        expectedEncodedUrl,
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it('should properly encode component names with special URL characters', async () => {
      const componentName = 'com.example.component?param=value&other=123#anchor';
      
      const mockComponent = {
        id: 600,
        name: componentName,
        state: 'disabled' as ComponentState,
        pid: componentName,
        properties: {}
      };

      jest.spyOn(componentService, 'listComponents')
        .mockResolvedValueOnce({
          success: true,
          data: [mockComponent],
          duration: 50
        });

      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: {}
      });

      const result = await componentService.disableComponent(testInstance, componentName);

      expect(result.success).toBe(true);
      
      // Verify proper URL encoding of special characters
      const expectedEncodedUrl = `/system/console/components/com.example.component%3Fparam%3Dvalue%26other%3D123%23anchor`;
      expect(componentService['makeAuthenticatedRequest']).toHaveBeenCalledWith(
        expect.anything(),
        expectedEncodedUrl,
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it('should properly encode component names with forward slashes', async () => {
      const componentName = 'com/example/path/component';
      
      const mockComponent = {
        id: 700,
        name: componentName,
        state: 'active' as ComponentState,
        pid: componentName,
        properties: {}
      };

      jest.spyOn(componentService, 'listComponents')
        .mockResolvedValueOnce({
          success: true,
          data: [mockComponent],
          duration: 50
        });

      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: {}
      });

      await componentService.enableComponent(testInstance, componentName);

      // Forward slashes should be encoded as %2F
      const expectedEncodedUrl = `/system/console/components/com%2Fexample%2Fpath%2Fcomponent`;
      expect(componentService['makeAuthenticatedRequest']).toHaveBeenCalledWith(
        expect.anything(),
        expectedEncodedUrl,
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it('should properly encode component names with percent characters', async () => {
      const componentName = 'com.example.component%20with%encoded';
      
      const mockComponent = {
        id: 800,
        name: componentName,
        state: 'active' as ComponentState,
        pid: componentName,
        properties: {}
      };

      jest.spyOn(componentService, 'listComponents')
        .mockResolvedValueOnce({
          success: true,
          data: [mockComponent],
          duration: 50
        });

      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: {}
      });

      await componentService.enableComponent(testInstance, componentName);

      // Percent characters should be double-encoded
      const expectedEncodedUrl = `/system/console/components/com.example.component%2520with%25encoded`;
      expect(componentService['makeAuthenticatedRequest']).toHaveBeenCalledWith(
        expect.anything(),
        expectedEncodedUrl,
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it('should handle component names that are already valid URLs', async () => {
      const componentName = 'com.example.standard.component.Name123';
      
      const mockComponent = {
        id: 900,
        name: componentName,
        state: 'active' as ComponentState,
        pid: componentName,
        properties: {}
      };

      jest.spyOn(componentService, 'listComponents')
        .mockResolvedValueOnce({
          success: true,
          data: [mockComponent],
          duration: 50
        });

      jest.spyOn(componentService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: {}
      });

      await componentService.enableComponent(testInstance, componentName);

      // Standard component names should pass through unchanged
      const expectedUrl = `/system/console/components/${componentName}`;
      expect(componentService['makeAuthenticatedRequest']).toHaveBeenCalledWith(
        expect.anything(),
        expectedUrl,
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });
  });
});