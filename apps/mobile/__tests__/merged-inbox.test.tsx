// @ts-nocheck — Test file with Jest mocks
//
// The inbox now shows conversations from both of a person's profiles at once.
// That fixes messages being invisible in the wrong profile, but it introduces
// a failure the split view never had: replying from the wrong identity. A
// reply sent as your buyer row to someone who messaged your seller row
// reaches them as a stranger.
//
// So: reads merge, writes stay bound to the thread. These pin that boundary,
// plus the labelling that makes a merged list readable at all.
import React from "react";
import renderer, { act } from "react-test-renderer";
import { Alert } from "react-native";

const mockPush = jest.fn();
let mockMode = "buyer";
const mockSetModeExplicitly = jest.fn(() => Promise.resolve());

jest.mock("expo-router", () => ({
  // Forwarded lazily: Babel hoists imports above the const declarations, so
  // capturing the jest.fn() by value here binds undefined.
  router: { push: (...args) => mockPush(...args) },
}));

jest.mock("@/contexts/ModeContext", () => ({
  useMode: () => ({
    mode: mockMode,
    setModeExplicitly: mockSetModeExplicitly,
  }),
}));

jest.mock("@/constants/images-icons", () => ({ PROFILE: 1 }));

import MessageCard from "@/components/inbox/MessageCard";

function render(props) {
  let tree;
  act(() => {
    tree = renderer.create(<MessageCard {...props} />);
  });
  return tree;
}

/** The card's outermost pressable. */
function press(tree) {
  const target = tree.root.findAll(
    (n) => typeof n.props?.onPress === "function"
  )[0];
  act(() => target.props.onPress());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMode = "buyer";
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  Alert.alert.mockRestore?.();
});

describe("profile labelling", () => {
  it("labels which profile a conversation belongs to", () => {
    const out = JSON.stringify(render({ asProfile: "seller" }).toJSON());
    expect(out).toContain("As seller");
  });

  it("labels a buyer-side conversation", () => {
    const out = JSON.stringify(render({ asProfile: "buyer" }).toJSON());
    expect(out).toContain("As buyer");
  });

  it("shows no chip for single-profile accounts", () => {
    // as_profile is omitted by the server unless the person has both, so a
    // chip on every row would be noise for everyone else.
    const out = JSON.stringify(render({}).toJSON());
    expect(out).not.toContain("As seller");
    expect(out).not.toContain("As buyer");
  });
});

describe("acting on a conversation", () => {
  it("opens directly when the thread matches the active profile", () => {
    mockMode = "buyer";
    press(render({ asProfile: "buyer", propertyId: "7", receiverId: "3" }));

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalled();
  });

  it("opens directly for a single-profile account", () => {
    press(render({ propertyId: "7", receiverId: "3" }));

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalled();
  });

  it("asks before opening a thread from the other profile", () => {
    // The whole point of the prompt: no silent switch, and no reply sent from
    // the wrong identity.
    mockMode = "buyer";
    press(render({ asProfile: "seller", propertyId: "7", receiverId: "3" }));

    expect(Alert.alert).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockSetModeExplicitly).not.toHaveBeenCalled();
  });

  it("switches then opens once the switch is confirmed", async () => {
    mockMode = "buyer";
    press(render({ asProfile: "seller", propertyId: "7", receiverId: "3" }));

    const confirm = Alert.alert.mock.calls[0][2].find(
      (b) => b.text !== "Cancel"
    );
    await act(async () => confirm.onPress());

    expect(mockSetModeExplicitly).toHaveBeenCalledWith("seller");
    expect(mockPush).toHaveBeenCalled();
  });

  it("does not open the thread when the switch fails", async () => {
    // Opening anyway would put the user in a thread the token can't act on.
    mockSetModeExplicitly.mockRejectedValueOnce(new Error("offline"));
    mockMode = "buyer";
    press(render({ asProfile: "seller", propertyId: "7", receiverId: "3" }));

    const confirm = Alert.alert.mock.calls[0][2].find(
      (b) => b.text !== "Cancel"
    );
    await act(async () => confirm.onPress());

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("stays put when the switch is declined", () => {
    mockMode = "seller";
    press(render({ asProfile: "buyer", propertyId: "7", receiverId: "3" }));

    const cancel = Alert.alert.mock.calls[0][2].find(
      (b) => b.text === "Cancel"
    );
    expect(cancel).toBeDefined();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockSetModeExplicitly).not.toHaveBeenCalled();
  });
});
