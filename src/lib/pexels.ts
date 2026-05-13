interface PexelsVideo {
  id: number;
  url: string;
  duration: number;
  video_files: { link: string; quality: string; width: number; height: number }[];
}

interface PexelsSearchResult {
  videos: PexelsVideo[];
  total_results: number;
}

export async function searchBrollClips(
  keywords: string[],
  maxResults = 3
): Promise<{ url: string; pexelsId: string; duration: number; keyword: string }[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return [];

  const results: { url: string; pexelsId: string; duration: number; keyword: string }[] = [];

  for (const keyword of keywords) {
    if (results.length >= maxResults) break;

    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&per_page=2&size=small&orientation=landscape`,
      { headers: { Authorization: apiKey } }
    );

    if (!res.ok) continue;

    const data: PexelsSearchResult = await res.json();

    for (const video of data.videos) {
      if (results.length >= maxResults) break;
      // Prefer HD quality
      const file =
        video.video_files.find((f) => f.quality === "hd" && f.width >= 1280) ||
        video.video_files[0];

      if (file) {
        results.push({
          url: file.link,
          pexelsId: String(video.id),
          duration: video.duration,
          keyword,
        });
      }
    }
  }

  return results;
}
