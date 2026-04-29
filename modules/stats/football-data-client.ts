import { FootballDataMatch } from "@/types";
import { sleep } from "@/lib/utils";
import { FOOTBALL_DATA_DELAY_MS } from "@/config/leagues";

const BASE_URL = "https://api.football-data.org/v4";
const API_KEY = process.env.FOOTBALL_DATA_API_KEY!;

async function fetchFD<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "X-Auth-Token": API_KEY },
    next: { revalidate: 0 },
  });

  if (res.status === 429) {
    // Rate limited — wait 60s and retry once
    console.warn("[FootballData] Rate limited, waiting 60s...");
    await sleep(60000);
    return fetchFD<T>(path);
  }

  if (!res.ok) {
    throw new Error(`[FootballData] ${res.status} ${res.statusText} — ${path}`);
  }

  return res.json() as Promise<T>;
}

export async function getUpcomingMatches(
  competitionCode: string,
  daysAhead = 3
): Promise<FootballDataMatch[]> {
  const dateFrom = new Date().toISOString().split("T")[0];
  const dateTo = new Date(Date.now() + daysAhead * 86400000)
    .toISOString()
    .split("T")[0];

  const data = await fetchFD<{ matches: FootballDataMatch[] }>(
    `/competitions/${competitionCode}/matches?status=SCHEDULED&dateFrom=${dateFrom}&dateTo=${dateTo}`
  );

  await sleep(FOOTBALL_DATA_DELAY_MS);
  return data.matches ?? [];
}

export async function getRecentMatches(
  competitionCode: string,
  daysBack = 10
): Promise<FootballDataMatch[]> {
  const dateTo = new Date().toISOString().split("T")[0];
  const dateFrom = new Date(Date.now() - daysBack * 86400000)
    .toISOString()
    .split("T")[0];

  const data = await fetchFD<{ matches: FootballDataMatch[] }>(
    `/competitions/${competitionCode}/matches?status=FINISHED&dateFrom=${dateFrom}&dateTo=${dateTo}`
  );

  await sleep(FOOTBALL_DATA_DELAY_MS);
  return data.matches ?? [];
}

export async function getTeamRecentMatches(
  teamId: number,
  limit = 5
): Promise<FootballDataMatch[]> {
  const data = await fetchFD<{ matches: FootballDataMatch[] }>(
    `/teams/${teamId}/matches?status=FINISHED&limit=${limit}`
  );

  await sleep(FOOTBALL_DATA_DELAY_MS);
  return data.matches ?? [];
}

export async function getHeadToHead(matchId: number): Promise<FootballDataMatch[]> {
  const data = await fetchFD<{ matches: FootballDataMatch[] }>(
    `/matches/${matchId}/head2head?limit=5`
  );

  await sleep(FOOTBALL_DATA_DELAY_MS);
  return data.matches ?? [];
}
