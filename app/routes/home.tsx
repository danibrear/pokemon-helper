import { useEffect, useMemo, useState } from "react";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Dani’s Pokèmon Helper" },
    {
      name: "description",
      content: "Build a smarter Pokémon team with instant type matchup advice.",
    },
  ];
}

const TYPES = [
  "Normal",
  "Fire",
  "Water",
  "Electric",
  "Grass",
  "Ice",
  "Fighting",
  "Poison",
  "Ground",
  "Flying",
  "Psychic",
  "Bug",
  "Rock",
  "Ghost",
  "Dragon",
  "Dark",
  "Steel",
  "Fairy",
] as const;
type PokemonType = (typeof TYPES)[number];

type PokemonIndexItem = { name: string; url: string };
type PokemonDetails = {
  id: number;
  name: string;
  types: PokemonType[];
  sprite: string | null;
  stats: number;
  attack: number;
  specialAttack: number;
  moves: Array<{
    name: string;
    versions: Array<{ version: string; method: string }>;
  }>;
};
type CounterDetails = PokemonDetails & {
  offense: number;
  danger: number;
  recommendedMove: {
    name: string;
    type: PokemonType;
    power: number | null;
    method: string;
    multiplier: number;
  } | null;
};
type VersionGroup = { name: string; url: string };

const API = "https://pokeapi.co/api/v2";
const CACHE_PREFIX = "type-scout:v1:";

function displayName(name: string) {
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Damerau-Levenshtein distance also treats adjacent swapped letters as one typo.
function fuzzyDistance(source: string, target: string) {
  const matrix = Array.from({ length: source.length + 1 }, () =>
    Array<number>(target.length + 1).fill(0),
  );
  for (let row = 0; row <= source.length; row++) matrix[row][0] = row;
  for (let column = 0; column <= target.length; column++)
    matrix[0][column] = column;
  for (let row = 1; row <= source.length; row++) {
    for (let column = 1; column <= target.length; column++) {
      const cost = source[row - 1] === target[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      );
      if (
        row > 1 &&
        column > 1 &&
        source[row - 1] === target[column - 2] &&
        source[row - 2] === target[column - 1]
      ) {
        matrix[row][column] = Math.min(
          matrix[row][column],
          matrix[row - 2][column - 2] + cost,
        );
      }
    }
  }
  return matrix[source.length][target.length];
}

function searchMatch(name: string, query: string) {
  const candidate = normalizeSearch(name);
  const needle = normalizeSearch(query);
  if (!needle) return null;
  if (candidate === needle) return { score: 0, fuzzy: false };
  if (candidate.startsWith(needle))
    return {
      score: 1 + (candidate.length - needle.length) / 100,
      fuzzy: false,
    };
  if (candidate.includes(needle))
    return { score: 5 + candidate.indexOf(needle), fuzzy: false };
  if (needle.length < 3) return null;
  const allowedDistance = needle.length <= 4 ? 1 : needle.length <= 7 ? 2 : 3;
  if (Math.abs(candidate.length - needle.length) > allowedDistance) return null;
  const distance = fuzzyDistance(candidate, needle);
  let commonPrefix = 0;
  while (
    candidate[commonPrefix] === needle[commonPrefix] &&
    commonPrefix < Math.min(candidate.length, needle.length)
  )
    commonPrefix++;
  return distance <= allowedDistance
    ? {
        score:
          20 +
          distance +
          Math.abs(candidate.length - needle.length) / 10 -
          commonPrefix / 100,
        fuzzy: true,
      }
    : null;
}

async function cachedJson<T>(url: string): Promise<T> {
  const cacheKey = CACHE_PREFIX + url;
  try {
    const saved = window.localStorage.getItem(cacheKey);
    if (saved) return JSON.parse(saved) as T;
  } catch {
    // Browsers can disable storage; the live API remains the fallback.
  }
  let response = await fetch(url);
  if (!response.ok && (response.status === 429 || response.status >= 500)) {
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    response = await fetch(url);
  }
  if (!response.ok)
    throw new Error(`PokéAPI request failed (${response.status})`);
  const data = (await response.json()) as T;
  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(data));
  } catch {
    /* Cache quota is optional. */
  }
  return data;
}

