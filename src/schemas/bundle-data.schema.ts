export interface BundleData {
  readonly s?: readonly [number, number]; // [active, total]
  readonly data?: readonly Array<{
    readonly state: 'Active' | 'Resolved' | 'Installed' | 'Fragment';
    readonly symbolicName: string;
  }>;
}

export interface BundleStateInfo {
  readonly state: string;
  readonly symbolicName: string;
}