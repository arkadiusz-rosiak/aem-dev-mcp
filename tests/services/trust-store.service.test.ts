import { TrustStoreService } from '@/services/trust-store.service.js';
import { AemHttpClient } from '@/services/http-client.js';
import { AEMInstance } from '@/types/index.js';

jest.mock('@/services/http-client.js');
jest.mock('@/utils/logger.js');

describe('TrustStoreService', () => {
  let trustStoreService: TrustStoreService;
  let mockHttpClient: jest.Mocked<AemHttpClient>;
  let testInstance: AEMInstance;

  beforeEach(() => {
    mockHttpClient = new AemHttpClient() as jest.Mocked<AemHttpClient>;
    trustStoreService = new TrustStoreService(mockHttpClient);
    testInstance = {
      url: 'http://test-author.example.com:4502',
      username: 'admin',
      password: 'admin'
    } as const;

    jest.clearAllMocks();
  });

  describe('listCertificates', () => {
    const mockTrustStoreResponse = {
      aliases: [
        {
          alias: 'cert1',
          entryType: 'X.509',
          subject: 'CN=example.com, O=Example, C=US',
          issuer: 'CN=Example CA, O=Example, C=US',
          serialNumber: '1234567890',
          notBefore: '2024-01-01T00:00:00Z',
          notAfter: '2025-12-31T23:59:59Z'
        },
        {
          alias: 'cert2',
          entryType: 'X.509',
          subject: 'CN=test.com, O=Test, C=US',
          issuer: 'CN=Test CA, O=Test, C=US',
          serialNumber: '9876543210',
          notBefore: '2024-01-01T00:00:00Z',
          notAfter: '2024-06-30T23:59:59Z'
        }
      ]
    };

    it('should list all certificates successfully', async () => {
      jest.spyOn(trustStoreService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        status: 200,
        data: mockTrustStoreResponse
      });

      const result = await trustStoreService.listCertificates(testInstance);

      expect(result.success).toBe(true);
      expect(result.certificates).toHaveLength(2);
      expect(result.certificates![0].alias).toBe('cert1');
    });

    it('should filter certificates by alias', async () => {
      jest.spyOn(trustStoreService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        status: 200,
        data: mockTrustStoreResponse
      });

      const result = await trustStoreService.listCertificates(testInstance, { aliases: ['cert1'] });

      expect(result.success).toBe(true);
      expect(result.certificates).toHaveLength(1);
      expect(result.certificates![0].alias).toBe('cert1');
    });

    it('should identify expiring certificates', async () => {
      jest.spyOn(trustStoreService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        status: 200,
        data: mockTrustStoreResponse
      });

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 365);

      const result = await trustStoreService.listCertificates(testInstance, {
        expiringBefore: futureDate
      });

      expect(result.success).toBe(true);
      expect(result.certificates!.length).toBeGreaterThan(0);
    });

    it('should handle trust store error', async () => {
      jest.spyOn(trustStoreService as any, 'makeAuthenticatedRequest').mockRejectedValue(
        new Error('Trust store not configured')
      );

      const result = await trustStoreService.listCertificates(testInstance);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Trust store not configured');
    });
  });

  describe('exportCertificates', () => {
    it('should export certificates in PEM format', async () => {
      const mockCertData = '-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----';

      jest.spyOn(trustStoreService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        status: 200,
        data: mockCertData
      });

      const result = await trustStoreService.exportCertificates(testInstance, {
        aliases: ['cert1'],
        format: 'PEM'
      });

      expect(result.success).toBe(true);
      expect(result.certificates).toBeDefined();
      expect(result.certificates![0].data).toContain('BEGIN CERTIFICATE');
    });

    it('should export certificates in DER format', async () => {
      const mockCertData = Buffer.from([0x30, 0x82, 0x02, 0x00]);

      jest.spyOn(trustStoreService as any, 'makeAuthenticatedRequest').mockResolvedValue({
        status: 200,
        data: mockCertData
      });

      const result = await trustStoreService.exportCertificates(testInstance, {
        aliases: ['cert1'],
        format: 'DER'
      });

      expect(result.success).toBe(true);
      expect(result.certificates).toBeDefined();
    });

    it('should handle export error', async () => {
      jest.spyOn(trustStoreService as any, 'makeAuthenticatedRequest').mockRejectedValue(
        new Error('Certificate not found')
      );

      const result = await trustStoreService.exportCertificates(testInstance, {
        aliases: ['nonexistent'],
        format: 'PEM'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Certificate not found');
    });
  });

  describe('syncTrustStore', () => {
    const sourceInstance: AEMInstance = {
      url: 'http://source.example.com:4502',
      username: 'admin',
      password: 'admin'
    };

    const targetInstance: AEMInstance = {
      url: 'http://target.example.com:4502',
      username: 'admin',
      password: 'admin'
    };

    it('should identify certificates to sync', async () => {
      const sourceCerts = {
        aliases: [
          { alias: 'cert1', serialNumber: '123' },
          { alias: 'cert2', serialNumber: '456' }
        ]
      };

      const targetCerts = {
        aliases: [
          { alias: 'cert1', serialNumber: '123' }
        ]
      };

      jest.spyOn(trustStoreService as any, 'makeAuthenticatedRequest')
        .mockResolvedValueOnce({ status: 200, data: sourceCerts })
        .mockResolvedValueOnce({ status: 200, data: targetCerts });

      const result = await trustStoreService.syncTrustStore(sourceInstance, [targetInstance]);

      expect(result.success).toBe(true);
      expect(result.differences).toBeDefined();
    });

    it('should handle sync error', async () => {
      jest.spyOn(trustStoreService as any, 'makeAuthenticatedRequest').mockRejectedValue(
        new Error('Connection failed')
      );

      const result = await trustStoreService.syncTrustStore(sourceInstance, [targetInstance]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection failed');
    });
  });
});