import { Camera, Search } from "lucide-react";
import type { FormEvent } from "react";
import { Input } from "@/components/ui/input";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  placeholder?: string;
  className?: string;
};

export default function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = "ابحث عن منتج، عطر، ماكينة...",
  className = "",
}: SearchBarProps) {
  return (
    <form onSubmit={onSubmit} className={`group relative ${className}`}>
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-xl border border-[#e6cc8b]/60 bg-white text-zinc-900 placeholder:text-zinc-400 px-12 text-sm font-medium shadow-sm shadow-black/20 transition-all focus-visible:border-[#f3d896] focus-visible:ring-4 focus-visible:ring-[#e6cc8b]/30"
      />
      <button
        type="submit"
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-DilMart-store-gold"
        aria-label="بحث"
      >
        <Search size={18} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        aria-label="بحث بالذكاء الاصطناعي قريباً"
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <Camera size={18} strokeWidth={1.75} />
      </button>
    </form>
  );
}
