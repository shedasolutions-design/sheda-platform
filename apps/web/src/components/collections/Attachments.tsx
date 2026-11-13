"use client";

/* eslint-disable @next/next/no-img-element -- uploaded photos come from arbitrary hosts */
import { useRef, useState } from "react";
import { ExternalLink, FileText, ImagePlus, Upload } from "lucide-react";
import Spinner from "@/components/ui/Spinner";
import { useApi } from "@/contexts/ApiContext";
import { fileToAsset } from "@/lib/files";
import type { CollectionDocumentStatus } from "@/services/api";

/**
 * Photos and documents for a raise or a builder/manager profile.
 *
 * Investors decide on what they can read, so every document that exists is
 * openable, and its check status is shown next to it: "Verified by Sheda"
 * only when Sheda checked it, "Not yet checked" when the owner uploaded it.
 */

export interface AttachedDocument {
  id: number;
  label: string;
  status: CollectionDocumentStatus;
  file_url?: string | null;
  verified_at?: string | null;
}

const STATUS_TEXT: Record<CollectionDocumentStatus, string> = {
  verified: "Verified by Sheda",
  uploaded: "Not yet checked",
  missing: "Missing",
};
const STATUS_CLASS: Record<CollectionDocumentStatus, string> = {
  verified: "bg-green-50 text-green-800",
  uploaded: "bg-amber-50 text-amber-800",
  missing: "bg-red-50 text-red-800",
};

const fileUrlOf = (uploaded: unknown): string | undefined => {
  if (typeof uploaded === "string") return uploaded;
  const u = uploaded as { file_url?: string; data?: { file_url?: string } } | null;
  return u?.file_url ?? u?.data?.file_url;
};
const isPdf = (url?: string | null) => !!url && /\.pdf($|\?)/i.test(url);

/** Photos in a swipeable row; each opens full size. */
export function PhotoGallery({ urls, alt }: { urls: string[]; alt: string }) {
  if (!urls.length) return null;
  return (
    <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
      {urls.map((u, i) => (
        <a key={u + i} href={u} target="_blank" rel="noreferrer" className="shrink-0 snap-start">
          <img
            src={u}
            alt={`${alt}, photo ${i + 1}`}
            loading={i === 0 ? "eager" : "lazy"}
            className={`rounded-xl object-cover ${i === 0 ? "h-52 w-80" : "h-52 w-64"}`}
          />
        </a>
      ))}
    </div>
  );
}

