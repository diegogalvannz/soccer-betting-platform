/**
 * RapidAPI — Free Live Football Data
 * Hard limit: 100 requests/month. NEVER call from frontend.
 * Every response is cached in Match.rawOddsCache for 6 hours.
 */
import { RapidApiOdds } from "@/types";
import { isCacheFresh } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { ODDS_CACHE_MAX_AGE_HOURS } from "@/config/leagues";

const BASE_URL = "https://free-api-live-football-data.p.rapidapi.com";
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY!;
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST!;

async function fetchRapid<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "x-rapidapi-key": RAPIDAPI_KEY,
      "x-rapidapi-host": RAPIDAPI_HOST,
    },
  });

  if (!res.ok) {
    throw new Error(`[RapidAPI] ${res.status} ${res.statusText} — ${path}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Get odds for a match. Checks DB cache first — only calls API if stale.
 * Returns null if no odds available.
 */
export async function getMatchOdds(
  matchDbId: string,
  externalMatchId: string
): Promise<RapidApiOdds | null> {
  // 1. Check if cached odds are still fresh
  const existing = await prisma.match.findUnique({
    where: { id: matchDbId },
    select: { rawOddsCache: true, oddsUpdatedAt: true },
  });

  if (existing?.rawOddsCache && isCacheFresh(existing.oddsUpdatedAt, ODDS_CACHE_MAX_AGE_HOURS)) {
    console.log(`[RapidAPI] Using cached odds for match ${matchDbId}`);
    return existing.rawOddsCache as unknown as RapidApiOdds;
  }

  // 2. Fetch from API (costs 1 of your 100 monthly requests)
  try {
    console.log(`[RapidAPI] Fetching fresh odds for match ${externalMatchId}`);
    const data = await fetchRapid<Record<string, unknown>>(
      `/football-get-odds?MatchId=${externalMatchId}`
    );

    const odds = parseOddsResponse(data);

    // 3. Cache immediately in DB
    await prisma.match.update({
      where: { id: matchDbId },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rawOddsCache: odds as any,
        oddsUpdatedAt: new Date(),
        homeOdds: odds.homeWin ?? undefined,
        drawOdds: odds.draw ?? undefined,
        awayOdds: odds.awayWin ?? undefined,
      },
    });

    return odds;
  } catch (err) {
    console.error(`[RapidAPI] Failed to fetch odds:`, err);
    return null;
  }
}

function parseOddsResponse(data: Record<string, unknown>): RapidApiOdds {
  // RapidAPI returns odds in various nested structures depending on the endpoint
  // This parser handles the most common format
  try {
    const response = data as {
      response?: {
        odds?: Array<{
          bookmakers?: Array<{
            bets?: Array<{
              name: string;
              values?: Array<{ value: string; odd: string }>;
            }>;
          }>;
        }>;
      };
    };

    const bookmakers =
      response?.response?.odds?.[0]?.bookmakers ?? [];

    for (const bm of bookmakers) {
      const matchWinner = bm.bets?.find((b) => b.name === "Match Winner");
      if (matchWinner?.values) {
        const home = matchWinner.values.find((v) => v.value === "Home");
        const draw = matchWinner.values.find((v) => v.value === "Draw");
        const away = matchWinner.values.find((v) => v.value === "Away");

        if (home && away) {
          return {
            homeWin: home ? parseFloat(home.odd) : null,
            draw: draw ? parseFloat(draw.odd) : null,
            awayWin: away ? parseFloat(away.odd) : null,
            source: "rapidapi",
            fetchedAt: new Date().toISOString(),
          };
        }
      }
    }
  } catch {}

  // Fallback: return the raw data as-is and mark as unknown
  return {
    homeWin: null,
    draw: null,
    awayWin: null,
    source: "rapidapi-raw",
    fetchedAt: new Date().toISOString(),
  };
}
