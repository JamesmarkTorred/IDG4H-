export class EncounterNotFoundError extends Error {
  constructor(readonly encounterId: string) {
    super(`Encounter ${encounterId} does not exist.`);
    this.name = 'EncounterNotFoundError';
  }
}
