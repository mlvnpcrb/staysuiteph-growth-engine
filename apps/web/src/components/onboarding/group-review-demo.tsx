"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@staysuite/ui";
import {
  Stage,
  Window,
  Text,
  Row,
  Check,
  States,
  type Act,
} from "@/vendor/stageshow/entry";
import "./group-review-demo.css";

// Adapted from Stageshow's form-error gold: fixed message lanes, a measured
// cursor, a once-only story, and the completed review as reduced-motion poster.
type Scene = {
  evidence: string;
  confirmed: boolean;
  saving: boolean;
  saved: boolean;
};
const excerpt = "Promotional posts need admin approval.";
const initial: Scene = {
  evidence: "",
  confirmed: false,
  saving: false,
  saved: false,
};
const poster: Scene = {
  evidence: excerpt,
  confirmed: true,
  saving: false,
  saved: true,
};

async function script(act: Act<Scene>) {
  await act.wait(700);
  act.mark("record-rules");
  await act.click("evidence");
  await act.type("evidence", excerpt, { interval: 65 });
  await act.wait(900);
  act.mark("confirm-review");
  await act.click("confirm");
  await act.set({ confirmed: true });
  await act.wait(1000);
  act.mark("save");
  await act.click("save");
  await act.set({ saving: true });
  await act.wait(900);
  await act.set({ saving: false, saved: true });
  act.mark("saved");
  await act.move({ at: "save", x: 0.85, y: 1.8 });
  await act.wait(2400);
}

export function GroupReviewDemo() {
  const [replay, setReplay] = useState(0);
  const { resolvedTheme } = useTheme();
  return (
    <figure className="review-demo">
      <div aria-hidden="true">
        <Stage<Scene>
          key={replay}
          width={560}
          height={400}
          compact={{ below: 560, width: 358, height: 380 }}
          initial={initial}
          poster={poster}
          script={script}
          play="once"
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          greys="cool"
          fidelity="realistic"
          cursor={{
            at: { wide: { x: 520, y: 370 }, compact: { x: 330, y: 390 } },
          }}
          className="coastal-review"
          tokens={{
            "--ss-font": "var(--font-ui)",
            "--ss-accent": "var(--action)",
            "--ss-text-strong": "var(--text)",
            "--ss-text": "var(--muted)",
            "--ss-surface": "var(--surface)",
            "--ss-chrome": "var(--surface)",
            "--ss-line": "var(--line)",
            "--ss-well": "var(--bg)",
            "--ss-success": "var(--success)",
          }}
        >
          {(scene, _rect, layout) => {
            const content = (
              <div className="coastal-review-card">
                <Row
                  className="coastal-review-group-row"
                  title={<Text>Cebu stays community</Text>}
                  subtitle={<Text>Sample group · Cebu City</Text>}
                />
                <div className="coastal-review-status">
                  <States
                    align="start"
                    value={scene.saved ? "reviewed" : "pending"}
                    states={{
                      pending: (
                        <span className="review-pill review-review_required">
                          Rules need review
                        </span>
                      ),
                      reviewed: (
                        <span className="review-pill review-reviewed">
                          Personally reviewed
                        </span>
                      ),
                    }}
                  />
                </div>
                <div className="coastal-review-fields">
                  <Text className="coastal-review-label">
                    Rules you personally reviewed
                  </Text>
                  <div
                    className="coastal-review-evidence"
                    data-target="evidence"
                    data-cursor="text"
                  >
                    <Text className="coastal-review-excerpt">
                      {scene.evidence || "Record a rule excerpt…"}
                    </Text>
                  </div>
                  <div
                    className="coastal-review-confirm"
                    data-target="confirm"
                    data-cursor="pointer"
                  >
                    <Check on={scene.confirmed} size={16} />
                    <Text>Rules checked today</Text>
                  </div>
                  <span
                    className="coastal-review-save"
                    data-target="save"
                    data-cursor="pointer"
                    data-saved={scene.saved || undefined}
                  >
                    <States
                      value={
                        scene.saved ? "saved" : scene.saving ? "saving" : "idle"
                      }
                      states={{
                        idle: "Save review",
                        saving: "Saving review…",
                        saved: "Review saved",
                      }}
                    />
                  </span>
                </div>
              </div>
            );
            return layout === "compact" ? (
              <div className="coastal-review-compact">{content}</div>
            ) : (
              <Window
                title="My Groups"
                toolbar={
                  <Text className="coastal-review-example">Example</Text>
                }
                className="coastal-review-window"
              >
                {content}
              </Window>
            );
          }}
        </Stage>
      </div>
      <figcaption>
        <p>
          <strong>Illustrated example.</strong> Record a rule excerpt, confirm
          your personal review, and save. No real group is edited. Review does
          not grant posting permission.
        </p>
        <Button
          variant="outline"
          onClick={() => setReplay((value) => value + 1)}
          aria-label="Replay group review illustration"
        >
          Replay demo
        </Button>
      </figcaption>
    </figure>
  );
}
