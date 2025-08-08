import { z } from 'zod';

export const MAX_CONCURRENT_INSTANCES = 20;

export const AEMInstanceSchema = z.object({
  url: z.string().url('Invalid URL format'),
  username: z.string().min(1, 'Username cannot be empty'),
  password: z.string().min(1, 'Password cannot be empty')
});

export const HealthCheckSchema = z.object({
  aliases: z.array(z.string().min(1, 'Alias cannot be empty')).optional(),
  instances: z.array(AEMInstanceSchema).optional(),
  detailed: z.boolean().optional().default(false)
}).refine(
  (data) => data.aliases || data.instances,
  { 
    message: "Either 'aliases' or 'instances' must be provided",
    path: ['aliases', 'instances']
  }
).refine(
  (data) => {
    const totalInstances = (data.aliases?.length ?? 0) + (data.instances?.length ?? 0);
    return totalInstances <= MAX_CONCURRENT_INSTANCES;
  },
  {
    message: `Maximum ${MAX_CONCURRENT_INSTANCES} instances supported for parallel health checks`,
    path: ['instances']
  }
);

export type HealthCheckInput = z.infer<typeof HealthCheckSchema>;
export type AEMInstanceInput = z.infer<typeof AEMInstanceSchema>;