/**
 * i18n — Bilingual support (EN / FR)
 * Handles language detection, persistence, and toggle links.
 */

// Available languages
const LANGUAGES = {
  en: { label: "EN", href: (currentPath) => englishUrl(currentPath) },
  fr: { label: "FR", href: (currentPath) => frenchUrl(currentPath) },
};

function isFrenchPage() {
  return window.location.pathname.startsWith("/fr/");
}

function englishUrl(currentPath) {
  // If already on a French page, strip /fr
  if (currentPath.startsWith("/fr/")) {
    return currentPath.replace("/fr/", "/");
  }
  return currentPath;
}

function frenchUrl(currentPath) {
  if (currentPath.startsWith("/fr/")) return currentPath; // already french
  // If root, go to /fr/
  if (currentPath === "/" || currentPath === "") return "/fr/";
  return "/fr" + currentPath;
}

/**
 * Returns the URL to switch to the other language.
 */
function getSwitchUrl() {
  const current = window.location.pathname;
  if (isFrenchPage()) {
    return englishUrl(current);
  } else {
    return frenchUrl(current);
  }
}

/**
 * Returns the label for the switch button.
 */
function getSwitchLabel() {
  return isFrenchPage() ? "🇬🇧 EN" : "🇫🇷 FR";
}

/**
 * Detects browser language on first visit (no saved preference).
 */
function detectAndRedirect() {
  const saved = localStorage.getItem("haloprofile_lang");
  if (saved) {
    // Preference already saved, respect it
    if (saved === "fr" && !isFrenchPage() && window.location.pathname !== "/") {
      // Only redirect if on a non-root page
      const frUrl = frenchUrl(window.location.pathname);
      if (frUrl !== window.location.pathname) {
        window.location.href = frUrl;
      }
    }
    return;
  }

  // No saved preference — detect browser language
  const browserLang = navigator.language || navigator.userLanguage || "";
  if (browserLang.startsWith("fr") && !isFrenchPage()) {
    localStorage.setItem("haloprofile_lang", "fr");
    const frUrl = frenchUrl(window.location.pathname);
    if (frUrl !== window.location.pathname) {
      window.location.href = frUrl;
    }
  } else {
    localStorage.setItem("haloprofile_lang", "en");
  }
}

/**
 * Inserts a language toggle button into a given container element.
 * Call after DOM is ready.
 */
function insertLanguageToggle(container) {
  if (!container) return;

  const link = document.createElement("a");
  link.href = getSwitchUrl();
  link.className = "text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors";
  link.textContent = getSwitchLabel();
  link.setAttribute("data-i18n-toggle", "");

  // Insert at the beginning of the container
  container.prepend(link);
}

// Export for modules
export { detectAndRedirect, insertLanguageToggle, getSwitchUrl, getSwitchLabel, isFrenchPage };