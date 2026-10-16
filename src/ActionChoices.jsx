import { Sparkles } from "lucide-react";
import { ACTION_ICONS } from "./PlayChoices.jsx";
import { ACTION_HELP } from "./learning.js";
import RuleHelp from "./RuleHelp.jsx";
export default function ActionChoices({ choices, busy, onAction, game }) {
  return (
    <div className="action-rail" aria-label="Available actions">
      {choices.map((c) => {
        const Icon = ACTION_ICONS[c.action] ?? Sparkles;
        return (
          <div key={c.id} className="action-command">
            <button
              className="command-choice action-command-button"
              aria-label={c.label}
              disabled={busy}
              onClick={() => onAction(c)}
            >
              <Icon size={22} />
              <strong>
                {ACTION_HELP[c.action]?.title ?? c.label.split(" · ")[0]}
              </strong>
              <small>
                {c.cost === "pip"
                  ? "1 card pip"
                  : typeof c.cost === "number"
                    ? `Spend ${game.players[game.me].resources[c.cost]}`
                    : "Bonus action"}
              </small>
            </button>
            {ACTION_HELP[c.action] && <RuleHelp info={ACTION_HELP[c.action]} />}
          </div>
        );
      })}
    </div>
  );
}
