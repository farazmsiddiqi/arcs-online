import {
  Copy,
  ArrowUpRight,
  Orbit,
  Flag,
  ArrowRight,
  Hammer,
  Wrench,
  Navigation,
  Coins,
  Users,
  Crown,
  Swords,
} from "lucide-react";
import { cardImage } from "./Cards.jsx";
import { ACTION_HELP, playPreview } from "./learning.js";
import RuleHelp from "./RuleHelp.jsx";
export const ACTION_ICONS = {
  build: Hammer,
  repair: Wrench,
  move: Navigation,
  tax: Coins,
  influence: Users,
  secure: Crown,
  battle: Swords,
};
const MODE_ICONS = {
  copy: Copy,
  pivot: Orbit,
  surpass: ArrowUpRight,
  lead: Flag,
};
export default function PlayChoices({ choices, game, busy, onPlay }) {
  return (
    <div className="play-options" aria-label="Ways to play this card">
      {choices.map((c) => {
        const p = playPreview(c, game),
          Mode = MODE_ICONS[c.mode],
          art = c.mode === "copy" ? game.lead.id : c.card;
        return (
          <article
            className={`play-option suit-${p.suit}`}
            key={c.id}
            data-mode={c.mode}
          >
            <button
              className="command-choice play-decision"
              aria-label={c.label}
              disabled={busy}
              onClick={() => onPlay(c)}
            >
              <img className="play-art" src={cardImage(art)} alt="" />
              <span className="play-mode">
                <Mode size={21} />
                <strong>{p.title}</strong>
                <span className="play-pips">
                  <b>{p.pips}</b> {p.pips === 1 ? "action" : "actions"}
                </span>
              </span>
              <span className="play-subtitle">
                {p.subtitle}
                <ArrowRight size={14} />
              </span>
              <span className="choice-consequence play-consequence">
                {p.summary}
              </span>
            </button>
            <RuleHelp
              className="mode-help"
              info={p}
              label={`What is ${p.title}?`}
            />
            <div
              className="play-action-menu"
              aria-label={`${p.title} action reference`}
            >
              <span>{p.pips === 1 ? "Choose one" : "Mix & repeat"}</span>
              {p.actions.map((a) => {
                const Icon = ACTION_ICONS[a];
                return (
                  <RuleHelp
                    key={a}
                    info={ACTION_HELP[a]}
                    className="action-chip"
                  >
                    <Icon size={13} />
                    {ACTION_HELP[a].title}
                  </RuleHelp>
                );
              })}
            </div>
          </article>
        );
      })}
    </div>
  );
}
