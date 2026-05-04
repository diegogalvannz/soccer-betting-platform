/**
 * News API — fetches recent football news for a given match.
 * Uses Google News RSS (no API key required, free).
 * GET /api/news?home=Chelsea&away=Arsenal&competition=Premier+League
 */
import { NextResponse } from "next/server";

export type NewsItem = {
  title: string;
  source: string;
  publishedAt: string;   // ISO-like string from RSS
  url: string;
};

function extractText(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return (m?.[1] ?? m?.[2] ?? "").trim();
}

function parseRSSItems(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractText(block, "title")
      .replace(/<[^>]+>/g, "")       // strip any HTML tags
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .trim();

    const link = extractText(block, "link") || (block.match(/<link>([^<]+)<\/link>/)?.[1] ?? "");
    const pubDate = extractText(block, "pubDate");
    const source = extractText(block, "source") || (block.match(/<source[^>]+>([^<]+)<\/source>/)?.[1] ?? "");

    if (title && link) {
      items.push({ title, source, publishedAt: pubDate, url: link });
    }
  }

  return items;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const home = searchParams.get("home") ?? "";
  const away = searchParams.get("away") ?? "";
  const competition = searchParams.get("competition") ?? "";

  if (!home || !away) {
    return NextResponse.json({ items: [] });
  }

  // Build query — shorter team names work better
  const homeName = home.split(" ").slice(0, 2).join(" ");
  const awayName = away.split(" ").slice(0, 2).join(" ");
  const query = encodeURIComponent(`${homeName} ${awayName} ${competition} fútbol`);

  const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=es-419&gl=MX&ceid=MX:es`;

  try {
    const res = await fetch(rssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SoccerBot/1.0)" },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error(`RSS ${res.status}`);

    const xml = await res.text();
    const items = parseRSSItems(xml).slice(0, 5);

    return NextResponse.json({ items }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    console.warn("[News] RSS fetch failed:", err);
    return NextResponse.json({ items: [] });
  }
}
