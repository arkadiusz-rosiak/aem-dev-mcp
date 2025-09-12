// Core AEM instance schemas
export {
  AEMInstanceSchema,
  InstanceSelectionSchema,
  type AEMInstance,
  type InstanceSelection
} from './instance.schemas.js';

// OSGi management schemas
export {
  BundleStateSchema,
  ComponentStateSchema,
  ConfigPropertyTypeSchema,
  ConfigPropertySchema,
  BundleListSchema,
  BundleOperationSchema,
  BundleIdentifierSchema,
  BundleDetailsSchema,
  BundleInstallSchema,
  ComponentListSchema,
  ComponentOperationSchema,
  ComponentIdentifierSchema,
  ConfigurationListSchema,
  ConfigurationGetSchema,
  ConfigurationCreateSchema,
  ConfigurationUpdateSchema,
  ConfigurationDeleteSchema,
  ConfigurationUnbindSchema,
  type BundleListInput,
  type BundleOperationInput,
  type BundleIdentifierInput,
  type BundleDetailsInput,
  type BundleInstallInput,
  type ComponentListInput,
  type ComponentOperationInput,
  type ComponentIdentifierInput,
  type ConfigurationListInput,
  type ConfigurationGetInput,
  type ConfigurationCreateInput,
  type ConfigurationUpdateInput,
  type ConfigurationDeleteInput,
  type ConfigurationUnbindInput
} from './osgi.schemas.js';

// AEM logs schemas
export {
  LogTypeSchema,
  AemLogsSearchInputSchema,
  PaginationMetadataSchema,
  LogSearchResultSchema,
  AemLogsSearchOutputSchema,
  LogSearchRequestSchema,
  PaginationResultSchema,
  type AemLogsSearchInput,
  type LogSearchResult,
  type AemLogsSearchOutput,
  type LogSearchRequest,
  type PaginationMetadata,
  type PaginationResult,
  type LogType
} from './aem-logs.schemas.js';