/**
 * Application user profile shape backed by the Appwrite `users` table.
 * Kept independent from any SQL ORM so the runtime model has one source:
 * Appwrite Auth plus the Appwrite TablesDB profile row.
 */
export type User = {
  id: number;
  authUserId: string;
  sessionVersion: string;
  organizationId: string;
  name: string | null;
  username: string | null;
  passwordHash: string | null;
  badgeNumber: string | null;
  bio: string | null;
  phone: string | null;
  rank: string | null;
  unit: string | null;
  avatarKey: string | null;
  email: string | null;
  loginMethod: string | null;
  isActive: boolean;
  isPlatformOwner: boolean;
  mustChangePassword: boolean;
  role: "user" | "admin";
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};
