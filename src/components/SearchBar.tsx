import { Search } from "lucide-react";
import type { FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
  placeholder = "ابحث عن المنتجات، الماركات، والمتاجر...",
  className = "",
}: SearchBarProps) {
  return (
    <form onSubmit={onSubmit} className={`group relative flex items-center w-full ${className}`}>
      <div className="relative w-full">
        <Input
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full rounded-xl border-2 border-border/90 bg-surface-light text-foreground placeholder:text-muted-foreground pr-11 pl-20 text-sm font-medium transition-all duration-200 focus-visible:border-primary focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-primary/20"
        />
        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary pointer-events-none">
          <Search size={18} strokeWidth={2.2} />
        </div>
      </div>

      <Button
        type="submit"
        size="sm"
        className="absolute left-1.5 top-1/2 -translate-y-1/2 h-8 px-4 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-bold transition-all shadow-sm"
        aria-label="بحث"
      >
        بحث
      </Button>
    </form>
  );
}
