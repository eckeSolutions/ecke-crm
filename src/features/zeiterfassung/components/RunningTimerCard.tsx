import { EckeButton, EckeCard, EckeIcon } from "@ds/stencil/react";

import type { RunningTimer } from "../stopwatch";
import { formatElapsed } from "../stopwatch";
import "./RunningTimerCard.css";

export function RunningTimerCard({
  timer,
  elapsedMs,
  pending,
  onStop,
  onDiscard,
}: {
  timer: RunningTimer;
  elapsedMs: number;
  pending: boolean;
  onStop: () => void;
  onDiscard: () => void;
}) {
  return (
    <EckeCard surface="glass" className="running-timer">
      <div className="running-timer__icon">
        <EckeIcon name="clock" />
      </div>
      <div className="running-timer__body">
        <div className="running-timer__description">
          <strong>{timer.clientName}</strong> · {timer.description}
        </div>
        <div className="running-timer__elapsed">{formatElapsed(elapsedMs)}</div>
      </div>
      <div className="running-timer__actions">
        <EckeButton surface="glass" type="button" emphasis="ghost" onClick={onDiscard} disabled={pending}>
          Verwerfen
        </EckeButton>
        <EckeButton surface="glass" type="button" emphasis="primary" onClick={onStop} disabled={pending}>
          {pending ? "Wird gespeichert…" : "Stoppen"}
        </EckeButton>
      </div>
    </EckeCard>
  );
}
