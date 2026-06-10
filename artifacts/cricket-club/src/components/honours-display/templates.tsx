import { useMemo, useState } from "react";
import { Link } from "wouter";
import type { ReactNode } from "react";
import type { DisplayBoard, BoardEntry, HonourBrand } from "./types";
import {
  initials,
  gradeBadge,
  formatDate,
  P7_GROUPS,
  matchesGroup,
  chunk,
} from "./helpers";

interface TemplateProps {
  board: DisplayBoard;
  brand: HonourBrand;
  kiosk?: boolean;
}

/** A player name that links to the player profile (unless in kiosk mode). */
function NameLink({
  playerId,
  kiosk,
  children,
}: {
  playerId?: number | null;
  kiosk?: boolean;
  children: ReactNode;
}) {
  if (kiosk || !playerId) return <>{children}</>;
  return (
    <Link href={`/players/${playerId}`} className="hb-link">
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// P1 / P2 / P3 — ledger skins (shared table body)
// ---------------------------------------------------------------------------

function LedgerRows({
  entries,
  kiosk,
}: {
  entries: BoardEntry[];
  kiosk?: boolean;
}) {
  return (
    <table>
      <tbody>
        {entries.map((e, i) => (
          <tr key={i}>
            <td className="yr">{e.season || "—"}</td>
            <td className="nm">
              <NameLink playerId={e.playerId} kiosk={kiosk}>
                {e.primaryText}
              </NameLink>
            </td>
            <td className="dt">{e.detail || ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function P1Heritage({ board, brand, entries, kiosk }: TemplateProps & { entries: BoardEntry[] }) {
  return (
    <div className="frame p1">
      <div className="board">
        <div className="crest">{brand.monogram}</div>
        <h2>{brand.name.toUpperCase()}</h2>
        <h3>{board.title.toUpperCase()}</h3>
        <div className="rule" />
        <LedgerRows entries={entries} kiosk={kiosk} />
      </div>
    </div>
  );
}

export function P2ClubColours({ board, brand, entries, kiosk }: TemplateProps & { entries: BoardEntry[] }) {
  return (
    <div className="frame p2">
      <div className="board">
        <h2>{board.title.toUpperCase()}</h2>
        <h3>{brand.name}</h3>
        <div className="rule" />
        <LedgerRows entries={entries} kiosk={kiosk} />
      </div>
    </div>
  );
}

export function P3Glass({ board, brand, entries, kiosk }: TemplateProps & { entries: BoardEntry[] }) {
  return (
    <div className="frame p3">
      <div className="panel">
        <span className="dot1" />
        <span className="dot2" />
        <h2>{board.title}</h2>
        <h3>{brand.name}</h3>
        <div className="rule" />
        <LedgerRows entries={entries} kiosk={kiosk} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// P4 — Modern Minimal
// ---------------------------------------------------------------------------

export function P4Modern({ board, brand, kiosk }: TemplateProps) {
  const cards = chunk(board.entries, 12);
  return (
    <div className="frame p4">
      <div className="head">
        <div className="chip-crest">{brand.monogram}</div>
        <div>
          <h2>{board.title}</h2>
          <p>
            {brand.name}
            {board.subtitle ? ` · ${board.subtitle}` : ""}
          </p>
        </div>
      </div>
      <div className="grid">
        {cards.map((group, ci) => (
          <div className="card" key={ci}>
            <h4>
              {board.title}
              {cards.length > 1 ? ` (${ci + 1}/${cards.length})` : ""}
            </h4>
            {group.map((e, i) => (
              <div className="row" key={i}>
                <span className="y">{e.season || "—"}</span>
                <span className="n">
                  <NameLink playerId={e.playerId} kiosk={kiosk}>
                    {e.primaryText}
                  </NameLink>
                </span>
                <span className="d">{e.detail || ""}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// P5 — Broadcast
// ---------------------------------------------------------------------------

export function P5Broadcast({ board, brand }: TemplateProps) {
  const heroes = board.entries.slice(0, 3);
  const tickerItems = board.entries
    .slice(0, 14)
    .map((e) => `${e.season || ""} ${e.primaryText}${e.detail ? " · " + e.detail : ""}`.trim());
  const ticker = tickerItems.join("  ▸  ");
  return (
    <div className="frame p5">
      <div className="glow" />
      <div className="inner">
        <span className="tag">{board.title}</span>
        <h2>{board.subtitle || "Honour Roll"}</h2>
        <h3>{brand.name}</h3>
        <div className="hero">
          {heroes.map((e, i) => (
            <div className="stat" key={i}>
              <div className="big">{e.detail || e.season || "—"}</div>
              <div className="who">{e.primaryText}</div>
              <div className="ctx">
                {[e.season, e.meta?.grade].filter(Boolean).join(" · ") || "\u00a0"}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="ticker">
        <span>
          {ticker}
          {ticker ? "  ▸  " : ""}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// P6 — Interactive
// ---------------------------------------------------------------------------

export function P6Interactive({ board, kiosk }: TemplateProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return board.entries;
    return board.entries.filter((e) =>
      [e.primaryText, e.detail ?? "", e.season]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [board.entries, query]);

  return (
    <div className="frame p6">
      <div className="bar">
        <input
          className="search"
          placeholder={`🔍  Search ${board.title.toLowerCase()}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={kiosk}
        />
        <span className="filt on">{board.title}</span>
      </div>
      <div className="cards">
        {filtered.map((e, i) => {
          const card = (
            <>
              <div className="ph">{initials(e.primaryText)}</div>
              <div className="meta">
                <div className="nm">{e.primaryText}</div>
                <div className="hon">
                  {[e.season, e.detail].filter(Boolean).join(" · ") || "\u00a0"}
                </div>
                {e.playerId && !kiosk ? (
                  <span className="lk">View profile ▸</span>
                ) : null}
              </div>
            </>
          );
          if (e.playerId && !kiosk) {
            return (
              <Link key={i} href={`/players/${e.playerId}`} className="pc hb-link">
                {card}
              </Link>
            );
          }
          return (
            <div className="pc" key={i}>
              {card}
            </div>
          );
        })}
      </div>
      <div className="qr">
        <div className="qrbox" />
        <span>
          Scan to open this honour board on your phone
          <br />
          and explore full player histories.
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// P7 — App Style (premierships-first, generalised for other boards)
// ---------------------------------------------------------------------------

export function P7AppStyle({ board, brand, kiosk }: TemplateProps) {
  const isPrem = board.category === "premierships";
  const [groupIdx, setGroupIdx] = useState(0);

  const availableGroups = useMemo(() => {
    if (!isPrem) return [];
    return P7_GROUPS.filter(
      (g) =>
        g.filter === null ||
        board.entries.some((e) => matchesGroup(e.meta?.parentGrade, g.filter)),
    );
  }, [board.entries, isPrem]);

  const activeFilter = availableGroups[groupIdx]?.filter ?? null;
  const rows = useMemo(() => {
    if (!isPrem) return board.entries;
    return board.entries.filter((e) => matchesGroup(e.meta?.parentGrade, activeFilter));
  }, [board.entries, isPrem, activeFilter]);

  const titleWords = board.title.split(" ");
  const head =
    titleWords.length > 1 ? (
      <h2>
        {titleWords.slice(0, -1).join(" ")} <span>{titleWords[titleWords.length - 1]}</span>
      </h2>
    ) : (
      <h2>
        <span>{board.title}</span>
      </h2>
    );

  const noun = isPrem ? "FLAG" : "ENTR";
  const countLabel = isPrem
    ? `${noun}${rows.length === 1 ? "" : "S"}`
    : rows.length === 1
      ? "ENTRY"
      : "ENTRIES";

  return (
    <div className="frame p7">
      <div className="head">
        <div className="ttl">
          <div className="badge-crest">{brand.monogram}</div>
          <div>
            {head}
            <div className="sub">
              {brand.name}
              {board.subtitle ? ` · ${board.subtitle}` : ""}
            </div>
          </div>
        </div>
        <div className="count">
          {rows.length}
          <small>{countLabel}</small>
        </div>
      </div>

      {isPrem && availableGroups.length > 1 ? (
        <div className="chips">
          {availableGroups.map((g, i) => (
            <span
              key={g.label}
              className={`ch${i === groupIdx ? " on" : ""}`}
              onClick={kiosk ? undefined : () => setGroupIdx(i)}
            >
              {g.label}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flags">
        {rows.map((e, i) => (
          <div className="flag" key={i}>
            <div className="top">
              <div>
                <div className="season">{e.season || "—"}</div>
                <div className="comp">
                  {e.meta?.competition || e.meta?.grade || board.title}
                </div>
              </div>
              {e.meta?.grade ? (
                <div className="gbadge">{gradeBadge(e.meta.grade)}</div>
              ) : null}
            </div>
            {e.detail ? <div className="res">{e.detail}</div> : null}
            <div className="ppl">
              {isPrem ? (
                <>
                  {e.meta?.captain ? (
                    <div>
                      Captain
                      <b>
                        <NameLink playerId={e.playerId} kiosk={kiosk}>
                          {e.meta.captain}
                        </NameLink>
                      </b>
                    </div>
                  ) : null}
                  {e.meta?.motm ? (
                    <div>
                      Player of the Final
                      <b>{e.meta.motm}</b>
                    </div>
                  ) : null}
                </>
              ) : (
                <div>
                  Winner
                  <b>
                    <NameLink playerId={e.playerId} kiosk={kiosk}>
                      {e.primaryText}
                    </NameLink>
                  </b>
                </div>
              )}
            </div>
            <div className="foot">
              <span>{e.meta?.venue || "—"}</span>
              <span>
                {e.matchId && !kiosk ? (
                  <Link href={`/matches/${e.matchId}`} className="hb-link">
                    View match ▸
                  </Link>
                ) : (
                  formatDate(e.meta?.date)
                )}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
