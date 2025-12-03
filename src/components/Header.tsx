"use client";

export function Header() {
  return (
    <header className="h-11 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-4 shrink-0">
      <h1 className="text-lg font-semibold text-neutral-100 tracking-tight">Node Banana</h1>
      <button
        className="w-6 h-6 rounded-full text-[10px] font-medium text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 flex items-center justify-center transition-colors"
        title="Help"
      >
        ?
      </button>
    </header>
  );
}
