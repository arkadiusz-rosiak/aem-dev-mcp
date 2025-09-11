import { z } from 'zod';
import { InstanceSelectionSchema } from '@/schemas/instance.schemas.js';

export const MAX_CONCURRENT_INSTANCES = 20;

export const HealthCheckSchema = InstanceSelectionSchema.refine(
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