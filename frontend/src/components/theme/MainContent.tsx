"use client";

import { memo } from "react";

/** Memoized shell so theme toggles don't re-render the full page tree. */
export const MainContent = memo(function MainContent({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex-1 lg:ml-64 min-h-screen bg-background pt-14 lg:pt-0 pb-20 lg:pb-0">
      {children}
    </main>
  );
});

