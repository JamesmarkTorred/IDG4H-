import { db } from '../db/connection';

import {
  createEncounter,
} from '../db/encounterRepository';

import {
  createObservation,
} from '../db/observationRepository';

import {
  createImmunization,
} from '../db/immunizationRepository';

import type {
  Encounter,
  EncounterInput,
  Observation,
  ObservationInput,
  Immunization,
  ImmunizationInput,
} from '../domain';

export interface ClinicalEncounterInput {
  patientId: string;

  encounter: Omit<
    EncounterInput,
    'patientId'
  >;

  observations?: Array<
    Omit<
      ObservationInput,
      'patientId' | 'encounterId'
    >
  >;

  immunizations?: Array<
    Omit<
      ImmunizationInput,
      'patientId' | 'encounterId'
    >
  >;
}

export interface ClinicalEncounterResult {
  encounter: Encounter;
  observations: Observation[];
  immunizations: Immunization[];
}

const saveClinicalEncounterTransaction =
  db.transaction(
    (
      input: ClinicalEncounterInput
    ): ClinicalEncounterResult => {
      const encounter = createEncounter({
        ...input.encounter,
        patientId: input.patientId,
      });

      const observations = (
        input.observations ?? []
      ).map((observation) =>
        createObservation({
          ...observation,
          patientId: input.patientId,
          encounterId: encounter.id,
        })
      );

      const immunizations = (
        input.immunizations ?? []
      ).map((immunization) =>
        createImmunization({
          ...immunization,
          patientId: input.patientId,
          encounterId: encounter.id,
        })
      );

      return {
        encounter,
        observations,
        immunizations,
      };
    }
  );

export function saveClinicalEncounter(
  input: ClinicalEncounterInput
): ClinicalEncounterResult {
  return saveClinicalEncounterTransaction(input);
}
