/** Maximum encoded output accepted for a prepared organization logo. */
export const MAX_ORGANIZATION_LOGO_BYTES = 5 * 1024 * 1024;
/** Maximum input file size accepted by the browser-side preparation step. */
export const MAX_ORGANIZATION_LOGO_SOURCE_BYTES = 25 * 1024 * 1024;
/** Preferred largest edge of prepared raster logos. */
export const INITIAL_ORGANIZATION_LOGO_DIMENSION = 2400;
/** Minimum largest edge while iteratively reducing an oversized output. */
export const MINIMUM_ORGANIZATION_LOGO_DIMENSION = 1024;
/** Absolute source-image dimensions/pixel count inspected before decoding. */
export const MAX_ORGANIZATION_LOGO_SOURCE_DIMENSION = 40_000;
export const MAX_ORGANIZATION_LOGO_SOURCE_PIXELS = 120_000_000;
/** Server-side storage guard against oversized raster decompression. */
export const MAX_STORED_ORGANIZATION_LOGO_DIMENSION = 8192;
export const MAX_STORED_ORGANIZATION_LOGO_PIXELS = 40_000_000;
/** Bound the header prefix parsed for JPEG metadata. */
export const ORGANIZATION_LOGO_METADATA_SCAN_BYTES = 1024 * 1024;
