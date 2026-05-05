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
  // Scotland / Belgium / Other Europe
  { match: ["celtic"],               color: "#16A34A" },
  { match: ["rangers"],              color: "#002F6C" },
  { match: ["hearts", "heart of midlothian"], color: "#9B1C1C" },
  { match: ["hibernian"],            color: "#005000" },
  { match: ["club brugge"],          color: "#002F6C" },
  { match: ["anderlecht"],           color: "#6B21A8" },
  { match: ["gent"],                 color: "#003087" },
  { match: ["genk"],                 color: "#003087" },
  { match: ["standard liège", "standard liege"], color: "#CC0000" },
  // Brazil — Copa Libertadores & Brasileirão
  { match: ["flamengo"],             color: "#CC0000" },
  { match: ["palmeiras"],            color: "#006437" },
  { match: ["fluminense"],           color: "#840000" },
  { match: ["corinthians"],          color: "#000000" },
  { match: ["são paulo", "sao paulo"], color: "#CC0000" },
  { match: ["santos"],               color: "#000000" },
  { match: ["grêmio", "gremio"],     color: "#2F5E9A" },
  { match: ["internacional"],        color: "#CC0000" },
  { match: ["cruzeiro"],             color: "#0033A0" },
  { match: ["botafogo"],             color: "#000000" },
  { match: ["vasco"],                color: "#000000" },
  { match: ["athletico paranaense", "athletico-pr"], color: "#CC0000" },
  { match: ["atletico mineiro", "atlético mineiro"], color: "#000000" },
  { match: ["fortaleza"],            color: "#0033A0" },
  { match: ["bragantino", "red bull bragantino"], color: "#CC0000" },
  { match: ["bahia"],                color: "#0033A0" },
  { match: ["ceará", "ceara"],       color: "#000000" },
  // Argentina — Copa Libertadores & Liga Profesional
  { match: ["river plate"],          color: "#CC0000" },
  { match: ["boca juniors", "boca"],  color: "#003F8A" },
  { match: ["racing club"],          color: "#00539F" },
  { match: ["independiente"],        color: "#CC0000" },
  { match: ["san lorenzo"],          color: "#0033A0" },
  { match: ["estudiantes"],          color: "#0033A0" },
  { match: ["talleres"],             color: "#003F8A" },
  { match: ["huracán", "huracan"],   color: "#FFFFFF" },
  { match: ["lanús", "lanus"],       color: "#CC0000" },
  { match: ["vélez", "velez"],       color: "#FFFFFF" },
  { match: ["argentinos juniors", "argentinos"], color: "#CC0000" },
  { match: ["defensa y justicia"],   color: "#FFD700" },
  { match: ["banfield"],             color: "#006400" },
  { match: ["godoy cruz"],           color: "#003F8A" },
  // Uruguay
  { match: ["nacional"],             color: "#CC0000" },
  { match: ["peñarol", "penarol"],   color: "#1F1F1F" },
  // Chile
  { match: ["colo-colo", "colo colo"], color: "#FFFFFF" },
  { match: ["universidad de chile", "u. de chile"], color: "#003F8A" },
  { match: ["palestino"],            color: "#006400" },
  // Colombia
  { match: ["atlético nacional", "atletico nacional"], color: "#007A4D" },
  { match: ["millonarios"],          color: "#003F8A" },
  { match: ["júnior", "junior de barranquilla"], color: "#CC0000" },
  { match: ["América de cali", "america de cali"], color: "#CC0000" },
  // Ecuador
  { match: ["barcelona sc"],         color: "#FFD700" },
  { match: ["ldu", "liga de quito"], color: "#FFFFFF" },
  { match: ["emelec"],               color: "#003F8A" },
  // Paraguay
  { match: ["olimpia"],              color: "#000000" },
  { match: ["cerro porteño", "cerro porteno"], color: "#003F8A" },
  // Peru
  { match: ["universitario"],        color: "#CC0000" },
  { match: ["alianza lima"],         color: "#003A70" },
  { match: ["sporting cristal"],     color: "#003F8A" },
  // Bolivia
  { match: ["bolívar", "bolivar"],   color: "#003F8A" },
  { match: ["the strongest"],        color: "#FFD700" },
  // Venezuela
  { match: ["caracas fc", "caracas"], color: "#CC0000" },
  // Mexico — Liga MX
  { match: ["club américa", "america"], color: "#FFD700" },
  { match: ["guadalajara", "chivas"], color: "#E31837" },
  { match: ["cruz azul"],            color: "#003F8A" },
  { match: ["pumas unam", "pumas"],  color: "#FFD700" },
  { match: ["tigres"],               color: "#FFB81C" },
  { match: ["monterrey", "rayados"], color: "#003F8A" },
  { match: ["atlas"],                color: "#CC0000" },
  { match: ["toluca"],               color: "#CC0000" },
  { match: ["santos laguna"],        color: "#009736" },
  { match: ["pachuca"],              color: "#003087" },
  { match: ["necaxa"],               color: "#CC0000" },
  { match: ["mazatlán", "mazatlan"], color: "#8B1537" },
  { match: ["juárez", "juarez", "fc juarez"], color: "#CC0000" },
  { match: ["puebla"],               color: "#003F8A" },
  { match: ["tijuana", "xolos"],     color: "#CC0000" },
  { match: ["querétaro", "queretaro"], color: "#003087" },
  // MLS
  { match: ["la galaxy", "galaxy"],  color: "#003087" },
  { match: ["lafc", "los angeles fc"], color: "#000000" },
  { match: ["inter miami"],          color: "#F7B5CD" },
  { match: ["seattle sounders"],     color: "#005695" },
  { match: ["portland timbers"],     color: "#01834A" },
  { match: ["new york city", "nycfc"], color: "#69B3E7" },
  { match: ["new york red bulls", "red bulls"], color: "#DD0000" },
  { match: ["atlanta united"],       color: "#CC0000" },
  { match: ["columbus crew"],        color: "#FFD700" },
  { match: ["toronto fc"],           color: "#B81837" },
  { match: ["cf montréal", "montreal"], color: "#003DA5" },
  { match: ["chicago fire"],         color: "#CC0000" },
  { match: ["sporting kc", "sporting kansas"], color: "#002F65" },
  { match: ["colorado rapids"],      color: "#862633" },
  { match: ["real salt lake"],       color: "#B30838" },
  { match: ["vancouver whitecaps"],  color: "#009BC9" },
  { match: ["fc cincinnati"],        color: "#F05323" },
  { match: ["houston dynamo"],       color: "#F7820A" },
  { match: ["fc dallas", "dallas"],  color: "#007BBF" },
  { match: ["minnesota united"],     color: "#E8D01C" },
  { match: ["orlando city"],         color: "#612B9B" },
  { match: ["philadelphia union"],   color: "#001C3D" },
  { match: ["nashville sc"],         color: "#ECE83A" },
  { match: ["austin fc"],            color: "#00B140" },
  { match: ["charlotte fc"],         color: "#1A85C8" },
  { match: ["st. louis city", "st louis"], color: "#BB2244" },
  // Saudi / UAE / Other
  { match: ["al nassr"],             color: "#FFD700" },
  { match: ["al ahli"],              color: "#006400" },
  { match: ["al hilal"],             color: "#003087" },
  { match: ["al ittihad"],           color: "#FFD700" },
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
