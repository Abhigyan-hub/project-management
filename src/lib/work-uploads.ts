import { supabase } from "@/lib/supabase";

const BUCKET = "work-screenshots";

/** Uploads screenshots to the private `work-screenshots` bucket and returns their paths. */
export async function uploadScreenshots(profileId: string, files: File[]) {
  const paths: string[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop() ?? "png";
    const path = `${profileId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || "image/png",
      upsert: false,
    });
    if (error) throw new Error(error.message);
    paths.push(path);
  }
  return paths;
}

/** Resolves storage paths (or absolute URLs) into viewable URLs. */
export async function resolveScreenshotUrls(paths: string[]) {
  if (!paths.length) return [] as string[];
  const direct = paths.filter((p) => /^https?:\/\//.test(p));
  const stored = paths.filter((p) => !/^https?:\/\//.test(p));
  if (!stored.length) return direct;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(stored, 60 * 60);
  if (error) throw new Error(error.message);
  const signed = (data ?? []).map((row) => row.signedUrl).filter((url): url is string => Boolean(url));
  return [...direct, ...signed];
}
