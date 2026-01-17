import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";

interface LanguageSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const languages = [
  { code: "auto", name: "Auto-detect" },
  { code: "en", name: "English" },
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
  { code: "ru", name: "Russian" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "ar", name: "Arabic" },
];

const LanguageSelector = ({ value, onChange }: LanguageSelectorProps) => {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return languages;
    return languages.filter(
      (lang) =>
        lang.name.toLowerCase().includes(q) ||
        lang.code.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-[180px] bg-card">
        <SelectValue placeholder="Select language" />
      </SelectTrigger>
      <SelectContent onKeyDown={(e) => e.stopPropagation()}>
        <div className="p-2" onClick={(e) => e.stopPropagation()}>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search language"
            autoFocus
            onKeyDownCapture={(e) => e.stopPropagation()}
            onKeyUpCapture={(e) => e.stopPropagation()}
          />
        </div>
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            No matches
          </div>
        ) : (
          filtered.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>
              {lang.name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
};

export default LanguageSelector;
