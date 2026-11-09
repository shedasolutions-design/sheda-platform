import type { Holding } from "./vault";

/**
 * Holdings to look at before any wallet exists.
 *
 * The screens are the thing being reviewed, and an empty portfolio shows
 * none of what they do: no income, no vacancy, no unit still under
 * construction. So the demo carries one of each, and says on screen that it
 * is a demo, because a reviewer should never have to guess whether a number in
 * front of them is real.
 *
 * Every amount here is in atomic units, six decimals, exactly as the
 * stablecoin and `services/projects.ts` hold them. So ₦300,000 is written
 * 300000000000, not 300000. Getting that wrong is quiet and convincing: the
 * screen renders a tidy "₦14.2" of rent against an ₦18,000,000 flat and
 * nothing anywhere reports an error.
 *
 * The figures below reconcile rather than being picked to look plausible,
 * because a reviewer checking the arithmetic should find it holds:
 *
 *   gross rent, 3 months at ₦300,000       900,000
 *   manager 8%                              -72,000
 *   reserve 5%                              -45,000
 *   platform 1%                              -9,000
 *   to holders                              774,000
 *   held: 139 of 10,000 shares = 1.39%    ₦10,758.60
 *
 * and `acc_per_share` is that ₦774,000 spread over the supply the way the
 * contract spreads it, so `balance × acc_per_share ÷ 1e18` returns the same
 * claimable figure the vault would.
 *
 * `services/vault.ts` reads these same shapes off the chain. When a wallet
 * lands, this file is deleted and nothing else changes.
 */

export const DEMO_MODE = true;

const vault = (over: Partial<Holding["info"]> = {}): Holding["info"] => ({
  name: "M120 Apartments · Unit 1B",
  symbol: "M120-1B",
  marketplace: "market.shedauser.testnet",
  property_id: "13",
  stablecoin: "usdt.fakes.testnet",
  manager: "Lagos Property Co",
  total_supply: "10000",
  supply_frozen: true,
  manager_bps: 800,
  reserve_bps: 500,
  platform_bps: 100,
  reserve: "45000000000",
  acc_per_share: "77400000000000000000000000",
  last_accounted: "900000000000",
  custody: { Held: { token_id: "13" } },
  ...over,
});

export const DEMO_HOLDINGS: Holding[] = [
  {
    // Let, and paying. The ordinary case.
    vaultId: "unit-1b.m120.shedauser.testnet",
    info: vault(),
    balance: "139",
    claimable: "10758600000",
  },
  {
    // Earning nothing this month. Shown as plainly as the one that is,
    // because a quiet holding is the thing a portfolio screen most often
    // hides behind a total.
    vaultId: "unit-4.yaba.shedauser.testnet",
    info: vault({
      name: "Yaba Hostel · Unit 4",
      symbol: "YABA-4",
      property_id: "21",
      manager: "Kayode Facilities",
      reserve: "0",
      acc_per_share: "0",
      last_accounted: "0",
    }),
    balance: "600",
    claimable: "0",
  },
  {
    // Bought into a raise that is still a building site.
    vaultId: "unit-2a.lekki.shedauser.testnet",
    info: vault({
      name: "Lekki Terraces · Unit 2A",
      symbol: "LEKKI-2A",
      property_id: "0",
      manager: "Lagos Property Co",
      reserve: "0",
      acc_per_share: "0",
      last_accounted: "0",
      custody: "AwaitingUnit",
    }),
    balance: "420",
    claimable: "0",
  },
];
