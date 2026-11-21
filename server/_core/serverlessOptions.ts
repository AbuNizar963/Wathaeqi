// Both function adapters decode the serverless-http envelope back to bytes.
// Encode all response bodies so binary files are never converted through UTF-8.
export const serverlessOptions = { binary: true } as const;
