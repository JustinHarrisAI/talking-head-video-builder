interface NotionPage {
  id: string;
  properties: Record<string, NotionProperty>;
}

interface NotionProperty {
  type: string;
  title?: { plain_text: string }[];
  rich_text?: { plain_text: string }[];
  select?: { name: string } | null;
  date?: { start: string } | null;
  status?: { name: string } | null;
}

interface ScriptFromNotion {
  notionPageId: string;
  title: string;
  body: string;
  platform: string | null;
  scheduledDate: Date | null;
  status: string;
}

function getConfig() {
  const apiKey = process.env.NOTION_API_KEY;
  const dbId = process.env.NOTION_CONTENT_DB;
  if (!apiKey || !dbId) throw new Error("Notion credentials not configured");
  return { apiKey, dbId };
}

export async function fetchTodaysScripts(): Promise<ScriptFromNotion[]> {
  const { apiKey, dbId } = getConfig();

  const today = new Date().toISOString().split("T")[0];

  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter: {
        or: [
          {
            property: "Scheduled Date",
            date: { equals: today },
          },
          {
            property: "Status",
            status: { equals: "Ready to Record" },
          },
        ],
      },
      sorts: [{ property: "Scheduled Date", direction: "ascending" }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion query failed: ${res.status} - ${err}`);
  }

  const data = await res.json();

  return data.results.map((page: NotionPage) => ({
    notionPageId: page.id,
    title: extractText(page.properties["Title"] || page.properties["Name"]),
    body: extractText(page.properties["Script"] || page.properties["Body"]),
    platform: page.properties["Platform"]?.select?.name?.toLowerCase() || null,
    scheduledDate: page.properties["Scheduled Date"]?.date?.start
      ? new Date(page.properties["Scheduled Date"].date.start)
      : null,
    status: page.properties["Status"]?.status?.name || "pending",
  }));
}

export async function updateNotionStatus(pageId: string, status: string): Promise<void> {
  const { apiKey } = getConfig();

  await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        Status: { status: { name: status } },
      },
    }),
  });
}

function extractText(prop: NotionProperty | undefined): string {
  if (!prop) return "";
  if (prop.title) return prop.title.map((t) => t.plain_text).join("");
  if (prop.rich_text) return prop.rich_text.map((t) => t.plain_text).join("");
  return "";
}
