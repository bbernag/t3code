import { describe, expect, it } from "vite-plus/test";

import {
  BubbleMenuPresence,
  closeBubbleMenu,
  toggleBubbleMenu,
} from "./recentThreadsBubbleMenuState";

describe("recent chats bubble menu state", () => {
  it("opens a closed menu and closes an open menu", () => {
    expect(toggleBubbleMenu(BubbleMenuPresence.Closed)).toBe(BubbleMenuPresence.Open);
    expect(toggleBubbleMenu(BubbleMenuPresence.Open)).toBe(BubbleMenuPresence.Closing);
  });

  it("stays closing when Android dispatches the backdrop and bubble handlers", () => {
    const afterBackdropPress = closeBubbleMenu(BubbleMenuPresence.Open);

    expect(toggleBubbleMenu(afterBackdropPress)).toBe(BubbleMenuPresence.Closing);
  });
});
