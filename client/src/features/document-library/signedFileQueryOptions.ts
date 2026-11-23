// A signed URL is needed to load the file once; frequent renewal reloads large
// previews. Printing explicitly obtains a fresh URL when it starts.
export const signedFileQueryOptions = {
  staleTime: 120_000,
  refetchInterval: false as const,
};
