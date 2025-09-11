import { z } from 'zod';


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

export const AEMInstanceSchema = z.object({
  url: z.string().url('Invalid URL format'),
  username: z.string().min(1, 'Username cannot be empty'),
  password: z.string().min(1, 'Password cannot be empty')
});

// Base schema without refinements for extension
export const InstanceSelectionBaseSchema = z.object({
  aliases: z.array(z.string().min(1, 'Alias cannot be empty')).optional(),
  instances: z.array(AEMInstanceSchema).optional()
});

// Full schema with refinements for direct use
export const InstanceSelectionSchema = InstanceSelectionBaseSchema.refine(
  (data) => data.aliases || data.instances,
  { 
    message: "Either 'aliases' or 'instances' must be provided",
    path: ['aliases', 'instances']
  }
);

export const BundleListSchema = InstanceSelectionBaseSchema.extend({
  stateFilter: BundleStateSchema.optional(),
  nameFilter: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional().default(100),
  offset: z.number().int().min(0).optional().default(0)
}).refine(
  (data) => data.aliases || data.instances,
  { 
    message: "Either 'aliases' or 'instances' must be provided",
    path: ['aliases', 'instances']
  }
);

export const BundleOperationSchema = InstanceSelectionBaseSchema.extend({
  bundleId: z.number().int().positive('Bundle ID must be a positive integer').optional(),
  symbolicName: z.string().optional(),
  action: z.enum(['start', 'stop', 'uninstall', 'refresh'])
}).refine(
  (data) => data.aliases || data.instances,
  { 
    message: "Either 'aliases' or 'instances' must be provided",
    path: ['aliases', 'instances']
  }
).refine(
  (data) => data.bundleId || data.symbolicName,
  {
    message: "Either 'bundleId' or 'symbolicName' must be provided",
    path: ['bundleId', 'symbolicName']
  }
);

export const BundleIdentifierSchema = InstanceSelectionBaseSchema.extend({
  bundleId: z.number().int().positive('Bundle ID must be a positive integer').optional(),
  symbolicName: z.string().optional()
}).refine(
  (data) => data.aliases || data.instances,
  { 
    message: "Either 'aliases' or 'instances' must be provided",
    path: ['aliases', 'instances']
  }
).refine(
  (data) => data.bundleId || data.symbolicName,
  {
    message: "Either 'bundleId' or 'symbolicName' must be provided",
    path: ['bundleId', 'symbolicName']
  }
);

export const BundleDetailsSchema = InstanceSelectionBaseSchema.extend({
  bundleId: z.number().int().positive('Bundle ID must be a positive integer').optional(),
  symbolicName: z.string().optional()
}).refine(
  (data) => data.aliases || data.instances,
  { 
    message: "Either 'aliases' or 'instances' must be provided",
    path: ['aliases', 'instances']
  }
).refine(
  (data) => data.bundleId || data.symbolicName,
  {
    message: "Either 'bundleId' or 'symbolicName' must be provided",
    path: ['bundleId', 'symbolicName']
  }
);

export const BundleInstallSchema = InstanceSelectionBaseSchema.extend({
  bundleUrl: z.string().url('Invalid bundle URL').optional(),
  bundleFile: z.instanceof(Buffer).optional(),
  startLevel: z.number().int().min(1).max(100).optional(),
  start: z.boolean().default(true),
  refresh: z.boolean().default(false)
}).refine(
  (data) => data.aliases || data.instances,
  { 
    message: "Either 'aliases' or 'instances' must be provided",
    path: ['aliases', 'instances']
  }
).refine(
  (data) => data.bundleUrl || data.bundleFile,
  {
    message: "Either 'bundleUrl' or 'bundleFile' must be provided",
    path: ['bundleUrl', 'bundleFile']
  }
);


export const ComponentListSchema = InstanceSelectionBaseSchema.extend({
  stateFilter: ComponentStateSchema.optional(),
  nameFilter: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional().default(100),
  offset: z.number().int().min(0).optional().default(0)
}).refine(
  (data) => data.aliases || data.instances,
  { 
    message: "Either 'aliases' or 'instances' must be provided",
    path: ['aliases', 'instances']
  }
);

export const ComponentOperationSchema = InstanceSelectionBaseSchema.extend({
  componentId: z.number().int().positive('Component ID must be positive').optional(),
  componentName: z.string().optional(),
  action: z.enum(['enable', 'disable'])
}).refine(
  (data) => data.aliases || data.instances,
  { 
    message: "Either 'aliases' or 'instances' must be provided",
    path: ['aliases', 'instances']
  }
).refine(
  (data) => data.componentId || data.componentName,
  {
    message: "Either 'componentId' or 'componentName' must be provided",
    path: ['componentId', 'componentName']
  }
);

