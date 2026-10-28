import { apiRequest } from "@/lib/api";

/** Uploads screenshots to the private `work-screenshots` bucket and returns their paths. */
export async function uploadScreenshots(profileId: string, files: File[]) {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  const result = await apiRequest<{ paths: string[] }>("/api/uploads", { method: "POST", body: form });
  return result.paths;
}

/** Resolves storage paths (or absolute URLs) into viewable URLs. */
export async function resolveScreenshotUrls(paths: string[]) {
  if (!paths.length) return [] as string[];
  const direct = paths.filter((path) => /^https?:\/\//.test(path));
  const stored = paths.filter((path) => !/^https?:\/\//.test(path));
  if (!stored.length) return direct;
  const result = await apiRequest<{ urls: string[] }>("/api/uploads/signed", { method: "POST", body: JSON.stringify({ paths: stored }) });
  return [...direct, ...result.urls];
}
