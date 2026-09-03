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

import {
  enqueueOutboxOperation,
} from '../db/outboxRepository';

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

      enqueueOutboxOperation({
        entityType: 'encounter',
        entityId: encounter.id,
        operationType: 'create',
        payload: encounter,
      });

      const observations = (
        input.observations ?? []
      ).map((observationInput) => {
        const observation =
          createObservation({
            ...observationInput,
            patientId: input.patientId,
            encounterId: encounter.id,
          });

        enqueueOutboxOperation({
          entityType: 'observation',
          entityId: observation.id,
          operationType: 'create',
          payload: observation,
        });

        return observation;
      });

      const immunizations = (
        input.immunizations ?? []
      ).map((immunizationInput) => {
        const immunization =
          createImmunization({
            ...immunizationInput,
            patientId: input.patientId,
            encounterId: encounter.id,
          });

        enqueueOutboxOperation({
          entityType: 'immunization',
          entityId: immunization.id,
          operationType: 'create',
          payload: immunization,
        });

        return immunization;
      });

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
