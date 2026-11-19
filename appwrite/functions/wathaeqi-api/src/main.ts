import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { createContext } from "../../../../server/_core/context";
import { ownerApiRouter } from "../../../../server/ownerApiRouter";
import { ENV } from "../../../../server/_core/env";

type AppwriteFunctionRequest = {
  method: string;
  url: string;
  path: string;
  scheme?: string;
  headers: Record<string, string>;
  bodyText?: string;
  bodyJson?: unknown;
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

function getAllowedOrigins(): Set<string> {
  return new Set(
    (process.env.APPWRITE_WEB_ORIGINS ?? "")
      .split(",")
      .map(origin => origin.trim())
      .filter(Boolean)
  );
}

function createResponseHeaders(
  baseHeaders: Headers,
  contentType?: string
): Headers {
  const headers = new Headers(baseHeaders);
  if (contentType) headers.set("Content-Type", contentType);
  return headers;
}

function createCorsHeaders(origin: string | undefined): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": [
      "Content-Type",
      "X-TRPC-Source",
      "trpc-accept",
      "Authorization",
    ].join(", "),
    "Access-Control-Max-Age": "600",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });

  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function createExpressRequest(
  request: AppwriteFunctionRequest
): ExpressRequest {
  const headers = Object.fromEntries(
    Object.entries(request.headers).map(([name, value]) => [
      name.toLowerCase(),
      value,
    ])
  );
  const clientIp =
    headers["x-appwrite-client-ip"] ??
    headers["x-forwarded-for"]?.split(",")[0]?.trim() ??
    "unknown";

  return {
    headers,
    method: request.method,
    protocol: request.scheme ?? "https",
    path: request.path,
    originalUrl: request.url,
    url: request.url,
    ip: clientIp,
    socket: { remoteAddress: clientIp },
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as unknown as ExpressRequest;
}

function createExpressResponse(
  headers: Headers
): ExpressResponse {
  return {
    setHeader(name: string, value: string | number | readonly string[]) {
      if (Array.isArray(value)) {
        headers.delete(name);
        for (const item of value) headers.append(name, String(item));
        return this;
      }
      headers.set(name, String(value));
      return this;
    },
    getHeader(name: string) {
      return headers.get(name) ?? undefined;
    },
  } as unknown as ExpressResponse;
}

export default async function main({
  req,
  res,
  log,
  error,
}: AppwriteFunctionContext): Promise<Response | unknown> {
  // Appwrite injects a short-lived API key scoped to this function execution.
  // Reuse it instead of storing a permanent project API key in function vars.
  if (!process.env.APPWRITE_API_KEY && req.headers["x-appwrite-key"]) {
    ENV.appwriteApiKey = req.headers["x-appwrite-key"];
  }

  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();
  const corsHeaders = createCorsHeaders(
    origin && allowedOrigins.has(origin) ? origin : undefined
  );

  if (origin && !allowedOrigins.has(origin)) {
    return res.json(
      { error: "Origin is not allowed" },
      403,
      { "Cache-Control": "no-store", Vary: "Origin" }
    );
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
        headers: createResponseHeaders(corsHeaders, "application/json"),
      }
    );
  }

  if (!url.pathname.startsWith("/api/trpc/") && url.pathname !== "/api/trpc") {
    return res.json(
      { error: "Not found" },
      404,
      { "Cache-Control": "no-store" }
    );
  }

  try {
    const requestHeaders = new Headers(req.headers);
    const requestBody =
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : (req.bodyText ??
          (req.bodyJson === undefined
            ? undefined
            : JSON.stringify(req.bodyJson)));
    const webRequest = new Request(req.url, {
      method: req.method,
      headers: requestHeaders,
      ...(requestBody === undefined ? {} : { body: requestBody }),
    });

    const expressHeaders = new Headers(corsHeaders);
    const expressRequest = createExpressRequest(req);
    const expressResponse = createExpressResponse(expressHeaders);
    const context = await createContext({
      req: expressRequest,
      res: expressResponse,
    } as Parameters<typeof createContext>[0]);

    const response = await fetchRequestHandler({
      endpoint: "/api/trpc",
      req: webRequest,
      router: ownerApiRouter,
      createContext: () => context,
    });

    const responseHeaders = new Headers(response.headers);
    for (const [name, value] of expressHeaders.entries()) {
      if (name.toLowerCase() === "set-cookie") {
        responseHeaders.append(name, value);
      } else if (!responseHeaders.has(name)) {
        responseHeaders.set(name, value);
      }
    }
    responseHeaders.set("Cache-Control", "no-store");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
    error("Wathaeqi owner API request failed");
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