function toPokemonDetails(data: any): PokemonDetails {
  return {
    id: data.id,
    name: data.name,
    types: data.types
      .sort((a: any, b: any) => a.slot - b.slot)
      .map((entry: any) => displayName(entry.type.name) as PokemonType),
    sprite:
      data.sprites?.other?.["official-artwork"]?.front_default ??
      data.sprites?.front_default ??
      null,
    stats: (data.stats ?? []).reduce(
      (total: number, entry: any) => total + entry.base_stat,
      0,
    ),
    attack:
      (data.stats ?? []).find((entry: any) => entry.stat.name === "attack")
        ?.base_stat ?? 0,
    specialAttack:
      (data.stats ?? []).find(
        (entry: any) => entry.stat.name === "special-attack",
      )?.base_stat ?? 0,
    moves: (data.moves ?? []).map((entry: any) => ({
      name: entry.move.name,
      versions: entry.version_group_details.map((detail: any) => ({
        version: detail.version_group.name,
        method: detail.move_learn_method.name,
      })),
    })),
  };
}

const TYPE_ICONS: Record<PokemonType, string> = {
  Normal: "●",
  Fire: "♨",
  Water: "◆",
  Electric: "ϟ",
  Grass: "♠",
  Ice: "✦",
  Fighting: "✊",
  Poison: "☠",
  Ground: "◒",
  Flying: "➤",
  Psychic: "◉",
  Bug: "✣",
  Rock: "⬟",
  Ghost: "♟",
  Dragon: "☄",
  Dark: "◐",
  Steel: "⚙",
  Fairy: "✧",
};

// Attack type -> defending types that change its damage.
const CHART: Record<
  PokemonType,
  { strong: PokemonType[]; weak: PokemonType[]; immune: PokemonType[] }
> = {
  Normal: { strong: [], weak: ["Rock", "Steel"], immune: ["Ghost"] },
  Fire: {
    strong: ["Grass", "Ice", "Bug", "Steel"],
    weak: ["Fire", "Water", "Rock", "Dragon"],
    immune: [],
  },
  Water: {
    strong: ["Fire", "Ground", "Rock"],
    weak: ["Water", "Grass", "Dragon"],
    immune: [],
  },
  Electric: {
    strong: ["Water", "Flying"],
    weak: ["Electric", "Grass", "Dragon"],
    immune: ["Ground"],
  },
  Grass: {
    strong: ["Water", "Ground", "Rock"],
    weak: ["Fire", "Grass", "Poison", "Flying", "Bug", "Dragon", "Steel"],
    immune: [],
  },
  Ice: {
    strong: ["Grass", "Ground", "Flying", "Dragon"],
    weak: ["Fire", "Water", "Ice", "Steel"],
    immune: [],
  },
  Fighting: {
    strong: ["Normal", "Ice", "Rock", "Dark", "Steel"],
    weak: ["Poison", "Flying", "Psychic", "Bug", "Fairy"],
    immune: ["Ghost"],
  },
  Poison: {
    strong: ["Grass", "Fairy"],
    weak: ["Poison", "Ground", "Rock", "Ghost"],
    immune: ["Steel"],
  },
  Ground: {
    strong: ["Fire", "Electric", "Poison", "Rock", "Steel"],
    weak: ["Grass", "Bug"],
    immune: ["Flying"],
  },
  Flying: {
    strong: ["Grass", "Fighting", "Bug"],
    weak: ["Electric", "Rock", "Steel"],
    immune: [],
  },
  Psychic: {
    strong: ["Fighting", "Poison"],
    weak: ["Psychic", "Steel"],
    immune: ["Dark"],
  },
  Bug: {
    strong: ["Grass", "Psychic", "Dark"],
    weak: ["Fire", "Fighting", "Poison", "Flying", "Ghost", "Steel", "Fairy"],
    immune: [],
  },
  Rock: {
    strong: ["Fire", "Ice", "Flying", "Bug"],
    weak: ["Fighting", "Ground", "Steel"],
    immune: [],
  },
  Ghost: { strong: ["Psychic", "Ghost"], weak: ["Dark"], immune: ["Normal"] },
  Dragon: { strong: ["Dragon"], weak: ["Steel"], immune: ["Fairy"] },
  Dark: {
    strong: ["Psychic", "Ghost"],
    weak: ["Fighting", "Dark", "Fairy"],
    immune: [],
  },
  Steel: {
    strong: ["Ice", "Rock", "Fairy"],
    weak: ["Fire", "Water", "Electric", "Steel"],
    immune: [],
  },
  Fairy: {
    strong: ["Fighting", "Dragon", "Dark"],
    weak: ["Fire", "Poison", "Steel"],
    immune: [],
  },
};

