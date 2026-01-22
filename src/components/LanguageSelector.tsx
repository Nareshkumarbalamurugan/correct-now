import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useMemo, useState, useRef, useEffect } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface LanguageSelectorProps {
  value: string;
  onChange: (value: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTooltip?: boolean;
}

const languages = [
  { code: "en", name: "English" },
  { code: "ur", name: "Urdu (اردو)" },
  { code: "hi", name: "Hindi (हिन्दी)" },
  { code: "ta", name: "Tamil (தமிழ்)" },
  { code: "te", name: "Telugu (తెలుగు)" },
  { code: "bn", name: "Bengali (বাংলা)" },
  { code: "mr", name: "Marathi (मराठी)" },
  { code: "gu", name: "Gujarati (ગુજરાતી)" },
  { code: "kn", name: "Kannada (ಕನ್ನಡ)" },
  { code: "ml", name: "Malayalam (മലയാളം)" },
  { code: "pa", name: "Punjabi (ਪੰਜਾਬੀ)" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "pt", name: "Portuguese" },
  { code: "it", name: "Italian" },
  { code: "nl", name: "Dutch" },
  { code: "af", name: "Afrikaans" },
  { code: "sv", name: "Swedish" },
  { code: "no", name: "Norwegian" },
  { code: "da", name: "Danish" },
  { code: "fi", name: "Finnish" },
  { code: "pl", name: "Polish" },
  { code: "ro", name: "Romanian" },
  { code: "cs", name: "Czech" },
  { code: "hu", name: "Hungarian" },
  { code: "tr", name: "Turkish" },
  { code: "el", name: "Greek" },
  { code: "he", name: "Hebrew" },
  { code: "fa", name: "Persian (فارسی)" },
  { code: "id", name: "Indonesian" },
  { code: "ms", name: "Malay" },
  { code: "th", name: "Thai" },
  { code: "vi", name: "Vietnamese" },
  { code: "tl", name: "Tagalog" },
  { code: "sw", name: "Swahili" },
  { code: "ru", name: "Russian" },
  { code: "uk", name: "Ukrainian" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "ar", name: "Arabic" },
];

const LanguageSelector = ({ value, onChange, open, onOpenChange, showTooltip = false }: LanguageSelectorProps) => {
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Reset query when dropdown closes
  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  // Auto-focus search input when dropdown opens (with delay for mobile)
  useEffect(() => {
    if (open && searchInputRef.current) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return languages;
    return languages.filter(
      (lang) =>
        lang.name.toLowerCase().includes(q) ||
        lang.code.toLowerCase().includes(q)
    );
  }, [query]);

  const handleItemSelect = (selectedValue: string) => {
    onChange(selectedValue);
    setQuery("");
    onOpenChange?.(false);
  };

  const preventCloseOnInteraction = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    setQuery(e.target.value);
  };

  const handleSearchClick = (e: React.MouseEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const selector = (
    <Select 
      value={value} 
      onValueChange={handleItemSelect} 
      open={open} 
      onOpenChange={onOpenChange}
    >
      <SelectTrigger className="w-full sm:w-[180px] bg-card">
        <SelectValue placeholder="Select language" />
      </SelectTrigger>
      <SelectContent 
        ref={contentRef}
        className="max-h-[300px]"
        onPointerDownOutside={(e) => {
          // Prevent closing when clicking on the search input or its container
          const target = e.target as HTMLElement;
          if (
            contentRef.current?.contains(target) ||
            target.closest('[data-language-search]')
          ) {
            e.preventDefault();
          }
        }}
      >
        <div 
          data-language-search
          className="sticky top-0 z-10 bg-popover p-2 border-b"
          onPointerDown={preventCloseOnInteraction}
          onMouseDown={preventCloseOnInteraction}
          onTouchStart={preventCloseOnInteraction}
          onTouchEnd={preventCloseOnInteraction}
          onClick={preventCloseOnInteraction}
        >
          <Input
            ref={searchInputRef}
            value={query}
            onChange={handleSearchChange}
            onClick={handleSearchClick}
            placeholder="Type to search..."
            className="h-9"
            onKeyDown={(e) => {
              e.stopPropagation();
              // Keep dropdown open while typing
              if (e.key === "Escape") {
                onOpenChange?.(false);
              }
            }}
            onPointerDown={preventCloseOnInteraction}
            onMouseDown={preventCloseOnInteraction}
            onTouchStart={preventCloseOnInteraction}
            onTouchEnd={preventCloseOnInteraction}
            onFocus={(e) => e.stopPropagation()}
          />
        </div>
        <div className="max-h-[240px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No languages found matching "{query}"
            </div>
          ) : (
            filtered.map((lang) => (
              <SelectItem 
                key={lang.code} 
                value={lang.code}
                onPointerDown={(e) => {
                  // Allow selection on mobile
                  e.stopPropagation();
                }}
              >
                {lang.name}
              </SelectItem>
            ))
          )}
        </div>
      </SelectContent>
    </Select>
  );

  // Show tooltip when language is not selected and user should select one
  if (showTooltip && !value) {
    return (
      <TooltipProvider>
        <Tooltip open={showTooltip}>
          <TooltipTrigger asChild>
            {selector}
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-accent text-accent-foreground">
            <p className="font-medium">Please select a language first</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return selector;
};

export default LanguageSelector;
