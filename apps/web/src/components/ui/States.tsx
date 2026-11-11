"use client";

import type { ReactNode } from "react";
import { AlertCircle, Inbox } from "lucide-react";
import Button from "./Button";
import Spinner from "./Spinner";

export function LoadingState({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-secondaryText">
      <Spinner size={32} />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function EmptyState({
  title,
  message,
  icon,
  action,
}: {
  title: string;
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 text-secondaryText">{icon ?? <Inbox size={40} />}</div>
      <p className="font-semibold">{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-secondaryText">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <AlertCircle size={40} className="mb-3 text-primary" />
      <p className="font-semibold">Something went wrong</p>
      <p className="mt-1 max-w-sm text-sm text-secondaryText">{message}</p>
      {onRetry && (
        <Button className="mt-5" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function InlineError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-active px-3 py-2 text-sm text-primary">
      {message}
    </p>
  );
}
