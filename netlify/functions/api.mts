import { randomUUID } from "node:crypto";
import serverless from "serverless-http";

type ApiHandler = ReturnType<typeof serverless>;
type LambdaEvent = Parameters<ApiHandler>[0];
type LambdaContext = Parameters<ApiHandler>[1];

let wrappedHandler: ApiHandler | undefined;

function getMultiValueQueryParameters(
  searchParams: URLSearchParams
): Record<string, string[]> {
  const values: Record<string, string[]> = {};
  for (const [key, value] of searchParams) {
    (values[key] ??= []).push(value);
  }
  return values;
}

async function toLambdaEvent(request: Request): Promise<LambdaEvent> {
  const url = new URL(request.url);
  const headers = Object.fromEntries(request.headers.entries());
  const multiValueQueryStringParameters = getMultiValueQueryParameters(
    url.searchParams
  );
  const queryStringParameters = Object.fromEntries(
    Object.entries(multiValueQueryStringParameters).map(([key, values]) => [
      key,
      values[values.length - 1],
    ])
  );
  const hasBody = !["GET", "HEAD"].includes(request.method);
  const body = hasBody ? Buffer.from(await request.arrayBuffer()) : null;
  const requestId = randomUUID();
  const sourceIp =
    request.headers.get("x-nf-client-connection-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "127.0.0.1";

  return {
    resource: url.pathname,
    path: url.pathname,
    httpMethod: request.method,
    headers,
    multiValueHeaders: Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key, [value]])
    ),
    queryStringParameters,
    multiValueQueryStringParameters,
    pathParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: "netlify",
      apiId: "netlify",
      authorizer: null,
      protocol: "HTTP/1.1",
      httpMethod: request.method,
      path: url.pathname,
      stage: "$default",
      requestId,
      requestTimeEpoch: Date.now(),
      resourcePath: url.pathname,
      resourceId: "netlify",
      identity: {
        sourceIp,
        userAgent: request.headers.get("user-agent") ?? "",
      },
      domainName: url.host,
      domainPrefix: url.hostname.split(".")[0] ?? "netlify",
    },
    body: body?.toString("base64") ?? null,
    isBase64Encoded: body !== null,
  } as unknown as LambdaEvent;
}

function createLambdaContext(): LambdaContext {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: "wathaeqi-api",
    functionVersion: "$LATEST",
    invokedFunctionArn: "arn:aws:lambda:netlify:function:wathaeqi-api",
    memoryLimitInMB: "1024",
    awsRequestId: randomUUID(),
    logGroupName: "/aws/lambda/wathaeqi-api",
    logStreamName: "",
    getRemainingTimeInMillis: () => 55_000,
  } as LambdaContext;
}

function toWebResponse(result: Awaited<ReturnType<ApiHandler>>): Response {
  const headers = new Headers();
  const multiValueHeaders = result.multiValueHeaders ?? {};

  for (const [name, value] of Object.entries(result.headers ?? {})) {
    if (
      !(
        name.toLowerCase() in
        Object.fromEntries(
          Object.keys(multiValueHeaders).map(key => [key.toLowerCase(), true])
        )
      )
    ) {
      headers.set(name, String(value));
    }
  }

  for (const [name, values] of Object.entries(multiValueHeaders)) {
    for (const value of values ?? []) {
      headers.append(name, String(value));
    }
  }

  const body =
    result.body == null
      ? null
      : result.isBase64Encoded
        ? Buffer.from(result.body, "base64")
        : result.body;

  return new Response(body, {
    status: result.statusCode ?? 200,
    headers,
  });
}

/**
 * Netlify's modern Fetch handler is used deliberately. The existing Express
 * application is adapted through serverless-http so the original /api path,
 * cookies, repeated query parameters, and JSON bodies reach tRPC unchanged.
 */
export default async function api(request: Request): Promise<Response> {
  try {
    if (!wrappedHandler) {
      const { createApp } = await import("../../dist/server/app.js");
      wrappedHandler = serverless(createApp({ productionStatic: false }));
    }

    const event = await toLambdaEvent(request);
    const result = await wrappedHandler(event, createLambdaContext());
    return toWebResponse(result);
  } catch (error) {
    console.error("[wathaeqi-api] Function startup or request failed", error);
    return Response.json(
      { error: "API function is temporarily unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}

export const config = {
  path: "/api/*",
  excludedPath: ["/api/health"],
};
