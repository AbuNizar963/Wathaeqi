import type serverless from "serverless-http";

type ApiHandler = ReturnType<typeof serverless>;

let wrappedHandler: ApiHandler | undefined;

/**
 * Load the Express application lazily so module initialization failures are
 * reported as a controlled API response instead of an opaque Netlify 502.
 */
export const handler = async (...args: Parameters<ApiHandler>) => {
  try {
    if (!wrappedHandler) {
      const [{ createApp }, serverlessModule] = await Promise.all([
        import("../../dist/server/app.js"),
        import("serverless-http"),
      ]);
      wrappedHandler = serverlessModule.default(
        createApp({ productionStatic: false })
      );
    }

    return await wrappedHandler(...args);
  } catch (error) {
    console.error("[wathaeqi-api] Function startup or request failed", error);
    return {
      statusCode: 503,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({
        error: "API function is temporarily unavailable",
      }),
    };
  }
};
