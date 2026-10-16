(function initializeBackground() {
  "use strict";

  const extensionApi = globalThis.browser || globalThis.chrome;
  const platformDefaults = {
    protectInstagram: true,
    protectTikTok: true,
    protectYoutubeShorts: true
  };
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

  function message(key) {
    return extensionApi.i18n.getMessage(key) || key;
  }

  async function updateActionBadge() {
    const [stored, hasSiteAccess] = await Promise.all([
      extensionApi.storage.local.get(platformDefaults),
      extensionApi.permissions.contains({ origins: requiredOrigins })
    ]);
    const activeCount = Object.keys(platformDefaults)
      .filter((key) => stored[key] === true)
      .length;

    let text;
    let color;
    let title;
    if (!hasSiteAccess) {
      text = "!";
      color = "#c98124";
      title = message("badgePermissionRequired");
    } else if (activeCount === 0) {
      text = "OFF";
      color = "#526174";
      title = message("badgeProtectionOff");
    } else {
      text = "ON";
      color = "#159ba6";
      title = message("badgeProtectionActive").replace("$COUNT$", String(activeCount));
    }

    await Promise.all([
      extensionApi.action.setBadgeText({ text }),
      extensionApi.action.setBadgeBackgroundColor({ color }),
      extensionApi.action.setTitle({ title })
    ]);
  }

  function refreshActionBadge() {
    void updateActionBadge().catch(() => {});
  }

  extensionApi.runtime.onInstalled.addListener((details) => {
    refreshActionBadge();
    if (details.reason !== "install") {
      return;
    }

    void extensionApi.tabs.create({
      url: extensionApi.runtime.getURL("onboarding/onboarding.html")
    });
  });

  extensionApi.runtime.onStartup.addListener(refreshActionBadge);
  extensionApi.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && Object.keys(platformDefaults).some((key) => changes[key])) {
      refreshActionBadge();
    }
  });
  extensionApi.permissions.onAdded.addListener(refreshActionBadge);
  extensionApi.permissions.onRemoved.addListener(refreshActionBadge);

  refreshActionBadge();
})();
