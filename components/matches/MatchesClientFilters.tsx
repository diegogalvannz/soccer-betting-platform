"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { getJerseyColor } from "@/lib/jersey-colors";
import { formatMatchDate, decimalToAmerican } from "@/lib/utils";
import Link from "next/link";
import type { League } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type SerializedMatch = {
  id: string;
  homeTeam: { name: string; shortName: string | null };
  awayTeam: { name: string; shortName: string | null };
  league: string;
  leagueCode: string;
  matchDate: string;
  homeOdds: number | null;
  drawOdds: number | null;
  awayOdds: number | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  picks: Array<{ id: string; status: string; selection: string; confidenceScore: number }>;
};

// ─── Tier definitions ─────────────────────────────────────────────────────────
//
// Maps leagueCode (both old Football-Data.org string codes and new API-Football
// numeric IDs) to display tiers.  Everything else appears only in "Todas".

/** TIER 1 — Top club competitions + the Big-5 + major Americas leagues */
const TIER1_CODES = new Set([
  "2",  "CL",    // UEFA Champions League
  "3",  "EL",    // UEFA Europa League
  "848","UECL",  // UEFA Conference League
  "15", "CWC",   // FIFA Club World Cup
  "39", "PL",    // Premier League
  "140","PD",    // La Liga / Primera Division
  "135","SA",    // Serie A
  "78", "BL1",   // Bundesliga
  "61", "FL1",   // Ligue 1
  "262",         // Liga MX
  "71", "BSA",   // Brasileirão
  "128",         // Liga Profesional Argentina
  "13", "CLI",   // Copa Libertadores
  "11",          // Copa Sudamericana
]);

/** TIER 2 — National domestic cups */
const TIER2_CODES = new Set([
  "45",   // FA Cup
  "48",   // EFL Cup / Carabao Cup
  "143",  // Copa del Rey
  "556",  // Supercopa de España
  "137",  // Coppa Italia
  "547",  // Supercoppa Italiana
  "81",   // DFB-Pokal
  "529",  // DFL-Supercup
  "66",   // Coupe de France
  "526",  // Trophée des Champions
]);

/** TIER 3 — National team competitions */
const TIER3_CODES = new Set([
  "1",  "WC",  // FIFA World Cup
  "4",  "EC",  // UEFA Euro
  "9",         // Copa América
  "5",         // UEFA Nations League
  "6",         // Concacaf Nations League
  "32",        // UEFA World Cup Qualifiers
  "29",        // CONMEBOL World Cup Qualifiers
  "22",        // Gold Cup
  "480",       // Olympic Football
  "276",       // Women's World Cup
]);

// Name-based fallbacks for old FD records where leagueCode is a string that
// doesn't appear in the above sets (e.g. "CLI" for Copa Libertadores).
const TIER1_NAMES = [
  "champions league", "europa league", "conference league",
  "premier league", "la liga", "laliga", "primera division",
  "serie a", "bundesliga", "ligue 1",
  "liga mx", "brasileirão", "brasileirao",
  "liga profesional argentina",
  "copa libertadores", "copa sudamericana",
  "club world cup",
];
const TIER2_NAMES = [
  "fa cup", "efl cup", "carabao", "league cup",
  "copa del rey", "supercopa", "coppa italia", "supercoppa",
  "dfb-pokal", "dfl-supercup", "coupe de france", "trophée", "trophee",
];
const TIER3_NAMES = [
  "world cup", "eurocopa", "copa america", "nations league",
  "qualif", "gold cup", "olympic",
];

type MatchTier = "1" | "2" | "3" | "other";

