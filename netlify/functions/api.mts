import serverless from "serverless-http";
import { createApp } from "../../dist/server/app.js";

/**
 * Netlify adapter for Wathaeqi's shared Express API.
 * The existing app owns security middleware, cookies, authentication, and tRPC.
 */
const app = createApp({ productionStatic: false });

export const handler = serverless(app);
