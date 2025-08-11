import { ConfigurationManagementService } from '@/services/configuration-management.service.js';
import { AemHttpClient } from '@/services/http-client.js';
import {
  AEMInstance,
  OSGI_ERROR_CODES,
  ConfigurationRequest,
  ConfigProperty
} from '@/types/index.js';
import { createTimeout } from '@/utils/type-factories.js';

jest.mock('@/services/http-client.js');
jest.mock('@/utils/logger.js');

describe('ConfigurationManagementService', () => {
  let configService: ConfigurationManagementService;
  let mockHttpClient: jest.Mocked<AemHttpClient>;
  let testInstance: AEMInstance;

  beforeEach(() => {
    mockHttpClient = new AemHttpClient() as jest.Mocked<AemHttpClient>;
    configService = new ConfigurationManagementService(mockHttpClient);
    testInstance = {
      url: 'http://test-author.example.com:4502',
      username: 'testuser',
      password: 'testpass'
    } as const;
    
    jest.clearAllMocks();
  });

  describe('listConfigurations', () => {
    const mockConfigResponse = {
      configurations: [
        {
          pid: 'com.example.web.servlet.TestServlet',
          title: 'Test Web Servlet',
          description: 'A test servlet for handling web requests.',
          properties: {
            'path': {
              name: 'path',
              value: '/test/api',
              type: 'String',
              description: 'The servlet path',
              cardinality: 0
            },
            'enabled': {
              name: 'enabled',
              value: true,
              type: 'Boolean',
              description: 'Enable the servlet',
              cardinality: 0
            },
            'timeout': {
              name: 'timeout',
              value: 5000,
              type: 'Integer',
              description: 'Request timeout in milliseconds',
              cardinality: 0
            }
          },
          bundleLocation: 'test:/config/com.example.web.servlet.TestServlet.config'
        },
        {
          pid: 'com.example.data.EventRecorder',
          title: 'Data Event Recorder',
          description: 'Records data events for monitoring.',
          properties: {
            'enabled': {
              name: 'enabled',
              value: false,
              type: 'Boolean',
              cardinality: 0
            },
            'event.filter': {
              name: 'event.filter',
              value: 'data/*',
              type: 'String',
              cardinality: 0
            }
          },
          factoryPid: 'com.example.data.EventRecorder.factory'
        },
        {
          pid: 'com.example.search.QueryEngine',
          title: 'Search Engine Settings',
          description: 'Settings for the search query engine.',
          properties: {
            'memoryLimit': {
              name: 'memoryLimit',
              value: 500000,
              type: 'Long',
              cardinality: 0
            },
            'readLimit': {
              name: 'readLimit',
              value: 100000,
              type: 'Long',
              cardinality: 0
            }
          }
        }
      ]
    };

    it('should list all configurations successfully', async () => {
      jest.spyOn(configService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: mockConfigResponse
      });

      const result = await configService.listConfigurations(testInstance);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        expect(result.data[0]).toEqual({
          pid: 'com.example.web.servlet.TestServlet',
          title: 'Test Web Servlet',
          description: 'A test servlet for handling web requests.',
          properties: {
            'path': {
              name: 'path',
              value: '/test/api',
              type: 'String',
              description: 'The servlet path',
              cardinality: 0
            },
            'enabled': {
              name: 'enabled',
              value: true,
              type: 'Boolean',
              description: 'Enable the servlet',
              cardinality: 0
            },
            'timeout': {
              name: 'timeout',
              value: 5000,
              type: 'Integer',
              description: 'Request timeout in milliseconds',
              cardinality: 0
            }
          },
          bundleLocation: 'test:/config/com.example.web.servlet.TestServlet.config',
          factoryPid: undefined
        });
      }
      expect(configService['makeAuthenticatedRequest']).toHaveBeenCalledWith(
        testInstance,
        '/system/console/configMgr.json',
        'GET',
        undefined,
        expect.any(Number),
        'Configuration console unavailable',
        'Authentication required for configuration console'
      );
    });

    it('should filter configurations by PID', async () => {
      jest.spyOn(configService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: mockConfigResponse
      });

      const result = await configService.listConfigurations(testInstance, 'servlet');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].pid).toBe('com.example.web.servlet.TestServlet');
      }
    });

    it('should filter configurations by title', async () => {
      jest.spyOn(configService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: mockConfigResponse
      });

      const result = await configService.listConfigurations(testInstance, 'search');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].title).toBe('Search Engine Settings');
      }
    });

    it('should handle authentication error', async () => {
      jest.spyOn(configService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: false,
        error: {
          code: OSGI_ERROR_CODES.PERMISSION_DENIED,
          message: 'Authentication failed'
        }
      });

      const result = await configService.listConfigurations(testInstance);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.PERMISSION_DENIED);
      }
    });

    it('should handle invalid configuration data', async () => {
      jest.spyOn(configService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: { status: 'ok' }
      });

      const result = await configService.listConfigurations(testInstance);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.OPERATION_FAILED);
        expect(result.error.message).toBe('Invalid configuration data received');
      }
    });

    it('should handle network error', async () => {
      const networkError = new Error('Network error');
      jest.spyOn(configService as any, 'makeAuthenticatedRequest').mockRejectedValue(networkError);

      const result = await configService.listConfigurations(testInstance);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.OPERATION_FAILED);
      }
    });
  });

  describe('getConfiguration', () => {
    const mockSingleConfigResponse = {
      pid: 'com.example.web.servlet.TestServlet',
      title: 'Test Web Servlet',
      description: 'The test servlet configuration',
      properties: {
        'path': {
          name: 'path',
          value: '/test/api',
          type: 'String',
          description: 'The servlet path',
          cardinality: 0
        }
      },
      bundleLocation: 'test:/config/example/'
    };

    it('should get configuration successfully', async () => {
      const configPid = 'com.example.web.servlet.TestServlet';

      jest.spyOn(configService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: mockSingleConfigResponse
      });

      const result = await configService.getConfiguration(testInstance, configPid);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pid).toBe(configPid);
        expect(result.data.title).toBe('Test Web Servlet');
      }
      expect(configService['makeAuthenticatedRequest']).toHaveBeenCalledWith(
        testInstance,
        `/system/console/configMgr/${encodeURIComponent(configPid)}.json`,
        'GET',
        undefined,
        expect.any(Number),
        'Configuration unavailable',
        'Authentication required'
      );
    });

    it('should handle configuration not found', async () => {
      const configPid = 'non.existent.config';

      jest.spyOn(configService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: false,
        error: {
          code: OSGI_ERROR_CODES.BUNDLE_NOT_FOUND,
          message: 'Configuration not found'
        }
      });

      const result = await configService.getConfiguration(testInstance, configPid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.BUNDLE_NOT_FOUND);
        expect(result.error.message).toBe(`Configuration ${configPid} not found`);
      }
    });

    it('should handle invalid configuration response', async () => {
      const configPid = 'test.config';

      jest.spyOn(configService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: { invalidData: true }
      });

      const result = await configService.getConfiguration(testInstance, configPid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.OPERATION_FAILED);
        expect(result.error.message).toBe('Failed to parse configuration data');
      }
    });
  });

  describe('createConfiguration', () => {
    const mockConfigRequest: Omit<ConfigurationRequest, 'instanceAlias'> = {
      pid: 'com.example.new.config',
      properties: {
        'enabled': {
          name: 'enabled',
          value: true,
          type: 'Boolean'
        },
        'timeout': {
          name: 'timeout',
          value: 5000,
          type: 'Integer'
        },
        'description': {
          name: 'description',
          value: 'A new configuration',
          type: 'String'
        }
      },
      factoryPid: 'com.example.factory'
    };

    it('should create configuration successfully', async () => {
      mockHttpClient.makeRequest.mockResolvedValue({
        status: 200,
        data: 'Configuration created',
        statusText: 'OK',
        headers: {},
        config: { headers: {} } as any
      });

      jest.spyOn(configService, 'getConfiguration').mockResolvedValue({
        success: true,
        data: {
          pid: mockConfigRequest.pid,
          title: 'New Configuration',
          description: 'Created configuration',
          properties: mockConfigRequest.properties,
          factoryPid: mockConfigRequest.factoryPid
        },
        duration: 100
      });

      const result = await configService.createConfiguration(testInstance, mockConfigRequest);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.configuration?.pid).toBe(mockConfigRequest.pid);
        expect(result.data.message).toBe('Configuration created successfully');
      }
      expect(mockHttpClient.makeRequest).toHaveBeenCalledWith(
        testInstance,
        '/system/console/configMgr/[Temporary PID replaced by real PID upon save]',
        'POST',
        expect.any(URLSearchParams),
        expect.any(Number)
      );
    });

    it('should validate configuration request', async () => {
      const invalidRequest: Omit<ConfigurationRequest, 'instanceAlias'> = {
        pid: '',
        properties: {}
      };

      const result = await configService.createConfiguration(testInstance, invalidRequest);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.CONFIGURATION_TYPE_MISMATCH);
        expect(result.error.message).toBe('PID is required and must be a string');
      }
    });

    it('should validate property types', async () => {
      const invalidRequest: Omit<ConfigurationRequest, 'instanceAlias'> = {
        pid: 'test.config',
        properties: {
          'invalidBoolean': {
            name: 'invalidBoolean',
            value: 'not-a-boolean',
            type: 'Boolean'
          } as ConfigProperty
        }
      };

      const result = await configService.createConfiguration(testInstance, invalidRequest);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.CONFIGURATION_TYPE_MISMATCH);
        expect(result.error.message).toBe('Invalid value for property: invalidBoolean');
      }
    });

    it('should handle authentication error', async () => {
      mockHttpClient.makeRequest.mockResolvedValue({
        status: 401,
        data: 'Unauthorized',
        statusText: 'Unauthorized',
        headers: {},
        config: { headers: {} } as any
      });

      const result = await configService.createConfiguration(testInstance, mockConfigRequest);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.PERMISSION_DENIED);
      }
    });

    it('should handle configuration conflict', async () => {
      mockHttpClient.makeRequest.mockResolvedValue({
        status: 409,
        data: 'Configuration already exists',
        statusText: 'Conflict',
        headers: {},
        config: { headers: {} } as any
      });

      const result = await configService.createConfiguration(testInstance, mockConfigRequest);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.CONFIGURATION_CONFLICT);
      }
    });
  });

  describe('updateConfiguration', () => {
    const mockUpdateRequest: Omit<ConfigurationRequest, 'instanceAlias'> = {
      pid: 'existing.config',
      properties: {
        'enabled': {
          name: 'enabled',
          value: false,
          type: 'Boolean'
        },
        'newProperty': {
          name: 'newProperty',
          value: 'added value',
          type: 'String'
        }
      }
    };

    it('should update configuration successfully', async () => {
      jest.spyOn(configService, 'getConfiguration')
        .mockResolvedValueOnce({
          success: true,
          data: {
            pid: mockUpdateRequest.pid,
            title: 'Existing Configuration',
            description: 'Existing config',
            properties: {
              'enabled': {
                name: 'enabled',
                value: true,
                type: 'Boolean'
              }
            }
          },
          duration: 50
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            pid: mockUpdateRequest.pid,
            title: 'Existing Configuration',
            description: 'Updated config',
            properties: mockUpdateRequest.properties
          },
          duration: 50
        });

      mockHttpClient.makeRequest.mockResolvedValue({
        status: 200,
        data: 'Configuration updated',
        statusText: 'OK',
        headers: {},
        config: { headers: {} } as any
      });

      const result = await configService.updateConfiguration(testInstance, mockUpdateRequest);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.configuration?.properties.enabled.value).toBe(false);
        expect(result.data.message).toBe('Configuration updated successfully');
      }
      expect(mockHttpClient.makeRequest).toHaveBeenCalledWith(
        testInstance,
        `/system/console/configMgr/${encodeURIComponent(mockUpdateRequest.pid)}`,
        'POST',
        expect.any(URLSearchParams),
        expect.any(Number)
      );
    });

    it('should handle non-existent configuration', async () => {
      jest.spyOn(configService, 'getConfiguration').mockResolvedValue({
        success: false,
        error: {
          code: OSGI_ERROR_CODES.BUNDLE_NOT_FOUND,
          message: 'Configuration not found'
        },
        duration: 50
      });

      const result = await configService.updateConfiguration(testInstance, mockUpdateRequest);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.BUNDLE_NOT_FOUND);
      }
    });
  });

  describe('deleteConfiguration', () => {
    const configPid = 'config.to.delete';

    it('should delete configuration successfully', async () => {
      jest.spyOn(configService, 'getConfiguration').mockResolvedValue({
        success: true,
        data: {
          pid: configPid,
          title: 'Configuration to Delete',
          description: 'This config will be deleted',
          properties: {}
        },
        duration: 50
      });

      mockHttpClient.makeRequest.mockResolvedValue({
        status: 200,
        data: 'Configuration deleted',
        statusText: 'OK',
        headers: {},
        config: { headers: {} } as any
      });

      const result = await configService.deleteConfiguration(testInstance, configPid);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.message).toBe('Configuration deleted successfully');
      }
      expect(mockHttpClient.makeRequest).toHaveBeenCalledWith(
        testInstance,
        `/system/console/configMgr/${encodeURIComponent(configPid)}`,
        'POST',
        'delete=true',
        expect.any(Number)
      );
    });

    it('should handle non-existent configuration deletion', async () => {
      jest.spyOn(configService, 'getConfiguration').mockResolvedValue({
        success: false,
        error: {
          code: OSGI_ERROR_CODES.BUNDLE_NOT_FOUND,
          message: 'Configuration not found'
        },
        duration: 50
      });

      const result = await configService.deleteConfiguration(testInstance, configPid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.BUNDLE_NOT_FOUND);
      }
    });

    it('should handle deletion failure', async () => {
      jest.spyOn(configService, 'getConfiguration').mockResolvedValue({
        success: true,
        data: {
          pid: configPid,
          title: 'Config',
          properties: {}
        },
        duration: 50
      });

      mockHttpClient.makeRequest.mockResolvedValue({
        status: 500,
        data: 'Server error',
        statusText: 'Internal Server Error',
        headers: {},
        config: { headers: {} } as any
      });

      const result = await configService.deleteConfiguration(testInstance, configPid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.OPERATION_FAILED);
      }
    });
  });

  describe('unbindConfiguration', () => {
    const configPid = 'config.to.unbind';
    const bundleLocation = 'bundle-symbolic-name';

    it('should unbind configuration successfully', async () => {
      const mockConfig = {
        pid: configPid,
        title: 'Configuration to Unbind',
        description: 'This config will be unbound',
        properties: {},
        bundleLocation: bundleLocation
      };

      jest.spyOn(configService, 'getConfiguration')
        .mockResolvedValueOnce({
          success: true,
          data: mockConfig,
          duration: 50
        })
        .mockResolvedValueOnce({
          success: true,
          data: { ...mockConfig, bundleLocation: undefined },
          duration: 50
        });

      mockHttpClient.makeRequest.mockResolvedValue({
        status: 200,
        data: 'Configuration unbound',
        statusText: 'OK',
        headers: {},
        config: { headers: {} } as any
      });

      const result = await configService.unbindConfiguration(testInstance, configPid, bundleLocation);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.message).toBe('Configuration unbound successfully');
      }
      expect(mockHttpClient.makeRequest).toHaveBeenCalledWith(
        testInstance,
        `/system/console/configMgr/${encodeURIComponent(configPid)}`,
        'POST',
        expect.stringContaining('unbind=true&bundleLocation=' + encodeURIComponent(bundleLocation)),
        expect.any(Number)
      );
    });

    it('should unbind configuration without bundle location', async () => {
      const mockConfig = {
        pid: configPid,
        title: 'Configuration to Unbind',
        properties: {}
      };

      jest.spyOn(configService, 'getConfiguration')
        .mockResolvedValueOnce({
          success: true,
          data: mockConfig,
          duration: 50
        })
        .mockResolvedValueOnce({
          success: true,
          data: mockConfig,
          duration: 50
        });

      mockHttpClient.makeRequest.mockResolvedValue({
        status: 200,
        data: 'Configuration unbound',
        statusText: 'OK',
        headers: {},
        config: { headers: {} } as any
      });

      const result = await configService.unbindConfiguration(testInstance, configPid);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
      }
      expect(mockHttpClient.makeRequest).toHaveBeenCalledWith(
        testInstance,
        `/system/console/configMgr/${encodeURIComponent(configPid)}`,
        'POST',
        'unbind=true',
        expect.any(Number)
      );
    });

    it('should handle unbind failure', async () => {
      jest.spyOn(configService, 'getConfiguration').mockResolvedValue({
        success: true,
        data: { pid: configPid, title: 'Config', properties: {} },
        duration: 50
      });

      mockHttpClient.makeRequest.mockResolvedValue({
        status: 403,
        data: 'Forbidden',
        statusText: 'Forbidden',
        headers: {},
        config: { headers: {} } as any
      });

      const result = await configService.unbindConfiguration(testInstance, configPid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(OSGI_ERROR_CODES.PERMISSION_DENIED);
      }
    });
  });

  describe('custom configuration', () => {
    it('should use custom configuration when provided', () => {
      const customConfig = {
        timeout: createTimeout(30000),
        actionDelayMs: 2000
      };

      const customService = new ConfigurationManagementService(mockHttpClient, customConfig);
      expect(customService).toBeInstanceOf(ConfigurationManagementService);
    });
  });

  describe('property validation', () => {
    it('should validate different property types correctly', async () => {
      const testProperties: Record<string, ConfigProperty> = {
        'stringProp': {
          name: 'stringProp',
          value: 'test string',
          type: 'String'
        },
        'booleanProp': {
          name: 'booleanProp',
          value: true,
          type: 'Boolean'
        },
        'integerProp': {
          name: 'integerProp',
          value: 42,
          type: 'Integer'
        },
        'longProp': {
          name: 'longProp',
          value: 1234567890,
          type: 'Long'
        },
        'doubleProp': {
          name: 'doubleProp',
          value: 3.14159,
          type: 'Double'
        },
        'floatProp': {
          name: 'floatProp',
          value: 2.71,
          type: 'Float'
        },
        'shortProp': {
          name: 'shortProp',
          value: 32767,
          type: 'Short'
        },
        'charProp': {
          name: 'charProp',
          value: 'A',
          type: 'Character'
        }
      };

      const validRequest: Omit<ConfigurationRequest, 'instanceAlias'> = {
        pid: 'test.validation.config',
        properties: testProperties
      };

      mockHttpClient.makeRequest.mockResolvedValue({
        status: 200,
        data: 'Configuration created',
        statusText: 'OK',
        headers: {},
        config: { headers: {} } as any
      });

      jest.spyOn(configService, 'getConfiguration').mockResolvedValue({
        success: true,
        data: {
          pid: validRequest.pid,
          properties: testProperties
        },
        duration: 100
      });

      const result = await configService.createConfiguration(testInstance, validRequest);

      expect(result.success).toBe(true);
    });

    it('should reject invalid property types', async () => {
      const invalidProperties = [
        {
          name: 'invalidBoolean',
          properties: { 'prop': { name: 'prop', value: 'not-boolean', type: 'Boolean' as const } },
          expectedError: 'Invalid value for property: prop'
        },
        {
          name: 'invalidInteger',
          properties: { 'prop': { name: 'prop', value: 3.14, type: 'Integer' as const } },
          expectedError: 'Invalid value for property: prop'
        },
        {
          name: 'invalidCharacter',
          properties: { 'prop': { name: 'prop', value: 'too long', type: 'Character' as const } },
          expectedError: 'Invalid value for property: prop'
        }
      ];

      for (const testCase of invalidProperties) {
        const invalidRequest: Omit<ConfigurationRequest, 'instanceAlias'> = {
          pid: 'test.config',
          properties: testCase.properties as Record<string, ConfigProperty>
        };

        const result = await configService.createConfiguration(testInstance, invalidRequest);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe(OSGI_ERROR_CODES.CONFIGURATION_TYPE_MISMATCH);
          expect(result.error.message).toBe(testCase.expectedError);
        }
      }
    });
  });

  describe('edge cases', () => {
    it('should handle malformed configuration data gracefully', async () => {
      jest.spyOn(configService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        success: true,
        data: {
          configurations: [
            { pid: 'valid.config', title: 'Valid Config' },
            { title: 'Missing PID Config' },
            null,
            undefined,
            'not-an-object',
            { pid: null, title: 'Null PID Config' },
            { pid: 'another.valid.config', title: 'Another Valid Config' }
          ]
        }
      });

      const result = await configService.listConfigurations(testInstance);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].pid).toBe('valid.config');
        expect(result.data[1].pid).toBe('another.valid.config');
      }
    });

    it('should handle property value conversion correctly', async () => {
      const testRequest: Omit<ConfigurationRequest, 'instanceAlias'> = {
        pid: 'conversion.test.config',
        properties: {
          'booleanTrue': { name: 'booleanTrue', value: true, type: 'Boolean' },
          'booleanFalse': { name: 'booleanFalse', value: false, type: 'Boolean' },
          'stringValue': { name: 'stringValue', value: 'test', type: 'String' },
          'numberValue': { name: 'numberValue', value: 123, type: 'Integer' }
        }
      };

      mockHttpClient.makeRequest.mockResolvedValue({
        status: 200,
        data: 'Success',
        statusText: 'OK',
        headers: {},
        config: { headers: {} } as any
      });

      jest.spyOn(configService, 'getConfiguration').mockResolvedValue({
        success: true,
        data: { pid: testRequest.pid, properties: testRequest.properties },
        duration: 100
      });

      const result = await configService.createConfiguration(testInstance, testRequest);

      expect(result.success).toBe(true);

      const formDataCall = mockHttpClient.makeRequest.mock.calls[0][3] as URLSearchParams;
      expect(formDataCall.get('booleanTrue')).toBe('true');
      expect(formDataCall.get('booleanFalse')).toBe('false');
      expect(formDataCall.get('stringValue')).toBe('test');
      expect(formDataCall.get('numberValue')).toBe('123');
    });
  });
});