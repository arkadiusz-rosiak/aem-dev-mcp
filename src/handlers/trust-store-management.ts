import { z } from 'zod';
import { AliasResolver } from '@/services/alias-resolver.js';
import { ParallelExecutor } from '@/services/parallel-executor.js';
import { AemHttpClient } from '@/services/http-client.js';
import { TrustStoreService } from '@/services/trust-store.service.js';
import {
  TrustStoreListRequestSchema,
  TrustStoreExportRequestSchema
} from '@/schemas/security.schemas.js';
import {
  TrustStoreListRequest,
  TrustStoreExportRequest,
  TrustStoreCertificateResult,
  TrustStoreExportResult
} from '@/types/security.types.js';
import { MCPToolResult, AEMInstance } from '@/types/index.js';
import { getDefaultLogger } from '@/utils/logger.js';
import { extractErrorMessage } from '@/utils/errors.js';

const logger = getDefaultLogger();

async function resolveInstances(
  instances: string[],
  resolver: AliasResolver
): Promise<AEMInstance[]> {
  const resolvedInstances: AEMInstance[] = [];

  for (const instance of instances) {
    // Try to parse as URL (direct instance)
    try {
      new URL(instance);
      // If it's a valid URL, treat as direct instance - but we need credentials
      // For now, assume it's an alias if it's just a string
      const result = await resolver.resolveAlias(instance);
      if (result.resolved) {
        resolvedInstances.push(...result.instances);
      }
    } catch {
      // Not a valid URL, treat as alias
      const result = await resolver.resolveAlias(instance);
      if (result.resolved) {
        resolvedInstances.push(...result.instances);
      }
    }
  }

  return resolvedInstances;
}

export async function handleTrustStoreList(
  args: unknown, 
  aliasResolver: AliasResolver, 
  parallelExecutor: ParallelExecutor, 
  httpClient: AemHttpClient
): Promise<MCPToolResult> {
  try {
    const request = TrustStoreListRequestSchema.parse(args) as TrustStoreListRequest;
    const trustStoreService = new TrustStoreService(httpClient, parallelExecutor);

    const instances = await resolveInstances(request.instances, aliasResolver);
    const results: Record<string, TrustStoreCertificateResult> = {};

    const operations = instances.map((instance: AEMInstance) => ({
      key: instance.url,
      operation: async () => {
        return trustStoreService.listTrustedCertificates(instance, request.aliasFilter);
      }
    }));

    const parallelResults = await parallelExecutor.executeInParallel(operations);

    for (const [instanceUrl, certificateResult] of Object.entries(parallelResults)) {
      results[instanceUrl] = certificateResult as TrustStoreCertificateResult;
    }

    const totalCertificates = Object.values(results)
      .reduce((total, result) => total + result.certificates.length, 0);
    const instancesWithErrors = Object.values(results)
      .filter(result => result.error).length;

    logger.info('Trust store list completed', { 
      totalInstances: instances.length,
      totalCertificates,
      instancesWithErrors,
      aliasFilter: request.aliasFilter
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          results,
          summary: {
            totalInstances: instances.length,
            totalCertificates,
            instancesWithErrors,
            aliasFilter: request.aliasFilter
          }
        }, null, 2)
      }],
      isError: false
    };

  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    logger.error('Trust store list failed', { error: errorMessage });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: errorMessage
        })
      }],
      isError: true
    };
  }
}

export async function handleTrustStoreExport(
  args: unknown, 
  aliasResolver: AliasResolver, 
  parallelExecutor: ParallelExecutor, 
  httpClient: AemHttpClient
): Promise<MCPToolResult> {
  try {
    const request = TrustStoreExportRequestSchema.parse(args) as TrustStoreExportRequest;
    const trustStoreService = new TrustStoreService(httpClient, parallelExecutor);

    const instances = await resolveInstances(request.instances, aliasResolver);
    const results: Record<string, TrustStoreExportResult[]> = {};

    const operations = instances.map((instance: AEMInstance) => ({
      key: instance.url,
      operation: async () => {
        return trustStoreService.exportCertificates(instance, request.aliases, request.format);
      }
    }));

    const parallelResults = await parallelExecutor.executeInParallel(operations);

    for (const [instanceUrl, exportResults] of Object.entries(parallelResults)) {
      results[instanceUrl] = exportResults as TrustStoreExportResult[];
    }

    const totalExports = Object.values(results).flat().length;
    const successfulExports = Object.values(results).flat().filter(r => r.success).length;

    logger.info('Trust store export completed', { 
      totalInstances: instances.length,
      totalExports,
      successfulExports,
      failedExports: totalExports - successfulExports,
      format: request.format
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          results,
          summary: {
            totalInstances: instances.length,
            totalExports,
            successfulExports,
            failedExports: totalExports - successfulExports,
            format: request.format
          }
        }, null, 2)
      }],
      isError: false
    };

  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    logger.error('Trust store export failed', { error: errorMessage });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: errorMessage
        })
      }],
      isError: true
    };
  }
}