function effectiveness(attack: PokemonType, defenders: PokemonType[]) {
  return defenders.reduce((multiplier, defender) => {
    const entry = CHART[attack];
    if (entry.immune.includes(defender)) return 0;
    if (entry.strong.includes(defender)) return multiplier * 2;
    if (entry.weak.includes(defender)) return multiplier * 0.5;
    return multiplier;
  }, 1);
}

function TypePill({
  type,
  compact = false,
}: {
  type: PokemonType;
  compact?: boolean;
}) {
  return (
    <span
      className={`type-pill type-${type.toLowerCase()} ${compact ? "compact" : ""}`}>
      <span className="type-icon" aria-hidden="true">
        {TYPE_ICONS[type]}
      </span>
      {type}
    </span>
  );
}

function ResultRow({
  type,
  multiplier,
}: {
  type: PokemonType;
  multiplier: number;
}) {
  const width =
    multiplier >= 4 ? 100 : multiplier >= 2 ? 72 : multiplier >= 1 ? 50 : 24;
  return (
    <div className="result-row">
      <TypePill type={type} compact />
      <div className="power-track" aria-hidden="true">
        <span style={{ width: `${width}%` }} />
      </div>
      <strong
        className={`multiplier multiplier-${String(multiplier).replace(".", "-")}`}>
        {multiplier}×
      </strong>
    </div>
  );
}

