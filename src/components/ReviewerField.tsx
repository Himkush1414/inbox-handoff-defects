"use client";
import { useEffect } from "react";

const REVIEWER_KEY = "handoff.reviewer";
const NAME_PATTERN = /^[\p{L}\p{N} ._'-]{1,64}$/u;

export function isValidReviewerName(name: string): boolean {
  return NAME_PATTERN.test(name.trim());
}

export default function ReviewerField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(REVIEWER_KEY);
      if (saved) onChange(saved);
    } catch {
      // localStorage unavailable (private mode, blocked storage) — fine, just no persistence.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(next: string) {
    onChange(next);
    try {
      window.localStorage.setItem(REVIEWER_KEY, next);
    } catch {
      // ignore
    }
  }

  return (
    <label className="reviewer-field">
      <span>Acting as</span>
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Your name"
        maxLength={64}
      />
    </label>
  );
}
