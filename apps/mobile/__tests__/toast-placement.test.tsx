// @ts-nocheck — Test file with Jest mocks
//
// The status banner sat at the bottom, anchored to insets.bottom — the system
// gesture inset, NOT the app's tab bar. So during a transaction it covered
// Home / Saved / History / Inbox / Portfolio, and an on-chain write can run
// for half a minute.
//
// Two things compounded it. The outcome auto-dismissed after 3s, so after a
// long wait the user had usually looked away and saw nothing, and a static
// message for 30s is indistinguishable from a frozen app.

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { ActivityIndicator, TouchableOpacity } from "react-native";

const mockToast = { current: null as any };
const mockDismiss = jest.fn();

jest.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ toast: mockToast.current, dismissToast: mockDismiss }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));
jest.mock("lucide-react-native", () => ({
  CheckCircle2: "CheckCircle2",
  XCircle: "XCircle",
}));

import Toast from "@/components/common/Toast";

const render = () => {
  let tree: any;
  act(() => {
    tree = TestRenderer.create(<Toast />);
  });
  return tree;
};

beforeEach(() => {
  mockToast.current = null;
  mockDismiss.mockClear();
});

describe("placement", () => {
  it("anchors to the top, clear of the tab bar", () => {
    mockToast.current = { id: "t1", type: "loading", message: "Cancelling deal..." };
    const tree = render();

    // Animated.View hands back a nested style structure rather than a flat
    // array, so flatten whatever shape it is before asserting.
    const flatten = (style: any): any[] =>
      Array.isArray(style) ? style.flatMap(flatten) : style ? [style] : [];
    const merged = Object.assign(
      {},
      ...flatten(tree.root.findAllByType("View")[0].props.style)
    );

    // The whole point: positioned from the top, never the bottom.
    expect(merged.top).toBe(52); // insets.top (44) + 8
    expect(merged.bottom).toBeUndefined();
  });

  it("lets touches through everywhere except the banner", () => {
    mockToast.current = { id: "t1", type: "loading", message: "Working..." };
    const tree = render();
    // box-none keeps the screen behind usable while a transaction runs.
    expect(tree.root.findAllByType("View")[0].props.pointerEvents).toBe("box-none");
  });

  it("renders nothing when idle", () => {
    mockToast.current = null;
    const tree = render();
    expect(tree.toJSON()).toBeNull();
  });
});

describe("long-running operations", () => {
  it("shows a spinner while loading", () => {
    mockToast.current = { id: "t1", type: "loading", message: "Cancelling deal..." };
    const tree = render();
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(1);
  });

  it("explains itself once the wait stops being brief", () => {
    jest.useFakeTimers();
    mockToast.current = { id: "t1", type: "loading", message: "Cancelling deal..." };
    const tree = render();

    // Nothing extra at first — a short wait needs no explanation.
    expect(JSON.stringify(tree.toJSON())).not.toContain("Still working");

    act(() => {
      jest.advanceTimersByTime(8000);
    });

    // A static message held for 30s reads as a hung app; a counter says the
    // app is alive without pretending to know more than it does.
    expect(JSON.stringify(tree.toJSON())).toContain("Still working");
    jest.useRealTimers();
  });
});

describe("dismissal", () => {
  it("can be tapped away once it has an outcome", () => {
    mockToast.current = { id: "t1", type: "success", message: "Deal cancelled." };
    const tree = render();

    act(() => tree.root.findByType(TouchableOpacity).props.onPress());
    expect(mockDismiss).toHaveBeenCalledWith("t1");
  });

  it("cannot be tapped away while still loading", () => {
    // Dismissing it would remove the only sign the work is still running.
    mockToast.current = { id: "t1", type: "loading", message: "Working..." };
    const tree = render();

    act(() => tree.root.findByType(TouchableOpacity).props.onPress());
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  it("tells the user it is dismissible", () => {
    mockToast.current = { id: "t1", type: "success", message: "Done." };
    const tree = render();
    expect(JSON.stringify(tree.toJSON())).toContain("Tap to dismiss");
  });
});

describe("outcome visibility window", () => {
  it("keeps an outcome on screen long enough to be seen after a long wait", () => {
    // Read from the context rather than duplicating the numbers, so this fails
    // if someone shortens them back toward the original 3s.
    const src = require("fs").readFileSync("contexts/ToastContext.tsx", "utf8");
    const success = Number(/success:\s*(\d+)/.exec(src)?.[1]);
    const error = Number(/error:\s*(\d+)/.exec(src)?.[1]);

    expect(success).toBeGreaterThanOrEqual(5000);
    // Errors usually carry something to act on, so they outlast successes.
    expect(error).toBeGreaterThan(success);
  });
});
