export interface BundleInfo {
  readonly state: 'Active' | 'Resolved' | 'Installed' | 'Fragment';
  readonly symbolicName: string;
}

export interface BundleData {
  readonly s?: readonly [number, number]; // [active, total]
  readonly data?: readonly BundleInfo[];
}