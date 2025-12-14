"use client";

export function Header() {
  return (
    <header className="h-11 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2">
        <img src="/banana_icon.png" alt="Banana" className="w-6 h-6" />
        <h1 className="text-2xl font-semibold text-neutral-100 tracking-tight">Node Banana</h1>
      </div>
      <a
        href="https://x.com/Mr_CryptoYT"
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        Made by Fdy
      </a>
    </header>
  );
}
