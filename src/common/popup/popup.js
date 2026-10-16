(function initializePopup() {
  "use strict";

  const extensionApi = globalThis.browser || globalThis.chrome;
  const popupMessages = globalThis.AwayDoomscrollinPopupMessages || {};
  let selectedLanguage = "en";
  const defaults = {
    protectInstagram: true,
    instagramProtectionMode: "strict",
    protectTikTok: true,
    tiktokProtectionMode: "strict",
    protectYoutubeShorts: true,
    youtubeProtectionMode: "strict",
    interventionCount: 0,
    instagramInterventionCount: 0,
    tiktokInterventionCount: 0,
    youtubeInterventionCount: 0
  };
  const legacyInstagramSettingKeys = [
    "protectHomeFeed",
    "protectReels",
    "protectInstagramPosts"
  ];
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

  function browserLanguage() {
    return extensionApi.i18n.getUILanguage().toLowerCase().startsWith("tr") ? "tr" : "en";
  }

  function message(key) {
    return popupMessages[selectedLanguage]?.[key] || extensionApi.i18n.getMessage(key) || key;
  }

  function uiLanguage() {
    return selectedLanguage;
  }

  function applyTranslations() {
    document.documentElement.lang = uiLanguage();
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const translated = message(element.dataset.i18n);
      if (translated) {
        element.textContent = translated;
      }
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
      element.setAttribute("aria-label", message(element.dataset.i18nAriaLabel));
    });

    const language = uiLanguage();
    const websiteLink = document.querySelector("[data-website-link]");
    if (websiteLink) {
      websiteLink.href = `https://awaydoomscrollin.com/${language}/`;
      websiteLink.setAttribute("aria-label", message("websiteLinkLabel"));
    }

    const communityLink = document.querySelector("[data-community-link]");
    if (communityLink) {
      communityLink.href = `https://resolvecommunity.com/${language}/`;
      communityLink.setAttribute("aria-label", message("communityWebsiteLinkLabel"));
    }

    const privacyLink = document.querySelector("[data-privacy-link]");
    if (privacyLink) {
      privacyLink.href = language === "tr"
        ? "https://awaydoomscrollin.com/tr/gizlilik/"
        : "https://awaydoomscrollin.com/en/privacy/";
      privacyLink.setAttribute("aria-label", message("privacyLinkDescription"));
    }

    const donateLink = document.querySelector("[data-donate-link]");
    if (donateLink) {
      donateLink.setAttribute("aria-label", message("donateLinkLabel"));
    }

    const version = extensionApi.runtime.getManifest().version;
    document.querySelectorAll("[data-version]").forEach((element) => {
      element.textContent = version;
    });
  }

  function normalizeCount(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  function normalizeStoredSettings(stored) {
    const legacyInstagramValues = legacyInstagramSettingKeys
      .map((key) => stored[key])
      .filter((setting) => typeof setting === "boolean");
    const protectInstagram = typeof stored.protectInstagram === "boolean"
      ? stored.protectInstagram
      : legacyInstagramValues.length > 0
        ? legacyInstagramValues.every(Boolean)
        : defaults.protectInstagram;

    return {
      protectInstagram,
      popupLanguage: stored.popupLanguage === "tr" || stored.popupLanguage === "en"
        ? stored.popupLanguage
        : browserLanguage(),
      instagramProtectionMode: stored.instagramProtectionMode === "balanced"
        ? "balanced"
        : defaults.instagramProtectionMode,
      protectTikTok: typeof stored.protectTikTok === "boolean" ? stored.protectTikTok : defaults.protectTikTok,
      tiktokProtectionMode: stored.tiktokProtectionMode === "balanced"
        ? "balanced"
        : defaults.tiktokProtectionMode,
      protectYoutubeShorts: typeof stored.protectYoutubeShorts === "boolean"
        ? stored.protectYoutubeShorts
        : defaults.protectYoutubeShorts,
      youtubeProtectionMode: stored.youtubeProtectionMode === "balanced"
        ? "balanced"
        : defaults.youtubeProtectionMode,
      interventionCount: normalizeCount(stored.interventionCount),
      instagramInterventionCount: normalizeCount(stored.instagramInterventionCount),
      tiktokInterventionCount: normalizeCount(stored.tiktokInterventionCount),
      youtubeInterventionCount: normalizeCount(stored.youtubeInterventionCount)
    };
  }

  async function loadSettings() {
    const stored = await extensionApi.storage.local.get(null);
    const normalized = normalizeStoredSettings(stored);
    const legacyKeys = legacyInstagramSettingKeys.filter((key) =>
      Object.prototype.hasOwnProperty.call(stored, key)
    );

    if (typeof stored.protectInstagram !== "boolean") {
      await extensionApi.storage.local.set({ protectInstagram: normalized.protectInstagram });
    }
    if (stored.instagramProtectionMode !== "strict" && stored.instagramProtectionMode !== "balanced") {
      await extensionApi.storage.local.set({
        instagramProtectionMode: normalized.instagramProtectionMode
      });
    }
    if (stored.tiktokProtectionMode !== "strict" && stored.tiktokProtectionMode !== "balanced") {
      await extensionApi.storage.local.set({
        tiktokProtectionMode: normalized.tiktokProtectionMode
      });
    }
    if (stored.youtubeProtectionMode !== "strict" && stored.youtubeProtectionMode !== "balanced") {
      await extensionApi.storage.local.set({
        youtubeProtectionMode: normalized.youtubeProtectionMode
      });
    }
    if (legacyKeys.length > 0) {
      await extensionApi.storage.local.remove(legacyKeys);
    }
    return normalized;
  }

  function showSavedStatus() {
    const status = document.getElementById("save-status");
    status.textContent = message("savedStatus");
    window.setTimeout(() => {
      status.textContent = "";
    }, 1200);
  }

  function showStatus(messageKey) {
    const status = document.getElementById("save-status");
    status.textContent = message(messageKey);
  }

  function renderStatistics(values) {
    const total = normalizeCount(values.interventionCount);
    document.getElementById("intervention-count").textContent = String(total);

    for (const platform of ["instagram", "tiktok", "youtube"]) {
      const key = `${platform}InterventionCount`;
      const count = normalizeCount(values[key]);
      document.querySelector(`[data-stat-value="${platform}"]`).textContent = String(count);
      const percentage = total > 0 ? Math.min(100, (count / total) * 100) : 0;
      const roundedPercentage = Math.round(percentage);
      document.querySelector(`[data-stat-percent="${platform}"]`).textContent = `${roundedPercentage}%`;
      document.querySelector(`[data-stat-bar="${platform}"]`).style.height = `${percentage}%`;
    }
  }

  function renderInstagramMode(mode, protectionEnabled) {
    const normalizedMode = mode === "balanced" ? "balanced" : "strict";
    const selector = document.querySelector("[data-instagram-mode-selector]");
    if (selector) {
      selector.disabled = !protectionEnabled;
    }
    for (const input of document.querySelectorAll("[data-instagram-mode]")) {
      input.checked = input.value === normalizedMode;
    }
    const description = document.getElementById("instagram-mode-description");
    if (description) {
      description.textContent = message(normalizedMode === "balanced"
        ? "instagramBalancedModeDescription"
        : "instagramStrictModeDescription");
    }
  }

  function renderTikTokMode(mode, protectionEnabled) {
    const normalizedMode = mode === "balanced" ? "balanced" : "strict";
    const selector = document.querySelector("[data-tiktok-mode-selector]");
    if (selector) {
      selector.disabled = !protectionEnabled;
    }
    for (const input of document.querySelectorAll("[data-tiktok-mode]")) {
      input.checked = input.value === normalizedMode;
    }
    const description = document.getElementById("tiktok-mode-description");
    if (description) {
      description.textContent = message(normalizedMode === "balanced"
        ? "tiktokBalancedModeDescription"
        : "tiktokStrictModeDescription");
    }
  }

  function renderYouTubeMode(mode, protectionEnabled) {
    const normalizedMode = mode === "balanced" ? "balanced" : "strict";
    const selector = document.querySelector("[data-youtube-mode-selector]");
    if (selector) {
      selector.disabled = !protectionEnabled;
    }
    for (const input of document.querySelectorAll("[data-youtube-mode]")) {
      input.checked = input.value === normalizedMode;
    }
    const description = document.getElementById("youtube-mode-description");
    if (description) {
      description.textContent = message(normalizedMode === "balanced"
        ? "youtubeBalancedModeDescription"
        : "youtubeStrictModeDescription");
    }
  }

  function renderLanguageSelector() {
    for (const button of document.querySelectorAll("[data-popup-language]")) {
      const selected = button.dataset.popupLanguage === selectedLanguage;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
  }

  async function broadcastInstagramMode(mode) {
    if (!extensionApi.tabs?.query || !extensionApi.tabs?.sendMessage) {
      return;
    }
    try {
      const tabs = await extensionApi.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs.find((tab) => Number.isInteger(tab.id));
      if (activeTab) {
        await extensionApi.tabs.sendMessage(activeTab.id, {
          type: "away-instagram-mode-changed",
          mode
        });
      }
    } catch {
      // The active tab may be an internal or unsupported browser page. Storage
      // remains the source of truth and will be picked up on the next page load.
    }
  }

  async function broadcastTikTokMode(mode) {
    if (!extensionApi.tabs?.query || !extensionApi.tabs?.sendMessage) {
      return;
    }
    try {
      const tabs = await extensionApi.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs.find((tab) => Number.isInteger(tab.id));
      if (activeTab) {
        await extensionApi.tabs.sendMessage(activeTab.id, {
          type: "away-tiktok-mode-changed",
          mode
        });
      }
    } catch {
      // Storage remains the source of truth for unsupported/internal pages.
    }
  }

  async function broadcastYouTubeMode(mode) {
    if (!extensionApi.tabs?.query || !extensionApi.tabs?.sendMessage) {
      return;
    }
    try {
      const tabs = await extensionApi.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs.find((tab) => Number.isInteger(tab.id));
      if (activeTab) {
        await extensionApi.tabs.sendMessage(activeTab.id, {
          type: "away-youtube-mode-changed",
          mode
        });
      }
    } catch {
      // Storage remains the source of truth for unsupported/internal pages.
    }
  }

  function renderProtectionStatus(values, hasSiteAccess) {
    const card = document.getElementById("protection-status-card");
    const title = document.getElementById("protection-status-title");
    const description = document.getElementById("protection-status-description");

    const activePlatforms = [];
    if (values.protectInstagram === true) activePlatforms.push("Instagram");
    if (values.protectTikTok === true) activePlatforms.push("TikTok");
    if (values.protectYoutubeShorts === true) activePlatforms.push("YouTube");

    card.classList.remove("is-checking", "is-active", "is-off", "needs-access");

    if (!hasSiteAccess) {
      card.classList.add("needs-access");
      title.textContent = message("protectionNeedsAccessTitle");
      description.textContent = message("protectionNeedsAccessDescription");
    } else if (activePlatforms.length === 0) {
      card.classList.add("is-off");
      title.textContent = message("protectionOffTitle");
      description.textContent = message("protectionOffDescription");
    } else {
      card.classList.add("is-active");
      title.textContent = message("protectionActiveTitle");

      if (activePlatforms.length === 3) {
        description.textContent = message("protectionActiveAll");
      } else {
        const lang = uiLanguage();
        const separator = lang === "tr" ? " ve " : " and ";
        const listText = activePlatforms.join(separator);
        description.textContent = message("protectionActiveSelected").replace("{platforms}", listText);
      }
    }
  }

  async function updateSiteAccessStatus() {
    const warning = document.getElementById("site-access-warning");
    const hasAccess = await extensionApi.permissions.contains({ origins: requiredOrigins });
    warning.hidden = hasAccess;
    return hasAccess;
  }

  function setupPlatformTabs() {
    const tabs = Array.from(document.querySelectorAll("[data-platform]"));

    function activateTab(nextTab, moveFocus = false) {
      for (const tab of tabs) {
        const selected = tab === nextTab;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        const panel = document.getElementById(tab.getAttribute("aria-controls"));
        panel.hidden = !selected;
      }
      if (moveFocus) {
        nextTab.focus();
      }
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activateTab(tab));
      tab.addEventListener("keydown", (event) => {
        let nextIndex = null;
        if (event.key === "ArrowRight") {
          nextIndex = (index + 1) % tabs.length;
        } else if (event.key === "ArrowLeft") {
          nextIndex = (index - 1 + tabs.length) % tabs.length;
        } else if (event.key === "Home") {
          nextIndex = 0;
        } else if (event.key === "End") {
          nextIndex = tabs.length - 1;
        }

        if (nextIndex !== null) {
          event.preventDefault();
          activateTab(tabs[nextIndex], true);
        }
      });
    });
  }

  function setupMainNavigation() {
    const navigationItems = Array.from(document.querySelectorAll("[data-page-target]"));
    const pages = Array.from(document.querySelectorAll("[data-page]"));

    function activatePage(pageName, moveFocus = false) {
      for (const page of pages) {
        page.hidden = page.dataset.page !== pageName;
      }

      for (const item of navigationItems) {
        const selected = item.dataset.pageTarget === pageName;
        item.classList.toggle("is-active", selected);
        if (selected) {
          item.setAttribute("aria-current", "page");
          if (moveFocus) {
            item.focus();
          }
        } else {
          item.removeAttribute("aria-current");
        }
      }
    }

    navigationItems.forEach((item, index) => {
      item.addEventListener("click", () => activatePage(item.dataset.pageTarget));
      item.addEventListener("keydown", (event) => {
        let nextIndex = null;
        if (event.key === "ArrowRight") {
          nextIndex = (index + 1) % navigationItems.length;
        } else if (event.key === "ArrowLeft") {
          nextIndex = (index - 1 + navigationItems.length) % navigationItems.length;
        } else if (event.key === "Home") {
          nextIndex = 0;
        } else if (event.key === "End") {
          nextIndex = navigationItems.length - 1;
        }

        if (nextIndex !== null) {
          event.preventDefault();
          const nextItem = navigationItems[nextIndex];
          activatePage(nextItem.dataset.pageTarget, true);
        }
      });
    });

    return activatePage;
  }

  async function start() {
    setupPlatformTabs();
    const activatePage = setupMainNavigation();
    const stored = await loadSettings();
    selectedLanguage = stored.popupLanguage;
    applyTranslations();
    let currentState = { ...stored };
    let hasSiteAccess = false;

    document.getElementById("open-apps-button").addEventListener("click", () => {
      activatePage("applications", true);
    });

    const grantAccessButton = document.getElementById("grant-site-access");
    grantAccessButton.addEventListener("click", async () => {
      try {
        const granted = await extensionApi.permissions.request({ origins: requiredOrigins });
        hasSiteAccess = granted && await updateSiteAccessStatus();
        renderProtectionStatus(currentState, hasSiteAccess);
        if (hasSiteAccess) {
          showStatus("siteAccessGranted");
        } else {
          showStatus("siteAccessStillRequired");
        }
      } catch {
        showStatus("siteAccessStillRequired");
      }
    });
    try {
      hasSiteAccess = await updateSiteAccessStatus();
    } catch {
      document.getElementById("site-access-warning").hidden = false;
    }
    renderProtectionStatus(currentState, hasSiteAccess);
    renderInstagramMode(currentState.instagramProtectionMode, currentState.protectInstagram);
    renderTikTokMode(currentState.tiktokProtectionMode, currentState.protectTikTok);
    renderYouTubeMode(currentState.youtubeProtectionMode, currentState.protectYoutubeShorts);
    renderLanguageSelector();

    for (const button of document.querySelectorAll("[data-popup-language]")) {
      button.addEventListener("click", async () => {
        const language = button.dataset.popupLanguage;
        if (language !== "tr" && language !== "en") {
          return;
        }
        selectedLanguage = language;
        currentState.popupLanguage = language;
        applyTranslations();
        renderProtectionStatus(currentState, hasSiteAccess);
        renderInstagramMode(currentState.instagramProtectionMode, currentState.protectInstagram);
        renderTikTokMode(currentState.tiktokProtectionMode, currentState.protectTikTok);
        renderYouTubeMode(currentState.youtubeProtectionMode, currentState.protectYoutubeShorts);
        renderLanguageSelector();
        await extensionApi.storage.local.set({ popupLanguage: language });
        showSavedStatus();
      });
    }

    for (const input of document.querySelectorAll("[data-setting]")) {
      input.checked = typeof stored[input.dataset.setting] === "boolean"
        ? stored[input.dataset.setting]
        : defaults[input.dataset.setting];

      input.addEventListener("change", async () => {
        currentState[input.dataset.setting] = input.checked;
        renderProtectionStatus(currentState, hasSiteAccess);
        if (input.dataset.setting === "protectInstagram") {
          renderInstagramMode(currentState.instagramProtectionMode, input.checked);
        }
        if (input.dataset.setting === "protectTikTok") {
          renderTikTokMode(currentState.tiktokProtectionMode, input.checked);
        }
        if (input.dataset.setting === "protectYoutubeShorts") {
          renderYouTubeMode(currentState.youtubeProtectionMode, input.checked);
        }
        await extensionApi.storage.local.set({ [input.dataset.setting]: input.checked });
        showSavedStatus();
      });
    }

    for (const input of document.querySelectorAll("[data-instagram-mode]")) {
      input.addEventListener("change", async () => {
        if (!input.checked) {
          return;
        }
        currentState.instagramProtectionMode = input.value;
        renderInstagramMode(currentState.instagramProtectionMode, currentState.protectInstagram);
        await extensionApi.storage.local.set({ instagramProtectionMode: input.value });
        await broadcastInstagramMode(input.value);
        showSavedStatus();
      });
    }

    for (const input of document.querySelectorAll("[data-tiktok-mode]")) {
      input.addEventListener("change", async () => {
        if (!input.checked) {
          return;
        }
        currentState.tiktokProtectionMode = input.value;
        renderTikTokMode(currentState.tiktokProtectionMode, currentState.protectTikTok);
        await extensionApi.storage.local.set({ tiktokProtectionMode: input.value });
        await broadcastTikTokMode(input.value);
        showSavedStatus();
      });
    }

    for (const input of document.querySelectorAll("[data-youtube-mode]")) {
      input.addEventListener("change", async () => {
        if (!input.checked) {
          return;
        }
        currentState.youtubeProtectionMode = input.value;
        renderYouTubeMode(currentState.youtubeProtectionMode, currentState.protectYoutubeShorts);
        await extensionApi.storage.local.set({ youtubeProtectionMode: input.value });
        await broadcastYouTubeMode(input.value);
        showSavedStatus();
      });
    }

    renderStatistics(currentState);

    extensionApi.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }

      const statisticKeys = [
        "interventionCount",
        "instagramInterventionCount",
        "tiktokInterventionCount",
        "youtubeInterventionCount"
      ];
      if (statisticKeys.some((key) => changes[key])) {
        for (const key of statisticKeys) {
          if (changes[key]) {
            currentState[key] = changes[key].newValue;
          }
        }
        renderStatistics(currentState);
      }

      const settingKeys = ["protectInstagram", "protectTikTok", "protectYoutubeShorts"];
      if (settingKeys.some((key) => changes[key])) {
        for (const key of settingKeys) {
          if (changes[key]) {
            currentState[key] = changes[key].newValue;
            const input = document.querySelector(`[data-setting="${key}"]`);
            if (input) {
              input.checked = changes[key].newValue === true;
            }
          }
        }
        renderProtectionStatus(currentState, hasSiteAccess);
        renderInstagramMode(currentState.instagramProtectionMode, currentState.protectInstagram);
        renderTikTokMode(currentState.tiktokProtectionMode, currentState.protectTikTok);
        renderYouTubeMode(currentState.youtubeProtectionMode, currentState.protectYoutubeShorts);
      }

      if (changes.instagramProtectionMode) {
        currentState.instagramProtectionMode = changes.instagramProtectionMode.newValue === "balanced"
          ? "balanced"
          : "strict";
        renderInstagramMode(currentState.instagramProtectionMode, currentState.protectInstagram);
      }

      if (changes.tiktokProtectionMode) {
        currentState.tiktokProtectionMode = changes.tiktokProtectionMode.newValue === "balanced"
          ? "balanced"
          : "strict";
        renderTikTokMode(currentState.tiktokProtectionMode, currentState.protectTikTok);
      }

      if (changes.youtubeProtectionMode) {
        currentState.youtubeProtectionMode = changes.youtubeProtectionMode.newValue === "balanced"
          ? "balanced"
          : "strict";
        renderYouTubeMode(currentState.youtubeProtectionMode, currentState.protectYoutubeShorts);
      }

      if (changes.popupLanguage) {
        selectedLanguage = changes.popupLanguage.newValue === "tr" ? "tr" : "en";
        currentState.popupLanguage = selectedLanguage;
        applyTranslations();
        renderProtectionStatus(currentState, hasSiteAccess);
        renderInstagramMode(currentState.instagramProtectionMode, currentState.protectInstagram);
        renderTikTokMode(currentState.tiktokProtectionMode, currentState.protectTikTok);
        renderYouTubeMode(currentState.youtubeProtectionMode, currentState.protectYoutubeShorts);
        renderLanguageSelector();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    void start();
  });
})();
