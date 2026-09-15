export interface JWTUserPayload {
  id: string;
  email: string;
  role: 'CANDIDATE' | 'RECRUITER' | 'ADMIN';
}

export interface JWTRefreshPayload {
  id: string;
}