export default function Home() {
  const [selected, setSelected] = useState<PokemonType[]>(["Grass", "Poison"]);
  const [pokemonIndex, setPokemonIndex] = useState<PokemonIndexItem[]>([]);
  const [speciesCount, setSpeciesCount] = useState(1025);
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pokemon, setPokemon] = useState<PokemonDetails | null>(null);
  const [counters, setCounters] = useState<CounterDetails[]>([]);
  const [versionGroups, setVersionGroups] = useState<VersionGroup[]>([]);
  const [versionGroup, setVersionGroup] = useState("scarlet-violet");
  const [counterMode, setCounterMode] = useState<"all" | "mine">("all");
  const [ownedPokemon, setOwnedPokemon] = useState<string[]>([]);
  const [searchState, setSearchState] = useState<
    "loading-index" | "idle" | "searching" | "error"
  >("loading-index");
  const [error, setError] = useState("");
  const [counterError, setCounterError] = useState("");
  const results = useMemo(
    () =>
      TYPES.map((type) => ({
        type,
        multiplier: effectiveness(type, selected),
      })).sort(
        (a, b) =>
          b.multiplier - a.multiplier ||
          TYPES.indexOf(a.type) - TYPES.indexOf(b.type),
      ),
    [selected],
  );
  const recommended = results.filter(({ multiplier }) => multiplier > 1);
  const avoid = results.filter(({ multiplier }) => multiplier < 1);
  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    return pokemonIndex
      .map((item) => ({ ...item, match: searchMatch(item.name, query) }))
      .filter(
        (
          item,
        ): item is typeof item & { match: { score: number; fuzzy: boolean } } =>
          item.match !== null,
      )
      .sort(
        (a, b) => a.match.score - b.match.score || a.name.localeCompare(b.name),
      )
      .slice(0, 8);
  }, [pokemonIndex, query]);

  useEffect(() => {
    let active = true;
    cachedJson<{ count: number }>(`${API}/pokemon-species?limit=1`)
      .then(async ({ count }) => {
        const data = await cachedJson<{ results: PokemonIndexItem[] }>(
          `${API}/pokemon-species?limit=${count}`,
        );
        if (active) {
          setSpeciesCount(count);
          setPokemonIndex(data.results);
          setSearchState("idle");
        }
      })
      .catch(
        () =>
          active &&
          (setSearchState("error"),
          setError(
            "Couldn’t load the Pokédex. Check your connection and try again.",
          )),
      );
    cachedJson<{ results: VersionGroup[] }>(`${API}/version-group?limit=100`)
      .then((versions) => {
        if (!active) return;
        setVersionGroups(versions.results);
        if (
          !versions.results.some(({ name }) => name === "scarlet-violet") &&
          versions.results.length
        )
          setVersionGroup(versions.results.at(-1)!.name);
      })
      .catch(() => {
        /* Search still works when optional game metadata is unavailable. */
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(
        "danis-pokemon-helper:my-pokemon",
      );
      if (saved) setOwnedPokemon(JSON.parse(saved));
    } catch {
      /* A collection is optional when storage is disabled. */
    }
  }, []);

  async function findCounters(
    target: PokemonDetails,
    game = versionGroup,
    mode = counterMode,
    owned = ownedPokemon,
  ) {
    setSearchState("searching");
    setCounterError("");
    try {
      const attackTypes = TYPES.filter(
        (type) => effectiveness(type, target.types) > 1,
      );
      if (!attackTypes.length) {
        setCounters([]);
        return;
      }

      const typeData = await Promise.all(
        attackTypes.map((type) =>
          cachedJson<any>(`${API}/type/${type.toLowerCase()}`),
        ),
      );
      const effectiveMoves = new Map<string, PokemonType>();
      typeData.forEach((data, index) =>
        data.moves.forEach((move: { name: string }) =>
          effectiveMoves.set(move.name, attackTypes[index]),
        ),
      );
      const candidates = new Map<string, { name: string; id: number }>();
      if (mode === "mine") {
        owned
          .filter((name) => name !== target.name)
          .forEach((name) => candidates.set(name, { name, id: 0 }));
      } else {
        for (const data of typeData) {
          const pool = data.pokemon
            .map((entry: any) => ({
              name: entry.pokemon.name as string,
              id: Number(entry.pokemon.url.match(/\/(\d+)\/$/)?.[1]),
            }))
            .filter(
              (entry: { id: number }) =>
                entry.id > 0 &&
                entry.id <= speciesCount &&
                entry.id !== target.id,
            );
          const stride = Math.max(1, Math.floor(pool.length / 8));
          [
            ...pool
              .filter((_: unknown, index: number) => index % stride === 0)
              .slice(0, 8),
            ...pool.slice(-2),
          ].forEach((entry: { name: string; id: number }) =>
            candidates.set(entry.name, entry),
          );
        }
      }

      const details = (
        await Promise.all(
          [...candidates.values()].slice(0, 28).map(({ name }) =>
            cachedJson<any>(`${API}/pokemon/${name}`)
              .then(toPokemonDetails)
              .catch(() => null),
          ),
        )
      ).filter((item): item is PokemonDetails => item !== null);
      const ranked = details
        .map((candidate) => {
          const availableMoves = candidate.moves.filter(
            (move) =>
              move.versions.some(({ version }) => version === game) &&
              effectiveMoves.has(move.name),
          );
          const offense = availableMoves.length
            ? Math.max(
                ...availableMoves.map((move) =>
                  effectiveness(effectiveMoves.get(move.name)!, target.types),
                ),
              )
            : 0;
          const danger = Math.max(
            ...target.types.map((type) => effectiveness(type, candidate.types)),
          );
          const score = offense * 120 + candidate.stats / 8 - danger * 25;
          return { ...candidate, offense, danger, score, availableMoves };
        })
        .filter(({ offense }) => offense > 1)
        .sort((a, b) => b.score - a.score || a.id - b.id)
        .slice(0, 6);

      const withMoves = await Promise.all(
        ranked.map(async (candidate) => {
          const pool = candidate.availableMoves.filter(
            (move) =>
              effectiveness(effectiveMoves.get(move.name)!, target.types) ===
              candidate.offense,
          );
          const stride = Math.max(1, Math.floor(pool.length / 7));
          const sampled = [
            ...pool.filter((_, index) => index % stride === 0).slice(0, 7),
            ...pool.slice(-2),
          ];
          const moveData = await Promise.all(
            sampled.map((move) =>
              cachedJson<any>(`${API}/move/${move.name}`).catch(() => null),
            ),
          );
          const best = moveData
            .filter(
              (move) => move?.damage_class?.name !== "status" && move?.power,
            )
            .sort((a, b) => {
              const score = (move: any) =>
                move.power *
                (move.accuracy ?? 100) *
                (move.damage_class.name === "physical"
                  ? candidate.attack
                  : candidate.specialAttack) *
                (candidate.types.includes(
                  displayName(move.type.name) as PokemonType,
                )
                  ? 1.5
                  : 1);
              return score(b) - score(a);
            })[0];
          const fallback = pool[0];
          const moveName = best?.name ?? fallback?.name;
          const moveRecord = candidate.moves.find(
            (move) => move.name === moveName,
          );
          const method =
            moveRecord?.versions.find(({ version }) => version === game)
              ?.method ?? "unknown";
          const moveType = best
            ? (displayName(best.type.name) as PokemonType)
            : effectiveMoves.get(moveName);
          return {
            ...candidate,
            recommendedMove:
              moveName && moveType
                ? {
                    name: moveName,
                    type: moveType,
                    power: best?.power ?? null,
                    method,
                    multiplier: effectiveness(moveType, target.types),
                  }
                : null,
          };
        }),
      );
      setCounters(withMoves);
    } catch {
      setCounters([]);
      setCounterError(
        "The Pokémon was found, but detailed counter data is temporarily unavailable. You can still use the type recommendations above.",
      );
    } finally {
      setSearchState("idle");
    }
  }

  async function selectPokemon(selection: PokemonIndexItem | string) {
    const fromIndex = typeof selection !== "string";
    const name = fromIndex ? selection.name : selection;
    const id = fromIndex ? selection.url.match(/\/(\d+)\/$/)?.[1] : undefined;
    setSearchState("searching");
    setError("");
    setCounterError("");
    setShowSuggestions(false);
    setCounters([]);
    try {
      let raw: any;
      try {
        raw = await cachedJson<any>(
          `${API}/pokemon/${id ?? name.toLowerCase()}`,
        );
      } catch {
        const species = await cachedJson<any>(
          `${API}/pokemon-species/${name.toLowerCase()}`,
        );
        const defaultVariety =
          species.varieties?.find((item: any) => item.is_default)?.pokemon
            ?.name ?? name;
        raw = await cachedJson<any>(`${API}/pokemon/${defaultVariety}`);
      }
      const details = toPokemonDetails(raw);
      setPokemon(details);
      setQuery(displayName(details.name));
      setSelected(details.types);
      await findCounters(details);
    } catch {
      setSearchState("error");
      setError(
        fromIndex
          ? "We found that Pokémon, but couldn’t load its battle data. Please try again in a moment."
          : "That Pokémon couldn’t be found. Try choosing a name from the list.",
      );
    }
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const exact = pokemonIndex.find(
      ({ name }) => normalizeSearch(name) === normalizeSearch(query),
    );
    if (exact) selectPokemon(exact);
    else if (suggestions[0]) selectPokemon(suggestions[0]);
    else {
      setSearchState("error");
      setError("No matching Pokémon found.");
    }
  }

  function toggleType(type: PokemonType) {
    setPokemon(null);
    setCounters([]);
    setQuery("");
    setSelected((current) => {
      if (current.includes(type))
        return current.filter((item) => item !== type);
      if (current.length === 2) return [current[1], type];
      return [...current, type];
    });
  }

  function changeVersion(game: string) {
    setVersionGroup(game);
    if (pokemon) findCounters(pokemon, game, counterMode);
  }

  function changeCounterMode(mode: "all" | "mine") {
    setCounterMode(mode);
    if (pokemon) findCounters(pokemon, versionGroup, mode);
  }

  function toggleOwned(name: string) {
    const next = ownedPokemon.includes(name)
      ? ownedPokemon.filter((item) => item !== name)
      : [...ownedPokemon, name];
    setOwnedPokemon(next);
    try {
      window.localStorage.setItem(
        "danis-pokemon-helper:my-pokemon",
        JSON.stringify(next),
      );
    } catch {
      /* Optional persistence. */
    }
    if (pokemon && counterMode === "mine")
      findCounters(pokemon, versionGroup, "mine", next);
  }

  return (
    <main className="app-shell">
      <nav className="topbar" aria-label="Main navigation">
        <a className="brand" href="/" aria-label="Dani’s Pokèmon Helper home">
          <span className="brand-mark">
            <span />
          </span>
          <span>
            Dani’s Pokèmon <span>Helper</span>
          </span>
        </a>
        <div className="nav-links">
          <a className="active" href="#checker">
            Matchup checker
          </a>
          <a href="#how-it-works">How it works</a>
        </div>
        <a className="dex-link" href="#type-chart">
          Type chart <span>↗</span>
        </a>
      </nav>

      <section className="hero" id="checker">
        <div className="hero-copy">
          <span className="eyebrow">
            <i /> Battle smarter
          </span>
          <h1>
            Find the winning <em>type matchup.</em>
          </h1>
          <p>
            Search any Pokémon or choose a type combination. We’ll show you
            exactly what to bring into battle.
          </p>
          <form className="pokemon-search" onSubmit={submitSearch}>
            <div className="search-box">
              <span aria-hidden="true">⌕</span>
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setShowSuggestions(true);
                  setError("");
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() =>
                  window.setTimeout(() => setShowSuggestions(false), 150)
                }
                placeholder={
                  searchState === "loading-index"
                    ? "Loading the Pokédex…"
                    : "Search a Pokémon, e.g. Garchomp"
                }
                aria-label="Search for a Pokémon"
                disabled={searchState === "loading-index"}
                autoComplete="off"
                type="search"
              />
              <button
                type="submit"
                disabled={
                  searchState === "loading-index" || searchState === "searching"
                }>
                {searchState === "searching" ? "Scouting…" : "Scout"}
              </button>
              {showSuggestions && suggestions.length > 0 && (
                <div className="suggestions" role="listbox">
                  {suggestions[0].match.fuzzy && (
                    <div className="fuzzy-heading">Did you mean…</div>
                  )}
                  {suggestions.map((item) => (
                    <button
                      type="button"
                      role="option"
                      key={item.name}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectPokemon(item)}>
                      <span>{displayName(item.name)}</span>
                      <small>
                        {item.match.fuzzy ? "Possible match" : "View matchup"}
                      </small>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {error && <p className="search-error">{error}</p>}
          </form>
        </div>
        <div className="hero-decoration" aria-hidden="true">
          <span className="orbit orbit-one" />
          <span className="orbit orbit-two" />
          <span className="hero-ball">
            <i />
          </span>
        </div>
      </section>

      <section className="workspace">
        <div className="selector-card">
          <div className="section-heading">
            <span className="step">01</span>
            <div>
              <h2>Choose opponent types</h2>
              <p>Select one or two types</p>
            </div>
            {selected.length > 0 && (
              <button className="clear-button" onClick={() => setSelected([])}>
                Clear
              </button>
            )}
          </div>
          <div className="type-grid">
            {TYPES.map((type) => {
              const isSelected = selected.includes(type);
              return (
                <button
                  key={type}
                  className={`type-button type-${type.toLowerCase()} ${isSelected ? "selected" : ""}`}
                  onClick={() => toggleType(type)}
                  aria-pressed={isSelected}>
                  <span className="type-icon" aria-hidden="true">
                    {TYPE_ICONS[type]}
                  </span>
                  <span>{type}</span>
                  {isSelected && <span className="check">✓</span>}
                </button>
              );
            })}
          </div>
          <div className={`selection-summary ${pokemon ? "has-pokemon" : ""}`}>
            {pokemon && (
              <div className="chosen-pokemon">
                {pokemon.sprite && <img src={pokemon.sprite} alt="" />}
                <div>
                  <small>Opponent</small>
                  <strong>{displayName(pokemon.name)}</strong>
                  <span>#{String(pokemon.id).padStart(4, "0")}</span>
                </div>
                <button
                  className={`team-add ${ownedPokemon.includes(pokemon.name) ? "saved" : ""}`}
                  onClick={() => toggleOwned(pokemon.name)}>
                  {ownedPokemon.includes(pokemon.name)
                    ? "✓ Saved"
                    : "+ My Pokémon"}
                </button>
              </div>
            )}
            {!pokemon && <span>Opponent</span>}
            <div className="selected-types">
              {selected.length ? (
                selected.map((type) => <TypePill key={type} type={type} />)
              ) : (
                <em>No types selected</em>
              )}
            </div>
            <span className="selection-count">{selected.length}/2</span>
          </div>
          <div className="my-pokemon-shelf">
            <div>
              <strong>My Pokémon</strong>
              <span>
                {ownedPokemon.length
                  ? `${ownedPokemon.length} saved`
                  : "Save Pokémon after searching for them"}
              </span>
            </div>
            {ownedPokemon.length > 0 && (
              <div className="owned-list">
                {ownedPokemon.map((name) => (
                  <span key={name}>
                    {displayName(name)}
                    <button
                      onClick={() => toggleOwned(name)}
                      aria-label={`Remove ${displayName(name)} from My Pokémon`}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div
          className={`advice-card ${selected.length === 0 ? "empty" : ""}`}
          aria-live="polite">
          <div className="section-heading">
            <span className="step coral">02</span>
            <div>
              <h2>Your battle plan</h2>
              <p>
                {selected.length
                  ? "Best attacking types, ranked"
                  : "Waiting for an opponent"}
              </p>
            </div>
          </div>
          {selected.length === 0 ? (
            <div className="empty-state">
              <span className="empty-ball">
                <i />
              </span>
              <h3>Pick an opponent type</h3>
              <p>Your tailored matchup advice will appear here.</p>
            </div>
          ) : (
            <>
              <div className="recommendation">
                <div className="result-label">
                  <span>✦</span> Recommended
                </div>
                {recommended.length ? (
                  <div className="result-list">
                    {recommended.map((item) => (
                      <ResultRow key={item.type} {...item} />
                    ))}
                  </div>
                ) : (
                  <p className="neutral-note">
                    This combination has no type weaknesses.
                  </p>
                )}
              </div>
              <div className="avoid-section">
                <div className="result-label muted">
                  <span>!</span> Avoid using
                </div>
                <div className="avoid-types">
                  {avoid.map(({ type, multiplier }) => (
                    <div className="avoid-item" key={type}>
                      <TypePill type={type} compact />
                      <span>{multiplier}×</span>
                    </div>
                  ))}
                </div>
              </div>
              {pokemon && (
                <div className="counter-section">
                  <div className="counter-title-row">
                    <div className="result-label">
                      <span>★</span> Strong Pokémon choices
                    </div>
                    <div className="counter-mode" aria-label="Counter source">
                      <button
                        className={counterMode === "all" ? "active" : ""}
                        onClick={() => changeCounterMode("all")}>
                        All
                      </button>
                      <button
                        className={counterMode === "mine" ? "active" : ""}
                        onClick={() => changeCounterMode("mine")}>
                        Mine
                      </button>
                    </div>
                  </div>
                  <label className="game-picker">
                    <span>Game / learnset</span>
                    <select
                      value={versionGroup}
                      onChange={(event) => changeVersion(event.target.value)}>
                      {[...versionGroups].reverse().map((game) => (
                        <option key={game.name} value={game.name}>
                          {displayName(game.name)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {counterError && (
                    <div className="counter-warning">{counterError}</div>
                  )}
                  {searchState === "searching" ? (
                    <p className="counter-loading">
                      Checking moves available in {displayName(versionGroup)}…
                    </p>
                  ) : counters.length ? (
                    <div className="counter-grid">
                      {counters.map((counter, index) => (
                        <article className="counter-card" key={counter.name}>
                          <span className="counter-rank">{index + 1}</span>
                          {counter.sprite && (
                            <img src={counter.sprite} alt="" />
                          )}
                          <div>
                            <strong>{displayName(counter.name)}</strong>
                            <small>
                              {counter.types.join(" · ")} · {counter.stats} base
                              stats
                            </small>
                            {counter.recommendedMove && (
                              <span className="move-rec">
                                <b>
                                  {displayName(counter.recommendedMove.name)}
                                </b>
                                <em
                                  className={`move-type type-${counter.recommendedMove.type.toLowerCase()}`}>
                                  {counter.recommendedMove.type}
                                </em>
                                <small>
                                  {counter.recommendedMove.power
                                    ? `${counter.recommendedMove.power} power · `
                                    : ""}
                                  {displayName(counter.recommendedMove.method)}
                                </small>
                              </span>
                            )}
                            <span className="why-rec">
                              {counter.recommendedMove?.multiplier ??
                                counter.offense}
                              × damage · takes {counter.danger}× STAB
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="no-counters">
                      <strong>
                        {counterMode === "mine" && !ownedPokemon.length
                          ? "Your collection is empty"
                          : "No matching counters found"}
                      </strong>
                      <p>
                        {counterMode === "mine"
                          ? "Search Pokémon and save them to My Pokémon, or switch back to All."
                          : "Try another game version."}
                      </p>
                    </div>
                  )}
                </div>
              )}
              <div className="tip">
                <span>i</span>
                <p>
                  <strong>Scout’s tip</strong> A Pokémon with one of the
                  recommended types—and a matching attack—will deal
                  super-effective damage.
                </p>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="explainer" id="how-it-works">
        <p>
          <span>2×</span> Super effective
        </p>
        <p>
          <span>4×</span> Double weakness
        </p>
        <p>
          <span>½×</span> Not very effective
        </p>
        <p>
          <span>0×</span> No effect
        </p>
      </section>
      <footer id="type-chart">
        <span>
          Dani’s Pokèmon <span>Helper</span>
        </span>
        <p>
          Matchups use the modern 18-type battle chart. Abilities and special
          moves may change the result.
        </p>
        <span>Made for trainers everywhere.</span>
      </footer>
    </main>
  );
}
