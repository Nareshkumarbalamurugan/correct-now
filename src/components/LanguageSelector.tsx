import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface LanguageSelectorProps {
  value: string;
  onChange: (value: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTooltip?: boolean;
}

const languages = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish (Español)" },
  { code: "fr", name: "French (Français)" },
  { code: "de", name: "German (Deutsch)" },
  { code: "pt", name: "Portuguese (Português)" },
  { code: "it", name: "Italian (Italiano)" },
  { code: "ru", name: "Russian (Русский)" },
  { code: "ja", name: "Japanese (日本語)" },
  { code: "ko", name: "Korean (한국어)" },
  { code: "zh", name: "Chinese (中文)" },
  { code: "ar", name: "Arabic (العربية)" },
  { code: "hi", name: "Hindi (हिन्दी)" },
  { code: "bn", name: "Bengali (বাংলা)" },
  { code: "ur", name: "Urdu (اردو)" },
  { code: "pa", name: "Punjabi (ਪੰਜਾਬੀ)" },
  { code: "ta", name: "Tamil (தமிழ்)" },
  { code: "te", name: "Telugu (తెలుగు)" },
  { code: "mr", name: "Marathi (मराठी)" },
  { code: "gu", name: "Gujarati (ગુજરાતી)" },
  { code: "kn", name: "Kannada (ಕನ್ನಡ)" },
  { code: "ml", name: "Malayalam (മലയാളം)" },
  { code: "fa", name: "Persian (فارسی)" },
  { code: "tr", name: "Turkish (Türkçe)" },
  { code: "vi", name: "Vietnamese (Tiếng Việt)" },
  { code: "th", name: "Thai (ไทย)" },
  { code: "id", name: "Indonesian (Bahasa Indonesia)" },
  { code: "ms", name: "Malay (Bahasa Melayu)" },
  { code: "tl", name: "Tagalog (Filipino)" },
  { code: "sw", name: "Swahili (Kiswahili)" },
  { code: "nl", name: "Dutch (Nederlands)" },
  { code: "pl", name: "Polish (Polski)" },
  { code: "uk", name: "Ukrainian (Українська)" },
  { code: "ro", name: "Romanian (Română)" },
  { code: "cs", name: "Czech (Čeština)" },
  { code: "el", name: "Greek (Ελληνικά)" },
  { code: "he", name: "Hebrew (עברית)" },
  { code: "hu", name: "Hungarian (Magyar)" },
  { code: "sv", name: "Swedish (Svenska)" },
  { code: "no", name: "Norwegian (Norsk)" },
  { code: "da", name: "Danish (Dansk)" },
  { code: "fi", name: "Finnish (Suomi)" },
  { code: "af", name: "Afrikaans" },
  { code: "sq", name: "Albanian (Shqip)" },
  { code: "am", name: "Amharic (አማርኛ)" },
  { code: "hy", name: "Armenian (Հայերեն)" },
  { code: "az", name: "Azerbaijani (Azərbaycan)" },
  { code: "eu", name: "Basque (Euskara)" },
  { code: "be", name: "Belarusian (Беларуская)" },
  { code: "bs", name: "Bosnian (Bosanski)" },
  { code: "bg", name: "Bulgarian (Български)" },
  { code: "ca", name: "Catalan (Català)" },
  { code: "ceb", name: "Cebuano" },
  { code: "ny", name: "Chichewa (Nyanja)" },
  { code: "co", name: "Corsican (Corsu)" },
  { code: "hr", name: "Croatian (Hrvatski)" },
  { code: "eo", name: "Esperanto" },
  { code: "et", name: "Estonian (Eesti)" },
  { code: "gl", name: "Galician (Galego)" },
  { code: "ka", name: "Georgian (ქართული)" },
  { code: "ht", name: "Haitian Creole (Kreyòl)" },
  { code: "ha", name: "Hausa" },
  { code: "haw", name: "Hawaiian (ʻŌlelo Hawaiʻi)" },
  { code: "hmn", name: "Hmong" },
  { code: "is", name: "Icelandic (Íslenska)" },
  { code: "ig", name: "Igbo" },
  { code: "ga", name: "Irish (Gaeilge)" },
  { code: "jw", name: "Javanese (Basa Jawa)" },
  { code: "kk", name: "Kazakh (Қазақ)" },
  { code: "km", name: "Khmer (ភាសាខ្មែរ)" },
  { code: "ku", name: "Kurdish (Kurdî)" },
  { code: "ky", name: "Kyrgyz (Кыргызча)" },
  { code: "lo", name: "Lao (ລາວ)" },
  { code: "la", name: "Latin (Latina)" },
  { code: "lv", name: "Latvian (Latviešu)" },
  { code: "lt", name: "Lithuanian (Lietuvių)" },
  { code: "lb", name: "Luxembourgish (Lëtzebuergesch)" },
  { code: "mk", name: "Macedonian (Македонски)" },
  { code: "mg", name: "Malagasy" },
  { code: "mt", name: "Maltese (Malti)" },
  { code: "mi", name: "Maori (Te Reo Māori)" },
  { code: "mn", name: "Mongolian (Монгол)" },
  { code: "my", name: "Myanmar (Burmese) (မြန်မာ)" },
  { code: "ne", name: "Nepali (नेपाली)" },
  { code: "ps", name: "Pashto (پښتو)" },
  { code: "si", name: "Sinhala (සිංහල)" },
  { code: "sk", name: "Slovak (Slovenčina)" },
  { code: "sl", name: "Slovenian (Slovenščina)" },
  { code: "so", name: "Somali (Soomaali)" },
  { code: "st", name: "Sesotho" },
  { code: "su", name: "Sundanese (Basa Sunda)" },
  { code: "tg", name: "Tajik (Тоҷикӣ)" },
  { code: "tt", name: "Tatar (Татарча)" },
  { code: "tk", name: "Turkmen (Türkmen)" },
  { code: "uz", name: "Uzbek (Oʻzbek)" },
  { code: "cy", name: "Welsh (Cymraeg)" },
  { code: "xh", name: "Xhosa (isiXhosa)" },
  { code: "yi", name: "Yiddish (ייִדיש)" },
  { code: "yo", name: "Yoruba (Yorùbá)" },
  { code: "zu", name: "Zulu (isiZulu)" },
  { code: "sr", name: "Serbian (Српски)" },
  { code: "sd", name: "Sindhi (سنڌي)" },
  { code: "sn", name: "Shona (chiShona)" },
  { code: "sm", name: "Samoan" },
  { code: "gd", name: "Scottish Gaelic (Gàidhlig)" },
  { code: "fy", name: "Frisian (Frysk)" },
];

const LanguageSelector = ({ value, onChange, open, onOpenChange, showTooltip = false }: LanguageSelectorProps) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = open ?? internalOpen;
  const selectedLanguage = languages.find((lang) => lang.code === value);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue);
    handleOpenChange(false);
  };

  const selector = (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={isOpen}
          className="w-full sm:w-[180px] justify-between bg-card"
        >
          <span className="truncate">
            {selectedLanguage ? selectedLanguage.name : "Select language"}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Type to search..." autoFocus />
          <CommandList>
            <CommandEmpty>No languages found.</CommandEmpty>
            <CommandGroup>
              {languages.map((lang) => (
                <CommandItem
                  key={lang.code}
                  value={`${lang.name} ${lang.code}`}
                  onSelect={() => handleSelect(lang.code)}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === lang.code ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {lang.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  // Show tooltip when language is not selected and user should select one
  if (showTooltip && !value) {
    return (
      <TooltipProvider>
        <Tooltip open={showTooltip}>
          <TooltipTrigger asChild>
            {selector}
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-accent text-accent-foreground">
            <p className="font-medium">Please select a language first</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return selector;
};

export default LanguageSelector;
