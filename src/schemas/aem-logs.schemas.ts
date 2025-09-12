import { z } from 'zod';
import { InstanceSelectionSchema } from '@/schemas/instance.schemas.js';

export const LogTypeSchema = z.enum([
  'application_errors',
  'http_requests',
  'web_access',
  'audit',
  'startup_messages',
  'system_errors',
  'bundle_lifecycle',
  'history',
  'upgrade_operations'
]);

const validateRegexPattern = (pattern: string): boolean => {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
};

export const AemLogsSearchInputSchema = InstanceSelectionSchema.safeExtend({
  regex: z.string()
    .min(1, 'Regex pattern is required')
    .refine(validateRegexPattern, {
      message: 'Invalid regex pattern provided'
    }),
  log_type: LogTypeSchema.default('application_errors'),
  page: z.number().int().min(1, 'Page number must be at least 1').default(1)
});

export const PaginationMetadataSchema = z.object({
  current_page: z.number().int().min(1),
  total_pages: z.number().int().min(1),
  total_entries: z.number().int().min(0),
  entries_on_page: z.number().int().min(0)
});

export const LogSearchResultSchema = z.object({
  instance: z.string().min(1),
  log_type: LogTypeSchema,
  entries: z.array(z.string()),
  pagination: PaginationMetadataSchema
});

export const AemLogsSearchOutputSchema = z.object({
  results: z.array(LogSearchResultSchema),
  summary: z.object({
    total_instances: z.number().int().min(0),
    successful_instances: z.number().int().min(0),
    failed_instances: z.number().int().min(0)
  })
});

export const LogSearchRequestSchema = z.object({
  instance: z.string().min(1),
  regex: z.string().min(1),
  log_type: LogTypeSchema,
  page: z.number().int().min(1)
});

export const PaginationResultSchema = z.object({
  paginatedLines: z.array(z.string()),
  totalPages: z.number().int().min(1),
  currentPage: z.number().int().min(1),
  totalEntries: z.number().int().min(0),
  entriesOnPage: z.number().int().min(0)
});

export type AemLogsSearchInput = z.infer<typeof AemLogsSearchInputSchema>;
export type LogSearchResult = z.infer<typeof LogSearchResultSchema>;
export type AemLogsSearchOutput = z.infer<typeof AemLogsSearchOutputSchema>;
export type LogSearchRequest = z.infer<typeof LogSearchRequestSchema>;
export type PaginationMetadata = z.infer<typeof PaginationMetadataSchema>;
export type PaginationResult = z.infer<typeof PaginationResultSchema>;
export type LogType = z.infer<typeof LogTypeSchema>;