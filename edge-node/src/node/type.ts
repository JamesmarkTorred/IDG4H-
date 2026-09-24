export interface NodeRegistrationRequest {
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
  registeredAt: string | null;
}

export interface NodeRegistrationResponse {
  node: RegisteredNode;
  authToken: string;
}

export interface NodeCredentials {
  nodeId: string;
  authToken: string;
}