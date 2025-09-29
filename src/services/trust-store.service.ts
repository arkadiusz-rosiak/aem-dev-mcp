import { AemHttpClient } from './http-client.js';
import { ParallelExecutor } from './parallel-executor.js';
import { 
  TrustStoreCertificate,
  TrustStoreCertificateResult,
  TrustStoreExportResult
} from '@/types/security.types.js';
import { AEMInstance } from '@/types/instance.types.js';
import { getDefaultLogger } from '@/utils/logger.js';
import { extractErrorMessage } from '@/utils/errors.js';

export class TrustStoreService {
  private readonly httpClient: AemHttpClient;
  private readonly parallelExecutor: ParallelExecutor;
  private readonly logger = getDefaultLogger();

  constructor(httpClient: AemHttpClient, parallelExecutor: ParallelExecutor) {
    this.httpClient = httpClient;
    this.parallelExecutor = parallelExecutor;
  }

  async listTrustedCertificates(instance: AEMInstance, aliasFilter?: string): Promise<TrustStoreCertificateResult> {
    try {
      const response = await this.httpClient.get(
        `${instance.url}/etc/truststore.json`,
        {
          username: instance.username,
          password: instance.password
        }
      );

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}: ${response.data}`);
      }

      const data = response.data;
      const certificates: TrustStoreCertificate[] = [];

      if (data.aliases && Array.isArray(data.aliases)) {
        for (const aliasData of data.aliases) {
          if (aliasFilter && !aliasData.alias.includes(aliasFilter)) {
            continue;
          }

          const certificate = await this.getCertificateDetails(instance, aliasData.alias);
          if (certificate) {
            certificates.push(certificate);
          }
        }
      }

      this.logger.info(`Retrieved ${certificates.length} trusted certificates`, { 
        instanceUrl: instance.url,
        certificateCount: certificates.length 
      });

      return {
        instanceUrl: instance.url,
        certificates
      };

    } catch (error) {
      this.logger.error('Failed to list trusted certificates', { 
        instanceUrl: instance.url,
        error: extractErrorMessage(error) 
      });

      return {
        instanceUrl: instance.url,
        certificates: [],
        error: extractErrorMessage(error)
      };
    }
  }

  async exportCertificates(instance: AEMInstance, aliases?: string[], format: 'PEM' | 'DER' = 'PEM'): Promise<TrustStoreExportResult[]> {
    try {
      const allCertificates = await this.listTrustedCertificates(instance);
      if (allCertificates.error) {
        return [{
          instanceUrl: instance.url,
          alias: '',
          certificateData: '',
          format,
          success: false,
          error: allCertificates.error
        }];
      }

      const certificatesToExport = aliases ? 
        allCertificates.certificates.filter(cert => aliases.includes(cert.alias)) :
        allCertificates.certificates;

      const exportResults: TrustStoreExportResult[] = [];

      for (const certificate of certificatesToExport) {
        try {
          const certificateData = await this.getCertificateData(instance, certificate.alias, format);
          
          exportResults.push({
            instanceUrl: instance.url,
            alias: certificate.alias,
            certificateData,
            format,
            success: true
          });

        } catch (error) {
          exportResults.push({
            instanceUrl: instance.url,
            alias: certificate.alias,
            certificateData: '',
            format,
            success: false,
            error: extractErrorMessage(error)
          });
        }
      }

      this.logger.info(`Exported ${exportResults.filter(r => r.success).length} certificates`, { 
        instanceUrl: instance.url,
        format,
        successCount: exportResults.filter(r => r.success).length,
        totalCount: exportResults.length
      });

      return exportResults;

    } catch (error) {
      this.logger.error('Failed to export certificates', { 
        instanceUrl: instance.url,
        format,
        error: extractErrorMessage(error) 
      });

      return [{
        instanceUrl: instance.url,
        alias: '',
        certificateData: '',
        format,
        success: false,
        error: extractErrorMessage(error)
      }];
    }
  }

  async syncTrustStore(sourceInstance: AEMInstance, targetInstances: AEMInstance[], certificateAliases?: string[]): Promise<Record<string, TrustStoreCertificateResult>> {
    const operations = targetInstances.map(targetInstance => ({
      key: targetInstance.url,
      operation: async (): Promise<TrustStoreCertificateResult> => {
        try {
          const sourceCertificates = await this.listTrustedCertificates(sourceInstance);
          if (sourceCertificates.error) {
            return {
              instanceUrl: targetInstance.url,
              certificates: [],
              error: `Failed to read source certificates: ${sourceCertificates.error}`
            };
          }

          const certificatesToSync = certificateAliases ? 
            sourceCertificates.certificates.filter(cert => certificateAliases.includes(cert.alias)) :
            sourceCertificates.certificates;

          const targetCertificates = await this.listTrustedCertificates(targetInstance);
          if (targetCertificates.error) {
            return {
              instanceUrl: targetInstance.url,
              certificates: [],
              error: `Failed to read target certificates: ${targetCertificates.error}`
            };
          }

          const syncedCertificates: TrustStoreCertificate[] = [];

          for (const sourceCert of certificatesToSync) {
            const targetCert = targetCertificates.certificates.find(cert => cert.alias === sourceCert.alias);
            
            if (!targetCert) {
              syncedCertificates.push(sourceCert);
            } else if (targetCert.fingerprint !== sourceCert.fingerprint) {
              syncedCertificates.push(sourceCert);
            }
          }

          this.logger.info(`Trust store sync completed`, { 
            sourceInstanceUrl: sourceInstance.url,
            targetInstanceUrl: targetInstance.url,
            syncedCount: syncedCertificates.length,
            totalSourceCount: certificatesToSync.length
          });

          return {
            instanceUrl: targetInstance.url,
            certificates: syncedCertificates
          };

        } catch (error) {
          this.logger.error(`Failed to sync trust store`, { 
            sourceInstanceUrl: sourceInstance.url,
            targetInstanceUrl: targetInstance.url,
            error: extractErrorMessage(error) 
          });

          return {
            instanceUrl: targetInstance.url,
            certificates: [],
            error: extractErrorMessage(error)
          };
        }
      }
    }));

    return this.parallelExecutor.executeInParallel(operations);
  }

  private async getCertificateDetails(instance: AEMInstance, alias: string): Promise<TrustStoreCertificate | null> {
    try {
      const response = await this.httpClient.get(
        `${instance.url}/etc/truststore/${encodeURIComponent(alias)}.json`,
        {
          username: instance.username,
          password: instance.password
        }
      );

      if (response.status >= 400) {
        return null;
      }

      const data = response.data;
      
      return {
        alias,
        subject: data.subject || '',
        issuer: data.issuer || '',
        serialNumber: data.serialNumber || '',
        notBefore: new Date(data.notBefore || Date.now()),
        notAfter: new Date(data.notAfter || Date.now()),
        fingerprint: data.fingerprint || '',
        keyUsage: data.keyUsage || [],
        extendedKeyUsage: data.extendedKeyUsage || [],
        subjectAlternativeNames: data.subjectAlternativeNames || []
      };

    } catch (error) {
      this.logger.warn(`Failed to get certificate details for alias ${alias}`, { 
        instanceUrl: instance.url,
        alias,
        error: extractErrorMessage(error) 
      });
      return null;
    }
  }

  private async getCertificateData(instance: AEMInstance, alias: string, format: 'PEM' | 'DER'): Promise<string> {
    const response = await this.httpClient.get(
      `${instance.url}/etc/truststore/${encodeURIComponent(alias)}.${format.toLowerCase()}`,
      {
        username: instance.username,
        password: instance.password
      }
    );

    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status}: Failed to export certificate ${alias}`);
    }

    return response.data;
  }
}