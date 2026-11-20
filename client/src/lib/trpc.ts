import { createTRPCReact } from "@trpc/react-query";
import type { OwnerApiRouter } from "../../../server/ownerApiRouter";

/**
 * Compatibility name retained for the original police client surface.
 * The transport and server router are Appwrite-backed.
 */
export const trpc = createTRPCReact<OwnerApiRouter>();
