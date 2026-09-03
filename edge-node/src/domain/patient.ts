import type { Persisted, SourceInput, SyncMetadata } from './record';

export type PatientSex = 'male' | 'female' | 'other' | 'unknown';

export interface PatientInput extends SourceInput {
  familySerialNo?: string;
  phicNo?: string;

  lastName: string;
  firstName: string;
  middleName?: string;
  suffix?: string;

  birthDate: string;
  sex: PatientSex;
  civilStatus?: string;
  placeOfBirth?: string;
  religion?: string;
  educationalAttainment?: string;

  contactNumber?: string;
  addressLine?: string;
  purok?: string;
  barangay?: string;
  municipalityCity?: string;
  province?: string;
  district?: string;

  phicMembershipCategory?: string;
  phicMembershipType?: string;
  employmentStatus?: string;
  occupation?: string;

  spouseName?: string;
  spouseBirthDate?: string;
  spouseOccupation?: string;
  memberMaidenName?: string;
  fatherName?: string;
  familyPosition?: string;
}

export interface Patient extends Persisted<PatientInput>, SyncMetadata {}
