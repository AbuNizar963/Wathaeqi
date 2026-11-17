import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { getAppwriteAuthenticatedUserFromRequest } from "./appwriteAuth";
import type { PublicUser } from "./auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: PublicUser | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const user = await getAppwriteAuthenticatedUserFromRequest(opts.req);
  if (!user) return { ...opts, user: null };

  const { passwordHash: _passwordHash, ...publicUser } = user;
  return { ...opts, user: publicUser };
}
