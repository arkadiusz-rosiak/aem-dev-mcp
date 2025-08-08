import { z } from 'zod';

export const MAX_BULK_OPERATIONS = 50;

export const BundleStateSchema = z.enum([
  'Active',
  'Resolved', 
  'Installed',
  'Starting',
  'Stopping',
  'Uninstalled',
  'Fragment'
]);

export const ComponentStateSchema = z.enum([
  'active',
  'satisfied',
  'unsatisfied',
  'disabled'
]);

export const ConfigPropertyTypeSchema = z.enum([
  'String',
  'Long',
  'Integer',
  'Short',
  'Character',
  'Boolean',
  'Double',
  'Float'
]);

export const ConfigPropertySchema = z.object({
  name: z.string().min(1, 'Property name cannot be empty'),
  value: z.any(),
  type: ConfigPropertyTypeSchema,
  cardinality: z.number().optional(),
  description: z.string().optional()
});

export const BundleListSchema = z.object({
  instanceAlias: z.string().min(1, 'Instance alias cannot be empty'),
  stateFilter: BundleStateSchema.optional(),
  nameFilter: z.string().optional()
});

export const BundleOperationSchema = z.object({
  instanceAlias: z.string().min(1, 'Instance alias cannot be empty'),
  bundleId: z.number().int().positive('Bundle ID must be a positive integer').optional(),
  symbolicName: z.string().optional(),
  action: z.enum(['start', 'stop', 'uninstall', 'refresh'])
}).refine(
  (data) => data.bundleId || data.symbolicName,
  {
    message: "Either 'bundleId' or 'symbolicName' must be provided",
    path: ['bundleId', 'symbolicName']
  }
);

export const BundleInstallSchema = z.object({
  instanceAlias: z.string().min(1, 'Instance alias cannot be empty'),
  bundleUrl: z.string().url('Invalid bundle URL').optional(),
  bundleFile: z.instanceof(Buffer).optional(),
  startLevel: z.number().int().min(1).max(100).optional(),
  start: z.boolean().default(true),
  refresh: z.boolean().default(false)
}).refine(
  (data) => data.bundleUrl || data.bundleFile,
  {
    message: "Either 'bundleUrl' or 'bundleFile' must be provided",
    path: ['bundleUrl', 'bundleFile']
  }
);

export const BundleBulkOperationSchema = z.object({
  instanceAlias: z.string().min(1, 'Instance alias cannot be empty'),
  bundleIds: z.array(z.number().int().positive('Bundle ID must be positive'))
    .min(1, 'At least one bundle ID must be provided')
    .max(MAX_BULK_OPERATIONS, `Maximum ${MAX_BULK_OPERATIONS} bundle IDs allowed`),
  action: z.enum(['start', 'stop', 'restart', 'uninstall', 'refresh'])
});

export const ComponentListSchema = z.object({
  instanceAlias: z.string().min(1, 'Instance alias cannot be empty'),
  stateFilter: ComponentStateSchema.optional(),
  nameFilter: z.string().optional()
});

export const ComponentOperationSchema = z.object({
  instanceAlias: z.string().min(1, 'Instance alias cannot be empty'),
  componentId: z.number().int().positive('Component ID must be positive').optional(),
  componentName: z.string().optional(),
  action: z.enum(['enable', 'disable'])
}).refine(
  (data) => data.componentId || data.componentName,
  {
    message: "Either 'componentId' or 'componentName' must be provided",
    path: ['componentId', 'componentName']
  }
);

export const ComponentBulkOperationSchema = z.object({
  instanceAlias: z.string().min(1, 'Instance alias cannot be empty'),
  componentIds: z.array(z.number().int().positive('Component ID must be positive')).optional(),
  componentNames: z.array(z.string().min(1, 'Component name cannot be empty')).optional(),
  action: z.enum(['enable', 'disable'])
}).refine(
  (data) => (data.componentIds && data.componentIds.length > 0) || 
           (data.componentNames && data.componentNames.length > 0),
  {
    message: "Either 'componentIds' or 'componentNames' must be provided and non-empty",
    path: ['componentIds', 'componentNames']
  }
).refine(
  (data) => {
    const totalComponents = (data.componentIds?.length ?? 0) + (data.componentNames?.length ?? 0);
    return totalComponents <= MAX_BULK_OPERATIONS;
  },
  {
    message: `Maximum ${MAX_BULK_OPERATIONS} components allowed`,
    path: ['componentIds', 'componentNames']
  }
);

export const ConfigurationListSchema = z.object({
  instanceAlias: z.string().min(1, 'Instance alias cannot be empty'),
  pidFilter: z.string().optional()
});

export const ConfigurationGetSchema = z.object({
  instanceAlias: z.string().min(1, 'Instance alias cannot be empty'),
  pid: z.string().min(1, 'PID cannot be empty')
});

export const ConfigurationCreateSchema = z.object({
  instanceAlias: z.string().min(1, 'Instance alias cannot be empty'),
  pid: z.string().min(1, 'PID cannot be empty'),
  properties: z.record(z.string(), ConfigPropertySchema)
    .refine(props => Object.keys(props).length > 0, {
      message: 'At least one property must be provided'
    }),
  factoryPid: z.string().optional(),
  bundleLocation: z.string().optional()
});

export const ConfigurationUpdateSchema = z.object({
  instanceAlias: z.string().min(1, 'Instance alias cannot be empty'),
  pid: z.string().min(1, 'PID cannot be empty'),
  properties: z.record(z.string(), ConfigPropertySchema)
    .refine(props => Object.keys(props).length > 0, {
      message: 'At least one property must be provided'
    }),
  factoryPid: z.string().optional(),
  bundleLocation: z.string().optional()
});

export const ConfigurationDeleteSchema = z.object({
  instanceAlias: z.string().min(1, 'Instance alias cannot be empty'),
  pid: z.string().min(1, 'PID cannot be empty')
});

export const ConfigurationUnbindSchema = z.object({
  instanceAlias: z.string().min(1, 'Instance alias cannot be empty'),
  pid: z.string().min(1, 'PID cannot be empty'),
  bundleLocation: z.string().optional()
});

export type BundleListInput = z.infer<typeof BundleListSchema>;
export type BundleOperationInput = z.infer<typeof BundleOperationSchema>;
export type BundleInstallInput = z.infer<typeof BundleInstallSchema>;
export type BundleBulkOperationInput = z.infer<typeof BundleBulkOperationSchema>;
export type ComponentListInput = z.infer<typeof ComponentListSchema>;
export type ComponentOperationInput = z.infer<typeof ComponentOperationSchema>;
export type ComponentBulkOperationInput = z.infer<typeof ComponentBulkOperationSchema>;
export type ConfigurationListInput = z.infer<typeof ConfigurationListSchema>;
export type ConfigurationGetInput = z.infer<typeof ConfigurationGetSchema>;
export type ConfigurationCreateInput = z.infer<typeof ConfigurationCreateSchema>;
export type ConfigurationUpdateInput = z.infer<typeof ConfigurationUpdateSchema>;
export type ConfigurationDeleteInput = z.infer<typeof ConfigurationDeleteSchema>;
export type ConfigurationUnbindInput = z.infer<typeof ConfigurationUnbindSchema>;