export type RegionalPricing = {
  regionLabel: string;
  currency: string;
  amount: number;
  stripePriceId?: string;
  useRazorpay?: boolean;
};

const env = import.meta.env as Record<string, string | undefined>;

const SEA = ["SG", "MY", "ID", "PH", "TH", "VN"];
const LATAM = ["BR", "MX", "AR", "CL", "CO", "PE"];
const MIDDLE_EAST = ["AE", "SA", "QA", "KW", "BH", "OM", "IL", "JO"];
const AFRICA = ["NG", "KE", "ZA", "EG", "GH", "TZ", "UG", "MA", "DZ"];
const EUROPE = [
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "NO",
  "IS",
  "CH",
];

export const resolvePricing = (countryCode: string): RegionalPricing => {
  const code = (countryCode || "").toUpperCase();

  if (code === "IN") {
    return {
      regionLabel: "India",
      currency: "INR",
      amount: 499,
      useRazorpay: true,
    };
  }

  if (code === "US" || code === "CA") {
    return {
      regionLabel: "US / Canada",
      currency: "USD",
      amount: 9,
      stripePriceId: env.VITE_STRIPE_PRICE_ID_USD_9,
    };
  }

  if (code === "GB") {
    return {
      regionLabel: "United Kingdom",
      currency: "GBP",
      amount: 7,
      stripePriceId: env.VITE_STRIPE_PRICE_ID_GBP_7,
    };
  }

  if (EUROPE.includes(code)) {
    return {
      regionLabel: "Europe",
      currency: "EUR",
      amount: 8,
      stripePriceId: env.VITE_STRIPE_PRICE_ID_EUR_8,
    };
  }

  if (SEA.includes(code)) {
    return {
      regionLabel: "Southeast Asia",
      currency: "USD",
      amount: 4.99,
      stripePriceId: env.VITE_STRIPE_PRICE_ID_USD_4_99,
    };
  }

  if (LATAM.includes(code)) {
    return {
      regionLabel: "Latin America",
      currency: "USD",
      amount: 4.99,
      stripePriceId: env.VITE_STRIPE_PRICE_ID_USD_4_99,
    };
  }

  if (MIDDLE_EAST.includes(code)) {
    return {
      regionLabel: "Middle East",
      currency: "USD",
      amount: 6.99,
      stripePriceId: env.VITE_STRIPE_PRICE_ID_USD_6_99,
    };
  }

  if (AFRICA.includes(code)) {
    return {
      regionLabel: "Africa",
      currency: "USD",
      amount: 3.99,
      stripePriceId: env.VITE_STRIPE_PRICE_ID_USD_3_99,
    };
  }

  return {
    regionLabel: "Rest of World",
    currency: "USD",
    amount: 5.99,
    stripePriceId: env.VITE_STRIPE_PRICE_ID_USD_5_99,
  };
};

export const formatPrice = (currency: string, amount: number) => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
};

export const detectCountryCode = async (): Promise<string> => {
  try {
    const res = await fetch("https://ipapi.co/json/");
    if (!res.ok) return "";
    const data = await res.json();
    return String(data?.country || "");
  } catch {
    return "";
  }
};
