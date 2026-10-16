(function initializeOnboarding() {
  "use strict";

  const extensionApi = globalThis.browser || globalThis.chrome;
  const requiredOrigins = [
    "https://www.instagram.com/*",
    "https://instagram.com/*",
    "https://m.instagram.com/*",
    "https://tiktok.com/*",
    "https://m.tiktok.com/*",
    "https://www.tiktok.com/*",
    "https://www.youtube.com/*",
    "https://m.youtube.com/*"
  ];
  const platformDefaults = {
    protectInstagram: true,
    protectTikTok: true,
    protectYoutubeShorts: true
  };

  function message(key) {
    return extensionApi.i18n.getMessage(key) || key;
  }

  function uiLanguage() {
    return extensionApi.i18n.getUILanguage().toLowerCase().startsWith("tr") ? "tr" : "en";
  }

  function applyTranslations() {
    const language = uiLanguage();
    document.documentElement.lang = language;
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const translated = message(element.dataset.i18n);
      if (translated) {
        element.textContent = translated;
      }
    });
    const privacyLink = document.querySelector("[data-privacy-link]");
    privacyLink.href = language === "tr"
      ? "https://awaydoomscrollin.com/tr/gizlilik/"
      : "https://awaydoomscrollin.com/en/privacy/";
    document.querySelector("[data-mobile-app-link]").href = language === "tr"
      ? "https://awaydoomscrollin.com/tr/"
      : "https://awaydoomscrollin.com/en/";
    document.querySelectorAll("[data-community-link]").forEach((link) => {
      link.href = language === "tr"
        ? "https://resolvecommunity.com/tr/"
        : "https://resolvecommunity.com/en/";
    });
  }

  function animateStatus(element) {
    element.classList.remove("is-fresh");
    void element.offsetWidth;
    element.classList.add("is-fresh");
  }

  function updateSelectionCount() {
    const count = document.querySelector("[data-selection-count]");
    if (count) {
      const selected = document.querySelectorAll("[data-setting]:checked").length;
      count.textContent = message("onboardingSelectionCount").replace("$COUNT$", String(selected));
    }
  }

  async function setupPlatformChoices() {
    const stored = await extensionApi.storage.local.get(platformDefaults);
    const status = document.getElementById("platform-status");

    for (const input of document.querySelectorAll("[data-setting]")) {
      input.checked = typeof stored[input.dataset.setting] === "boolean"
        ? stored[input.dataset.setting]
        : platformDefaults[input.dataset.setting];
      input.addEventListener("change", async () => {
        await extensionApi.storage.local.set({ [input.dataset.setting]: input.checked });
        updateSelectionCount();
        status.textContent = message("onboardingPlatformSaved");
        animateStatus(status);
      });
    }
    updateSelectionCount();
  }

  async function updateAccessState() {
    const button = document.getElementById("grant-site-access");
    const status = document.getElementById("access-status");
    const granted = await extensionApi.permissions.contains({ origins: requiredOrigins });
    document.getElementById("access-card").classList.toggle("is-complete", granted);
    button.disabled = granted;
    button.textContent = message(granted ? "siteAccessAlreadyGranted" : "grantSiteAccess");
    status.textContent = granted ? message("siteAccessReady") : "";
    return granted;
  }

  async function start() {
    applyTranslations();
    await setupPlatformChoices();

    const accessButton = document.getElementById("grant-site-access");
    accessButton.addEventListener("click", async () => {
      const status = document.getElementById("access-status");
      try {
        const granted = await extensionApi.permissions.request({ origins: requiredOrigins });
        if (granted && await updateAccessState()) {
          status.textContent = message("siteAccessReady");
        } else {
          status.textContent = message("siteAccessStillRequired");
        }
        animateStatus(status);
      } catch {
        status.textContent = message("siteAccessStillRequired");
        animateStatus(status);
      }
    });

    document.getElementById("finish-setup").addEventListener("click", () => {
      window.close();
    });

    try {
      await updateAccessState();
    } catch {
      document.getElementById("access-status").textContent = message("siteAccessStillRequired");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    void start();
  });
})();
