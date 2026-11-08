// @ts-nocheck — Test file with Jest mocks
//
// Two error messages were actively misleading users.
//
// A contract panic reached the screen with the RPC's JSON envelope still
// attached — `Underflow in staged cancel refund"}}}}` — and "Requires attached
// deposit" was reported as "Insufficient NEAR balance", telling someone to top
// up an account that was already funded for a problem topping up cannot fix.

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

import nearContractService from "@/services/nearContract";
const parse = (raw: string) =>
  (nearContractService.constructor as any).parseContractError(raw);

describe("panic messages reaching the user", () => {
  it("strips the JSON envelope off a panic", () => {
    const raw =
      'Smart contract panicked: Property is not for sale"}}}}';
    const out = parse(raw);
    expect(out).not.toMatch(/[}"\]]$/);
    expect(out).toBe("Property is not for sale");
  });

  it("explains an arithmetic underflow instead of showing it raw", () => {
    const raw =
      'Smart contract panicked: Underflow in staged cancel refund"}}}}';
    const out = parse(raw);

    // "Underflow" is contract-internals vocabulary; it tells the user nothing
    // about what to do and reads like data loss.
    expect(out).not.toMatch(/underflow/i);
    // The reassurance that matters most when a money operation fails.
    expect(out).toMatch(/funds are still held safely/i);
    // Retrying will not help, so it must not read like a transient glitch.
    expect(out).toMatch(/contract-side fix/i);
  });

  it("handles an overflow the same way", () => {
    const out = parse('Smart contract panicked: Overflow in escrow total"}}');
    expect(out).toMatch(/escrow accounting/i);
  });

  it("leaves an ordinary panic message intact", () => {
    // Most panics are already user-readable and should not be reworded.
    expect(parse("Smart contract panicked: Bid already accepted")).toBe(
      "Bid already accepted"
    );
  });
});

describe("attached deposit vs empty wallet", () => {
  it("does not blame the user's balance for a missing deposit", () => {
    const out = parse(
      "Requires attached deposit of exactly 1 yoctoNEAR"
    );
    // Telling someone to add NEAR for this is a dead end — the method is
    // payable and the app sent too little. Topping up changes nothing.
    expect(out).not.toMatch(/balance is too low/i);
    expect(out).toMatch(/didn't send enough/i);
    expect(out).toMatch(/funds are untouched/i);
  });

  it("still reports a genuinely low balance as such", () => {
    const out = parse("NotEnoughBalance: account has insufficient funds");
    expect(out).toMatch(/balance is too low/i);
    // And says what would actually help.
    expect(out).toMatch(/add a little near/i);
  });

  it("checks the deposit case before the balance case", () => {
    // Both substrings can appear in one RPC error; the deposit reading is the
    // more specific and must win.
    const out = parse(
      "NotEnoughBalance ... Requires attached deposit of exactly 1 yoctoNEAR"
    );
    expect(out).toMatch(/didn't send enough/i);
  });
});
