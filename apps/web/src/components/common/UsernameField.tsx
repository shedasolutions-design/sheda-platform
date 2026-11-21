"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import TextField from "@/components/ui/TextField";
import Spinner from "@/components/ui/Spinner";
import apiService from "@/services/api";

export type UsernameStatus = "idle" | "checking" | "ok" | "bad";

/**
 * A username box that checks as you type and suggests free ones.
 *
 * Suggestions come from `name` (the full name being typed beside it). Until
 * the person types a username of their own, the best free suggestion is
 * filled in for them; after that their choice is left alone and suggestions
 * only appear as chips. The rules themselves live on the server
 * (app/services/usernames.py), which this asks.
 */
export default function UsernameField({
  value,
  onChange,
  name = "",
  currentUsername,
  onStatus,
  autoFill = true,
}: {
  value: string;
  onChange: (username: string) => void;
  name?: string;
  /** The username already saved: shown as fine without asking. */
  currentUsername?: string | null;
  onStatus?: (status: UsernameStatus) => void;
  /** Fill the box from the name until the person types (sign-up). Off when editing a saved profile. */
  autoFill?: boolean;
}) {
  const [status, setStatus] = useState<UsernameStatus>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // Typed by the person (not filled in from the name).
  const [ownChoice, setOwnChoice] = useState(Boolean(value));
  const seq = useRef(0);

  const report = (s: UsernameStatus) => {
    setStatus(s);
    onStatus?.(s);
  };

  // Suggest from the name; fill the box while it isn't the person's own.
  useEffect(() => {
    const words = name.trim();
    if (words.length < 2) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const res = await apiService.checkUsername("", words).catch(() => null);
      if (mine !== seq.current || !res?.ok || !res.data) return;
      setSuggestions(res.data.suggestions);
      if (autoFill && !ownChoice && res.data.suggestions[0]) {
        onChange(res.data.suggestions[0]);
        setProblem(null);
        report("ok");
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  // Check what's in the box when the person types it.
  useEffect(() => {
    if (!ownChoice) return;
    const wanted = value.trim().replace(/^@/, "").toLowerCase();
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      if (!wanted || (currentUsername && wanted === currentUsername.toLowerCase())) {
        setProblem(null);
        return report(wanted ? "ok" : "idle");
      }
      report("checking");
      const res = await apiService.checkUsername(wanted, name.trim()).catch(() => null);
      if (mine !== seq.current) return;
      if (!res?.ok || !res.data) {
        setProblem("Couldn't check right now.");
        return report("bad");
      }
      if (res.data.available) {
        setProblem(null);
        report("ok");
      } else {
        setProblem(res.data.problem);
        if (res.data.suggestions.length) setSuggestions(res.data.suggestions);
        report("bad");
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ownChoice]);

  const pick = (s: string) => {
    setOwnChoice(true);
    onChange(s);
  };

  return (
    <div>
      <TextField
        label="Username"
        placeholder="e.g. ada.obi"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={21}
        value={value}
        onChange={(e) => {
          setOwnChoice(true);
          onChange(e.target.value.replace(/\s/g, "").toLowerCase());
        }}
        leading={<span className="text-secondaryText">@</span>}
        hint={
          status === "checking" ? (
            <span className="inline-flex items-center gap-1 text-secondaryText">
              <Spinner size={12} /> Checking…
            </span>
          ) : status === "ok" && value ? (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <Check size={14} /> @{value.replace(/^@/, "")} is yours if you want it
            </span>
          ) : status === "bad" && problem ? (
            <span className="inline-flex items-center gap-1 text-red-600">
              <X size={14} /> {problem}
            </span>
          ) : (
            <span className="text-secondaryText">Letters, numbers, dots and underscores. You can sign in with it too.</span>
          )
        }
      />
      {suggestions.filter((s) => s !== value).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2" aria-label="Suggested usernames">
          {suggestions
            .filter((s) => s !== value)
            .map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => pick(s)}
                className="rounded-full border border-borderColor px-3 py-1 text-xs text-primaryText hover:border-primary hover:bg-primaryLight"
              >
                @{s}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
