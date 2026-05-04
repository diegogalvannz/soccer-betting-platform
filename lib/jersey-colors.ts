/**
 * Primary jersey color map for known football clubs.
 * Used to color team jersey icons on match cards.
 * Keyed by lowercased partial team name for fuzzy matching.
 */

const JERSEY_COLORS: Array<{ match: string[]; color: string }> = [
  // England
  { match: ["arsenal"],              color: "#EF0107" },
  { match: ["chelsea"],              color: "#034694" },
  { match: ["manchester united", "man united", "man utd"], color: "#DA291C" },
  { match: ["manchester city", "man city"],                color: "#6CABDD" },
  { match: ["liverpool"],            color: "#C8102E" },
  { match: ["tottenham", "spurs"],   color: "#132257" },
  { match: ["newcastle"],            color: "#241F20" },
  { match: ["aston villa"],          color: "#95BFE5" },
  { match: ["west ham"],             color: "#7A263A" },
  { match: ["brighton"],             color: "#0057B8" },
  { match: ["brentford"],            color: "#E30613" },
  { match: ["fulham"],               color: "#000000" },
  { match: ["crystal palace"],       color: "#1B458F" },
  { match: ["everton"],              color: "#003399" },
  { match: ["wolves", "wolverhampton"], color: "#FDB913" },
  { match: ["nottingham forest", "nottm forest"], color: "#DD0000" },
  { match: ["bournemouth"],          color: "#DA291C" },
  { match: ["leicester"],            color: "#003090" },
  { match: ["leeds"],                color: "#FFCD00" },
  { match: ["burnley"],              color: "#6C1D45" },
  { match: ["sunderland"],           color: "#EB172B" },
  { match: ["ipswich"],              color: "#003087" },
  // Spain
  { match: ["real madrid"],          color: "#FFFFFF" },
  { match: ["barcelona", "barça", "barca"], color: "#004D98" },
  { match: ["atlético", "atletico", "atleti"], color: "#CB3524" },
  { match: ["sevilla"],              color: "#FBBF17" },
  { match: ["valencia"],             color: "#FF7F00" },
  { match: ["athletic"],             color: "#EE2031" },
  { match: ["real sociedad"],        color: "#0067B1" },
  { match: ["real betis"],           color: "#00954C" },
  { match: ["villarreal"],           color: "#FFD700" },
  { match: ["osasuna"],              color: "#D2001F" },
  { match: ["getafe"],               color: "#004B98" },
  { match: ["celta"],                color: "#8BB3E4" },
  { match: ["español", "espanyol"],  color: "#004B98" },
  { match: ["rayo"],                 color: "#FF0000" },
  { match: ["girona"],               color: "#CC0000" },
  { match: ["mallorca"],             color: "#BB0000" },
  { match: ["levante"],              color: "#1E40AF" },
  // Germany
  { match: ["bayern"],               color: "#DC052D" },
  { match: ["dortmund"],             color: "#FDE100" },
  { match: ["leverkusen"],           color: "#E32221" },
  { match: ["leipzig", "rb leipzig"], color: "#DD0741" },
  { match: ["frankfurt"],            color: "#E1000F" },
  { match: ["wolfsburg"],            color: "#65B32E" },
  { match: ["freiburg"],             color: "#E20A17" },
  { match: ["union berlin"],         color: "#EB1923" },
  { match: ["gladbach", "mönchengladbach", "monchengladbach"], color: "#000000" },
  { match: ["hoffenheim"],           color: "#1762A3" },
  { match: ["augsburg"],             color: "#BA3733" },
  { match: ["stuttgart"],            color: "#E32219" },
  { match: ["mainz"],                color: "#C3141E" },
  { match: ["bremen", "werder"],     color: "#1D7A3C" },
  { match: ["heidenheim"],           color: "#CC0000" },
  { match: ["köln", "koln", "cologne"], color: "#EF0107" },
  { match: ["hsv", "hamburger"],     color: "#0F9FDC" },
  { match: ["pauli", "st. pauli"],   color: "#9B1915" },
  { match: ["bochum"],               color: "#0052A5" },
  // Italy
  { match: ["juventus", "juve"],     color: "#000000" },
  { match: ["inter milan", "inter"], color: "#010E80" },
  { match: ["ac milan", "milan"],    color: "#FB090B" },
  { match: ["napoli"],               color: "#12A0C3" },
  { match: ["roma"],                 color: "#8E1F2F" },
  { match: ["lazio"],                color: "#87D8F7" },
  { match: ["atalanta"],             color: "#1E3B6E" },
  { match: ["fiorentina"],           color: "#610080" },
  { match: ["torino"],               color: "#8B1C23" },
  { match: ["udinese"],              color: "#000000" },
  { match: ["bologna"],              color: "#CC0000" },
  // France
  { match: ["psg", "paris saint-germain", "paris sg"], color: "#004170" },
  { match: ["marseille"],            color: "#009BDF" },
  { match: ["lyon"],                 color: "#0022A0" },
  { match: ["monaco"],               color: "#E8112D" },
  { match: ["lille"],                color: "#C41F1D" },
  { match: ["rennes"],               color: "#000000" },
  { match: ["nantes"],               color: "#F5C211" },
  // Portugal
  { match: ["sporting"],             color: "#006600" },
  { match: ["benfica"],              color: "#EE2522" },
  { match: ["porto"],                color: "#003087" },
  // Netherlands
  { match: ["ajax"],                 color: "#D2122E" },
  { match: ["psv"],                  color: "#CC0000" },
  { match: ["feyenoord"],            color: "#CC0000" },
  { match: ["den bosch"],            color: "#008000" },
  { match: ["almere"],               color: "#CC0000" },
  // Turkey
  { match: ["galatasaray"],          color: "#FF6300" },
  { match: ["fenerbahce"],           color: "#004B98" },
  { match: ["besiktas"],             color: "#000000" },
  // South America / UCL extras
  { match: ["club brugge"],          color: "#002F6C" },
  { match: ["celtic"],               color: "#16A34A" },
  { match: ["rangers"],              color: "#002F6C" },
  { match: ["al nassr"],             color: "#FFD700" },
  { match: ["al ahli"],              color: "#006400" },
  { match: ["mamelodi"],             color: "#008000" },
  { match: ["kaizer chiefs"],        color: "#FFD700" },
];

const DEFAULT_COLOR = "#6B7280"; // gray-500

export function getJerseyColor(teamName: string): string {
  const lower = teamName.toLowerCase();
  for (const entry of JERSEY_COLORS) {
    if (entry.match.some((m) => lower.includes(m))) {
      return entry.color;
    }
  }
  return DEFAULT_COLOR;
}

/** Returns a contrasting text color (black or white) for a given background hex */
export function contrastColor(hex: string): "#000000" | "#FFFFFF" {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}
