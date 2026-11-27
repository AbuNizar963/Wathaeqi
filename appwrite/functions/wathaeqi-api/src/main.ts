import { randomUUID } from "node:crypto";
import serverless from "serverless-http";
import { createApp } from "../../../../server/app";
import { ENV } from "../../../../server/_core/env";
import { serverlessOptions } from "../../../../server/_core/serverlessOptions";

type AppwriteFunctionRequest = {
  method: string;
  url: string;
  path: string;
  scheme?: string;
  headers: Record<string, string>;
  bodyText?: string;
  bodyJson?: unknown;
  bodyBinary?: string | Uint8Array;
};

type AppwriteFunctionContext = {
  req: AppwriteFunctionRequest;
  res: {
    json: (
      data: unknown,
      statusCode?: number,
      headers?: Record<string, string>
    ) => unknown;
  };
  log: (...messages: unknown[]) => void;
  error: (...messages: unknown[]) => void;
};

type LambdaEvent = {
  resource: string;
  path: string;
  httpMethod: string;
  headers: Record<string, string>;
  multiValueHeaders: Record<string, string[]>;
  queryStringParameters: Record<string, string>;
  multiValueQueryStringParameters: Record<string, string[]>;
  pathParameters: null;
  stageVariables: null;
  requestContext: Record<string, unknown>;
  body: string | null;
  isBase64Encoded: boolean;
};

type LambdaResponse = {
  statusCode?: number;
  headers?: Record<string, string>;
  multiValueHeaders?: Record<string, string[]>;
  body?: string | null;
  isBase64Encoded?: boolean;
};

let expressHandler: ReturnType<typeof serverless> | undefined;

export function getRequestHeader(
  headers: Record<string, string>,
  name: string
): string | undefined {
  const target = name.toLowerCase();
  const entry = Object.entries(headers).find(
    ([headerName]) => headerName.toLowerCase() === target
  );
  return entry?.[1];
}

function getMultiValueQueryParameters(
  searchParams: URLSearchParams
): Record<string, string[]> {
  const values: Record<string, string[]> = {};
  for (const [key, value] of searchParams) {
    (values[key] ??= []).push(value);
  }
  return values;
}

function getRequestBody(req: AppwriteFunctionRequest): {
  body: string | null;
  isBase64Encoded: boolean;
} {
  if (["GET", "HEAD"].includes(req.method)) {
    return { body: null, isBase64Encoded: false };
  }

  if (req.bodyBinary !== undefined) {
    if (typeof req.bodyBinary === "string") {
      return { body: req.bodyBinary, isBase64Encoded: true };
    }
    return {
      body: Buffer.from(req.bodyBinary).toString("base64"),
      isBase64Encoded: true,
    };
  }

  if (req.bodyText !== undefined) {
    return {
      body: Buffer.from(req.bodyText).toString("base64"),
      isBase64Encoded: true,
    };
  }

  if (req.bodyJson !== undefined) {
    return {
      body: Buffer.from(JSON.stringify(req.bodyJson)).toString("base64"),
      isBase64Encoded: true,
    };
  }

  return { body: null, isBase64Encoded: false };
}

function toLambdaEvent(req: AppwriteFunctionRequest): LambdaEvent {
  const url = new URL(req.url);
  const headers = Object.fromEntries(
    Object.entries(req.headers)
      .filter(
        ([name]) => !["origin", "referer"].includes(name.toLowerCase())
      )
      .map(([name, value]) => [name.toLowerCase(), value])
  );
  const multiValueQueryStringParameters = getMultiValueQueryParameters(
    url.searchParams
  );
  const queryStringParameters = Object.fromEntries(
    Object.entries(multiValueQueryStringParameters).map(([key, values]) => [
      key,
      values[values.length - 1],
    ])
  );
  const requestBody = getRequestBody(req);
  const sourceIp =
    getRequestHeader(req.headers, "x-appwrite-client-ip") ??
    getRequestHeader(req.headers, "x-forwarded-for")?.split(",")[0]?.trim() ??
    "127.0.0.1";

  return {
    resource: url.pathname,
    path: url.pathname,
    httpMethod: req.method,
    headers,
    multiValueHeaders: Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key, [value]])
    ),
    queryStringParameters,
    multiValueQueryStringParameters,
    pathParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: "appwrite",
      apiId: "appwrite",
      authorizer: null,
      protocol: "https",
      httpMethod: req.method,
      path: url.pathname,
      stage: "$default",
      requestId: randomUUID(),
      requestTimeEpoch: Date.now(),
      resourcePath: url.pathname,
      resourceId: "wathaeqi-api",
      identity: { sourceIp, userAgent: headers["user-agent"] ?? "" },
      domainName: url.host,
      domainPrefix: url.hostname.split(".")[0] ?? "appwrite",
    },
    body: requestBody.body,
    isBase64Encoded: requestBody.isBase64Encoded,
  };
}

