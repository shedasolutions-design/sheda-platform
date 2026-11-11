"use client";

import { useId } from "react";
import { allNigeriaLocations } from "@/constants/locations";
import TextField from "./TextField";

/** Free-text location with suggestions from the Nigerian locations list. */
export default function LocationField({
  label = "Location",
  value,
  onChange,
  placeholder = "Search or type your location",
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const listId = useId();
  return (
    <>
      <TextField
        label={label}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      <datalist id={listId}>
        {allNigeriaLocations.map((o) => (
          <option key={String(o.value)} value={String(o.label)} />
        ))}
      </datalist>
    </>
  );
}
