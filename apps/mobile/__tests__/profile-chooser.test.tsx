// @ts-nocheck — Test file with Jest mocks
//
// The chooser decides which of a person's two accounts a session uses, so the
// failure modes are worse than a normal modal's: dismissing it without a
// choice, or defaulting one silently, lands someone in a profile they never
// picked — with a different inbox and different deals than they expect.
//
// These pin the rules that keep that from happening, plus the one-time
// behaviour for people already signed in when the feature ships.
import React from "react";
import renderer, { act } from "react-test-renderer";

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockPathname = "/(tabs)/home";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

// The methods forward lazily rather than referencing the jest.fn()s directly.
// Babel hoists the imports below above these `const` declarations, so the
// factory runs while they're still uninitialized — capturing them by value
// would bind `undefined`, and every router assertion would silently see zero
// calls. `usePathname` already worked only because its arrow body defers.
jest.mock("expo-router", () => ({
  router: {
    push: (...args) => mockPush(...args),
    replace: (...args) => mockReplace(...args),
  },
  usePathname: () => mockPathname,
}));

jest.mock("expo-linear-gradient", () => {
  const { View } = require("react-native");
  return { LinearGradient: (props) => <View {...props} /> };
});

const mockSetModeExplicitly = jest.fn(() => Promise.resolve());
const mockRememberChoice = jest.fn(() => Promise.resolve());
let mockMode = { mode: "buyer", hasRememberedChoice: false, isLoading: false };
let mockApi = { isAuthenticated: true };

jest.mock("@/contexts/ModeContext", () => ({
  useMode: () => ({
    ...mockMode,
    setModeExplicitly: mockSetModeExplicitly,
    rememberChoice: mockRememberChoice,
  }),
}));

jest.mock("@/contexts/ApiContext", () => ({
  useApi: () => mockApi,
}));

jest.mock("@/constants/featureFlags", () => ({
  get NEW_SIGNIN_CHOOSER() {
    return mockFlag;
  },
}));
let mockFlag = true;

import ProfileGate from "@/components/auth/ProfileGate";
import ProfileChooser from "@/components/auth/ProfileChooser";

function render(element) {
  let tree;
  act(() => {
    tree = renderer.create(element);
  });
  return tree;
}

/** Find a pressable by its accessibilityLabel. */
function pressableFor(tree, label) {
  return tree.root
    .findAll(
      (node) =>
        typeof node.type !== "string" &&
        node.props?.accessibilityLabel === label &&
        typeof node.props?.onPress === "function"
    )
    .concat(
      tree.root.findAll(
        (node) =>
          node.props?.accessibilityLabel === label &&
          typeof node.props?.onPress === "function"
      )
    )[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFlag = true;
  mockPathname = "/(tabs)/home";
  mockMode = { mode: "buyer", hasRememberedChoice: false, isLoading: false };
  mockApi = { isAuthenticated: true };
});

describe("ProfileChooser", () => {
  it("keeps Continue disabled until a profile is picked", () => {
    const onConfirm = jest.fn();
    const tree = render(<ProfileChooser visible onConfirm={onConfirm} />);

    const cta = pressableFor(tree, null) || null;
    // Press every button-role node; none should confirm while nothing is chosen.
    tree.root
      .findAll((n) => n.props?.accessibilityRole === "button")
      .forEach((n) => {
        act(() => n.props.onPress?.());
      });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms the chosen profile and the remember preference", () => {
    const onConfirm = jest.fn();
    const tree = render(<ProfileChooser visible onConfirm={onConfirm} />);

    act(() => pressableFor(tree, "Seller. List & manage").props.onPress());
    act(() => pressableFor(tree, "Remember on this device").props.onPress());
    act(() =>
      tree.root
        .find((n) => n.props?.accessibilityRole === "button")
        .props.onPress()
    );

    expect(onConfirm).toHaveBeenCalledWith("seller", true);
  });

  it("defaults remember to off, so a choice is per-session unless asked", () => {
    const onConfirm = jest.fn();
    const tree = render(<ProfileChooser visible onConfirm={onConfirm} />);

    act(() => pressableFor(tree, "Buyer. Rent or buy").props.onPress());
    act(() =>
      tree.root
        .find((n) => n.props?.accessibilityRole === "button")
        .props.onPress()
    );

    expect(onConfirm).toHaveBeenCalledWith("buyer", false);
  });
});

describe("ProfileGate visibility", () => {
  it("asks when authenticated with no remembered choice", () => {
    const tree = render(<ProfileGate />);
    expect(tree.toJSON()).not.toBeNull();
  });

  it("stays out of the way once a choice is remembered", () => {
    mockMode = { ...mockMode, hasRememberedChoice: true };
    expect(render(<ProfileGate />).toJSON()).toBeNull();
  });

  it("never appears for a signed-out user", () => {
    mockApi = { isAuthenticated: false };
    expect(render(<ProfileGate />).toJSON()).toBeNull();
  });

  it("waits rather than flashing while storage is still being read", () => {
    // undefined means "we don't know yet" — showing now would ask someone who
    // has already chosen.
    mockMode = { ...mockMode, hasRememberedChoice: undefined };
    expect(render(<ProfileGate />).toJSON()).toBeNull();
  });

  it("disappears entirely when the feature flag is off", () => {
    mockFlag = false;
    expect(render(<ProfileGate />).toJSON()).toBeNull();
  });
});

describe("ProfileGate confirmation", () => {
  it("switches profile, records the preference, and routes to the matching root", async () => {
    const tree = render(<ProfileGate />);

    act(() => pressableFor(tree, "Seller. List & manage").props.onPress());
    await act(async () => {
      tree.root
        .find((n) => n.props?.accessibilityRole === "button")
        .props.onPress();
    });

    expect(mockSetModeExplicitly).toHaveBeenCalledWith("seller");
    expect(mockRememberChoice).toHaveBeenCalledWith(false);
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/activity");
  });

  it("routes a buyer to home", async () => {
    const tree = render(<ProfileGate />);

    act(() => pressableFor(tree, "Buyer. Rent or buy").props.onPress());
    await act(async () => {
      tree.root
        .find((n) => n.props?.accessibilityRole === "button")
        .props.onPress();
    });

    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/home");
  });

  it("does not yank someone out of wallet setup", async () => {
    // Signup routes into wallet-setup, which owns its own multi-step flow.
    mockPathname = "/wallet-setup";
    const tree = render(<ProfileGate />);

    act(() => pressableFor(tree, "Buyer. Rent or buy").props.onPress());
    await act(async () => {
      tree.root
        .find((n) => n.props?.accessibilityRole === "button")
        .props.onPress();
    });

    expect(mockSetModeExplicitly).toHaveBeenCalledWith("buyer");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("stays open when the profile switch fails", async () => {
    // Dismissing here would leave the app showing one profile while the token
    // still points at the other.
    mockSetModeExplicitly.mockRejectedValueOnce(new Error("network down"));
    const tree = render(<ProfileGate />);

    act(() => pressableFor(tree, "Seller. List & manage").props.onPress());
    await act(async () => {
      tree.root
        .find((n) => n.props?.accessibilityRole === "button")
        .props.onPress();
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockRememberChoice).not.toHaveBeenCalled();
    expect(tree.toJSON()).not.toBeNull();
  });
});
