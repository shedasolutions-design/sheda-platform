import { createContext, useContext, useEffect } from "react";
import { PEOPLE, type Person } from "./people";

/**
 * Who the app is being used as.
 *
 * Sheda Collections has two sides that barely overlap. A buyer browses
 * raises, picks a flat and claims rent. A builder opens raises, asks for a
 * phase to be signed off and manages the stake backing their promises. The
 * same screens would serve neither of them well, so the navigation changes
 * with the role rather than hiding half the app behind empty states.
 *
 * While there is no wallet this is a switch in the header, which is also how
 * the whole product can be reviewed without four test accounts. Once sign in
 * lands the role comes from what the connected account actually is, and the
 * switch becomes a role picker only for an account that is both.
 */
export type Role = "buyer" | "builder";

export interface RoleState {
  role: Role;
  setRole: (role: Role) => void;
  /** The profile a builder is acting as. Null while browsing as a buyer. */
  actingAs: Person | null;
}

/** The builder whose side of the product the preview shows. */
export const PREVIEW_BUILDER_ID = "minimalist";

export const previewBuilder = (): Person =>
  PEOPLE.find((p) => p.id === PREVIEW_BUILDER_ID) as Person;

export const RoleContext = createContext<RoleState>({
  role: "buyer",
  setRole: () => {},
  actingAs: null,
});

export const useRole = () => useContext(RoleContext);

/**
 * The builder whose side is being shown, flipping the role if the screen
 * was opened directly.
 *
 * A link straight to /raises is a real way to arrive, on the web
 * especially, and without this the screen would render nothing at all
 * while the tab bar still showed the buyer's tabs. Arriving at a builder
 * screen is itself the request to be on the builder side.
 */
export function useActingBuilder(): Person {
  const { role, setRole } = useRole();
  useEffect(() => {
    if (role !== "builder") setRole("builder");
  }, [role, setRole]);
  return previewBuilder();
}

export const ROLE_LABEL: Record<Role, string> = {
  buyer: "Buyer",
  builder: "Builder",
};
