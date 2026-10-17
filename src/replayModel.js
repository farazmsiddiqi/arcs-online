export function replayPresentation(position, seat, motion) {
  return {
    ...position,
    me: seat,
    _replay: motion,
    decision: { actor: null, title: "Read-only replay", choices: [] },
    interaction: null,
    resourceArrangement: null,
  };
}
export function turnDestination(frames, index, direction) {
  if (!frames.length || index < 0) return 0;
  if (direction > 0) {
    const next = frames.findIndex(
      (f, i) => i > index && f.turn !== frames[index].turn,
    );
    return next < 0 ? frames.length - 1 : next;
  }
  let i = index - 1;
  while (i > 0 && frames[i].turn === frames[index].turn) i--;
  return Math.max(0, i);
}
