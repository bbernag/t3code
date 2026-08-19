export enum BubbleMenuPresence {
  Closed = "closed",
  Closing = "closing",
  Open = "open",
}

export function closeBubbleMenu(current: BubbleMenuPresence): BubbleMenuPresence {
  return current === BubbleMenuPresence.Open ? BubbleMenuPresence.Closing : current;
}

export function toggleBubbleMenu(current: BubbleMenuPresence): BubbleMenuPresence {
  return current === BubbleMenuPresence.Closed
    ? BubbleMenuPresence.Open
    : BubbleMenuPresence.Closing;
}
