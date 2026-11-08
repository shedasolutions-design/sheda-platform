// @ts-nocheck — Test file with Jest mocks
//
// Regression tests for the Google button feeling dead.
//
// The original shape was three bugs compounding:
//   1. Screens passed `isGoogleLoading || !isGoogleReady` to <Socials>, so the
//      button rendered a spinner before the user had touched anything.
//   2. <Socials> disabled itself on that same flag, so the tap never landed.
//   3. The handler ran `if (... || !isGoogleReady) return;`, silently dropping
//      any press that did land during the not-ready window.
//
// Net effect: a button that looked busy on arrival, ignored you, and never
// explained itself. These tests pin the fixed behaviour.

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { ActivityIndicator, TouchableOpacity } from "react-native";
import Socials from "@/components/Socials";

jest.mock("@/components/common/Icon", () => "Icon");
jest.mock("@/assets/icons", () => ({ GOOGLEICON: "google-icon" }));

describe("<Socials> — the button itself", () => {
  it("shows the Google icon, not a spinner, when idle", () => {
    let tree: any;
    act(() => {
      tree = TestRenderer.create(<Socials onGooglePress={() => {}} />);
    });
    // A spinner before any interaction is what made it read as "already busy".
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
  });

  it("is pressable when idle", () => {
    const onPress = jest.fn();
    let tree: any;
    act(() => {
      tree = TestRenderer.create(<Socials onGooglePress={onPress} />);
    });
    const btn = tree.root.findByType(TouchableOpacity);

    expect(btn.props.disabled).toBe(false);
    act(() => btn.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("shows a spinner and blocks re-entry only while genuinely signing in", () => {
    const onPress = jest.fn();
    let tree: any;
    act(() => {
      tree = TestRenderer.create(
        <Socials onGooglePress={onPress} isGoogleLoading />
      );
    });

    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(1);
    expect(tree.root.findByType(TouchableOpacity).props.disabled).toBe(true);
  });

  it("exposes busy state to assistive tech", () => {
    let tree: any;
    act(() => {
      tree = TestRenderer.create(
        <Socials onGooglePress={() => {}} isGoogleLoading />
      );
    });
    const btn = tree.root.findByType(TouchableOpacity);
    expect(btn.props.accessibilityState).toEqual({ disabled: false, busy: true });
    expect(btn.props.accessibilityRole).toBe("button");
  });

  it("gives the press a visible target and feedback", () => {
    let tree: any;
    act(() => {
      tree = TestRenderer.create(<Socials onGooglePress={() => {}} />);
    });
    const btn = tree.root.findByType(TouchableOpacity);
    // A missed tap near the icon's edge is indistinguishable from a dead
    // button, and no opacity change makes a slow start look like nothing
    // happened at all.
    expect(btn.props.hitSlop).toBeDefined();
    expect(btn.props.activeOpacity).toBeLessThan(1);
  });
});

// ── The hook's readiness handling ─────────────────────────────────────────
// signInWithGoogle() must WAIT for the auth request rather than reject or
// no-op, so a press that beats the hook is honoured instead of lost.

const mockPromptAsync = jest.fn();
let mockRequest: any = null;

jest.mock("expo-auth-session", () => ({
  makeRedirectUri: () => "https://example.test/google-auth",
  ResponseType: { IdToken: "id_token" },
  useAuthRequest: () => [mockRequest, null, mockPromptAsync],
}));
jest.mock("expo-crypto", () => ({ randomUUID: () => "test-nonce" }));
jest.mock("@/config/google", () => ({
  GOOGLE_WEB_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
}));

import { useGoogleAuth } from "@/hooks/useGoogleAuth";

function HookHarness({ onReady }: { onReady: (api: any) => void }) {
  const api = useGoogleAuth();
  onReady(api);
  return null;
}

describe("useGoogleAuth — a press is never dropped", () => {
  beforeEach(() => {
    mockPromptAsync.mockReset();
    mockRequest = null;
  });

  it("waits for the request instead of failing when pressed early", async () => {
    mockPromptAsync.mockResolvedValue({
      type: "success",
      params: { id_token: "the-token" },
    });

    let api: any;
    let tree: any;
    await act(async () => {
      tree = TestRenderer.create(
        <HookHarness onReady={(a) => (api = a)} />
      );
    });

    expect(api.isReady).toBe(false);

    // Press while the request is still building.
    let resolved: string | undefined;
    let rejected: any;
    const pending = api
      .signInWithGoogle()
      .then((t: string) => (resolved = t))
      .catch((e: any) => (rejected = e));

    // Nothing prompted yet, and crucially nothing thrown either — the old
    // code would have silently returned here and the tap would be gone.
    await act(async () => {});
    expect(mockPromptAsync).not.toHaveBeenCalled();
    expect(rejected).toBeUndefined();

    // The request finishes building; the waiting press now proceeds.
    mockRequest = { url: "https://accounts.google.com/..." };
    await act(async () => {
      tree.update(<HookHarness onReady={(a) => (api = a)} />);
    });
    await act(async () => {
      await pending;
    });

    expect(mockPromptAsync).toHaveBeenCalledTimes(1);
    expect(resolved).toBe("the-token");
    expect(rejected).toBeUndefined();
  });

  it("prompts immediately when already ready", async () => {
    mockRequest = { url: "https://accounts.google.com/..." };
    mockPromptAsync.mockResolvedValue({
      type: "success",
      params: { id_token: "tok" },
    });

    let api: any;
    await act(async () => {
      TestRenderer.create(<HookHarness onReady={(a) => (api = a)} />);
    });

    await act(async () => {
      await expect(api.signInWithGoogle()).resolves.toBe("tok");
    });
    expect(mockPromptAsync).toHaveBeenCalledTimes(1);
  });

  it("reports cancellation distinctly from failure", async () => {
    mockRequest = { url: "https://accounts.google.com/..." };
    mockPromptAsync.mockResolvedValue({ type: "cancel" });

    let api: any;
    await act(async () => {
      TestRenderer.create(<HookHarness onReady={(a) => (api = a)} />);
    });

    await act(async () => {
      await expect(api.signInWithGoogle()).rejects.toThrow(/cancelled/i);
    });
  });
});
