"use client";

import React from "react";

export function KiteLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#F04438" />
      <path d="M16 6L25 15L16 24L7 15L16 6Z" fill="white" />
      <path d="M16 11L21 16L16 21L11 16L16 11Z" fill="#F04438" />
    </svg>
  );
}

export function UpstoxLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#7C3AED" />
      <path d="M10 9V17C10 20.3137 12.6863 23 16 23C19.3137 23 22 20.3137 22 17V9H18.5V17C18.5 18.3807 17.3807 19.5 16 19.5C14.6193 19.5 13.5 18.3807 13.5 17V9H10Z" fill="white" />
    </svg>
  );
}

export function KotakNeoLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#E11D48" />
      <path d="M9 23V9L16 16V9L23 16V23L16 16V23L9 23Z" fill="white" />
    </svg>
  );
}

export function AngelOneLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#EA580C" />
      <path d="M16 7L24 23H19.5L16 15.5L12.5 23H8L16 7Z" fill="white" />
      <circle cx="16" cy="18" r="2.5" fill="#38BDF8" />
    </svg>
  );
}

export function GrowwLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#00D09C" />
      <path d="M8 22L14 15L18 19L24 10" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 10H24V15" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ICICIDirectLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#003874" />
      <path d="M8 9H14V23H8V9Z" fill="#F37023" />
      <path d="M16 9H24C26.2091 9 28 10.7909 28 13V19C28 21.2091 26.2091 23 24 23H16V9Z" fill="white" />
    </svg>
  );
}

export function DhanLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#059669" />
      <path d="M10 8H16C19.866 8 23 11.134 23 15C23 18.866 19.866 22 16 22H10V8Z" fill="white" />
      <path d="M14 12H16C17.6569 12 19 13.3431 19 15C19 16.6569 17.6569 18 16 18H14V12Z" fill="#059669" />
    </svg>
  );
}

export function FivePaisaLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#1E293B" />
      <path d="M10 9H22V13H14V16H22V23H10V19H18V16H10V9Z" fill="#F59E0B" />
    </svg>
  );
}

export function YahooFinanceLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#6001D2" />
      <path d="M9 8L15 17V24H18V17L24 8H20.2L16.5 14.5L12.8 8H9Z" fill="white" />
    </svg>
  );
}

export function BrokerLogo({ brokerKey, className = "h-4 w-4" }: { brokerKey: string; className?: string }) {
  const key = (brokerKey || "").toLowerCase();
  if (key === "kite") return <KiteLogo className={className} />;
  if (key === "upstox") return <UpstoxLogo className={className} />;
  if (key === "kotak_neo" || key === "kotak") return <KotakNeoLogo className={className} />;
  if (key === "angel") return <AngelOneLogo className={className} />;
  if (key === "groww") return <GrowwLogo className={className} />;
  if (key === "icici") return <ICICIDirectLogo className={className} />;
  if (key === "dhan") return <DhanLogo className={className} />;
  if (key === "fivepaisa") return <FivePaisaLogo className={className} />;
  if (key === "yfinance") return <YahooFinanceLogo className={className} />;

  return (
    <div className={`rounded bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px] ${className}`}>
      {key.slice(0, 2).toUpperCase()}
    </div>
  );
}
