import { z } from 'zod';

/**
 * Core AEM instance schema for authentication and connection
 */
export const AEMInstanceSchema = z.object({
  url: z.string().url('Invalid URL format'),
  username: z.string().min(1, 'Username cannot be empty'),
  password: z.string().min(1, 'Password cannot be empty')
});

/**
 * Base schema for selecting AEM instances via aliases or direct configuration
 * This is the foundation schema used across all AEM operations
 */
export const InstanceSelectionSchema = z.object({
  aliases: z.array(z.string().min(1, 'Alias cannot be empty')).optional(),
  instances: z.array(AEMInstanceSchema).optional()
}).refine(
  (data) => data.aliases || data.instances,
  { 
    message: "Either 'aliases' or 'instances' must be provided",
    path: ['aliases', 'instances']
  }
);

// Type exports
export type AEMInstance = z.infer<typeof AEMInstanceSchema>;
export type InstanceSelection = z.infer<typeof InstanceSelectionSchema>;