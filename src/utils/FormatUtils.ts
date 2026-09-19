// F22: /min metadata — parsing, formatting and length validation are what
// the UI uses; the full build added ~30 KB gzip to the first screen.
import {
  parsePhoneNumberWithError,
  type CountryCode,
} from "libphonenumber-js/min";

// The market DropChat sells to: a number typed without a country code is read
// as Chilean.
export const DEFAULT_PHONE_COUNTRY: CountryCode = "CL";

export function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Function that searches a specific criteria inside a string term with
 * case insensitive and without accents for a character matching search.
 * @param searchCriteria is the term we'll be looking to match inside term
 * @param term the string being looked up
 * @returns
 */
export function isIncludedIn(searchCriteria: string, term: string) {
  return searchCriteria.length
    ? removeAccents(term)
        .toLowerCase()
        .includes(removeAccents(searchCriteria).toLowerCase())
    : true;
}

export function nameInitials(name: string): string {
  const names = name.split(" ");

  if (names.length === 1) {
    return names[0].slice(0, 2);
  }

  if (names.length > 1) {
    return names
      .slice(0, 2)
      .map((name) => name[0])
      .join("");
  }

  return "?";
}

export function formatPhoneNumber(phoneNumber: string): string {
  try {
    const parsed = parsePhoneNumberWithError("+" + phoneNumber, {
      extract: false,
    });
    return parsed.formatInternational();
  } catch {
    return phoneNumber;
  }
}

export function isValidPhoneNumber(phoneNumber: string): boolean {
  if (!phoneNumber?.trim()) {
    return true;
  }

  try {
    const parsed = parsePhoneNumberWithError(phoneNumber, { extract: true });
    return parsed.isValid();
  } catch {
    return false;
  }
}

/**
 * Normalize phone number to E.164 format without the plus sign.
 * For Argentina (+54), ensures the 9 is included after country code for mobile numbers.
 * Returns original if parsing fails.
 */
export function normalizePhoneNumber(phoneNumber: string): string {
  try {
    const parsed = parsePhoneNumberWithError(phoneNumber, { extract: true });
    // remove the +
    let number = parsed.number.slice(1);

    if (parsed.country === "AR" && !number.startsWith("549")) {
      number = number.replace("54", "549");
    }

    return number;
  } catch {
    // Return cleaned version (digits only) if parsing fails
    return phoneNumber.replace(/\D/g, "");
  }
}

/**
 * Turn what someone types to start a conversation into a WhatsApp address
 * (E.164 digits, no plus). A number with its country code ("+56 9 …" or
 * "569…") keeps it; one without ("9 1234 5678") is read as `defaultCountry`.
 * Argentine mobiles get their 9 (see normalizePhoneNumber). Returns the bare
 * digits when no reading is a valid number.
 */
export function toWhatsAppAddress(
  input: string,
  defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY,
): string {
  const digits = input.replace(/\D/g, "");
  if (!digits) return "";

  // A leading + settles it. Without one, the national reading goes first: a
  // local number rarely also reads as a valid international one, while
  // "569…" is too long to be a valid Chilean national number.
  const readings: [string, CountryCode | undefined][] = input
    .trim()
    .startsWith("+")
    ? [["+" + digits, undefined]]
    : [
        [digits, defaultCountry],
        ["+" + digits, undefined],
      ];

  for (const [text, country] of readings) {
    try {
      const parsed = parsePhoneNumberWithError(text, {
        defaultCountry: country,
      });
      if (parsed.isValid()) return normalizePhoneNumber(parsed.number);
    } catch {
      // not a number under this reading; try the next one
    }
  }

  return digits;
}