function getMatchTier(leagueCode: string, leagueName: string): MatchTier {
  if (TIER1_CODES.has(leagueCode)) return "1";
  if (TIER2_CODES.has(leagueCode)) return "2";
  if (TIER3_CODES.has(leagueCode)) return "3";
  const name = leagueName.toLowerCase();
  if (TIER1_NAMES.some(f => name.includes(f))) return "1";
  if (TIER2_NAMES.some(f => name.includes(f))) return "2";
  if (TIER3_NAMES.some(f => name.includes(f))) return "3";
  return "other";
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function JerseyIcon({ color, size = 34 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 40" fill="none" aria-hidden>
      <path d="M13 2 Q18 7 23 2" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M13 2 L4 10 L8 14 L13 10" fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round" />
      <path d="M23 2 L32 10 L28 14 L23 10" fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round" />
      <path d="M13 2 Q12 8 11 10 L10 38 L26 38 L25 10 Q24 8 23 2 Q18 7 13 2Z" fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round" />
      <path d="M17 12 L17 36" stroke="rgba(0,0,0,0.12)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function OddsChip({ val }: { val: number }) {
  const american = decimalToAmerican(val);
  return (
    <span className="text-[11px] font-mono px-1.5 py-0.5 bg-muted/60 rounded border border-border/60">
      {american > 0 ? "+" : ""}{american}
    </span>
  );
}

function PickBadge({ pick }: { pick: { status: string; selection: string } }) {
  const cls =
    pick.status === "WON"  ? "bg-green-500/15 text-green-400 border-green-500/30" :
    pick.status === "LOST" ? "bg-red-500/15 text-red-400 border-red-500/30" :
    pick.status === "VOID" ? "bg-gray-500/15 text-gray-400 border-gray-500/30" :
                             "bg-primary/15 text-primary border-primary/30";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${cls}`}>
      {pick.status === "PENDING"
        ? `Pick: ${pick.selection.length > 14 ? pick.selection.slice(0, 14) + "…" : pick.selection}`
        : pick.status}
    </span>
  );
}

function MatchCard({ match, finished }: { match: SerializedMatch; finished?: boolean }) {
  const homeColor = getJerseyColor(match.homeTeam.name);
  const awayColor = getJerseyColor(match.awayTeam.name);
  const homeName  = match.homeTeam.shortName ?? match.homeTeam.name;
  const awayName  = match.awayTeam.shortName ?? match.awayTeam.name;

  return (
    <Link href={`/matches/${match.id}`}>
      <div className={`group relative bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 cursor-pointer ${finished ? "opacity-80" : ""}`}>
        {/* League + date header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-muted/20">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide truncate">
            {match.league}
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
            {formatMatchDate(new Date(match.matchDate))}
          </span>
        </div>

        {/* Teams + score row */}
        <div className="grid grid-cols-3 items-center gap-2 px-4 py-4">
          <div className="flex flex-col items-center gap-1.5">
            <JerseyIcon color={homeColor} />
            <p className="text-xs font-semibold text-center leading-tight line-clamp-2">{homeName}</p>
          </div>

          <div className="flex flex-col items-center gap-1">
            {finished ? (
              <span className="text-2xl font-black tabular-nums">
                {match.homeScore ?? 0} — {match.awayScore ?? 0}
              </span>
            ) : (
              <>
                <span className="text-lg font-bold text-muted-foreground">vs</span>
                {match.homeOdds ? (
                  <div className="flex gap-1 mt-1">
                    <OddsChip val={match.homeOdds} />
                    {match.drawOdds && <OddsChip val={match.drawOdds} />}
                    {match.awayOdds && <OddsChip val={match.awayOdds} />}
                  </div>
                ) : (
                  <span className="text-[9px] text-muted-foreground/50 mt-1 text-center leading-tight">
                    Cuotas próximamente
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <JerseyIcon color={awayColor} />
            <p className="text-xs font-semibold text-center leading-tight line-clamp-2">{awayName}</p>
          </div>
        </div>

        {match.picks.length > 0 && (
          <div className="flex flex-wrap gap-1 px-4 pb-3">
            {match.picks.map((p) => <PickBadge key={p.id} pick={p} />)}
          </div>
        )}

        <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </Link>
  );
}

// ─── League catalogue card ────────────────────────────────────────────────────

function LeagueCatalogCard({ league }: { league: League }) {
  const isSoon = league.source === "coming-soon";
  return (
    <div className={`px-3 py-2 rounded-lg border text-sm flex items-center justify-between gap-2 ${isSoon ? "border-border/40 opacity-60" : "border-primary/30 bg-primary/5"}`}>
      <span className="font-medium truncate">{league.name}</span>
      {isSoon
        ? <span className="text-[10px] text-muted-foreground shrink-0">Próximamente</span>
        : <span className="text-[10px] text-green-400 shrink-0">Activo</span>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  upcoming: SerializedMatch[];
  recent: SerializedMatch[];
  regions: string[];
  leaguesByRegion: Record<string, League[]>;
  allLeagues: League[];
};

type MainTab   = "partidos" | "ligas";
type TierTab   = "principales" | "copas" | "selecciones" | "todas";

const TIER_TABS: { id: TierTab; label: string; tier: MatchTier | null }[] = [
  { id: "principales", label: "Principales",  tier: "1" },
  { id: "copas",       label: "Copas",         tier: "2" },
  { id: "selecciones", label: "Selecciones",   tier: "3" },
  { id: "todas",       label: "Todas",         tier: null },
];

export function MatchesClientFilters({ upcoming, recent, regions, leaguesByRegion, allLeagues }: Props) {
  const [mainTab,     setMainTab]     = useState<MainTab>("partidos");
  const [tierTab,     setTierTab]     = useState<TierTab>("principales");
  const [leagueFilter, setLeagueFilter] = useState<string>("todos");
  const [selectedRegion, setSelectedRegion] = useState<string>("Todas");

  // Pre-compute tier for every match (memoized)
  const withTier = useMemo(() => ({
    upcoming: upcoming.map(m => ({ ...m, tier: getMatchTier(m.leagueCode, m.league) })),
    recent:   recent.map(m   => ({ ...m, tier: getMatchTier(m.leagueCode, m.league) })),
  }), [upcoming, recent]);

  const activeTier = TIER_TABS.find(t => t.id === tierTab)!.tier;

  // Matches filtered by the active tier tab
  const tierUpcoming = useMemo(() =>
    activeTier ? withTier.upcoming.filter(m => m.tier === activeTier) : withTier.upcoming,
  [withTier.upcoming, activeTier]);

  const tierRecent = useMemo(() =>
    activeTier ? withTier.recent.filter(m => m.tier === activeTier) : withTier.recent,
  [withTier.recent, activeTier]);

  // League pills — only leagues that exist in the current tier
  const tierLeagues = useMemo(() => {
    const set = new Set<string>();
    [...tierUpcoming, ...tierRecent].forEach(m => set.add(m.league));
    return Array.from(set).sort();
  }, [tierUpcoming, tierRecent]);

  // Final match lists after both tier AND league filter
  const filteredUpcoming = useMemo(() =>
    leagueFilter === "todos" ? tierUpcoming : tierUpcoming.filter(m => m.league === leagueFilter),
  [tierUpcoming, leagueFilter]);

  const filteredRecent = useMemo(() =>
    leagueFilter === "todos" ? tierRecent : tierRecent.filter(m => m.league === leagueFilter),
  [tierRecent, leagueFilter]);

  // Reset league chip when switching tier
  function handleTierChange(t: TierTab) {
    setTierTab(t);
    setLeagueFilter("todos");
  }

  const filteredRegions = useMemo(() =>
    selectedRegion === "Todas" ? regions : regions.filter(r => r === selectedRegion),
  [regions, selectedRegion]);

  return (
    <div className="space-y-6">
      {/* ── Main tabs: Partidos | Ligas ── */}
      <div className="flex gap-1 border-b border-border">
        {(["partidos", "ligas"] as MainTab[]).map(t => (
          <button
            key={t}
            onClick={() => setMainTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              mainTab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "partidos" ? "Partidos" : "Ligas y Competiciones"}
          </button>
        ))}
      </div>

      {/* ══ PARTIDOS TAB ══ */}
      {mainTab === "partidos" && (
        <div className="space-y-5">
          {/* Tier filter tabs */}
          <div className="flex flex-wrap gap-2">
            {TIER_TABS.map(({ id, label }) => {
              const tierObj = TIER_TABS.find(t => t.id === id)!;
              const count = (tierObj.tier
                ? [...withTier.upcoming, ...withTier.recent].filter(m => m.tier === tierObj.tier)
                : [...withTier.upcoming, ...withTier.recent]
              ).length;
              return (
                <button
                  key={id}
                  onClick={() => handleTierChange(id)}
                  className={`text-xs px-3.5 py-1.5 rounded-full border font-semibold transition-colors ${
                    tierTab === id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                  }`}
                >
                  {label}
                  <span className={`ml-1.5 text-[10px] font-normal ${tierTab === id ? "opacity-80" : "opacity-50"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* League filter chips — only for leagues in the current tier */}
          {tierLeagues.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setLeagueFilter("todos")}
                className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                  leagueFilter === "todos"
                    ? "bg-primary/20 text-primary border-primary/50"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                Todas
              </button>
              {tierLeagues.map(league => {
                const count = [...tierUpcoming, ...tierRecent].filter(m => m.league === league).length;
                return (
                  <button
                    key={league}
                    onClick={() => setLeagueFilter(league)}
                    className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                      leagueFilter === league
                        ? "bg-primary/20 text-primary border-primary/50"
                        : "border-border/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {league}
                    <span className="ml-1 opacity-50">({count})</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Upcoming matches */}
          <section>
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              Próximos
              <Badge variant="outline" className="text-xs">{filteredUpcoming.length}</Badge>
            </h2>
            {filteredUpcoming.length === 0 ? (
              <div className="rounded-xl border border-border bg-card py-12 text-center text-muted-foreground text-sm">
                {tierTab === "principales"
                  ? "Sin próximos partidos en ligas principales — se actualizan diariamente a las 00:40 UTC"
                  : "Sin partidos en esta categoría por el momento"}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredUpcoming.map(m => <MatchCard key={m.id} match={m} />)}
              </div>
            )}
          </section>

          {/* Recent results */}
          {filteredRecent.length > 0 && (
            <section>
              <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
                Resultados Recientes
                <Badge variant="outline" className="text-xs">{filteredRecent.length}</Badge>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredRecent.map(m => <MatchCard key={m.id} match={m} finished />)}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ══ LIGAS TAB ══ */}
      {mainTab === "ligas" && (
        <div className="space-y-6">
          {/* Region filter */}
          <div className="flex flex-wrap gap-2">
            {["Todas", ...regions].map(r => (
              <button
                key={r}
                onClick={() => setSelectedRegion(r)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  selectedRegion === r
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* League grid per region */}
          {filteredRegions.map(region => (
            <section key={region}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                {region}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {(leaguesByRegion[region] ?? []).map(league => (
                  <LeagueCatalogCard key={league.code} league={league} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