export async function handleTrustStoreSync(
  args: unknown, 
  aliasResolver: AliasResolver, 
  parallelExecutor: ParallelExecutor, 
  httpClient: AemHttpClient
): Promise<MCPToolResult> {
  try {
    const request = z.object({
      sourceInstance: z.string(),
      targetInstances: z.array(z.string()),
      certificateAliases: z.array(z.string()).optional()
    }).parse(args);
    
    const trustStoreService = new TrustStoreService(httpClient, parallelExecutor);

    const sourceInstances = await resolveInstances([request.sourceInstance], aliasResolver);
    const targetInstances = await resolveInstances(request.targetInstances, aliasResolver);
    
    if (sourceInstances.length === 0) {
      throw new Error('Source instance not found');
    }
    
    const sourceInstance = sourceInstances[0];
    
    const results = await trustStoreService.syncTrustStore(
      sourceInstance, 
      targetInstances, 
      request.certificateAliases
    );

    const totalSyncs = Object.values(results).length;
    const successfulSyncs = Object.values(results)
      .filter(result => !result.error).length;
    const totalCertificates = Object.values(results)
      .reduce((total, result) => total + result.certificates.length, 0);

    logger.info('Trust store sync completed', { 
      sourceInstance: sourceInstance.url,
      targetInstances: targetInstances.length,
      totalSyncs,
      successfulSyncs,
      failedSyncs: totalSyncs - successfulSyncs,
      totalCertificates
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          results,
          summary: {
            sourceInstance: sourceInstance.url,
            targetInstances: targetInstances.length,
            totalSyncs,
            successfulSyncs,
            failedSyncs: totalSyncs - successfulSyncs,
            totalCertificates
          }
        }, null, 2)
      }],
      isError: false
    };

  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    logger.error('Trust store sync failed', { error: errorMessage });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: errorMessage
        })
      }],
      isError: true
    };
  }
}

export const trustStoreListTool = {
  name: 'aem_trust_store_list',
  description: 'List trusted certificates from AEM trust stores',
  inputSchema: {
    type: 'object',
    properties: {
      instances: {
        type: 'array',
        items: { type: 'string' },
        description: 'AEM instance URLs or aliases'
      },
      aliasFilter: { 
        type: 'string', 
        description: 'Optional filter to match certificate aliases' 
      }
    },
    required: ['instances']
  }
} as const;

export const trustStoreExportTool = {
  name: 'aem_trust_store_export',
  description: 'Export trusted certificates from AEM trust stores',
  inputSchema: {
    type: 'object',
    properties: {
      instances: {
        type: 'array',
        items: { type: 'string' },
        description: 'AEM instance URLs or aliases'
      },
      aliases: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific certificate aliases to export (optional - exports all if not specified)'
      },
      format: {
        type: 'string',
        enum: ['PEM', 'DER'],
        description: 'Certificate export format'
      }
    },
    required: ['instances', 'format']
  }
} as const;

export const trustStoreSyncTool = {
  name: 'aem_trust_store_sync',
  description: 'Synchronize trust store certificates from source to target instances (read-only comparison)',
  inputSchema: {
    type: 'object',
    properties: {
      sourceInstance: { type: 'string', description: 'Source AEM instance URL or alias' },
      targetInstances: {
        type: 'array',
        items: { type: 'string' },
        description: 'Target AEM instance URLs or aliases'
      },
      certificateAliases: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific certificate aliases to sync (optional - syncs all if not specified)'
      }
    },
    required: ['sourceInstance', 'targetInstances']
  }
} as const;