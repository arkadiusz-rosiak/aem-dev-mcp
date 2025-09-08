import { createTimeout } from '@/utils/type-factories.js';

export const TIMEOUTS = {
  HTTP_CLIENT: createTimeout(30000),
  SERVICE_DEFAULT: createTimeout(15000),
  DEFAULT: createTimeout(10000),
  HEALTH_CHECK: createTimeout(15000),
  DIAGNOSTICS: createTimeout(15000),
  ALIAS_RESOLUTION: createTimeout(5000),
  CONNECTION_POOL_CLEANUP: createTimeout(60000),
  AGENT_TTL: createTimeout(300000),
  BUNDLE_INSTALL: createTimeout(300000)
} as const;

export type TimeoutKey = keyof typeof TIMEOUTS;