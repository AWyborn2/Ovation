import { useEffect, useRef, useState } from "react";
import { prepareTeamNames } from "./fitNames";
import currentRender from "./current-render.html?raw";
import "./_group.css";

const CARD = 1080;

export function Current() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.58);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const resize = () => {
      setScale(Math.min((stage.clientWidth - 36) / CARD, (stage.clientHeight - 36) / CARD));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = stageRef.current;
    if (root) void prepareTeamNames(root);
  }, []);

  return (
    <main className="team-list-board" aria-label="Current Broadcast Dark team list card">
      <div className="team-list-current-stage" ref={stageRef}>
        <div className="team-list-control-bar">
          <span>Current · Broadcast Dark / Team List</span>
          <span>Original 2-column layout</span>
        </div>
        <div
          className="team-list-card"
          style={{ width: CARD, height: CARD, transform: `translate(-50%, -50%) scale(${scale})` }}
          dangerouslySetInnerHTML={{ __html: currentRender }}
        />
      </div>
    </main>
  );
}
