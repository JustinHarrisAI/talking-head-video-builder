const BASE_URL = "https://app.metricool.com/api";

function getCredentials() {
  const userId = process.env.METRICOOL_USER_ID;
  const blogId = process.env.METRICOOL_BLOG_ID;
  if (!userId || !blogId) throw new Error("Metricool credentials not configured");
  return { userId, blogId };
}

export async function normalizeMediaUrl(mediaUrl: string): Promise<string> {
  const { userId, blogId } = getCredentials();
  const res = await fetch(
    `${BASE_URL}/actions/normalize/image/url?url=${encodeURIComponent(mediaUrl)}&userId=${userId}&blogId=${blogId}`
  );
  if (!res.ok) throw new Error(`Metricool normalize failed: ${res.status}`);
  const data = await res.json();
  return data.url || mediaUrl;
}

export async function schedulePost(options: {
  text: string;
  mediaUrl: string;
  platforms: string[]; // e.g. ["instagram", "tiktok", "linkedin"]
  scheduledDate?: Date;
}): Promise<{ success: boolean; postId?: string; error?: string }> {
  const { userId, blogId } = getCredentials();

  // First normalize the media URL so Metricool can access it
  const normalizedUrl = await normalizeMediaUrl(options.mediaUrl);

  const body = {
    userId,
    blogId,
    text: options.text,
    media: [{ url: normalizedUrl, type: "video" }],
    platforms: options.platforms,
    date: options.scheduledDate
      ? options.scheduledDate.toISOString()
      : new Date().toISOString(),
    autoPublish: !options.scheduledDate, // publish immediately if no date set
  };

  const res = await fetch(`${BASE_URL}/v2/scheduler/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = await res.text();
    return { success: false, error: `Metricool post failed: ${res.status} - ${error}` };
  }

  const data = await res.json();
  return { success: true, postId: data.id || data.postId };
}
