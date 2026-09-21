/**
 * What the file storage will actually accept.
 *
 * Uploads go straight from the browser to Supabase Storage, whose free plan refuses any
 * file over 50 MB with a 413. The platform used to advertise 250 MB, so a large video
 * uploaded to 100% and only then failed. Both the page and the API check this figure, so
 * an oversized file is refused instantly and with a reason.
 *
 * Raising it means raising it at the storage first — the app cannot lift the storage cap.
 */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = '50 MB';
