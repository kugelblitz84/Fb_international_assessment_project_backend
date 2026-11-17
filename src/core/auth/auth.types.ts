import type { Request } from 'express';

export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
}
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
export interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}
export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  sessionId: string;
}
export interface PublicUser {
  id: string;
  name: string;
  email: string;
}
export const publicUser = (user: PublicUser): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
});
