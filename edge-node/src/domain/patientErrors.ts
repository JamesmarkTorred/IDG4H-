export class PatientNotFoundError extends Error {
  constructor(
    readonly patientId: string,
    operation?: string
  ) {
    super(
      operation
        ? `Cannot create ${operation}: patient ${patientId} does not exist.`
        : `Patient ${patientId} does not exist.`
    );
    this.name = 'PatientNotFoundError';
  }
}

export class PatientVersionConflictError extends Error {
  constructor(
    readonly patientId: string,
    readonly expectedVersion: number,
    readonly currentVersion: number
  ) {
    super(
      `Patient version conflict. Expected ${expectedVersion}, current ${currentVersion}.`
    );
    this.name = 'PatientVersionConflictError';
  }
}
