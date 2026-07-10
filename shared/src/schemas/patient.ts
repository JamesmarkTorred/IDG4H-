export interface Patient {
  id: string;
  fullName: string;
  birthDate: string; // ISO date
  sex: 'male' | 'female' | 'other';
}