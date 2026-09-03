export interface SourceInput {
  nodeId: string;
  sourceSystem?: string;
  sourceRecordId?: string;
}

export interface SyncMetadata {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// SQLite returns NULL for omitted optional inputs. Persisted records include
// every field; callers creating a record may omit those optional fields.
export type Persisted<T> = {
  [K in keyof T]-?: undefined extends T[K]
    ? Exclude<T[K], undefined> | null
    : T[K];
};