/** Each document, its check status, and a link to open it. */
export function DocumentList({ documents, empty }: { documents: AttachedDocument[]; empty?: string }) {
  if (!documents.length) {
    return empty ? <p className="text-sm text-secondaryText">{empty}</p> : null;
  }
  return (
    <ul className="divide-y divide-borderColor overflow-hidden rounded-xl border border-borderColor bg-white">
      {documents.map((d) => {
        const body = (
          <>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cardBackground text-primary">
              {d.file_url && !isPdf(d.file_url) ? (
                <img src={d.file_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
              ) : (
                <FileText size={20} aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-black">{d.label}</span>
              <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[d.status]}`}>
                {STATUS_TEXT[d.status]}
              </span>
            </span>
            {d.file_url ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                Open <ExternalLink size={14} aria-hidden="true" />
              </span>
            ) : null}
          </>
        );
        return (
          <li key={d.id}>
            {d.file_url ? (
              <a href={d.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-3 py-3 hover:bg-cardBackground">
                {body}
              </a>
            ) : (
              <div className="flex items-center gap-3 px-3 py-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The owner's uploader: choose what the document is, pick the file (PDF or
 * photo, up to 10 MB), and it is stored and attached. It lands as "Not yet
 * checked"; only Sheda can mark it verified.
 */
export function DocumentUploader({
  kinds,
  onAttach,
}: {
  kinds: string[];
  onAttach: (label: string, fileUrl: string) => Promise<string | null>;
}) {
  const { uploadFile } = useApi();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState(kinds[0] ?? "Other");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const label = kind === "Other" ? custom.trim() : kind;

  const onFile = async (file?: File) => {
    if (!file) return;
    setNote(null);
    if (!/^(application\/pdf|image\/)/.test(file.type)) {
      setNote({ ok: false, text: "Choose a PDF or a photo." });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setNote({ ok: false, text: "Files can be up to 10 MB." });
      return;
    }
    if (!label) {
      setNote({ ok: false, text: "Say what the document is first." });
      return;
    }
    setBusy(true);
    const asset = fileToAsset(file);
    try {
      const url = fileUrlOf(await uploadFile("property", asset));
      if (!url) throw new Error("The upload did not return a link.");
      const err = await onAttach(label, url);
      if (err) setNote({ ok: false, text: err });
      else {
        setNote({ ok: true, text: `${label} added. Sheda will check it.` });
        setCustom("");
      }
    } catch (e: any) {
      setNote({ ok: false, text: e?.message || "The file could not be uploaded. Please try again." });
    } finally {
      URL.revokeObjectURL(asset.uri);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-borderColor bg-cardBackground/50 p-3">
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="doc-kind">What is it?</label>
        <select
          id="doc-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="h-10 min-w-0 flex-1 rounded-lg border border-borderColor bg-white px-2 text-sm"
        >
          {[...kinds.filter((k) => k !== "Other"), "Other"].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        {kind === "Other" ? (
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            maxLength={120}
            placeholder="Name the document"
            className="h-10 min-w-0 flex-1 rounded-lg border border-borderColor bg-white px-2 text-sm"
          />
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (input.current) {
            input.current.value = "";
            input.current.click();
          }
        }}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? <Spinner size={16} className="text-white" /> : <Upload size={16} aria-hidden="true" />}
        {busy ? "Uploading..." : "Upload a PDF or photo"}
      </button>
      {note ? <p className={`text-xs ${note.ok ? "text-green-700" : "text-red-700"}`}>{note.text}</p> : null}
    </div>
  );
}

/** The owner's "add photos" button: uploads each and attaches it. */
export function PhotoAdder({ onAttach }: { onAttach: (urls: string[]) => Promise<string | null> }) {
  const { uploadFile } = useApi();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const onFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/")).slice(0, 10);
    if (!files.length) return;
    setNote(null);
    const urls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      setBusy(`Uploading ${i + 1} of ${files.length}...`);
      const asset = fileToAsset(files[i]);
      try {
        const url = fileUrlOf(await uploadFile("property", asset));
        if (url) urls.push(url);
      } catch {
        /* reported below as a count */
      } finally {
        URL.revokeObjectURL(asset.uri);
      }
    }
    const err = urls.length ? await onAttach(urls) : "None of the photos uploaded. Please try again.";
    setBusy(null);
    setNote(err ?? (urls.length < files.length ? `${files.length - urls.length} photo(s) failed to upload.` : null));
  };

  return (
    <div>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      <button
        type="button"
        disabled={!!busy}
        onClick={() => {
          if (input.current) {
            input.current.value = "";
            input.current.click();
          }
        }}
        className="flex h-10 items-center gap-2 rounded-lg border border-borderColor bg-white px-3 text-sm font-semibold text-black disabled:opacity-60"
      >
        {busy ? <Spinner size={16} /> : <ImagePlus size={16} aria-hidden="true" />}
        {busy ?? "Add photos"}
      </button>
      {note ? <p className="mt-1 text-xs text-red-700">{note}</p> : null}
    </div>
  );
}

/** A company logo or photo: shows the current one and replaces it on pick. */
export function LogoPicker({
  value,
  onChange,
  fallback,
}: {
  value: string | null;
  onChange: (url: string) => void;
  fallback: string;
}) {
  const { uploadFile } = useApi();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const onFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setNote("Choose an image.");
    if (file.size > 5 * 1024 * 1024) return setNote("Images can be up to 5 MB.");
    setBusy(true);
    setNote(null);
    const asset = fileToAsset(file);
    try {
      const url = fileUrlOf(await uploadFile("property", asset));
      if (!url) throw new Error("The upload did not return a link.");
      onChange(url);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "The image could not be uploaded.");
    } finally {
      URL.revokeObjectURL(asset.uri);
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100 text-sm font-semibold text-secondaryText">
        {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : fallback}
      </span>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="inline-flex items-center gap-2 rounded-xl border border-borderColor px-3 py-2 text-sm font-medium text-primaryText disabled:opacity-60"
      >
        {busy ? <Spinner size={14} /> : <ImagePlus size={14} aria-hidden="true" />}
        {value ? "Change logo" : "Add logo or photo"}
      </button>
      {note ? <p className="text-xs text-red-700">{note}</p> : null}
    </div>
  );
}
