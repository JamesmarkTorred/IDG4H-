export type Sex = 'male' | 'female' | 'other' | 'unknown';

export interface PatientInput {
  sourceSystem?: string;
  sourceRecordId?: string;

  familySerialNo?: string;
  phicNo?: string;

  lastName: string;
  firstName: string;
  middleName?: string;
  suffix?: string;

  birthDate: string;
  sex: Sex;

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

export interface Patient extends PatientInput {
  id: string;
  nodeId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
