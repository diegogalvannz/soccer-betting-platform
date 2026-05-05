export type League = {
  code: string;
  name: string;
  country: string;
  region: string;           // e.g. "Europa", "México", "América del Sur"
  footballDataId?: number;  // FD.org competition ID (free tier)
  source: "football-data" | "coming-soon"; // which API provides data
};

export type MatchStatus = "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | "CANCELLED";
export type PickStatus = "PENDING" | "WON" | "LOST" | "VOID" | "SKIPPED";
export type BetResult = "PENDING" | "WON" | "LOST" | "VOID";

export type MatchWithTeams = {
  id: string;
  externalId: string;
  homeTeam: { id: string; name: string; shortName: string | null; logo: string | null };
  awayTeam: { id: string; name: string; shortName: string | null; logo: string | null };
  league: string;
  leagueCode: string;
  matchDate: string;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  homeOdds: number | null;
  drawOdds: number | null;
  awayOdds: number | null;
  stats: Record<string, unknown> | null;
};

export type PickWithMatch = {
  id: string;
  matchId: string;
  match: MatchWithTeams;
  market: string;
  selection: string;
  odds: number;
  americanOdds: number;
  confidenceScore: number;
  reasoning: string;
  sentimentSummary: string | null;
  status: PickStatus;
  createdAt: string;
};

export type BetWithPick = {
  id: string;
  pickId: string;
  pick: PickWithMatch;
  stake: number;
  odds: number;
  result: BetResult;
  profit: number | null;
  notes: string | null;
  createdAt: string;
  settledAt: string | null;
};

export type MonthlyBreakdown = {
  month: string;
  bets: number;
  won: number;
  lost: number;
  profit: number;
  roi: number;
};

export type AnalyticsSummary = {
  totalBets: number;
  wonBets: number;
  lostBets: number;
  pendingBets: number;
  totalStaked: number;
  totalProfit: number;
  roi: number;
  winRate: number;
  bankrollStart: number;
  bankrollCurrent: number;
  monthlyBreakdown: MonthlyBreakdown[];
};

export type ScoreResult = {
  pick: "HOME" | "DRAW" | "AWAY" | "OVER" | "UNDER" | "BTTS_YES" | "BTTS_NO" | "DC_1X" | "DC_X2" | "DC_12" | "CARDS_OVER" | "CARDS_UNDER" | "SKIP";
  market: string;
  selection: string;
  decimalOdds: number;
  americanOdds: number;
  confidenceScore: number;
  reasoning: string;
  sentimentSummary: string | null;
  componentScores: {
    form: number;
    headToHead: number;
    homeAway: number;
    oddsValue: number;
    sentiment: number;
    news: number;
  };
};

export type FootballDataMatch = {
  id: number;
  utcDate: string;
  status: string;
  homeTeam: { id: number; name: string; shortName: string; crest: string };
  awayTeam: { id: number; name: string; shortName: string; crest: string };
  score: { fullTime: { home: number | null; away: number | null } };
  competition: { id: number; name: string; code: string };
};

export type RapidApiOdds = {
  homeWin: number | null;
  draw: number | null;
  awayWin: number | null;
  source: string;
  fetchedAt: string;
};
