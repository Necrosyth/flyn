import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search } from "lucide-react";
import { parsePhoneNumber } from "libphonenumber-js";

/** Build E.164 from dial code + local input. Falls back to dialCode+digits. */
function toE164(dialCode: string, localInput: string): string {
  const digits = localInput.replace(/\D/g, "").replace(/^0+/, ""); // strip leading zeros
  if (!digits) return dialCode;
  try {
    const parsed = parsePhoneNumber(dialCode + digits);
    if (parsed?.isValid()) return parsed.format("E.164");
  } catch { /* fall through */ }
  return dialCode + digits;
}

interface Country {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { code: "IN", name: "India", dialCode: "+91", flag: "🇮🇳" },
  { code: "US", name: "United States", dialCode: "+1", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", dialCode: "+44", flag: "🇬🇧" },
  { code: "AU", name: "Australia", dialCode: "+61", flag: "🇦🇺" },
  { code: "CA", name: "Canada", dialCode: "+1", flag: "🇨🇦" },
  { code: "AE", name: "United Arab Emirates", dialCode: "+971", flag: "🇦🇪" },
  { code: "SG", name: "Singapore", dialCode: "+65", flag: "🇸🇬" },
  { code: "ZA", name: "South Africa", dialCode: "+27", flag: "🇿🇦" },
  { code: "NG", name: "Nigeria", dialCode: "+234", flag: "🇳🇬" },
  { code: "PK", name: "Pakistan", dialCode: "+92", flag: "🇵🇰" },
  { code: "BD", name: "Bangladesh", dialCode: "+880", flag: "🇧🇩" },
  { code: "ID", name: "Indonesia", dialCode: "+62", flag: "🇮🇩" },
  { code: "MY", name: "Malaysia", dialCode: "+60", flag: "🇲🇾" },
  { code: "PH", name: "Philippines", dialCode: "+63", flag: "🇵🇭" },
  { code: "TH", name: "Thailand", dialCode: "+66", flag: "🇹🇭" },
  { code: "BR", name: "Brazil", dialCode: "+55", flag: "🇧🇷" },
  { code: "DE", name: "Germany", dialCode: "+49", flag: "🇩🇪" },
  { code: "FR", name: "France", dialCode: "+33", flag: "🇫🇷" },
  { code: "JP", name: "Japan", dialCode: "+81", flag: "🇯🇵" },
  { code: "CN", name: "China", dialCode: "+86", flag: "🇨🇳" },
  { code: "KE", name: "Kenya", dialCode: "+254", flag: "🇰🇪" },
  { code: "NZ", name: "New Zealand", dialCode: "+64", flag: "🇳🇿" },
  { code: "IE", name: "Ireland", dialCode: "+353", flag: "🇮🇪" },
  { code: "NL", name: "Netherlands", dialCode: "+31", flag: "🇳🇱" },
  { code: "IT", name: "Italy", dialCode: "+39", flag: "🇮🇹" },
  { code: "ES", name: "Spain", dialCode: "+34", flag: "🇪🇸" },
  { code: "MX", name: "Mexico", dialCode: "+52", flag: "🇲🇽" },
  { code: "KR", name: "South Korea", dialCode: "+82", flag: "🇰🇷" },
  { code: "SA", name: "Saudi Arabia", dialCode: "+966", flag: "🇸🇦" },
  { code: "EG", name: "Egypt", dialCode: "+20", flag: "🇪🇬" },
  { code: "GH", name: "Ghana", dialCode: "+233", flag: "🇬🇭" },
  { code: "ET", name: "Ethiopia", dialCode: "+251", flag: "🇪🇹" },
  { code: "TZ", name: "Tanzania", dialCode: "+255", flag: "🇹🇿" },
  { code: "UG", name: "Uganda", dialCode: "+256", flag: "🇺🇬" },
  { code: "RW", name: "Rwanda", dialCode: "+250", flag: "🇷🇼" },
  { code: "LK", name: "Sri Lanka", dialCode: "+94", flag: "🇱🇰" },
  { code: "NP", name: "Nepal", dialCode: "+977", flag: "🇳🇵" },
];

function parsePhoneValue(value: string, defaultCountry: Country): { country: Country; localNumber: string } {
  if (!value) return { country: defaultCountry, localNumber: "" };

  if (value.startsWith("+")) {
    // Try to match dial code (longest match wins)
    const sorted = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);
    for (const c of sorted) {
      if (value.startsWith(c.dialCode)) {
        return { country: c, localNumber: value.slice(c.dialCode.length) };
      }
    }
  }

  // No country code found — put entire value as local number
  return { country: defaultCountry, localNumber: value };
}

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  defaultCountry?: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  id?: string;
}

export function PhoneInput({
  value,
  onChange,
  defaultCountry = "US",
  placeholder = "Enter number",
  className = "",
  inputClassName = "",
  disabled = false,
  id,
}: PhoneInputProps) {
  const defaultCountryObj = COUNTRIES.find(c => c.code === defaultCountry) ?? COUNTRIES[0];
  const parsed = parsePhoneValue(value, defaultCountryObj);

  const [selectedCountry, setSelectedCountry] = useState<Country>(parsed.country);
  const [localNumber, setLocalNumber] = useState(parsed.localNumber);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync external value changes (e.g. when editing an existing contact)
  useEffect(() => {
    const p = parsePhoneValue(value, defaultCountryObj);
    setSelectedCountry(p.country);
    setLocalNumber(p.localNumber);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount — don't re-run on every keystroke

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleCountrySelect = (country: Country) => {
    setSelectedCountry(country);
    setOpen(false);
    setSearch("");
    onChange(toE164(country.dialCode, localNumber));
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow digits, spaces, dashes, parens
    const raw = e.target.value.replace(/[^\d\s\-()]/g, "");
    setLocalNumber(raw);
    onChange(toE164(selectedCountry.dialCode, raw));
  };

  const filteredCountries = search
    ? COUNTRIES.filter(
        c =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.dialCode.includes(search) ||
          c.code.toLowerCase().includes(search.toLowerCase()),
      )
    : COUNTRIES;

  return (
    <div className={`flex ${className}`} ref={dropdownRef}>
      {/* Country code selector */}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 h-10 px-3 rounded-l-md border border-r-0 border-input bg-muted/50 hover:bg-muted text-sm font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="text-base leading-none">{selectedCountry.flag}</span>
          <span className="text-muted-foreground">{selectedCountry.dialCode}</span>
          <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute z-50 top-full left-0 mt-1 w-64 max-h-72 overflow-hidden rounded-md border border-border bg-popover shadow-lg flex flex-col">
            <div className="p-2 border-b border-border">
              <div className="flex items-center gap-2 px-2 py-1 rounded bg-muted/50">
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input
                  autoFocus
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search country..."
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {filteredCountries.map(country => (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => handleCountrySelect(country)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground text-left transition-colors ${
                    selectedCountry.code === country.code ? "bg-accent/50" : ""
                  }`}
                >
                  <span className="text-base leading-none">{country.flag}</span>
                  <span className="flex-1 truncate">{country.name}</span>
                  <span className="text-muted-foreground text-xs shrink-0">{country.dialCode}</span>
                </button>
              ))}
              {filteredCountries.length === 0 && (
                <p className="text-center py-4 text-sm text-muted-foreground">No countries found</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Local number input */}
      <input
        id={id}
        type="tel"
        disabled={disabled}
        value={localNumber}
        onChange={handleNumberChange}
        placeholder={placeholder}
        className={`flex-1 h-10 px-3 rounded-r-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${inputClassName}`}
      />
    </div>
  );
}
