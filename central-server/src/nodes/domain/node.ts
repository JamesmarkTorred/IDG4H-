export interface NodeRegistrationInput {
  nodeId: string;
  name: string;
  facilityName: string;
  address: string;
  registrationCode: string;
}

export interface RegisteredNode {
  id: string;
  nodeId: string;
  name: string;
  facilityName: string;
  address: string;
  status: string;
  registeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  authToken: string;
}