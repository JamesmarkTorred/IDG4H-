export interface NodeRegistrationInput {
  nodeId: string;
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

export interface NodeSummary {
  id: string;
  nodeId: string;
  name: string;
  facilityName: string;
  address: string;
  status: string;
  registeredAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}