export const ComponentIdentifierSchema = InstanceSelectionBaseSchema.extend({
  componentId: z.number().int().positive('Component ID must be positive').optional(),
  componentName: z.string().optional()
}).refine(
  (data) => data.aliases || data.instances,
  { 
    message: "Either 'aliases' or 'instances' must be provided",
    path: ['aliases', 'instances']
  }
).refine(
  (data) => data.componentId || data.componentName,
  {
    message: "Either 'componentId' or 'componentName' must be provided",
    path: ['componentId', 'componentName']
  }
);


export const ConfigurationListSchema = InstanceSelectionBaseSchema.extend({
  pidFilter: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional().default(100),
  offset: z.number().int().min(0).optional().default(0)
}).refine(
  (data) => data.aliases || data.instances,
  { 
    message: "Either 'aliases' or 'instances' must be provided",
    path: ['aliases', 'instances']
  }
);

export const ConfigurationGetSchema = InstanceSelectionBaseSchema.extend({
  pid: z.string().min(1, 'PID cannot be empty')
}).refine(
  (data) => data.aliases || data.instances,
  { 
    message: "Either 'aliases' or 'instances' must be provided",
    path: ['aliases', 'instances']
  }
);

export const ConfigurationCreateSchema = InstanceSelectionBaseSchema.extend({
  pid: z.string().min(1, 'PID cannot be empty'),
  properties: z.record(z.string(), ConfigPropertySchema)
    .refine(props => Object.keys(props).length > 0, {
      message: 'At least one property must be provided'
    }),
  factoryPid: z.string().optional(),
  bundleLocation: z.string().optional()
}).refine(
  (data) => data.aliases || data.instances,
  { 
    message: "Either 'aliases' or 'instances' must be provided",
    path: ['aliases', 'instances']
  }
);

export const ConfigurationUpdateSchema = InstanceSelectionBaseSchema.extend({
  pid: z.string().min(1, 'PID cannot be empty'),
  properties: z.record(z.string(), ConfigPropertySchema)
    .refine(props => Object.keys(props).length > 0, {
      message: 'At least one property must be provided'
    }),
  factoryPid: z.string().optional(),
  bundleLocation: z.string().optional()
}).refine(
  (data) => data.aliases || data.instances,
  { 
    message: "Either 'aliases' or 'instances' must be provided",
    path: ['aliases', 'instances']
  }
);

export const ConfigurationDeleteSchema = InstanceSelectionBaseSchema.extend({
  pid: z.string().min(1, 'PID cannot be empty')
}).refine(
  (data) => data.aliases || data.instances,
  { 
    message: "Either 'aliases' or 'instances' must be provided",
    path: ['aliases', 'instances']
  }
);

export const ConfigurationUnbindSchema = InstanceSelectionBaseSchema.extend({
  pid: z.string().min(1, 'PID cannot be empty'),
  bundleLocation: z.string().optional()
}).refine(
  (data) => data.aliases || data.instances,
  { 
    message: "Either 'aliases' or 'instances' must be provided",
    path: ['aliases', 'instances']
  }
);

export type BundleListInput = z.infer<typeof BundleListSchema>;
export type BundleOperationInput = z.infer<typeof BundleOperationSchema>;
export type BundleIdentifierInput = z.infer<typeof BundleIdentifierSchema>;
export type BundleDetailsInput = z.infer<typeof BundleDetailsSchema>;
export type BundleInstallInput = z.infer<typeof BundleInstallSchema>;
export type ComponentListInput = z.infer<typeof ComponentListSchema>;
export type ComponentOperationInput = z.infer<typeof ComponentOperationSchema>;
export type ComponentIdentifierInput = z.infer<typeof ComponentIdentifierSchema>;
export type ConfigurationListInput = z.infer<typeof ConfigurationListSchema>;
export type ConfigurationGetInput = z.infer<typeof ConfigurationGetSchema>;
export type ConfigurationCreateInput = z.infer<typeof ConfigurationCreateSchema>;
export type ConfigurationUpdateInput = z.infer<typeof ConfigurationUpdateSchema>;
export type ConfigurationDeleteInput = z.infer<typeof ConfigurationDeleteSchema>;
export type ConfigurationUnbindInput = z.infer<typeof ConfigurationUnbindSchema>;