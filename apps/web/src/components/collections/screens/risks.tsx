"use client";

import { Stack } from "@/components/collections/nav";
import { INVEST_RISKS } from "@/services/collections/copy";

/**
 * Every risk of investing on Sheda, in one place, in plain words.
 *
 * Sheda is a decentralized marketplace: nobody can reverse a payment or
 * step in for a builder who fails. People should know that before they
 * put money in, not after.
 */
export default function Risks() {
  return (
    <>
      <Stack.Screen options={{ title: "Know the risks" }} />
      <div className="mx-auto max-w-2xl space-y-4 px-5 pb-10 pt-4">
        <p className="text-sm leading-relaxed text-secondaryText">
          Sheda is a decentralized marketplace. Your money is held by smart contracts on the blockchain, not by Sheda.
          That protects you from anyone running off with it, but it also means nobody can undo a payment for you.
          Read these before you invest.
        </p>
        <ol className="space-y-3">
          {INVEST_RISKS.map((r, i) => (
            <li key={r.title} className="rounded-2xl border border-borderColor p-4">
              <p className="font-semibold text-primaryText">
                {i + 1}. {r.title}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-secondaryText">{r.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
