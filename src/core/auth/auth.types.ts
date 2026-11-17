import type { UserRole } from '@prisma/client';
import type { Request } from 'express';

export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  role: UserRole;
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
  role: UserRole;
  id: string;
  name: string;
  email: string;
}
export const publicUser = (user: PublicUser): PublicUser => ({
  role: user.role,
  id: user.id,
  name: user.name,
  email: user.email,
});
