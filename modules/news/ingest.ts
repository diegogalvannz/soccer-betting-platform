/**
 * News ingestion — placeholder module.
 * Uses free RSS feeds from BBC Sport and Goal.com.
 * Returns a news sentiment score (0-1) for a given team name.
 */

type NewsItem = {
  title: string;
  description: string;
  publishedAt: string;
  source: string;
};

const RSS_FEEDS = [
  "https://www.goal.com/en/feeds/news?fmt=rss",
  "https://feeds.bbci.co.uk/sport/football/rss.xml",
];

export async function fetchRecentNews(teamName: string): Promise<NewsItem[]> {
  const results: NewsItem[] = [];

  for (const feedUrl of RSS_FEEDS) {
    try {
      const res = await fetch(feedUrl, {
        headers: { "User-Agent": "SoccerBettingBot/1.0" },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) continue;

      const xml = await res.text();
      const items = parseRssItems(xml, teamName);
      results.push(...items);
    } catch {
      // Feed unavailable — skip silently
    }
  }

  return results.slice(0, 10);
}

function parseRssItems(xml: string, teamName: string): NewsItem[] {
  const items: NewsItem[] = [];
  const teamLower = teamName.toLowerCase();

  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title");
    const description = extractTag(block, "description");
    const pubDate = extractTag(block, "pubDate");

    // Only include articles mentioning the team
    if (
      title.toLowerCase().includes(teamLower) ||
      description.toLowerCase().includes(teamLower)
    ) {
      items.push({
        title,
        description: description.replace(/<[^>]+>/g, "").slice(0, 200),
        publishedAt: pubDate,
        source: "rss",
      });
    }
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match?.[1] ?? match?.[2] ?? "";
}

/**
 * Returns a news impact score 0-1.
 * 0.5 = neutral (no news), <0.5 = bad news, >0.5 = good news.
 * Very simple keyword analysis — upgrade to LLM later.
 */
export function scoreNewsImpact(articles: NewsItem[]): number {
  if (!articles.length) return 0.5;

  const positiveWords = ["win", "victory", "strong", "fit", "return", "form", "goal"];
  const negativeWords = ["injury", "injured", "suspended", "ban", "doubt", "miss", "crisis", "loss"];

  let score = 0;
  for (const article of articles) {
    const text = (article.title + " " + article.description).toLowerCase();
    for (const w of positiveWords) if (text.includes(w)) score += 0.1;
    for (const w of negativeWords) if (text.includes(w)) score -= 0.1;
  }

  return Math.max(0, Math.min(1, 0.5 + score));
}
