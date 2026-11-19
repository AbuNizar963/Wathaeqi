import { createTRPCReact } from "@trpc/react-query";
import type { OwnerApiRouter } from "../../../server/ownerApiRouter";

export const ownerTrpc = createTRPCReact<OwnerApiRouter>();
