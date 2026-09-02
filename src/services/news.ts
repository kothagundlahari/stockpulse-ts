import axios from "axios";

export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

/**
 * Parses RSS XML into news items.
 * Simple regex parser - avoids heavy XML dependencies.
 */
function parseRssItems(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1];
    const title = extractTag(content, "title");
    const link = extractTag(content, "link");
    const pubDate = extractTag(content, "pubDate");

    if (title && link) {
      items.push({ title, link, pubDate: pubDate || "", source: "" });
    }
  }

  return items;
}

function extractTag(content: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</${tag}>`);
  const match = regex.exec(content);
  return match ? match[1].trim() : null;
}

const RSS_FEEDS = [
  { url: "https://news.google.com/rss/search?q=%s+stock+market&hl=en-IN&gl=IN", name: "Google News" },
  { url: "https://feeds.feedburner.com/moneycontrolheadlines", name: "MoneyControl" },
];

/**
 * Fetches news for a stock from multiple RSS sources.
 */
export async function fetchStockNews(
  symbol: string,
  maxItems: number = 10
): Promise<NewsItem[]> {
  const allItems: NewsItem[] = [];

  for (const feed of RSS_FEEDS) {
    try {
      const url = feed.url.replace("%s", symbol);
      const response = await axios.get(url, {
        timeout: 5000,
        headers: { "User-Agent": "StockPulse/1.0" },
      });
      const items = parseRssItems(response.data);
      items.forEach((item) => (item.source = feed.name));
      allItems.push(...items);
    } catch {
      // Skip failed feeds silently
    }
  }

  return allItems.slice(0, maxItems);
}