function toWebResponse(result: LambdaResponse): Response {
  const headers = new Headers();
  for (const [name, value] of Object.entries(result.headers ?? {})) {
    headers.set(name, String(value));
  }
  for (const [name, values] of Object.entries(result.multiValueHeaders ?? {})) {
    headers.delete(name);
    for (const value of values ?? []) headers.append(name, String(value));
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

function getAllowedOrigins(): Set<string> {
  return new Set(
    (process.env.APPWRITE_WEB_ORIGINS ?? "")
      .split(",")
      .map(origin => origin.trim())
      .filter(Boolean)
  );
}

export function createCorsHeaders(origin: string | undefined): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store",
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": [
      "Content-Type",
      "X-TRPC-Source",
      "trpc-accept",
      "Authorization",
      "X-File-Name",
      "X-Organization-Id",
      "X-Document-Metadata",
    ].join(", "),
    "Access-Control-Max-Age": "600",
    "Access-Control-Expose-Headers": "X-Request-Id",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  // Appwrite's function gateway can omit Origin on forwarded preflight
  // requests. When it does, use the first explicitly configured production
  // origin so the browser receives a valid CORS response. A supplied but
  // unapproved origin is never reflected here (and is rejected by main()).
  const allowedOrigins = getAllowedOrigins();
  const responseOrigin = origin
    ? allowedOrigins.has(origin)
      ? origin
      : undefined
    : allowedOrigins.values().next().value;
  if (responseOrigin) {
    headers.set("Access-Control-Allow-Origin", responseOrigin);
  }
  return headers;
}

export function applyCorsHeaders(
  response: Response,
  corsHeaders: Headers
): Response {
  for (const [name, value] of corsHeaders.entries()) {
    const normalizedName = name.toLowerCase();
    if (normalizedName === "vary" && response.headers.has("Vary")) {
      const current = response.headers
        .get("Vary")!
        .split(",")
        .map(item => item.trim());
      if (!current.some(item => item.toLowerCase() === "origin")) {
        response.headers.set("Vary", [...current, "Origin"].join(", "));
      }
    } else if (
      normalizedName.startsWith("access-control-") ||
      !response.headers.has(name)
    ) {
      response.headers.set(name, value);
    }
  }
  return response;
}

export default async function main({
  req,
  res,
  log,
  error,
}: AppwriteFunctionContext): Promise<Response | unknown> {
  const appwriteApiKey = getRequestHeader(req.headers, "x-appwrite-key");
  if (!process.env.APPWRITE_API_KEY && appwriteApiKey) {
    ENV.appwriteApiKey = appwriteApiKey;
  }

  const origin = getRequestHeader(req.headers, "origin");
  const allowedOrigins = getAllowedOrigins();
  const corsHeaders = createCorsHeaders(
    origin && allowedOrigins.has(origin) ? origin : undefined
  );

  if (origin && !allowedOrigins.has(origin)) {
    return res.json({ error: "Origin is not allowed" }, 403, {
      "Cache-Control": "no-store",
      Vary: "Origin",
    });
  }

  if (req.method === "OPTIONS") {
    if (origin && !allowedOrigins.has(origin)) {
      return res.json({ error: "Origin is not allowed" }, 403);
    }
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname === "/health") {
    return new Response(
      JSON.stringify({
        ok: true,
        service: "wathaeqi-owner-api",
        platform: "appwrite-functions",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: new Headers([
          ...corsHeaders.entries(),
          ["Content-Type", "application/json"],
        ]),
      }
    );
  }

  try {
    expressHandler ??= serverless(
      createApp({ productionStatic: false }),
      serverlessOptions
    );
    const result = await expressHandler(toLambdaEvent(req), {
      functionName: "wathaeqi-api",
      functionVersion: "$LATEST",
      invokedFunctionArn: "appwrite:function:wathaeqi-api",
      memoryLimitInMB: "512",
      awsRequestId: randomUUID(),
      getRemainingTimeInMillis: () => 55_000,
    } as never);
    const response = applyCorsHeaders(
      toWebResponse(result as LambdaResponse),
      corsHeaders
    );
    response.headers.set(
      "Cache-Control",
      response.headers.get("Cache-Control")?.includes("private")
        ? "private, no-store"
        : "no-store"
    );
    return response;
  } catch (caught) {
    error("Wathaeqi owner API request failed", caught);
    log("Request path:", url.pathname);
    return new Response(
      JSON.stringify({ error: "API request could not be completed" }),
      {
        status: 500,
        headers: new Headers([
          ...corsHeaders.entries(),
          ["Content-Type", "application/json"],
        ]),
      }
    );
  }
}
