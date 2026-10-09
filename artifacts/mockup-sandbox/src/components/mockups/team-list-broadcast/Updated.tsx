import { useEffect, useRef, useState } from "react";
import { prepareTeamNames } from "./fitNames";
import squareRender from "./updated-square.html?raw";
import portraitRender from "./updated-portrait.html?raw";
import storyRender from "./updated-story.html?raw";
import landscapeRender from "./updated-landscape.html?raw";
import "./_group.css";

type Format = "square" | "portrait" | "story" | "landscape";
const DIMENSIONS: Record<Format, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  landscape: { width: 1200, height: 630 },
};
const RENDERS: Record<Format, string> = {
  square: squareRender,
  portrait: portraitRender,
  story: storyRender,
  landscape: landscapeRender,
};

export function Updated() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [format, setFormat] = useState<Format>("square");
  const [scale, setScale] = useState(0.58);
  const dimensions = DIMENSIONS[format];

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const resize = () => {
      setScale(
        Math.min(
          (stage.clientWidth - 40) / dimensions.width,
          (stage.clientHeight - 56) / dimensions.height,
        ),
      );
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();
    return () => observer.disconnect();
  }, [dimensions.height, dimensions.width]);

  useEffect(() => {
    const root = stageRef.current;
    if (root) void prepareTeamNames(root);
  }, [format]);

  return (
    <main className="team-list-board" aria-label="Updated Broadcast Dark team list card">
      <div className="team-list-current-stage" ref={stageRef}>
        <div className="team-list-control-bar">
          <span>Updated · 12 ordered players · approved initials only</span>
          <nav className="team-list-formats" aria-label="Card format">
            {(Object.keys(DIMENSIONS) as Format[]).map((item) => (
              <button
                type="button"
                key={item}
                aria-pressed={format === item}
                onClick={() => setFormat(item)}
              >
                {item}
              </button>
            ))}
          </nav>
        </div>
        <div
          className="team-list-card"
          style={{
            width: dimensions.width,
            height: dimensions.height,
            transform: `translate(-50%, -50%) scale(${scale})`,
          }}
          dangerouslySetInnerHTML={{ __html: RENDERS[format] }}
        />
      </div>
    </main>
  );
}
