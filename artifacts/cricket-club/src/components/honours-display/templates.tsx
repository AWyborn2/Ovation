import type { ReactNode } from "react";
import { Link } from "wouter";
import type { DisplayBoard, BoardEntry, HonourBrand } from "./types";
import { gradeBadge, formatDate } from "./helpers";

interface LayoutProps {
  board: DisplayBoard;
  brand: HonourBrand;
  kiosk?: boolean;
  /** Pre-paged subset for long list boards; defaults to all board entries. */
  entries?: BoardEntry[];
}

/** A name that links to the player profile (unless in kiosk mode). */
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

/** Shared board header: crest, club name, title, optional subtitle. */
function BoardHead({
  board,
  brand,
}: {
  board: DisplayBoard;
  brand: HonourBrand;
}) {
  return (
    <header className="hb-head">
      <div className="hb-crest">{brand.monogram}</div>
      <div className="hb-titles">
        <div className="hb-club">{brand.name}</div>
        <h2 className="hb-title">{board.title}</h2>
        {board.subtitle ? <p className="hb-sub">{board.subtitle}</p> : null}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Premiership layout — same info as /premierships (grade, result, squad…).
// ---------------------------------------------------------------------------

export function PremiershipBoard({ board, brand, kiosk }: LayoutProps) {
  return (
    <div className="hb-board hb-premiership">
      <BoardHead board={board} brand={brand} />
      <div className="hb-flags">
        {board.entries.map((e, i) => (
          <article className="hb-flag" key={i}>
            <div className="hb-flag-top">
              <div>
                <div className="hb-flag-season">{e.season || "—"}</div>
                <div className="hb-flag-comp">
                  {e.meta?.competition || board.title}
                </div>
              </div>
              {e.meta?.grade ? (
                <span className="hb-chip">{gradeBadge(e.meta.grade)}</span>
              ) : null}
            </div>

            {e.detail ? <div className="hb-flag-result">{e.detail}</div> : null}

            <div className="hb-flag-people">
              {e.meta?.captain ? (
                <div>
                  <span className="hb-k">Captain</span>
                  <b>
                    <NameLink playerId={e.playerId} kiosk={kiosk}>
                      {e.meta.captain}
                    </NameLink>
                  </b>
                </div>
              ) : null}
              {e.meta?.motm ? (
                <div>
                  <span className="hb-k">Player of the Final</span>
                  <b>{e.meta.motm}</b>
                </div>
              ) : null}
            </div>

            {e.squad && e.squad.length ? (
              <div className="hb-squad">
                {e.squad.map((m, j) => (
                  <span className="hb-squad-name" key={j}>
                    <NameLink playerId={m.playerId} kiosk={kiosk}>
                      {m.name}
                      {m.isCaptain ? " (c)" : ""}
                    </NameLink>
                  </span>
                ))}
              </div>
            ) : null}

            <div className="hb-flag-foot">
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
          </article>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team of the Decade layout — XI lineup in batting order.
// ---------------------------------------------------------------------------

export function TeamOfDecadeBoard({ board, brand, kiosk }: LayoutProps) {
  return (
    <div className="hb-board hb-tod">
      <BoardHead board={board} brand={brand} />
      <ol className="hb-lineup">
        {board.entries.map((e, i) => (
          <li className="hb-lineup-row" key={i}>
            <span className="hb-lineup-num">{i + 1}</span>
            <span className="hb-lineup-name">
              <NameLink playerId={e.playerId} kiosk={kiosk}>
                {e.primaryText}
              </NameLink>
            </span>
            {e.detail ? <span className="hb-lineup-role">{e.detail}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic list layout — rank/season · name (+grade) · detail.
// ---------------------------------------------------------------------------

export function ListBoard({ board, brand, kiosk, entries }: LayoutProps) {
  const rows = entries ?? board.entries;
  const ranked = rows.some((e) => e.meta?.rank != null);
  return (
    <div className="hb-board hb-list">
      <BoardHead board={board} brand={brand} />
      <table className="hb-table">
        <tbody>
          {rows.map((e, i) => (
            <tr className="row" key={i}>
              <td className="hb-lead">
                {e.meta?.rank != null ? (
                  <span className="hb-rank">{e.meta.rank}</span>
                ) : (
                  <span className="hb-season">{e.season || (ranked ? "" : "—")}</span>
                )}
              </td>
              <td className="hb-name">
                <NameLink playerId={e.playerId} kiosk={kiosk}>
                  {e.primaryText}
                </NameLink>
                {e.meta?.grade ? (
                  <span className="hb-chip hb-chip-sm">{gradeBadge(e.meta.grade)}</span>
                ) : null}
              </td>
              <td className="hb-detail">{e.detail || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
