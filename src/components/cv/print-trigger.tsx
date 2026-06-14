// src/app/cv-print/print-trigger.tsx
"use client";
import { useEffect } from "react";

/** Tiny client component that calls window.print() on mount. */
export function PrintTrigger() {
  useEffect(() => {
    window.print();
  }, []);
  return null;
}
