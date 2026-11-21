import { randomUUID } from "node:crypto";
import serverless from "serverless-http";
import { createApp } from "../../../../server/app";
import { ENV } from "../../../../server/_core/env";

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
    Object.entries(req.headers).filter(
      ([name]) => !["origin", "referer"].includes(name.toLowerCase())
    )
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
    req.headers["x-appwrite-client-ip"] ??
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ??
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

function createCorsHeaders(origin: string | undefined): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store",
    Vary: "Origin",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
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
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

export default async function main({
  req,
  res,
  log,
  error,
}: AppwriteFunctionContext): Promise<Response | unknown> {
  if (!process.env.APPWRITE_API_KEY && req.headers["x-appwrite-key"]) {
    ENV.appwriteApiKey = req.headers["x-appwrite-key"];
  }

  const origin = req.headers.origin;
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
    expressHandler ??= serverless(createApp({ productionStatic: false }));
    const result = await expressHandler(toLambdaEvent(req), {
      functionName: "wathaeqi-api",
      functionVersion: "$LATEST",
      invokedFunctionArn: "appwrite:function:wathaeqi-api",
      memoryLimitInMB: "512",
      awsRequestId: randomUUID(),
      getRemainingTimeInMillis: () => 55_000,
    } as never);
    const response = toWebResponse(result as LambdaResponse);
    for (const [name, value] of corsHeaders.entries()) {
      if (name.toLowerCase() === "set-cookie") {
        response.headers.append(name, value);
      } else if (!response.headers.has(name)) {
        response.headers.set(name, value);
      }
    }
    response.headers.set("Cache-Control", "no-store");
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
