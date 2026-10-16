(function startAwayDoomscrollinBrowser() {
  "use strict";

  const extensionApi = globalThis.browser || globalThis.chrome;
  const rules = globalThis.AwayDoomscrollinRouteRules;

  if (!extensionApi || !rules) {
    return;
  }

  const OVERLAY_ID = "away-doomscrollin-intervention";
  const EXPLORE_CURTAIN_ID = "away-doomscrollin-explore-curtain";
  const SURFACE_BANNER_ID = "away-doomscrollin-surface-banner";
  const SHROUD_CLASS = "away-doomscrollin-shroud";
  const SHROUD_TARGET_ATTR = "data-away-doomscrollin-shrouded";
  const NOTIFICATION_MEDIA_ATTR = "data-away-instagram-notification-media";
  const FLYOUT_CLIPPED_SHROUD_ATTR = "data-away-clipped-behind-flyout";
  const INSTAGRAM_POST_PROBE_ATTR = "data-away-instagram-post-classifying";
  const TIKTOK_SHROUD_ATTR = "data-away-tiktok-shroud";
  const TIKTOK_FOCUSED_MEDIA_ATTR = "data-away-tiktok-focused-media";
  const TIKTOK_RELATED_MEDIA_ATTR = "data-away-tiktok-related-media";
  const TIKTOK_PREVIOUS_LOOP_ATTR = "data-away-tiktok-previous-loop";
  const YOUTUBE_SHROUD_ATTR = "data-away-youtube-shroud";
  const YOUTUBE_FOCUSED_MEDIA_ATTR = "data-away-youtube-focused-media";
  const YOUTUBE_RELATED_MEDIA_ATTR = "data-away-youtube-related-media";
  const YOUTUBE_PREVIOUS_LOOP_ATTR = "data-away-youtube-previous-loop";
  const YOUTUBE_STATIC_SHORT_ATTR = "data-away-youtube-static-short";
  const PREVIOUS_TABINDEX_ATTR = "data-away-previous-tabindex";
  const PREVIOUS_ARIA_HIDDEN_ATTR = "data-away-previous-aria-hidden";
  const GRID_SHROUD_SELECTOR = "a[href*=\"/p/\" i], a[href*=\"/reel/\" i], a[href*=\"/tv/\" i]";
  const PROFILE_REEL_SELECTOR = "a[href*=\"/reel/\" i], a[href*=\"/tv/\" i]";
  const INSTAGRAM_STORY_SELECTOR = "a[href^=\"/stories/\" i], a[href*=\"instagram.com/stories/\" i]";
  const INSTAGRAM_NOTIFICATION_TEXT_PATTERN =
    /beğen|yorum|bahset|etiketle|paylaş|takip|liked|comment|mention|tagged|shared|follow/i;
  const INSTAGRAM_NOTIFICATION_PANEL_TEXT_PATTERN =
    /bildirimler|notifications|tüm bildirimler|all notifications|filtrele|filter/i;
  const SHIELD_ICON_SVG =
    "<svg viewBox=\"0 0 64 64\" width=\"52\" height=\"52\" aria-hidden=\"true\" focusable=\"false\">" +
    "<circle cx=\"32\" cy=\"32\" r=\"29\" fill=\"#0a222c\" stroke=\"#1edce6\" stroke-opacity=\"0.45\" stroke-width=\"1.5\"/>" +
    "<path d=\"M32 14.5 44 19v9.4c0 7.4-5 12.6-12 15.4-7-2.8-12-8-12-15.4V19z\" fill=\"#1edce6\"/>" +
    "<path d=\"m25.8 31.4 4.4 4.4 8.6-9\" fill=\"none\" stroke=\"#06222b\" stroke-width=\"3.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>" +
    "</svg>";
  const ROUTE_CHECK_INTERVAL_MS = 500;
  const ROOT_SCROLL_ARM_DELAY_MS = 900;
  const ROOT_SCROLL_THRESHOLD_PX = 4;
  const TOUCH_THRESHOLD_PX = 12;
  const WHEEL_THRESHOLD_PX = 6;

  let settings = rules.normalizeSettings();
  let currentRoute = rules.ROUTES.OUTSIDE_SUPPORTED_SITES;
  let overlayReason = null;
  let lastLocation = "";
  let lastInterventionToken = null;
  let lastRootScrollY = 0;
  let rootScrollReadyAt = 0;
  let touchStartY = null;
  let previousDocumentOverflow = "";
  let previousBodyOverflow = "";
  let immediateRepairScheduled = false;
  let exploreCurtainPaused = false;
  let youtubeWatchProbeStartedAt = 0;
  let youtubeWatchClassification = "unknown";

  function isExtensionContextValid() {
    try {
      return Boolean(extensionApi?.runtime?.id);
    } catch {
      return false;
    }
  }

  async function loadSettings() {
    if (!isExtensionContextValid()) {
      return rules.normalizeSettings();
    }
    try {
      const stored = await extensionApi.storage.local.get(null);
      const normalized = rules.normalizeSettings(stored);
      const legacyKeys = rules.LEGACY_INSTAGRAM_SETTING_KEYS.filter((key) =>
        Object.prototype.hasOwnProperty.call(stored, key)
      );

      if (typeof stored.protectInstagram !== "boolean" && isExtensionContextValid()) {
        await extensionApi.storage.local.set({ protectInstagram: normalized.protectInstagram });
      }
      if (stored.instagramProtectionMode !== "strict" &&
        stored.instagramProtectionMode !== "balanced" &&
        isExtensionContextValid()) {
        await extensionApi.storage.local.set({
          instagramProtectionMode: normalized.instagramProtectionMode
        });
      }
      if (stored.tiktokProtectionMode !== "strict" &&
        stored.tiktokProtectionMode !== "balanced" &&
        isExtensionContextValid()) {
        await extensionApi.storage.local.set({
          tiktokProtectionMode: normalized.tiktokProtectionMode
        });
      }
      if (stored.youtubeProtectionMode !== "strict" &&
        stored.youtubeProtectionMode !== "balanced" &&
        isExtensionContextValid()) {
        await extensionApi.storage.local.set({
          youtubeProtectionMode: normalized.youtubeProtectionMode
        });
      }
      if (legacyKeys.length > 0 && isExtensionContextValid()) {
        await extensionApi.storage.local.remove(legacyKeys);
      }
      return normalized;
    } catch {
      return rules.normalizeSettings();
    }
  }

  function message(key, substitutions) {
    return extensionApi.i18n.getMessage(key, substitutions) || key;
  }

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    if (typeof text === "string") {
      element.textContent = text;
    }
    return element;
  }

  function websiteUrl() {
    const language = extensionApi.i18n.getUILanguage().toLowerCase().startsWith("tr") ? "tr" : "en";
    return `https://awaydoomscrollin.com/${language}/`;
  }

  function restorePageScrolling() {
    document.documentElement.style.overflow = previousDocumentOverflow;
    if (document.body) {
      document.body.style.overflow = previousBodyOverflow;
    }
  }

  function removeOverlay() {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      existing.remove();
    }
    overlayReason = null;
    restorePageScrolling();
    applyExploreCurtain();
  }

  function navigateTo(url) {
    removeSurfaceShrouds();
    removeOverlay();
    window.location.assign(url);
  }

  function isDirectMediaLink(element) {
    if (!(element instanceof Element)) {
      return false;
    }
    const selector = "a[href*='/reel' i], a[href*='/p/' i], a[href*='/tv/' i]";
    return Boolean(
      element.matches(selector) ||
      element.closest(selector) ||
      (element.hasAttribute("data-away-direct-media") &&
        (element.querySelector(selector) || isSharedMessageCard(element)))
    );
  }

  function isInsideInstagramMessageSurface(element) {
    return element instanceof Element && Boolean(
      window.location.pathname.startsWith("/direct/") ||
      element.closest("[data-away-messages='true'], [aria-roledescription='message']")
    );
  }

  function restoreShroudedTarget(target) {
    if (!(target instanceof Element)) {
      return;
    }
    target.removeAttribute(SHROUD_TARGET_ATTR);
    target.removeAttribute("data-away-direct-media");
    target.removeAttribute(NOTIFICATION_MEDIA_ATTR);
    const previousTabIndex = target.getAttribute(PREVIOUS_TABINDEX_ATTR);
    const previousAriaHidden = target.getAttribute(PREVIOUS_ARIA_HIDDEN_ATTR);
    if (previousTabIndex === "__missing__" || previousTabIndex === null) {
      target.removeAttribute("tabindex");
    } else {
      target.setAttribute("tabindex", previousTabIndex);
    }
    if (previousAriaHidden === "__missing__" || previousAriaHidden === null) {
      target.removeAttribute("aria-hidden");
    } else {
      target.setAttribute("aria-hidden", previousAriaHidden);
    }
    target.removeAttribute(PREVIOUS_TABINDEX_ATTR);
    target.removeAttribute(PREVIOUS_ARIA_HIDDEN_ATTR);
  }

  function removeSurfaceShrouds(preserveDirectMedia = false) {
    // Instagram updates the URL before unmounting the outgoing feed. Keep its
    // existing covers until those nodes disappear, including during DM entry.
    const preserveTarget = (target) => preserveDirectMedia && settings.protectInstagram &&
      ((isInsideInstagramMessageSurface(target) && isDirectMediaLink(target)) || (
        window.location.pathname.startsWith("/direct/") &&
        target instanceof Element && target.matches("article") &&
        !target.matches("[aria-roledescription='message']")
      ) || (
        settings.instagramProtectionMode === "strict" &&
        target instanceof Element &&
        target.hasAttribute(NOTIFICATION_MEDIA_ATTR)
      ));
    for (const shroud of Array.from(document.querySelectorAll(`.${SHROUD_CLASS}`))) {
      if (preserveTarget(shroud.parentElement)) {
        continue;
      }
      shroud.remove();
    }
    for (const target of Array.from(document.querySelectorAll(`[${SHROUD_TARGET_ATTR}]`))) {
      if (preserveTarget(target)) {
        continue;
      }
      restoreShroudedTarget(target);
    }
  }

  function surfaceBannerMessageKeys() {
    if (rules.platformForRoute(currentRoute) === "youtube") {
      return currentRoute === rules.ROUTES.YOUTUBE_HOME
        ? ["youtubeHomeShroudTitle", "youtubeHomeShroudDescription"]
        : ["youtubeShortShroudTitle", "youtubeShortShroudDescription"];
    }
    if (rules.platformForRoute(currentRoute) === "tiktok") {
      return ["tiktokShroudTitle", "tiktokShroudDescription"];
    }
    if (currentRoute === rules.ROUTES.EXPLORE) {
      return ["exploreShroudTitle", "exploreShroudDescription"];
    }
    if (currentRoute === rules.ROUTES.HOME_FEED) {
      return [
        "homeShroudTitle",
        settings.instagramProtectionMode === "strict"
          ? "homeStrictShroudDescription"
          : "homeShroudDescription"
      ];
    }
    if (currentRoute === rules.ROUTES.INDIVIDUAL_POST) {
      return ["postShroudTitle", "postShroudDescription"];
    }
    return ["reelsShroudTitle", "reelsShroudDescription"];
  }

  function balancedProfileIsOpen(route = currentRoute) {
    return route === rules.ROUTES.PROFILE_OR_OTHER &&
      settings.protectInstagram &&
      settings.instagramProtectionMode === "balanced" &&
      !isInstagramSavedUrl(window.location.href) &&
      !isInstagramActivityUrl(window.location.href);
  }

  function isProfileReelTarget(element) {
    return element instanceof Element && Boolean(
      element.matches(PROFILE_REEL_SELECTOR) || element.closest(PROFILE_REEL_SELECTOR)
    );
  }

  function cleanBalancedProfilePostShrouds() {
    for (const shroud of Array.from(document.querySelectorAll(`.${SHROUD_CLASS}`))) {
      const target = shroud.parentElement;
      if (isInsideInstagramMessageSurface(target) || isProfileReelTarget(target)) {
        continue;
      }
      shroud.remove();
    }
    for (const target of Array.from(document.querySelectorAll(`[${SHROUD_TARGET_ATTR}]`))) {
      if (isInsideInstagramMessageSurface(target) || isProfileReelTarget(target)) {
        continue;
      }
      restoreShroudedTarget(target);
    }
  }

  function renderShroudPresentation(shroud, withContent, showIcon) {
    const presentation = withContent ? "message" : showIcon ? "icon" : "blank";
    if (shroud.dataset.awayPresentation === presentation) {
      return;
    }
    shroud.dataset.awayPresentation = presentation;
    shroud.replaceChildren();

    if (withContent) {
      const content = createElement("div", "away-doomscrollin-shroud-content");
      const icon = createElement("span", "away-doomscrollin-shroud-icon");
      icon.innerHTML = SHIELD_ICON_SVG;
      content.append(icon);
      const [titleKey, descriptionKey] = surfaceBannerMessageKeys();
      content.append(
        createElement("p", "away-doomscrollin-shroud-title", message(titleKey)),
        createElement("p", "away-doomscrollin-shroud-description", message(descriptionKey))
      );
      shroud.append(content);
    } else if (showIcon) {
      const icon = createElement("span", "away-doomscrollin-grid-shield-icon");
      icon.innerHTML = SHIELD_ICON_SVG;
      shroud.append(icon);
    }
  }

  function shroudTarget(element, withContent = false, showIcon = true, allowFlyoutMedia = false) {
    if (!(element instanceof Element) || element.id === OVERLAY_ID || element.closest(`#${OVERLAY_ID}`)) {
      return;
    }
    // Hard invariant for Balanced mode: only Reel cells may be covered on a
    // profile. Normal /p/ posts stay available, while message attachments keep
    // their independent protection.
    if (
      balancedProfileIsOpen() &&
      !isInsideInstagramMessageSurface(element) &&
      !isProfileReelTarget(element)
    ) {
      return;
    }
    // Never shroud anything inside the navigation, flyout drawers, or outside main on Instagram,
    // except direct message media attachments (shared reels/posts in chats)
    if (
      rules.platformForRoute(currentRoute) === "instagram" &&
      isInsideInstagramLeftNav(element) &&
      !allowFlyoutMedia
    ) {
      return;
    }
    if (
      rules.platformForRoute(currentRoute) === "instagram" &&
      isInsideInstagramNavOrFlyout(element) &&
      !isDirectMediaLink(element) &&
      !allowFlyoutMedia
    ) {
      return;
    }
    const existingShroud = element.querySelector(`:scope > .${SHROUD_CLASS}`);
    if (element.hasAttribute(SHROUD_TARGET_ATTR) && existingShroud) {
      renderShroudPresentation(existingShroud, withContent, showIcon);
      return;
    }
    if (!element.hasAttribute(PREVIOUS_TABINDEX_ATTR)) {
      element.setAttribute(
        PREVIOUS_TABINDEX_ATTR,
        element.hasAttribute("tabindex") ? element.getAttribute("tabindex") : "__missing__"
      );
    }
    if (!element.hasAttribute(PREVIOUS_ARIA_HIDDEN_ATTR)) {
      element.setAttribute(
        PREVIOUS_ARIA_HIDDEN_ATTR,
        element.hasAttribute("aria-hidden") ? element.getAttribute("aria-hidden") : "__missing__"
      );
    }
    element.setAttribute(SHROUD_TARGET_ATTR, "");
    element.setAttribute("tabindex", "-1");
    element.setAttribute("aria-hidden", "true");
    const shroud = createElement("div", SHROUD_CLASS);
    shroud.setAttribute("role", "presentation");
    renderShroudPresentation(shroud, withContent, showIcon);

    element.append(shroud);

    const video = element.querySelector("video");
    if (video) {
      try {
        video.pause();
      } catch {}
    }
  }

  function exploreGridIsPresent() {
    const main = document.querySelector("main, [role=\"main\"]");
    return Boolean(main ? main.querySelector(GRID_SHROUD_SELECTOR) : document.querySelector(GRID_SHROUD_SELECTOR));
  }

  function getExploreGridLinks() {
    const main = document.querySelector("main, [role=\"main\"]");
    const container = main || document;
    return Array.from(container.querySelectorAll(GRID_SHROUD_SELECTOR)).filter((link) => {
      if (link.closest("nav, aside, header, [role='dialog'], [aria-modal='true'], [data-away-flyout], [data-away-messages]")) {
        return false;
      }
      if (isInsideInstagramNavOrFlyout(link)) {
        return false;
      }
      return true;
    });
  }

  function getInstagramSidebarRight() {
    const main = document.querySelector("main, [role=\"main\"]");
    if (main) {
      const mr = main.getBoundingClientRect();
      if (mr.left >= 50 && mr.left <= 450) {
        return Math.round(mr.left);
      }
    }
    for (const nav of document.querySelectorAll("nav, aside, [role='navigation']")) {
      const nr = nav.getBoundingClientRect();
      if (nr.left < 50 && nr.width > 50) {
        return Math.round(nr.right);
      }
    }
    return window.innerWidth >= 1264 ? 244 : 72;
  }

  function isInsideInstagramLeftNav(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    if (target.closest("nav, aside, [role='navigation'], [data-away-flyout='true']")) {
      return true;
    }
    const sidebarRight = getInstagramSidebarRight();
    const rect = target.getBoundingClientRect();
    if (rect.right <= sidebarRight && rect.width > 0) {
      const main = document.querySelector("main, [role='main']");
      if (!main || !main.contains(target)) {
        return true;
      }
    }
    return false;
  }

  function cleanInstagramLeftNav() {
    for (const shroud of Array.from(document.querySelectorAll(`.${SHROUD_CLASS}`))) {
      if (
        isInsideInstagramLeftNav(shroud.parentElement) &&
        !(settings.instagramProtectionMode === "strict" &&
          shroud.parentElement?.hasAttribute(NOTIFICATION_MEDIA_ATTR))
      ) {
        shroud.remove();
      }
    }
    for (const target of Array.from(document.querySelectorAll(`[${SHROUD_TARGET_ATTR}]`))) {
      if (
        isInsideInstagramLeftNav(target) &&
        !(settings.instagramProtectionMode === "strict" && target.hasAttribute(NOTIFICATION_MEDIA_ATTR))
      ) {
        restoreShroudedTarget(target);
      }
    }
  }

  function isSearchFocused() {
    const active = document.activeElement;
    if (active && active instanceof Element) {
      if (active.matches("input[placeholder*='Ara' i], input[placeholder*='Search' i], input[aria-label*='Search' i], input[aria-label*='Ara' i]")) {
        return true;
      }
    }
    return false;
  }

  function getExploreTopHeaderBottom() {
    const searchInputs = document.querySelectorAll(
      "main input, [role='main'] input, input[placeholder*='Ara' i], input[placeholder*='Search' i], input[aria-label*='Search' i], input[aria-label*='Ara' i]"
    );
    for (const input of searchInputs) {
      const rect = input.getBoundingClientRect();
      if (rect.top >= 0 && rect.top < 160 && rect.left >= 40 && rect.width > 50) {
        const header = input.closest("header, [role='banner'], nav") || input.parentElement;
        const hRect = header ? header.getBoundingClientRect() : rect;
        return Math.max(Math.round(rect.bottom + 8), Math.round(hRect.bottom));
      }
    }
    const main = document.querySelector("main, [role=\"main\"]");
    if (main) {
      const header = main.querySelector("header, [role='banner']");
      if (header) {
        const hr = header.getBoundingClientRect();
        if (hr.top >= 0 && hr.top < 160 && hr.height > 0) {
          return Math.round(hr.bottom);
        }
      }
    }
    return 0;
  }

  function applyExploreCurtain() {
    const onExplore =
      settings.protectInstagram && currentRoute === rules.ROUTES.EXPLORE;
    if (!onExplore) {
      const existing = document.getElementById(EXPLORE_CURTAIN_ID);
      if (existing) {
        existing.remove();
      }
      return;
    }

    // Ensure floating messages widget at bottom-right is elevated above the curtain
    getInstagramFloatingMessagesInfo();

    // Release the curtain while Instagram shows its own flyout panels
    // (notifications, search flyout, dialogs, active search) so they stay fully usable.
    const flyoutInfo = getInstagramFlyoutInfo();
    const flyoutOpen = flyoutInfo.isOpen;
    const searchActive = isSearchFocused();
    const showsCurtain =
      !overlayReason &&
      onExplore &&
      exploreGridIsPresent() &&
      !exploreCurtainPaused &&
      !visibleInstagramDialogExists() &&
      !flyoutOpen &&
      !searchActive;

    const existing = document.getElementById(EXPLORE_CURTAIN_ID);
    if (!showsCurtain) {
      if (existing) {
        existing.remove();
      }
      if (flyoutOpen || searchActive || exploreCurtainPaused) {
        restorePageScrolling();
      }
      return;
    }

    const gridLinks = getExploreGridLinks();
    if (gridLinks.length === 0) {
      if (existing) {
        existing.remove();
      }
      return;
    }

    // Determine the rightmost boundary of the sidebar and any open drawer
    const sidebarRight = getInstagramSidebarRight();
    const effectiveLeft = flyoutInfo.right > 0 ? Math.max(sidebarRight, flyoutInfo.right) : sidebarRight;

    const topHeaderBottom = getExploreTopHeaderBottom();

    let minGridLeft = Infinity;
    let minGridTop = Infinity;
    let maxGridRight = -Infinity;
    let maxGridBottom = -Infinity;

    for (const link of gridLinks) {
      const rect = link.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) {
        continue;
      }
      if (rect.right <= effectiveLeft) {
        continue;
      }
      minGridLeft = Math.min(minGridLeft, rect.left);
      maxGridRight = Math.max(maxGridRight, rect.right);
      if (rect.bottom >= 0) {
        minGridTop = Math.min(minGridTop, rect.top);
        maxGridBottom = Math.max(maxGridBottom, rect.bottom);
      }
    }

    if (!Number.isFinite(minGridLeft) || !Number.isFinite(maxGridRight) || maxGridRight <= minGridLeft) {
      if (existing) {
        existing.remove();
      }
      return;
    }

    // Strictly match the actual media grid coordinates so the curtain never spills
    // into empty margins or covers areas where there are no posts
    let minLeft = Math.max(effectiveLeft, Math.floor(minGridLeft));
    let maxRight = Math.min(window.innerWidth, Math.ceil(maxGridRight));
    let minTop = Math.max(topHeaderBottom, Number.isFinite(minGridTop) ? Math.floor(minGridTop) : topHeaderBottom);
    let maxBottom = Number.isFinite(maxGridBottom) && maxGridBottom > minTop
      ? Math.min(window.innerHeight, Math.ceil(maxGridBottom))
      : window.innerHeight;

    if (!Number.isFinite(minLeft) || maxRight - minLeft < 40 || maxBottom - minTop < 40) {
      if (existing) {
        existing.remove();
      }
      return;
    }

    const curtain = existing || createElement("div", "away-doomscrollin-explore-curtain");
    if (!existing) {
      curtain.id = EXPLORE_CURTAIN_ID;
      curtain.setAttribute("role", "presentation");
      curtain.setAttribute("data-route", currentRoute);

      const banner = createElement("div", "away-doomscrollin-surface-banner");
      banner.id = SURFACE_BANNER_ID;
      banner.setAttribute("role", "status");
      const icon = createElement("span", "away-doomscrollin-shroud-icon");
      icon.innerHTML = SHIELD_ICON_SVG;
      const [titleKey, descriptionKey] = surfaceBannerMessageKeys();
      banner.append(
        icon,
        createElement("p", "away-doomscrollin-shroud-title", message(titleKey)),
        createElement("p", "away-doomscrollin-shroud-description", message(descriptionKey))
      );
      curtain.append(banner);
      (document.body || document.documentElement).append(curtain);
    }

    curtain.style.top = `${minTop}px`;
    curtain.style.left = `${minLeft}px`;
    curtain.style.width = `${maxRight - minLeft}px`;
    curtain.style.height = `${maxBottom - minTop}px`;

    for (const link of gridLinks) {
      shroudTarget(link);
    }
  }

  function shroudExploreGridLinks() {
    for (const link of getExploreGridLinks()) {
      shroudTarget(link);
    }
  }

  function shroudInstagramStoryLinks() {
    for (const link of document.querySelectorAll(INSTAGRAM_STORY_SELECTOR)) {
      shroudTarget(link);
    }
  }

  function cleanInstagramStoryShrouds() {
    for (const target of document.querySelectorAll(`[${SHROUD_TARGET_ATTR}]`)) {
      if (!target.matches(INSTAGRAM_STORY_SELECTOR)) {
        continue;
      }
      const shroud = target.querySelector(`:scope > .${SHROUD_CLASS}`);
      if (shroud) {
        shroud.remove();
      }
      restoreShroudedTarget(target);
    }
  }

  function isInstagramNotificationMediaLink(link, flyoutElement) {
    if (!(link instanceof Element) || !link.matches(GRID_SHROUD_SELECTOR)) {
      return false;
    }
    if (
      link.closest("main, [role='main'], nav, aside, header, [role='navigation'], [data-away-messages='true']")
    ) {
      return false;
    }
    if (flyoutElement?.contains(link) || link.closest("[data-away-flyout='true']")) {
      return true;
    }
    const rect = link.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.left >= 40 && rect.right <= 650;
  }

  function getInstagramNotificationMediaTarget(link) {
    const visibleMedia = Array.from(link.querySelectorAll("img, video, canvas")).filter((item) => {
      const rect = item.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    // A notification row can contain both the sender avatar and the post cover.
    // Instagram places the content preview on the right, so prefer the rightmost
    // visible media node and leave the avatar available as communication context.
    visibleMedia.sort((left, right) =>
      right.getBoundingClientRect().right - left.getBoundingClientRect().right
    );
    const media = visibleMedia[0];
    if (!media) {
      return null;
    }

    const linkRect = link.getBoundingClientRect();
    if (
      linkRect.width > 0 &&
      linkRect.height > 0 &&
      linkRect.width <= 180 &&
      linkRect.height <= 180
    ) {
      return link;
    }

    let current = media.parentElement;
    let boundedTarget = null;
    while (current && current !== link.parentElement) {
      const rect = current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.width <= 180 && rect.height <= 180) {
        boundedTarget = current;
      }
      if (current === link) {
        break;
      }
      current = current.parentElement;
    }
    return boundedTarget;
  }

  function getInstagramNotificationRowForMedia(media, flyoutElement) {
    if (!(media instanceof Element)) {
      return null;
    }
    if (
      media.closest("main, [role='main'], nav, aside, header, [role='navigation'], [data-away-messages='true']")
    ) {
      return null;
    }
    const mediaRect = media.getBoundingClientRect();
    if (
      mediaRect.width < 20 ||
      mediaRect.height < 20 ||
      mediaRect.width > 140 ||
      mediaRect.height > 140
    ) {
      return null;
    }

    let current = media.parentElement;
    while (current && current !== document.body && current !== document.documentElement) {
      if (current.matches("main, [role='main'], nav, aside, header, [role='navigation'], [data-away-messages='true']")) {
        return null;
      }
      const rect = current.getBoundingClientRect();
      const isInsideDetectedFlyout = Boolean(flyoutElement?.contains(current));
      const isInsideFlyoutArea = rect.left >= 40 && rect.right <= 650;
      const text = (current.textContent || "").trim();
      if (
        rect.width >= 220 &&
        rect.width <= 600 &&
        rect.height >= 38 &&
        rect.height <= 180 &&
        text.length >= 8 &&
        text.length <= 600 &&
        INSTAGRAM_NOTIFICATION_TEXT_PATTERN.test(text) &&
        (isInsideDetectedFlyout || isInsideFlyoutArea)
      ) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function getInstagramNotificationRowMediaTarget(row) {
    if (!(row instanceof Element)) {
      return null;
    }
    const rowRect = row.getBoundingClientRect();
    const visibleMedia = Array.from(row.querySelectorAll("img, video, canvas")).filter((item) => {
      const rect = item.getBoundingClientRect();
      return rect.width >= 20 && rect.height >= 20 && rect.width <= 140 && rect.height <= 140;
    });
    if (visibleMedia.length < 2) {
      return null;
    }
    visibleMedia.sort((left, right) =>
      right.getBoundingClientRect().right - left.getBoundingClientRect().right
    );
    const preview = visibleMedia[0];
    const previewRect = preview.getBoundingClientRect();
    if (previewRect.left + (previewRect.width / 2) < rowRect.left + (rowRect.width * 0.64)) {
      return null;
    }

    let current = preview.parentElement;
    let boundedTarget = null;
    while (current && current !== row) {
      const rect = current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.width <= 180 && rect.height <= 180) {
        boundedTarget = current;
      }
      current = current.parentElement;
    }
    return boundedTarget;
  }

  function getUnshroudedInstagramNotificationMediaTargets() {
    if (
      !settings.protectInstagram ||
      settings.instagramProtectionMode !== "strict" ||
      rules.platformForRoute(currentRoute) !== "instagram"
    ) {
      return [];
    }
    const flyoutElement = getInstagramFlyoutInfo().element;
    const targets = [];
    for (const link of document.querySelectorAll(GRID_SHROUD_SELECTOR)) {
      if (!isInstagramNotificationMediaLink(link, flyoutElement)) {
        continue;
      }
      const target = getInstagramNotificationMediaTarget(link);
      if (
        target &&
        !target.hasAttribute(SHROUD_TARGET_ATTR) &&
        !targets.includes(target)
      ) {
        targets.push(target);
      }
    }

    // Current Instagram notification cards do not always expose a /p/ or
    // /reel/ link on their thumbnail. Fall back to the row layout: avatars sit
    // on the left, while the post/reel preview is the rightmost square media.
    const seenRows = new Set();
    for (const media of document.querySelectorAll("img, video, canvas")) {
      const row = getInstagramNotificationRowForMedia(media, flyoutElement);
      if (!row || seenRows.has(row)) {
        continue;
      }
      seenRows.add(row);
      const target = getInstagramNotificationRowMediaTarget(row);
      if (
        target &&
        !target.hasAttribute(SHROUD_TARGET_ATTR) &&
        !targets.includes(target)
      ) {
        targets.push(target);
      }
    }
    return targets;
  }

  function shroudInstagramNotificationMedia() {
    for (const target of getUnshroudedInstagramNotificationMediaTargets()) {
      target.setAttribute(NOTIFICATION_MEDIA_ATTR, "");
      shroudTarget(target, false, true, true);
    }
  }

  function cleanInstagramNotificationMediaShrouds() {
    for (const target of document.querySelectorAll(`[${NOTIFICATION_MEDIA_ATTR}]`)) {
      const shroud = target.querySelector(`:scope > .${SHROUD_CLASS}`);
      if (shroud) {
        shroud.remove();
      }
      restoreShroudedTarget(target);
    }
  }

  function shroudInstagramPostArticles() {
    const articles = Array.from(document.querySelectorAll("main article, [role=\"main\"] article"));
    const bannerArticle = articles.find((article) => {
      const rect = article.getBoundingClientRect();
      return rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
    }) || articles[0];

    for (const article of articles) {
      const showsMessage = article === bannerArticle;
      shroudTarget(article, showsMessage, showsMessage);
    }
  }

  function shroudProfileGridLinks() {
    const profileSelectors = settings.instagramProtectionMode === "balanced"
      ? PROFILE_REEL_SELECTOR
      : `${GRID_SHROUD_SELECTOR}, a[href*="/saved/" i], a[href$="/saved" i], a[href*="/your_activity" i]`;
    for (const link of Array.from(document.querySelectorAll(profileSelectors))) {
      // Profile chrome (avatar, follow/message buttons, highlight stories, tablist)
      // must stay usable; only media cells inside the grid are covered.
      if (
        link.closest(
          "header, nav, aside, [role='navigation'], [role='tablist'], [role='dialog'], [aria-modal='true'], [data-away-flyout], [data-away-messages]"
        )
      ) {
        continue;
      }
      if (link.getAttribute("role") === "tab" || link.closest("[role='tab']")) {
        continue;
      }
      if (isInsideInstagramNavOrFlyout(link)) {
        continue;
      }
      shroudTarget(link);
    }
  }

  function shroudDebugSnapshot() {
    return {
      route: currentRoute,
      protectInstagram: settings.protectInstagram,
      instagramProtectionMode: settings.instagramProtectionMode,
      balancedProfileIsOpen: balancedProfileIsOpen(),
      gridLinks: document.querySelectorAll(GRID_SHROUD_SELECTOR).length,
      shrouded: document.querySelectorAll(`[${SHROUD_TARGET_ATTR}]`).length,
      shroudsInDom: document.querySelectorAll(`.${SHROUD_CLASS}`).length
    };
  }

  function eventTargetsShroudedElement(event) {
    if (!(event?.target instanceof Element)) {
      return false;
    }
    const host = event.target.closest(`[${SHROUD_TARGET_ATTR}]`);
    if (host) {
      return true;
    }
    // Clicking the shroud layer itself also counts: it sits inside the host.
    return Boolean(event.target.closest(`.${SHROUD_CLASS}`));
  }

  function isInstagramSavedUrl(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
      if (!["www.instagram.com", "instagram.com", "m.instagram.com"].includes(host)) {
        return false;
      }
      const pathname = parsed.pathname.toLowerCase();
      return pathname.includes("/saved/") || pathname.endsWith("/saved");
    } catch {
      return false;
    }
  }

  function isInstagramActivityUrl(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
      if (!["www.instagram.com", "instagram.com", "m.instagram.com"].includes(host)) {
        return false;
      }
      const pathname = parsed.pathname.toLowerCase();
      return pathname.startsWith("/your_activity") || pathname.includes("/your_activity");
    } catch {
      return false;
    }
  }

  function isInstagramStoryUrl(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
      return ["www.instagram.com", "instagram.com", "m.instagram.com"].includes(host) &&
        (parsed.pathname === "/stories" || parsed.pathname.startsWith("/stories/"));
    } catch {
      return false;
    }
  }

  function getInstagramIndividualPostMetadataKind() {
    const currentShortcode = rules.instagramMediaShortcode(window.location.href);
    return rules.classifyInstagramIndividualMediaMetadata([
      document.querySelector('link[rel~="canonical" i]')?.href,
      document.querySelector('meta[property="og:url" i]')?.content,
      document.querySelector('meta[name="twitter:url" i]')?.content
    ], currentShortcode);
  }

  function setInstagramPostProbeActive(active) {
    document.documentElement.toggleAttribute(INSTAGRAM_POST_PROBE_ATTR, active);
    if (!active) {
      return;
    }
    for (const video of document.querySelectorAll("video")) {
      try {
        video.pause();
      } catch {}
    }
  }

  function instagramPostProbeIsActive() {
    return document.documentElement.hasAttribute(INSTAGRAM_POST_PROBE_ATTR);
  }

  function handleShroudedClick(event) {
    if (rules.platformForRoute(currentRoute) === "tiktok" && !settings.protectTikTok) {
      return;
    }
    if (eventTargetsShroudedElement(event)) {
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopImmediatePropagation();
      return;
    }

    if (!settings.protectInstagram) {
      return;
    }

    // Intercept clicks on saved or activity navigation (More -> Saved / Your Activity in sidebar or profile tabs)
    const target = event?.target;
    if (target instanceof Element) {
      if (settings.instagramProtectionMode === "strict") {
        const storyLink = target.closest(INSTAGRAM_STORY_SELECTOR);
        if (storyLink && isInstagramStoryUrl(storyLink.href || storyLink.getAttribute("href"))) {
          if (event.cancelable) {
            event.preventDefault();
          }
          event.stopImmediatePropagation();
          navigateTo("https://www.instagram.com/direct/inbox/");
          return;
        }
      }

      const blockedLink = target.closest(
        "a[href*='/saved/' i], a[href$='/saved' i], a[href*='/your_activity' i]"
      );
      if (blockedLink) {
        const rawHref = blockedLink.getAttribute("href") || "";
        if (isInstagramSavedUrl(blockedLink.href || rawHref) || isInstagramActivityUrl(blockedLink.href || rawHref)) {
          if (event.cancelable) {
            event.preventDefault();
          }
          event.stopImmediatePropagation();
          navigateTo("https://www.instagram.com/direct/inbox/");
          return;
        }
      }

      // Also intercept if clicking menu item with text or aria-label of 'hareketlerin' or 'your activity'
      const menuControl = target.closest("a, [role='link'], [role='menuitem'], button");
      if (menuControl && target.closest("nav, aside, [role='navigation'], [role='menu']")) {
        const text = (menuControl.textContent || "").trim().toLowerCase();
        const ariaLabel = (menuControl.getAttribute("aria-label") || "").trim().toLowerCase();
        if (
          text === "hareketlerin" ||
          text === "your activity" ||
          ariaLabel === "hareketlerin" ||
          ariaLabel === "your activity"
        ) {
          if (event.cancelable) {
            event.preventDefault();
          }
          event.stopImmediatePropagation();
          navigateTo("https://www.instagram.com/direct/inbox/");
          return;
        }
      }

      // Also intercept any click on direct message media attachment (shared posts/reels)
      const dmLink = target.closest("a[href*='/reel' i], a[href*='/p/' i], a[href*='/tv/' i]");
      if (
        dmLink &&
        isInsideInstagramMessageSurface(dmLink) &&
        !isInsideInstagramLeftNav(dmLink) &&
        !dmLink.closest("nav, aside, [role='navigation'], [role='tablist'], [role='tab'], header")
      ) {
        if (event.cancelable) {
          event.preventDefault();
        }
        event.stopImmediatePropagation();
        const card = getDirectMediaContainer(dmLink);
        if (!isInsideInstagramLeftNav(card)) {
          shroudTarget(card);
        }
        if (card !== dmLink && !isInsideInstagramLeftNav(dmLink)) {
          shroudTarget(dmLink);
        }
        return;
      }
    }
  }

  function getDirectMediaContainer(link) {
    if (!(link instanceof Element)) {
      return link;
    }
    if (isInsideInstagramLeftNav(link)) {
      return link;
    }
    let current = link;
    let card = link;

    while (current && current !== document.body && current !== document.documentElement) {
      if (
        current.matches &&
        (current.matches("nav, aside, [role='navigation'], [role='tablist'], [role='tab'], header") ||
         current.id === OVERLAY_ID ||
         current.id === EXPLORE_CURTAIN_ID)
      ) {
        break;
      }
      if (isInsideInstagramLeftNav(current)) {
        break;
      }

      const rect = current.getBoundingClientRect();
      if (rect.left < getInstagramSidebarRight() && (!document.querySelector("main, [role='main']")?.contains(current))) {
        break;
      }

      const isCardDimensions =
        (rect.width === 0 && rect.height === 0) ||
        (rect.width >= 80 && rect.width <= 550 && rect.height >= 60 && rect.height <= 850);

      const hasReactionButtons = Boolean(
        current.querySelector(
          "svg[aria-label*='Yanıtla' i], svg[aria-label*='Reply' i], svg[aria-label*='İfade' i], svg[aria-label*='React' i], svg[aria-label*='Beğen' i], svg[aria-label*='Like' i], button[aria-label*='Daha fazla' i], button[aria-label*='More' i]"
        )
      );

      // Stop at the attachment boundary, before a message row or the chat panel.
      if (current !== link && (
        !isCardDimensions || hasReactionButtons ||
        current.matches("[role='row'], [role='dialog'], [data-away-messages], [data-away-flyout]") ||
        current.querySelector("input, textarea, [contenteditable='true'], [role='textbox']") ||
        current.querySelectorAll("a[href*='/reel' i], a[href*='/p/' i], a[href*='/tv/' i]").length > 1
      )) {
        break;
      }

      if (isCardDimensions && !hasReactionButtons) {
        if (current.querySelector("video, img, canvas")) {
          card = current;
        }
      }

      if (current.parentElement) {
        const parentHasReactions = Boolean(
          current.parentElement.querySelector(
            "svg[aria-label*='Yanıtla' i], svg[aria-label*='Reply' i], svg[aria-label*='İfade' i], svg[aria-label*='React' i]"
          )
        );
        if (parentHasReactions && card !== link) {
          break;
        }
      }

      current = current.parentElement;
    }

    return card;
  }

  function isSharedMessageCard(card) {
    if (!(card instanceof Element) || !card.matches("div[role='button']")) {
      return false;
    }
    const inMessages = window.location.pathname.startsWith("/direct/") ||
      card.closest("[data-away-messages='true']");
    if (!inMessages || card.closest("nav, header, [role='navigation']") ||
      card.querySelector("input, textarea, [contenteditable='true'], [role='textbox']")) {
      return false;
    }
    // Full shares include an author; quoted reels can contain only a preview
    // and a clip icon. Match the innermost card so reply wrappers stay usable.
    const author = Array.from(card.querySelectorAll("a[href]")).some((link) => {
      try {
        const url = new URL(link.getAttribute("href"), window.location.origin);
        return url.origin === window.location.origin && /^\/[^/]+\/$/.test(url.pathname);
      } catch {
        return false;
      }
    });
    const preview = Array.from(card.querySelectorAll("img")).some((image) =>
      Number(image.getAttribute("width")) >= 100 && Number(image.getAttribute("height")) >= 100
    );
    const avatar = Array.from(card.querySelectorAll("img")).some((image) =>
      Number(image.getAttribute("width")) > 0 && Number(image.getAttribute("width")) <= 64
    );
    const clip = Array.from(card.querySelectorAll(
      "svg[aria-label='Klip' i], svg[aria-label='Clip' i], svg[aria-label='Reel' i], svg[aria-label='Reels' i]"
    )).some((icon) => icon.closest("div[role='button']") === card);
    return preview && ((author && avatar) || clip);
  }

  function shroudDirectMessageMedia() {
    if (!settings.protectInstagram) {
      return;
    }
    cleanInstagramLeftNav();
    for (const card of document.querySelectorAll("div[role='button']")) {
      if (isSharedMessageCard(card)) {
        card.setAttribute("data-away-direct-media", "");
        shroudTarget(card);
      }
    }
    const selector = "a[href*='/reel' i], a[href*='/p/' i], a[href*='/tv/' i]";
    for (const link of Array.from(document.querySelectorAll(selector))) {
      if (!isInsideInstagramMessageSurface(link)) {
        continue;
      }
      if (isInsideInstagramLeftNav(link)) {
        continue;
      }
      if (
        link.closest(
          "nav, aside, [role='navigation'], [data-away-flyout='true'], [role='tablist'], [role='tab'], header"
        )
      ) {
        continue;
      }
      const card = getDirectMediaContainer(link);
      if (isInsideInstagramLeftNav(card)) {
        continue;
      }
      // A shared preview can wrap the permalink rather than live inside it.
      // Mark that bounded card so the message-panel exemption and cleanup retain it.
      card.setAttribute("data-away-direct-media", "");
      shroudTarget(card);
      if (card !== link) {
        shroudTarget(link);
      }
    }
  }

  function tikTokSurfaceIsCovered() {
    return settings.protectTikTok &&
      currentRoute === rules.ROUTES.TIKTOK_FEED;
  }

  function tikTokFocusedVideoIsOpen() {
    return rules.shouldFocusTikTokVideo(currentRoute, settings);
  }

  function getVisibleModalDialogs() {
    const dialogSelectors = [
      '[role="dialog"]',
      '[aria-modal="true"]',
      '#login-modal',
      '#loginModalContentContainer',
      '#loginContainer',
      '[id*="modal-overlay"]',
      '[class*="tux-modal"]',
      '[class*="ModalContent"]',
      '[class*="DivModalContent"]'
    ];
    return Array.from(document.querySelectorAll(dialogSelectors.join(", "))).filter((element) => {
      if (element.id === OVERLAY_ID || element.id === EXPLORE_CURTAIN_ID) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });
  }

  function visibleModalDialogExists() {
    return getVisibleModalDialogs().length > 0;
  }

  function cleanTikTokShrouds(keepTarget = () => false) {
    for (const target of Array.from(document.querySelectorAll(`[${TIKTOK_SHROUD_ATTR}]`))) {
      if (keepTarget(target)) {
        continue;
      }
      const shroud = target.querySelector(`:scope > .${SHROUD_CLASS}`);
      if (shroud) {
        shroud.remove();
      }
      restoreShroudedTarget(target);
      target.removeAttribute(TIKTOK_SHROUD_ATTR);
    }
  }

  function restoreTikTokFocusedMedia(element) {
    if (element instanceof HTMLVideoElement && element.hasAttribute(TIKTOK_PREVIOUS_LOOP_ATTR)) {
      element.loop = element.getAttribute(TIKTOK_PREVIOUS_LOOP_ATTR) === "true";
      element.removeAttribute(TIKTOK_PREVIOUS_LOOP_ATTR);
    }
    element.removeAttribute(TIKTOK_FOCUSED_MEDIA_ATTR);
    element.removeAttribute(TIKTOK_RELATED_MEDIA_ATTR);
  }

  function cleanTikTokFocusedState() {
    document.documentElement.removeAttribute("data-away-tiktok-focused-video");
    for (const element of document.querySelectorAll(
      `[${TIKTOK_FOCUSED_MEDIA_ATTR}], [${TIKTOK_RELATED_MEDIA_ATTR}]`
    )) {
      restoreTikTokFocusedMedia(element);
    }
  }

  function getTikTokMainSurface() {
    const selectors = [
      "main",
      "[role='main']",
      "[id^='main-content-']",
      "[data-e2e='short-drama-page']",
      "[data-e2e='browse-page']",
      "[data-e2e='live-page']"
    ];
    const candidates = Array.from(document.querySelectorAll(selectors.join(", ")))
      .filter((element) => {
        if (element.closest("nav, aside, header, [role='dialog'], [aria-modal='true']")) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width >= 240 && rect.height >= 180;
      });
    return candidates.sort((left, right) => {
      const a = left.getBoundingClientRect();
      const b = right.getBoundingClientRect();
      return (b.width * b.height) - (a.width * a.height);
    })[0] || null;
  }

  function tikTokMediaLinks() {
    return Array.from(document.querySelectorAll(
      "a[href*='/video/' i], a[href*='/photo/' i]"
    )).filter((link) => !link.closest("nav, header"));
  }

  function shroudTikTokMediaLinks() {
    for (const link of tikTokMediaLinks()) {
      link.setAttribute(TIKTOK_SHROUD_ATTR, "");
      shroudTarget(link);
    }
  }

  function pauseTikTokMedia(except = null) {
    for (const video of document.querySelectorAll("video")) {
      if (video === except) continue;
      try {
        video.pause();
      } catch {}
    }
  }

  function applyTikTokFocusedVideo() {
    document.documentElement.setAttribute("data-away-tiktok-focused-video", "");
    const currentVideoId = rules.tikTokVideoId(window.location.href);
    const videos = Array.from(document.querySelectorAll("video"));
    for (const element of document.querySelectorAll(
      `[${TIKTOK_FOCUSED_MEDIA_ATTR}], [${TIKTOK_RELATED_MEDIA_ATTR}]`
    )) {
      restoreTikTokFocusedMedia(element);
    }

    for (const link of tikTokMediaLinks()) {
      const linkedVideoId = rules.tikTokVideoId(link.href);
      if (linkedVideoId && currentVideoId && linkedVideoId !== currentVideoId) {
        link.setAttribute(TIKTOK_RELATED_MEDIA_ATTR, "");
      }
    }

    const exactVideos = currentVideoId
      ? videos.filter((video) => {
          const link = video.closest("a[href*='/video/' i]");
          return link && rules.tikTokVideoId(link.href) === currentVideoId;
        })
      : [];
    const browseVideos = Array.from(document.querySelectorAll(
      "[data-e2e='browse-video'] video, [data-e2e='video-player'] video"
    ));
    const candidates = exactVideos.length > 0 ? exactVideos : browseVideos.length > 0 ? browseVideos : videos;
    const viewportArea = (video) => {
      const rect = video.getBoundingClientRect();
      const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      return width * height;
    };
    const primary = candidates.sort((left, right) => {
      const a = left.getBoundingClientRect();
      const b = right.getBoundingClientRect();
      return (viewportArea(right) - viewportArea(left)) ||
        ((b.width * b.height) - (a.width * a.height));
    })[0] || null;
    if (primary) {
      primary.setAttribute(TIKTOK_PREVIOUS_LOOP_ATTR, String(primary.loop));
      primary.loop = true;
      primary.setAttribute(TIKTOK_FOCUSED_MEDIA_ATTR, "");
    }
    pauseTikTokMedia(primary);
  }

  function cleanYouTubeShrouds(keepTarget = () => false) {
    for (const target of Array.from(document.querySelectorAll(`[${YOUTUBE_SHROUD_ATTR}]`))) {
      if (keepTarget(target)) continue;
      const shroud = target.querySelector(`:scope > .${SHROUD_CLASS}`);
      if (shroud) shroud.remove();
      restoreShroudedTarget(target);
      target.removeAttribute(YOUTUBE_SHROUD_ATTR);
    }
  }

  function youtubeShortLinks() {
    return Array.from(document.querySelectorAll(
      "a[href^='/shorts/' i], a[href*='youtube.com/shorts/' i]"
    )).filter((link) => !link.closest("nav, #guide, ytd-mini-guide-renderer"));
  }

  function youtubeShortCard(link) {
    if (!(link instanceof Element)) return null;
    return link.closest([
      "ytd-rich-item-renderer",
      "ytd-video-renderer",
      "ytd-grid-video-renderer",
      "ytd-reel-item-renderer",
      "ytm-shorts-lockup-view-model",
      "ytm-video-with-context-renderer",
      "yt-lockup-view-model",
      "ytd-compact-video-renderer"
    ].join(", ")) || link;
  }

  function youtubeShortShelves() {
    return Array.from(document.querySelectorAll([
      "ytd-reel-shelf-renderer",
      "ytd-rich-shelf-renderer[is-shorts]",
      "ytm-reel-shelf-renderer"
    ].join(", ")));
  }

  function youtubeShortTargets() {
    const shelves = youtubeShortShelves();
    const targets = new Set(shelves);
    for (const link of youtubeShortLinks()) {
      if (shelves.some((shelf) => shelf.contains(link))) continue;
      const card = youtubeShortCard(link);
      if (card) targets.add(card);
    }
    return Array.from(targets);
  }

  function youtubeStrictNotificationMediaTargets() {
    if (!settings.protectYoutubeShorts || settings.youtubeProtectionMode !== "strict") {
      return [];
    }
    return Array.from(document.querySelectorAll(
      "ytd-notification-renderer yt-img-shadow:not(#avatar)"
    )).filter((target) => {
      // A known /shorts/ notification is already covered by its enclosing link.
      if (target.closest("a[href*='/shorts/' i]")) return false;
      const rect = target.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  function shroudYouTubeTargets(targets) {
    for (const target of targets) {
      target.setAttribute(YOUTUBE_SHROUD_ATTR, "");
      shroudTarget(target);
    }
  }

  function shroudYouTubeShorts() {
    shroudYouTubeTargets(youtubeShortTargets());
  }

  function getYouTubeMainSurface() {
    const candidates = Array.from(document.querySelectorAll([
      "ytd-browse[page-subtype='home'] ytd-rich-grid-renderer",
      "ytd-browse[page-subtype='home'] #contents",
      "ytd-two-column-browse-results-renderer #primary",
      "main",
      "[role='main']"
    ].join(", "))).filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width >= 300 && rect.height >= 180;
    });
    return candidates.sort((left, right) => {
      const a = left.getBoundingClientRect();
      const b = right.getBoundingClientRect();
      return (b.width * b.height) - (a.width * a.height);
    })[0] || null;
  }

  function pauseYouTubeMedia(except = null, onlyShortSurfaces = false) {
    const media = onlyShortSurfaces
      ? [
          ...youtubeShortTargets(),
          ...document.querySelectorAll(`[${YOUTUBE_STATIC_SHORT_ATTR}]`)
        ].flatMap((target) => Array.from(target.querySelectorAll("video")))
      : Array.from(document.querySelectorAll("video"));
    for (const video of new Set(media)) {
      if (video === except) continue;
      try {
        video.pause();
      } catch {}
    }
  }

  function youtubeWatchMetadataKind() {
    if (currentRoute !== rules.ROUTES.YOUTUBE_WATCH) return "unknown";
    const currentId = rules.youtubeVideoId(window.location.href);
    const metadataUrls = Array.from(document.querySelectorAll(
      "link[rel='canonical'][href], meta[property='og:url'][content], meta[itemprop='url'][content]"
    )).map((element) => element.href || element.content).filter(Boolean);
    let sawMatchingWatchMetadata = false;

    for (const value of metadataUrls) {
      const metadataId = rules.youtubeVideoId(value);
      if (currentId && metadataId && currentId !== metadataId) continue;
      const route = rules.classifySupportedUrl(value);
      // A Short may expose both a regular /watch URL and a /shorts canonical
      // during YouTube's SPA transition. Never let an earlier generic watch
      // signal overrule a later, more specific Shorts signal.
      if (route === rules.ROUTES.YOUTUBE_SHORTS) return "short";
      if (route === rules.ROUTES.YOUTUBE_WATCH) sawMatchingWatchMetadata = true;
    }

    if (document.querySelector("ytd-watch-flexy[is-shorts], ytd-shorts, [is-shorts-video]")) {
      return "short";
    }
    return sawMatchingWatchMetadata ? "video" : "unknown";
  }

  function restoreYouTubeFocusedMedia(element) {
    if (element instanceof HTMLVideoElement && element.hasAttribute(YOUTUBE_PREVIOUS_LOOP_ATTR)) {
      element.loop = element.getAttribute(YOUTUBE_PREVIOUS_LOOP_ATTR) === "true";
      element.removeAttribute(YOUTUBE_PREVIOUS_LOOP_ATTR);
    }
    element.removeAttribute(YOUTUBE_FOCUSED_MEDIA_ATTR);
    element.removeAttribute(YOUTUBE_RELATED_MEDIA_ATTR);
  }

  function cleanYouTubeFocusedState() {
    for (const element of document.querySelectorAll(
      `[${YOUTUBE_FOCUSED_MEDIA_ATTR}], [${YOUTUBE_RELATED_MEDIA_ATTR}]`
    )) {
      restoreYouTubeFocusedMedia(element);
    }
  }

  function applyYouTubeFocusedShort() {
    const currentId = rules.youtubeVideoId(window.location.href);
    cleanYouTubeFocusedState();
    const candidates = Array.from(document.querySelectorAll(
      "video.html5-main-video, #movie_player video, video"
    ));
    const primary = candidates.sort((left, right) => {
      const a = left.getBoundingClientRect();
      const b = right.getBoundingClientRect();
      return (b.width * b.height) - (a.width * a.height);
    })[0] || null;
    if (primary) {
      primary.setAttribute(YOUTUBE_PREVIOUS_LOOP_ATTR, String(primary.loop));
      // Focused Viewing is one deliberate play, not an automatic loop of the
      // same clip. The viewer can still replay it manually when useful.
      primary.loop = false;
      primary.setAttribute(YOUTUBE_FOCUSED_MEDIA_ATTR, "");
    }
    for (const link of document.querySelectorAll("a[href]")) {
      const linkedId = rules.youtubeVideoId(link.href);
      if (!linkedId || !currentId || linkedId === currentId) continue;
      const target = youtubeShortCard(link);
      if (target) target.setAttribute(YOUTUBE_RELATED_MEDIA_ATTR, "");
    }
    pauseYouTubeMedia(primary);
  }

  function disableYouTubeAutoplay() {
    const toggle = document.querySelector(
      ".ytp-autonav-toggle-button[aria-checked='true'], button[aria-label*='Autoplay' i][aria-pressed='true']"
    );
    if (toggle instanceof HTMLElement) {
      try {
        toggle.click();
      } catch {}
    }
  }

  function restoreYouTubeIntentionalLinks() {
    for (const link of document.querySelectorAll("a[data-away-youtube-original-href]")) {
      const original = link.getAttribute("data-away-youtube-original-href");
      if (original) link.setAttribute("href", original);
      link.removeAttribute("data-away-youtube-original-href");
    }
    for (const target of document.querySelectorAll(`[${YOUTUBE_STATIC_SHORT_ATTR}]`)) {
      target.removeAttribute(YOUTUBE_STATIC_SHORT_ATTR);
    }
  }

  function prepareYouTubeIntentionalLinks() {
    for (const link of youtubeShortLinks()) {
      const id = rules.youtubeVideoId(link.href);
      if (!id) continue;
      if (!link.hasAttribute("data-away-youtube-original-href")) {
        link.setAttribute("data-away-youtube-original-href", link.getAttribute("href") || link.href);
      }
      link.setAttribute("href", `/watch?v=${encodeURIComponent(id)}&away_focused=1`);
      const card = youtubeShortCard(link);
      if (card) card.setAttribute(YOUTUBE_STATIC_SHORT_ATTR, "");
    }
  }

  function clearYouTubeDocumentState() {
    for (const attribute of [
      "data-away-youtube-home-covered",
      "data-away-youtube-focused-short",
      "data-away-youtube-strict-watch",
      "data-away-youtube-watch-classifying",
      "data-away-youtube-intentional-grid"
    ]) {
      document.documentElement.removeAttribute(attribute);
    }
    cleanYouTubeShrouds();
    cleanYouTubeFocusedState();
    restoreYouTubeIntentionalLinks();
  }

  function applySurfaceShrouds() {
    const onYouTube = rules.platformForRoute(currentRoute) === "youtube";
    if (onYouTube) {
      const homeCovered = rules.shouldCoverYouTubeHome(currentRoute, settings);
      const shortsShrouded = rules.shouldShroudYouTubeShorts(currentRoute, settings);
      const intentionalGrid = rules.shouldAllowIntentionalYouTubeShorts(currentRoute, settings);
      const focusedShort = currentRoute === rules.ROUTES.YOUTUBE_WATCH &&
        settings.protectYoutubeShorts && settings.youtubeProtectionMode === "balanced" &&
        youtubeWatchClassification === "short";
      const strictWatch = currentRoute === rules.ROUTES.YOUTUBE_WATCH &&
        settings.protectYoutubeShorts && settings.youtubeProtectionMode === "strict" &&
        youtubeWatchClassification === "video";
      const notificationTargets = youtubeStrictNotificationMediaTargets();

      document.documentElement.toggleAttribute("data-away-youtube-home-covered", homeCovered);
      document.documentElement.toggleAttribute("data-away-youtube-focused-short", focusedShort);
      document.documentElement.toggleAttribute("data-away-youtube-strict-watch", strictWatch);
      document.documentElement.toggleAttribute("data-away-youtube-intentional-grid", intentionalGrid);

      if (!focusedShort) cleanYouTubeFocusedState();
      if (!intentionalGrid) restoreYouTubeIntentionalLinks();

      if (homeCovered) {
        const mainSurface = getYouTubeMainSurface();
        const externalShortTargets = youtubeShortTargets().filter((target) =>
          !mainSurface || !mainSurface.contains(target)
        );
        const retainedTargets = new Set([
          ...(mainSurface ? [mainSurface] : []),
          ...externalShortTargets,
          ...notificationTargets
        ]);
        cleanYouTubeShrouds((target) => retainedTargets.has(target));
        if (mainSurface) {
          mainSurface.setAttribute(YOUTUBE_SHROUD_ATTR, "");
          shroudTarget(mainSurface, true);
        }
        shroudYouTubeTargets([...externalShortTargets, ...notificationTargets]);
        pauseYouTubeMedia();
      } else if (shortsShrouded) {
        const targets = new Set([...youtubeShortTargets(), ...notificationTargets]);
        cleanYouTubeShrouds((target) => targets.has(target));
        shroudYouTubeTargets(targets);
        pauseYouTubeMedia(null, true);
      } else if (focusedShort) {
        cleanYouTubeShrouds();
        applyYouTubeFocusedShort();
        disableYouTubeAutoplay();
      } else if (intentionalGrid) {
        cleanYouTubeShrouds();
        prepareYouTubeIntentionalLinks();
        pauseYouTubeMedia(null, true);
      } else {
        const retainedTargets = new Set(notificationTargets);
        cleanYouTubeShrouds((target) => retainedTargets.has(target));
        shroudYouTubeTargets(notificationTargets);
      }
      if (strictWatch) disableYouTubeAutoplay();
      restorePageScrolling();
      return;
    }
    clearYouTubeDocumentState();
    const onTikTok = rules.platformForRoute(currentRoute) === "tiktok";
    const coveredTikTok = tikTokSurfaceIsCovered();
    const shroudTikTokMedia = rules.shouldShroudTikTokMedia(currentRoute, settings);
    const focusedTikTokVideo = tikTokFocusedVideoIsOpen();
    document.documentElement.toggleAttribute("data-away-tiktok-covered", coveredTikTok);
    document.documentElement.toggleAttribute("data-away-tiktok-focused-video", focusedTikTokVideo);
    document.documentElement.toggleAttribute(
      "data-away-tiktok-intentional-grid",
      onTikTok && settings.protectTikTok && settings.tiktokProtectionMode === "balanced" &&
        [rules.ROUTES.TIKTOK_SEARCH, rules.ROUTES.TIKTOK_PROFILE,
          rules.ROUTES.TIKTOK_MESSAGES].includes(currentRoute)
    );

    if (onTikTok) {
      if (!focusedTikTokVideo) {
        cleanTikTokFocusedState();
      }
      if (coveredTikTok) {
        const mainSurface = getTikTokMainSurface();
        const fallbackTargets = mainSurface ? [] : Array.from(document.querySelectorAll(
          "[data-key-interaction='video_card'], [data-e2e='browse-video']"
        ));
        const retainedTargets = new Set(mainSurface ? [mainSurface] : fallbackTargets);
        cleanTikTokShrouds((target) => retainedTargets.has(target));
        if (mainSurface) {
          mainSurface.setAttribute(TIKTOK_SHROUD_ATTR, "");
          shroudTarget(mainSurface, true);
        } else {
          for (const target of fallbackTargets) {
            target.setAttribute(TIKTOK_SHROUD_ATTR, "");
            shroudTarget(target);
          }
        }
        pauseTikTokMedia();
      } else if (shroudTikTokMedia) {
        const mediaLinks = new Set(tikTokMediaLinks());
        cleanTikTokShrouds((target) => mediaLinks.has(target));
        shroudTikTokMediaLinks();
        pauseTikTokMedia();
      } else if (focusedTikTokVideo) {
        cleanTikTokShrouds();
        applyTikTokFocusedVideo();
      } else if (
        settings.protectTikTok && settings.tiktokProtectionMode === "balanced" &&
        [rules.ROUTES.TIKTOK_SEARCH, rules.ROUTES.TIKTOK_PROFILE,
          rules.ROUTES.TIKTOK_MESSAGES].includes(currentRoute)
      ) {
        cleanTikTokShrouds();
        pauseTikTokMedia();
      } else {
        cleanTikTokShrouds();
      }
      restorePageScrolling();
      return;
    }
    const instagramMediaProtectionEnabled = settings.protectInstagram &&
      rules.platformForRoute(currentRoute) === "instagram" &&
      (rules.shouldCoverSurfaceInPlace(currentRoute, settings) ||
        currentRoute === rules.ROUTES.DIRECT_MESSAGES);
    document.documentElement.toggleAttribute(
      "data-away-instagram-media-protection",
      instagramMediaProtectionEnabled
    );
    document.documentElement.toggleAttribute("data-away-instagram-direct",
      window.location.pathname.startsWith("/direct/"));
    document.documentElement.toggleAttribute(
      "data-away-instagram-balanced-profile",
      balancedProfileIsOpen()
    );
    const instagramStrictProtectionEnabled = settings.protectInstagram &&
      rules.platformForRoute(currentRoute) === "instagram" &&
      settings.instagramProtectionMode === "strict";
    document.documentElement.toggleAttribute(
      "data-away-instagram-strict",
      instagramStrictProtectionEnabled
    );
    if (rules.platformForRoute(currentRoute) === "instagram") {
      cleanInstagramLeftNav();
      getInstagramFlyoutInfo();
      getInstagramFloatingMessagesInfo();
      shroudDirectMessageMedia();
      if (instagramStrictProtectionEnabled) {
        shroudInstagramStoryLinks();
        shroudInstagramNotificationMedia();
      } else {
        cleanInstagramStoryShrouds();
        cleanInstagramNotificationMediaShrouds();
      }
    }

    if (balancedProfileIsOpen()) {
      // Clear Strict-mode /p/ covers, preserve any existing Reel covers, then
      // protect newly mounted Reel cells. This avoids a remove/re-add mutation
      // loop while Instagram updates profile grids as an SPA.
      cleanBalancedProfilePostShrouds();
      shroudProfileGridLinks();
      shroudDirectMessageMedia();
      applyExploreCurtain();
      restorePageScrolling();
      return;
    }

    if (
      !rules.shouldCoverSurfaceInPlace(currentRoute, settings) &&
      !rules.shouldShroudProfileGrids(currentRoute, settings)
    ) {
      removeSurfaceShrouds(true);
      shroudDirectMessageMedia();
      applyExploreCurtain();
      return;
    }

    if (
      currentRoute === rules.ROUTES.INDIVIDUAL_POST ||
      currentRoute === rules.ROUTES.HOME_FEED
    ) {
      shroudInstagramPostArticles();
    }

    if (rules.shouldShroudProfileGrids(currentRoute, settings)) {
      shroudProfileGridLinks();
    }

    if (currentRoute === rules.ROUTES.EXPLORE && settings.protectInstagram) {
      shroudExploreGridLinks();
    }

    applyExploreCurtain();
    shroudDirectMessageMedia();
  }

  function lockCoveredSurfaceScrolling() {
    if (isInstagramFlyoutOpen() || exploreCurtainPaused) {
      return;
    }
    document.documentElement.style.overflow = "hidden";
    if (document.body) {
      document.body.style.overflow = "hidden";
    }
  }

  async function incrementInterventionCount(reason) {
    if (!isExtensionContextValid()) {
      return;
    }
    const token = `${reason}:${window.location.pathname}`;
    if (lastInterventionToken === token) {
      return;
    }

    lastInterventionToken = token;
    try {
      const stored = rules.normalizeSettings(await extensionApi.storage.local.get(null));
      const updates = rules.incrementInterventionCounters(stored, rules.platformForRoute(reason));

      settings = { ...stored, ...updates };
      if (isExtensionContextValid()) {
        await extensionApi.storage.local.set(updates);
      }
    } catch {
      // Ignored if extension context is invalidated
    }
  }

  function disableCurrentProtection() {
    const key = rules.settingForRoute(overlayReason);
    if (!key) {
      removeOverlay();
      return;
    }
    if (isExtensionContextValid()) {
      try {
        extensionApi.storage.local.set({ [key]: false }).catch(() => {}).finally(removeOverlay);
        return;
      } catch {}
    }
    removeOverlay();
  }

  function interventionMessageKeys(reason) {
    if (reason === rules.ROUTES.REELS) {
      return ["reelsInterventionTitle", "reelsInterventionDescription"];
    }
    if (reason === rules.ROUTES.INDIVIDUAL_POST) {
      return ["postInterventionTitle", "postInterventionDescription"];
    }
    if (reason === rules.ROUTES.EXPLORE) {
      return ["exploreInterventionTitle", "exploreInterventionDescription"];
    }
    if (reason === rules.ROUTES.TIKTOK_FEED || reason === rules.ROUTES.TIKTOK_VIDEO) {
      return ["tiktokInterventionTitle", "tiktokInterventionDescription"];
    }
    if (reason === rules.ROUTES.YOUTUBE_SHORTS) {
      return ["youtubeInterventionTitle", "youtubeInterventionDescription"];
    }
    return ["feedInterventionTitle", "feedInterventionDescription"];
  }

  function actionConfiguration(reason) {
    const platform = rules.platformForRoute(reason);
    if (platform === "instagram") {
      return {
        leaveKey: "leaveInstagram",
        destinationKey: "goToMessages",
        destinationUrl: "https://www.instagram.com/direct/inbox/"
      };
    }
    if (platform === "tiktok") {
      return {
        leaveKey: "leaveTikTok",
        destinationKey: "goToTikTokHome",
        destinationUrl: "https://www.tiktok.com/"
      };
    }
    return {
      leaveKey: "leaveYouTube",
      destinationKey: "goToYouTubeHome",
      destinationUrl: "https://www.youtube.com/"
    };
  }

  function buildOverlay(reason) {
    const root = createElement("div", "away-doomscrollin-overlay");
    root.id = OVERLAY_ID;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", `${OVERLAY_ID}-title`);

    const card = createElement("section", "away-doomscrollin-card");
    const brand = createElement("div", "away-doomscrollin-brand");
    const logo = createElement("img", "away-doomscrollin-logo");
    logo.src = extensionApi.runtime.getURL("icons/icon-48.png");
    logo.alt = "";
    logo.width = 42;
    logo.height = 42;

    const brandDivider = createElement("span", "away-doomscrollin-brand-divider");
    brandDivider.setAttribute("aria-hidden", "true");
    const brandCopy = createElement("div", "away-doomscrollin-brand-copy");
    const brandName = createElement("p", "away-doomscrollin-brand-name", "AwayDoomscrollin'");
    const brandByline = createElement("p", "away-doomscrollin-brand-byline", message("byResolveCommunity"));
    brandCopy.append(brandName, brandByline);
    brand.append(logo, brandDivider, brandCopy);

    const eyebrow = createElement("p", "away-doomscrollin-eyebrow", message("interventionEyebrow"));
    const [titleKey, descriptionKey] = interventionMessageKeys(reason);
    const title = createElement("h1", "away-doomscrollin-title", message(titleKey));
    title.id = `${OVERLAY_ID}-title`;

    const description = createElement(
      "p",
      "away-doomscrollin-description",
      message(descriptionKey)
    );

    const actions = createElement("div", "away-doomscrollin-actions");

    function renderDefaultActions() {
      title.textContent = message(titleKey);
      description.textContent = message(descriptionKey);
      actions.replaceChildren();

      const actionConfigurationForRoute = actionConfiguration(reason);
      const leaveButton = createElement(
        "button",
        "away-doomscrollin-button away-doomscrollin-button-primary",
        message(actionConfigurationForRoute.leaveKey)
      );
      leaveButton.type = "button";
      leaveButton.addEventListener("click", () => navigateTo("about:blank"));

      const destinationButton = createElement(
        "button",
        "away-doomscrollin-button",
        message(actionConfigurationForRoute.destinationKey)
      );
      destinationButton.type = "button";
      destinationButton.addEventListener("click", () => navigateTo(actionConfigurationForRoute.destinationUrl));

      const disableButton = createElement("button", "away-doomscrollin-button away-doomscrollin-button-quiet", message("disableProtection"));
      disableButton.type = "button";
      disableButton.addEventListener("click", showDisableConfirmation);

      actions.append(leaveButton, destinationButton, disableButton);
    }

    function showDisableConfirmation() {
      title.textContent = message("confirmDisableTitle");
      description.textContent = message("confirmDisableDescription");
      actions.replaceChildren();

      const keepButton = createElement(
        "button",
        "away-doomscrollin-button away-doomscrollin-button-primary",
        message("keepProtection")
      );
      keepButton.type = "button";
      keepButton.addEventListener("click", () => {
        renderDefaultActions();
        const first = actions.querySelector("button");
        if (first) {
          first.focus();
        }
      });

      const confirmButton = createElement(
        "button",
        "away-doomscrollin-button away-doomscrollin-button-quiet",
        message("confirmDisableButton")
      );
      confirmButton.type = "button";
      confirmButton.addEventListener("click", disableCurrentProtection);

      actions.append(keepButton, confirmButton);
      keepButton.focus();
    }

    renderDefaultActions();

    const websiteLink = createElement("a", "away-doomscrollin-website", "awaydoomscrollin.com");
    websiteLink.href = websiteUrl();
    websiteLink.target = "_blank";
    websiteLink.rel = "noreferrer";
    websiteLink.setAttribute("aria-label", message("websiteLinkLabel"));

    card.append(brand, eyebrow, title, description, actions, websiteLink);
    root.append(card);
    return root;
  }

  function showOverlay(reason) {
    // Product invariant: Instagram never shows the fullscreen intervention.
    // Direct Reels/posts are redirected to DMs and every other protected
    // Instagram surface is covered in place.
    if (rules.platformForRoute(reason) === "instagram") {
      return;
    }

    if (overlayReason === reason && document.getElementById(OVERLAY_ID)) {
      return;
    }

    removeOverlay();
    overlayReason = reason;
    previousDocumentOverflow = document.documentElement.style.overflow;
    previousBodyOverflow = document.body ? document.body.style.overflow : "";
    document.documentElement.style.overflow = "hidden";
    if (document.body) {
      document.body.style.overflow = "hidden";
    }

    const overlay = buildOverlay(reason);
    (document.body || document.documentElement).append(overlay);
    const firstButton = overlay.querySelector("button");
    if (firstButton) {
      firstButton.focus();
    }

    applyExploreCurtain();
    void incrementInterventionCount(reason);
  }

  function visibleInstagramDialogExists() {
    return visibleModalDialogExists();
  }

  function isInstagramFlyoutToggle(target) {
    // The left-nav entries (notifications, search) that open Instagram's
    // slide-in side panels, matched by their accessible names in both locales.
    if (!(target instanceof Element)) {
      return false;
    }
    const rect = target.getBoundingClientRect();
    const isInSidebarArea = rect.left >= 0 && rect.left < 280;
    if (!isInSidebarArea) {
      return false;
    }

    const control = target.closest("a, [role='link'], [role='button'], button, [data-testid*='nav']");
    if (!control) {
      return false;
    }

    if (
      control.matches("a[href*='/your_activity' i], a[href*='/saved/' i], a[href$='/saved' i]") ||
      control.closest("a[href*='/your_activity' i], a[href*='/saved/' i], a[href$='/saved' i]")
    ) {
      return false;
    }

    const candidates = [
      target.getAttribute("aria-label"),
      target.getAttribute("title"),
      control.getAttribute("aria-label"),
      control.getAttribute("title"),
      target.closest("svg")?.getAttribute("aria-label"),
      control.querySelector("svg")?.getAttribute("aria-label"),
      control.textContent
    ];

    const labels = candidates
      .filter((s) => typeof s === "string" && s.trim().length > 0)
      .map((s) => s.trim().toLocaleLowerCase());

    const keywords = [
      "notifications",
      "bildirimler",
      "bildirim",
      "activity",
      "hareketler",
      "etkinlik",
      "beğenmeler",
      "search",
      "ara",
      "arama",
      "mesajlar",
      "mesaj",
      "messages",
      "direct",
      "sohbet"
    ];

    if (labels.some((label) => keywords.some((keyword) => label === keyword || (label.length < 35 && label.includes(keyword))))) {
      return true;
    }

    if (target.closest("[data-away-messages='true']")) {
      return true;
    }

    if (target.closest("nav, aside, [role='navigation']")) {
      const link = target.closest("a");
      if (link) {
        const href = (link.getAttribute("href") || "").toLowerCase();
        if (
          href.includes("notifications") ||
          href.includes("bildirim") ||
          href.includes("activity") ||
          href.includes("search") ||
          href.includes("direct")
        ) {
          return true;
        }
      }
    }

    return false;
  }

  function isInsideInstagramNavOrFlyout(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    const main = document.querySelector("main, [role='main']");
    if (main && main.contains(target)) {
      return false;
    }
    if (
      target.closest(
        "nav, aside, header, [role='navigation'], [role='dialog'], [aria-modal='true'], [data-away-flyout], [data-away-messages='true']"
      )
    ) {
      return true;
    }
    const messagesInfo = getInstagramFloatingMessagesInfo();
    if (messagesInfo.element && messagesInfo.element.contains(target)) {
      return true;
    }
    const flyoutInfo = getInstagramFlyoutInfo();
    if (flyoutInfo.isOpen) {
      if (flyoutInfo.element && flyoutInfo.element.contains(target)) {
        return true;
      }
      const rect = target.getBoundingClientRect();
      if (rect.right <= flyoutInfo.right) {
        return true;
      }
    }
    const rect = target.getBoundingClientRect();
    if (rect.left >= 0 && rect.left < 260 && (!main || !main.contains(target))) {
      return true;
    }
    return false;
  }

  function activateInstagramFlyoutPanel(panel) {
    if (!(panel instanceof Element)) {
      return;
    }
    panel.setAttribute("data-away-flyout", "true");
    panel.setAttribute("data-away-flyout-elevated", "true");
    const style = window.getComputedStyle(panel);
    panel.toggleAttribute("data-away-flyout-positioned", style.position === "static");

    for (const element of document.querySelectorAll("[data-away-flyout]")) {
      if (element === panel) {
        continue;
      }
      element.removeAttribute("data-away-flyout");
      element.removeAttribute("data-away-flyout-elevated");
      element.removeAttribute("data-away-flyout-positioned");
      element.style.removeProperty("z-index");
    }
  }

  function clearInstagramFlyoutPanels() {
    for (const element of document.querySelectorAll(
      "[data-away-flyout], [data-away-flyout-elevated], [data-away-flyout-positioned]"
    )) {
      element.removeAttribute("data-away-flyout");
      element.removeAttribute("data-away-flyout-elevated");
      element.removeAttribute("data-away-flyout-positioned");
      element.style.removeProperty("z-index");
    }
  }

  function syncInstagramShroudsBehindFlyout() {
    for (const shroud of document.querySelectorAll(`[${FLYOUT_CLIPPED_SHROUD_ATTR}]`)) {
      shroud.removeAttribute(FLYOUT_CLIPPED_SHROUD_ATTR);
      shroud.style.removeProperty("clip-path");
      shroud.style.removeProperty("visibility");
    }

    if (
      !settings.protectInstagram ||
      rules.platformForRoute(currentRoute) !== "instagram"
    ) {
      document.documentElement.removeAttribute("data-away-instagram-flyout-open");
      return;
    }

    const flyoutInfo = getInstagramFlyoutInfo();
    document.documentElement.toggleAttribute(
      "data-away-instagram-flyout-open",
      flyoutInfo.isOpen
    );
    if (!flyoutInfo.isOpen || flyoutInfo.right <= 0) {
      return;
    }
    const flyoutRight = flyoutInfo.element
      ? flyoutInfo.element.getBoundingClientRect().right
      : flyoutInfo.right;

    for (const target of document.querySelectorAll(
      `:is(main, [role="main"]) [${SHROUD_TARGET_ATTR}]`
    )) {
      if (target.closest("[data-away-flyout='true'], [data-away-messages='true']")) {
        continue;
      }
      const shroud = target.querySelector(`:scope > .${SHROUD_CLASS}`);
      if (!shroud) {
        continue;
      }
      const rect = target.getBoundingClientRect();
      const coveredWidth = Math.min(rect.width, Math.max(0, flyoutRight - rect.left));
      if (rect.width <= 0 || coveredWidth <= 0) {
        continue;
      }
      shroud.setAttribute(FLYOUT_CLIPPED_SHROUD_ATTR, "");
      if (coveredWidth >= rect.width - 1) {
        shroud.style.setProperty("visibility", "hidden", "important");
      } else {
        shroud.style.setProperty(
          "clip-path",
          `inset(0px 0px 0px ${Math.ceil(coveredWidth)}px)`,
          "important"
        );
      }
    }
  }

  function getInstagramFlyoutInfo() {
    const visibleDialogs = getVisibleModalDialogs();
    if (visibleDialogs.length > 0) {
      const notificationDialog = visibleDialogs.find((dialog) => {
        const rect = dialog.getBoundingClientRect();
        const text = (dialog.textContent || "").trim();
        return rect.left >= 40 &&
          rect.right <= 700 &&
          rect.width >= 260 &&
          rect.height >= window.innerHeight * 0.4 &&
          INSTAGRAM_NOTIFICATION_PANEL_TEXT_PATTERN.test(text);
      });
      if (notificationDialog) {
        activateInstagramFlyoutPanel(notificationDialog);
        const rect = notificationDialog.getBoundingClientRect();
        return {
          isOpen: true,
          element: notificationDialog,
          right: Math.max(Math.round(rect.right), 470)
        };
      }
      return { isOpen: true, right: window.innerWidth, element: null };
    }

    // Flyout drawers (Search and Notifications) are rendered outside <main> and outside <nav>.
    // They slide in from the left, positioned between left: 50px and 150px with width 280px to 550px.

    // 1. Search input in left search drawer
    const searchInputs = document.querySelectorAll(
      "input[placeholder*='Ara' i], input[placeholder*='Search' i], input[aria-label*='Search' i], input[aria-label*='Ara' i]"
    );
    for (const input of searchInputs) {
      const rect = input.getBoundingClientRect();
      // If it's a top search bar inside main (rect.top < 150), it's the explore header (handled by getExploreTopHeaderBottom), not a flyout drawer
      if (input.closest("main, [role='main']") && rect.top < 150) {
        continue;
      }
      if (rect.left >= 40 && rect.left < 500 && rect.width > 50) {
        let host = input.parentElement;
        let drawerPanel = null;
        while (host && host !== document.body && host !== document.documentElement) {
          const hr = host.getBoundingClientRect();
          if (
            hr.width >= 240 &&
            hr.width <= 550 &&
            hr.height >= window.innerHeight * 0.4 &&
            !host.querySelector("main")
          ) {
            drawerPanel = host;
          }
          host = host.parentElement;
        }
        const activeDrawer = drawerPanel || input.closest("div[style*='width']") || input.parentElement;
        if (activeDrawer) {
          activateInstagramFlyoutPanel(activeDrawer);
          const dRect = activeDrawer.getBoundingClientRect();
          return {
            isOpen: true,
            element: activeDrawer,
            right: Math.max(Math.round(dRect.right), Math.round(rect.right) + 40, 470)
          };
        }
      }
    }

    // 2. Notifications / Activity drawer detection:
    // When the drawer is open, it contains headings or notification text strictly outside main and nav
    const drawerKeywords = [
      "bildirimler",
      "notifications",
      "bildirim",
      "activity",
      "hareketler",
      "filtrele",
      "filter",
      "yorumlar",
      "comments",
      "takipler",
      "follows",
      "takipçiler",
      "followers",
      "bahsetmeler",
      "mentions",
      "doğrulanmış",
      "verified",
      "bu hafta",
      "this week",
      "bu ay",
      "this month",
      "bugün",
      "today",
      "dün",
      "yesterday",
      "daha önce",
      "earlier",
      "önceki",
      "istekler",
      "requests",
      "tüm bildirimler",
      "all notifications",
      "seni takip etmeye başladı",
      "started following you",
      "fotoğrafını beğendi",
      "liked your photo"
    ];

    const textNodes = document.querySelectorAll(
      "span, div, h1, h2, h3, p, a, button, [role='heading'], [role='button']"
    );
    for (const node of textNodes) {
      // Must be strictly outside main and outside the static left sidebar
      if (node.closest("main, [role='main']") || node.closest("nav, aside, [role='navigation']")) {
        continue;
      }

      const rect = node.getBoundingClientRect();
      if (rect.left < 0 || rect.left > 550 || rect.width === 0 || rect.height === 0) {
        continue;
      }

      const text = (node.textContent || "").trim().toLowerCase();
      if (!text) {
        continue;
      }

      const matchesKeyword =
        drawerKeywords.includes(text) ||
        (text.length < 80 && drawerKeywords.some((kw) => text.includes(kw)));

      if (matchesKeyword) {
        const style = window.getComputedStyle(node);
        if (style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0") {
          let panel = node;
          let topDrawerPanel = null;
          while (
            panel.parentElement &&
            panel.parentElement !== document.body &&
            panel.parentElement !== document.documentElement
          ) {
            const pRect = panel.parentElement.getBoundingClientRect();
            if (
              pRect.left >= 0 &&
              pRect.left <= 150 &&
              pRect.width >= 280 &&
              pRect.width <= 550 &&
              pRect.height >= window.innerHeight * 0.4 &&
              !panel.parentElement.querySelector("main, nav, aside, [role='navigation']")
            ) {
              topDrawerPanel = panel.parentElement;
            }
            panel = panel.parentElement;
          }
          if (topDrawerPanel) {
            activateInstagramFlyoutPanel(topDrawerPanel);
            const pRect = topDrawerPanel.getBoundingClientRect();
            return {
              isOpen: true,
              element: topDrawerPanel,
              right: Math.max(Math.round(pRect.right), Math.round(rect.right), 470)
            };
          }
        }
      }
    }

    // Clean up any stale data-away-flyout attributes when no flyout is open
    clearInstagramFlyoutPanels();

    return { isOpen: false, right: 0, element: null };
  }

  function getInstagramFloatingMessagesInfo() {
    if (rules.platformForRoute(currentRoute) !== "instagram") {
      return { isOpen: false, element: null, rect: null };
    }

    const main = document.querySelector("main, [role='main']");

    function setupMessagesPanel(panel) {
      if (panel.getAttribute("data-away-messages") !== "true") {
        panel.setAttribute("data-away-messages", "true");
      }
      if (panel.style.zIndex !== "1000") {
        panel.style.setProperty("z-index", "1000", "important");
      }

      let ancestor = panel.parentElement;
      while (ancestor && ancestor !== document.body && ancestor !== document.documentElement && ancestor !== main) {
        if (ancestor.parentElement === document.body) {
          if (ancestor.style.zIndex !== "1000") {
            ancestor.style.setProperty("z-index", "1000", "important");
          }
        }
        const aStyle = window.getComputedStyle ? window.getComputedStyle(ancestor) : null;
        if (aStyle && (aStyle.position === "fixed" || aStyle.position === "absolute")) {
          if (ancestor.style.zIndex !== "1000") {
            ancestor.style.setProperty("z-index", "1000", "important");
          }
        }
        ancestor = ancestor.parentElement;
      }

      const rect = panel.getBoundingClientRect();
      const isOpen = rect.height > 150;
      return { isOpen, element: panel, rect };
    }

    function findHostFloatingPanel(node) {
      if (!node || !(node instanceof Element)) {
        return null;
      }
      if (node.closest("main, [role='main'], nav, aside")) {
        return null;
      }

      let host = node;
      let floatingPanel = null;
      while (host && host !== document.body && host !== document.documentElement && host !== main) {
        const rect = host.getBoundingClientRect();
        if (
          rect.right >= window.innerWidth - 600 &&
          rect.bottom >= window.innerHeight - 150 &&
          rect.width >= 50 &&
          rect.width <= 600 &&
          rect.height >= 25
        ) {
          floatingPanel = host;
        }
        host = host.parentElement;
      }
      return floatingPanel;
    }

    // 1. Search by SVG aria-labels or title attributes in floating messages widget
    const svgSelectors = [
      "svg[aria-label*='Yeni mesaj' i]",
      "svg[aria-label*='New message' i]",
      "svg[aria-label*='Mesaj' i]",
      "svg[aria-label*='Message' i]",
      "svg[aria-label*='Direct' i]",
      "svg[aria-label*='Sohbet' i]",
      "svg[aria-label*='Chat' i]"
    ];

    for (const sel of svgSelectors) {
      for (const svg of document.querySelectorAll(sel)) {
        const panel = findHostFloatingPanel(svg);
        if (panel) {
          return setupMessagesPanel(panel);
        }
      }
    }

    // 2. Search by input / textarea / textbox used in direct message threads
    const inputSelectors = [
      "input[placeholder*='Mesaj' i]",
      "textarea[placeholder*='Mesaj' i]",
      "div[aria-label*='Mesaj' i]",
      "div[aria-label*='Message' i]",
      "input[placeholder*='Message' i]",
      "textarea[placeholder*='Message' i]",
      "[role='textbox'][aria-label*='Mesaj' i]",
      "[role='textbox'][aria-label*='Message' i]"
    ];

    for (const sel of inputSelectors) {
      for (const input of document.querySelectorAll(sel)) {
        const panel = findHostFloatingPanel(input);
        if (panel) {
          return setupMessagesPanel(panel);
        }
      }
    }

    // 3. Search by text "Mesajlar" or "Messages" in the bottom-right corner
    const textNodes = document.querySelectorAll("button, [role='button'], span, div, p");
    for (const node of textNodes) {
      if (node.children.length > 3) {
        continue;
      }
      const text = (node.textContent || "").trim();
      if (
        text === "Mesajlar" ||
        text === "Messages" ||
        text === "Direct" ||
        text.startsWith("Mesajlar") ||
        text.startsWith("Messages")
      ) {
        const panel = findHostFloatingPanel(node);
        if (panel) {
          return setupMessagesPanel(panel);
        }
      }
    }

    // 3. Check for previously marked element
    const previouslyMarked = document.querySelector("[data-away-messages='true']");
    if (previouslyMarked) {
      const rect = previouslyMarked.getBoundingClientRect();
      if (rect.width >= 50 && rect.height >= 25) {
        return setupMessagesPanel(previouslyMarked);
      }
    }

    return { isOpen: false, element: null, rect: null };
  }

  function isInstagramFlyoutOpen() {
    return getInstagramFlyoutInfo().isOpen;
  }

  function handleInstagramFlyoutClick(event) {
    if (rules.platformForRoute(currentRoute) !== "instagram" || !settings.protectInstagram) {
      return;
    }

    if (isInstagramFlyoutToggle(event.target)) {
      exploreCurtainPaused = true;
      applyRouteState();
      for (const delay of [50, 150, 300, 500, 800]) {
        window.setTimeout(() => {
          if (getInstagramFlyoutInfo().isOpen) {
            exploreCurtainPaused = false;
            applyRouteState();
          } else if (delay === 800) {
            exploreCurtainPaused = false;
            applyRouteState();
          }
        }, delay);
      }
      return;
    }

    if (!isInsideInstagramNavOrFlyout(event.target) && !eventTargetsOverlay(event)) {
      exploreCurtainPaused = false;
      window.setTimeout(applyRouteState, 50);
      window.setTimeout(applyRouteState, 250);
    }
  }

  function isEditableTarget(target) {
    return target instanceof Element && Boolean(
      target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
    );
  }

  function isProtectedFeedGestureTarget(target) {
    if (!(target instanceof Element) || isEditableTarget(target) || visibleInstagramDialogExists()) {
      return false;
    }

    if (target.closest("nav, header, aside")) {
      return false;
    }

    const main = document.querySelector("main, [role='main']");
    if (main) {
      return main.contains(target);
    }

    return currentRoute === rules.ROUTES.TIKTOK_FEED && document.body?.contains(target);
  }

  function isTikTokNavigationControl(target) {
    if (!(target instanceof Element)) {
      return false;
    }

    const control = target.closest(
      "button, [role='button'], [data-e2e='cinema-playback-control-autoscroll'], " +
      "input[name='cinema-mode-autoscroll']"
    );
    if (!control) {
      return false;
    }

    const accessibleName = control.getAttribute("aria-label") || control.getAttribute("title") || "";
    const markers = [
      control.getAttribute("data-e2e"),
      ...Array.from(control.querySelectorAll("[data-e2e]"), (element) => element.getAttribute("data-e2e"))
    ];

    if (markers.some((marker) => rules.isTikTokNavigationControlDescriptor(marker, accessibleName))) {
      return true;
    }

    return Boolean(
      control.matches('[class*="ButtonSwitchVideo"]') ||
      control.querySelector('[class*="ButtonSwitchVideo"]')
    );
  }

  function scrollableFeedIsArmed() {
    return !overlayReason && rules.shouldArmScrollableFeed(currentRoute, settings);
  }

  function eventTargetsOverlay(event) {
    const overlay = document.getElementById(OVERLAY_ID);
    return Boolean(
      overlay &&
      event?.target instanceof Node &&
      overlay.contains(event.target)
    );
  }

  function enforceImmediateRouteProtection(event) {
    applyRouteState();

    if (rules.platformForRoute(currentRoute) === "tiktok" && !settings.protectTikTok) {
      return false;
    }

    const protectedTikTokSurface = tikTokSurfaceIsCovered() || tikTokFocusedVideoIsOpen();
    if (!protectedTikTokSurface && (visibleModalDialogExists() || isEventInsideModal(event))) {
      return false;
    }

    if (tikTokSurfaceIsCovered()) {
      const target = event?.target;
      const scrollingKey = event?.type === "keydown" && rules.isTikTokNavigationKey(event.key);
      if (!isEditableTarget(target) &&
        (scrollingKey || ["wheel", "touchmove"].includes(event?.type) ||
          isTikTokNavigationControl(target))) {
        preventCoveredGesture(event);
      }
      return true;
    }

    if (tikTokFocusedVideoIsOpen()) {
      const target = event?.target;
      const scrollingKey = event?.type === "keydown" && rules.isTikTokNavigationKey(event.key);
      if (!isEditableTarget(target) &&
        (scrollingKey || ["wheel", "touchmove"].includes(event?.type) ||
          isTikTokNavigationControl(target))) {
        preventCoveredGesture(event);
      }
      return true;
    }

    if (!rules.shouldBlockImmediately(currentRoute, settings)) {
      return false;
    }

    if (!eventTargetsOverlay(event)) {
      interveneForScrollableFeed(event);
    }
    return true;
  }

  function rootScrollY() {
    const scrollingElement = document.scrollingElement || document.documentElement;
    return Number.isFinite(window.scrollY) ? window.scrollY : scrollingElement.scrollTop;
  }

  function resetRootScrollTracking() {
    lastRootScrollY = rootScrollY();
    rootScrollReadyAt = performance.now() + ROOT_SCROLL_ARM_DELAY_MS;
  }

  function interveneForScrollableFeed(event) {
    if (event && event.cancelable) {
      event.preventDefault();
    }
    if (event && typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    } else if (event) {
      event.stopPropagation();
    }
    showOverlay(currentRoute);
  }

  function handleTikTokNavigationControl(event) {
    if (!settings.protectTikTok) {
      return;
    }
    if (enforceImmediateRouteProtection(event)) {
      return;
    }

    if (
      !overlayReason &&
      rules.shouldArmScrollableFeed(currentRoute, settings) &&
      currentRoute === rules.ROUTES.TIKTOK_FEED &&
      isTikTokNavigationControl(event.target)
    ) {
      interveneForScrollableFeed(event);
    }
  }

  function isTargetOrPositionInNavOrFlyout(event) {
    if (visibleInstagramDialogExists()) {
      return true;
    }
    const target = event?.target;
    if (target instanceof Element && isInsideInstagramNavOrFlyout(target)) {
      return true;
    }
    const messagesInfo = getInstagramFloatingMessagesInfo();
    if (messagesInfo.element) {
      if (target instanceof Element && messagesInfo.element.contains(target)) {
        return true;
      }
      if (event && typeof event.clientX === "number" && typeof event.clientY === "number" && messagesInfo.rect) {
        const mr = messagesInfo.rect;
        if (
          event.clientX >= mr.left &&
          event.clientX <= mr.right &&
          event.clientY >= mr.top &&
          event.clientY <= mr.bottom
        ) {
          return true;
        }
      }
    }
    if (event && typeof event.clientX === "number" && event.clientX >= 0) {
      if (isInstagramFlyoutOpen() && event.clientX < 560) {
        return true;
      }
      if (event.clientX < 260) {
        return true;
      }
    }
    return false;
  }

  function handleWheel(event) {
    if (rules.platformForRoute(currentRoute) === "tiktok" && !settings.protectTikTok) {
      return;
    }
    if (enforceImmediateRouteProtection(event)) {
      return;
    }

    if (isTargetOrPositionInNavOrFlyout(event)) {
      return;
    }

    if (instagramSurfaceIsCovered() && rules.isMeaningfulVerticalIntent(event.deltaX, event.deltaY, WHEEL_THRESHOLD_PX)) {
      preventCoveredGesture(event);
      return;
    }

    if (
      scrollableFeedIsArmed() &&
      isProtectedFeedGestureTarget(event.target) &&
      rules.isMeaningfulVerticalIntent(event.deltaX, event.deltaY, WHEEL_THRESHOLD_PX)
    ) {
      interveneForScrollableFeed(event);
    }
  }

  function handleTouchStart(event) {
    if (rules.platformForRoute(currentRoute) === "tiktok" && !settings.protectTikTok) {
      touchStartY = null;
      return;
    }
    if (enforceImmediateRouteProtection(event)) {
      touchStartY = null;
      return;
    }

    if (isTargetOrPositionInNavOrFlyout(event)) {
      touchStartY = null;
      return;
    }

    if (instagramSurfaceIsCovered()) {
      touchStartY = event.touches.length === 1 ? event.touches[0].clientY : null;
      return;
    }

    if (!scrollableFeedIsArmed() || event.touches.length !== 1 || !isProtectedFeedGestureTarget(event.target)) {
      touchStartY = null;
      return;
    }
    touchStartY = event.touches[0].clientY;
  }

  function handleTouchMove(event) {
    if (rules.platformForRoute(currentRoute) === "tiktok" && !settings.protectTikTok) {
      touchStartY = null;
      return;
    }
    if (enforceImmediateRouteProtection(event)) {
      touchStartY = null;
      return;
    }

    if (touchStartY === null || event.touches.length !== 1) {
      return;
    }

    if (isTargetOrPositionInNavOrFlyout(event)) {
      return;
    }

    const deltaY = touchStartY - event.touches[0].clientY;
    if (Math.abs(deltaY) < TOUCH_THRESHOLD_PX) {
      return;
    }

    if (instagramSurfaceIsCovered()) {
      touchStartY = null;
      preventCoveredGesture(event);
      return;
    }

    if (scrollableFeedIsArmed() && isProtectedFeedGestureTarget(event.target)) {
      touchStartY = null;
      interveneForScrollableFeed(event);
    }
  }

  function isEventInsideModal(event) {
    const target = event?.target;
    if (!(target instanceof Element)) {
      return false;
    }
    return Boolean(
      target.closest(
        '[role="dialog"], [aria-modal="true"], #login-modal, #loginModalContentContainer, #loginContainer, [id*="modal-overlay"], [class*="tux-modal"]'
      )
    );
  }

  function handleKeyDown(event) {
    if (rules.platformForRoute(currentRoute) === "tiktok" && !settings.protectTikTok) {
      return;
    }
    if (enforceImmediateRouteProtection(event)) {
      return;
    }

    if (youtubeSingleVideoProtectionActive() && (
      (event.shiftKey && ["n", "p"].includes(String(event.key).toLowerCase())) ||
      ["MediaTrackNext", "MediaTrackPrevious"].includes(event.key)
    )) {
      preventCoveredGesture(event);
      return;
    }

    if (visibleModalDialogExists() || isEventInsideModal(event)) {
      return;
    }

    if (
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      !rules.isScrollingKey(event.key) ||
      isEditableTarget(event.target) ||
      isTargetOrPositionInNavOrFlyout(event) ||
      visibleInstagramDialogExists()
    ) {
      return;
    }

    if (instagramSurfaceIsCovered()) {
      preventCoveredGesture(event);
      return;
    }

    if (!scrollableFeedIsArmed()) {
      return;
    }

    interveneForScrollableFeed(event);
  }

  function handleRootScroll(event) {
    if (enforceImmediateRouteProtection(event)) {
      return;
    }

    if (isInstagramFlyoutOpen() || visibleInstagramDialogExists() || instagramSurfaceIsCovered()) {
      return;
    }

    const nextRootScrollY = rootScrollY();
    const previousRootScrollY = lastRootScrollY;
    lastRootScrollY = nextRootScrollY;

    if (
      !event.isTrusted ||
      !scrollableFeedIsArmed() ||
      performance.now() < rootScrollReadyAt ||
      document.visibilityState !== "visible" ||
      !document.hasFocus() ||
      visibleInstagramDialogExists()
    ) {
      return;
    }

    if (rules.isMeaningfulScrollDistance(
      previousRootScrollY,
      nextRootScrollY,
      ROOT_SCROLL_THRESHOLD_PX
    )) {
      showOverlay(currentRoute);
    }
  }

  function instagramSurfaceIsCovered() {
    return !overlayReason &&
      rules.platformForRoute(currentRoute) === "instagram" &&
      rules.shouldCoverSurfaceInPlace(currentRoute, settings);
  }

  function preventCoveredGesture(event) {
    if (event && event.cancelable) {
      event.preventDefault();
    }
    if (event && typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    } else if (event) {
      event.stopPropagation();
    }
  }

  function youtubeSingleVideoProtectionActive() {
    if (!settings.protectYoutubeShorts || currentRoute !== rules.ROUTES.YOUTUBE_WATCH) {
      return false;
    }
    return youtubeWatchClassification === "short" ||
      (settings.youtubeProtectionMode === "strict" && youtubeWatchClassification === "video");
  }

  function isYouTubeNavigationControl(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest([
      ".ytp-next-button",
      ".ytp-prev-button",
      "button[aria-label*='Next video' i]",
      "button[aria-label*='Previous video' i]",
      "button[aria-label*='Sonraki video' i]",
      "button[aria-label*='Önceki video' i]"
    ].join(", ")));
  }

  function handleYouTubeNavigationControl(event) {
    if (youtubeSingleVideoProtectionActive() && isYouTubeNavigationControl(event.target)) {
      preventCoveredGesture(event);
    }
  }

  function isStrictTikTokVideoUrl(value) {
    return settings.protectTikTok && settings.tiktokProtectionMode === "strict" &&
      rules.classifySupportedUrl(value) === rules.ROUTES.TIKTOK_VIDEO;
  }

  function isDifferentFocusedTikTokVideoUrl(value) {
    if (!tikTokFocusedVideoIsOpen()) return false;
    const currentVideoId = rules.tikTokVideoId(window.location.href);
    const linkedVideoId = rules.tikTokVideoId(value);
    return Boolean(currentVideoId && linkedVideoId && currentVideoId !== linkedVideoId);
  }

  function handleTikTokBlockedLinkClick(event) {
    if (!settings.protectTikTok || !(event.target instanceof Element)) {
      return;
    }
    const link = event.target.closest("a[href]");
    if (!link) return;
    const linkedRoute = rules.classifySupportedUrl(link.href);
    if (linkedRoute === rules.ROUTES.TIKTOK_FEED) {
      document.documentElement.setAttribute("data-away-tiktok-covered", "");
      pauseTikTokMedia();
      return;
    }
    if (link && isDifferentFocusedTikTokVideoUrl(link.href)) {
      preventCoveredGesture(event);
      return;
    }
    if (link && isStrictTikTokVideoUrl(link.href)) {
      if (event.type === "pointerdown" || event.type === "mousedown") {
        document.documentElement.setAttribute("data-away-tiktok-covered", "");
        pauseTikTokMedia();
        return;
      }
      preventCoveredGesture(event);
      window.location.assign("https://www.tiktok.com/messages");
    }
  }

  function applyRouteState() {
    if (!isExtensionContextValid()) {
      return;
    }
    const nextRoute = rules.classifySupportedUrl(window.location.href);
    if (settings.protectYoutubeShorts && nextRoute === rules.ROUTES.YOUTUBE_SHORTS) {
      const videoId = rules.youtubeVideoId(window.location.href);
      void incrementInterventionCount(nextRoute);
      document.documentElement.setAttribute("data-away-youtube-watch-classifying", "");
      pauseYouTubeMedia();
      if (settings.youtubeProtectionMode === "balanced" && videoId) {
        window.location.replace(
          `${window.location.origin}/watch?v=${encodeURIComponent(videoId)}&away_focused=1`
        );
      } else {
        window.location.replace("https://www.youtube.com/feed/subscriptions");
      }
      return;
    }
    if (
      settings.protectTikTok && settings.tiktokProtectionMode === "strict" &&
      nextRoute === rules.ROUTES.TIKTOK_VIDEO
    ) {
      document.documentElement.setAttribute("data-away-tiktok-redirecting", "");
      window.location.replace("https://www.tiktok.com/messages");
      return;
    }
    document.documentElement.removeAttribute("data-away-tiktok-redirecting");
    const routeChanged = nextRoute !== currentRoute || window.location.href !== lastLocation;
    currentRoute = nextRoute;
    lastLocation = window.location.href;

    if (routeChanged) {
      lastInterventionToken = null;
      touchStartY = null;
      exploreCurtainPaused = false;
      resetRootScrollTracking();
      youtubeWatchProbeStartedAt = nextRoute === rules.ROUTES.YOUTUBE_WATCH
        ? performance.now()
        : 0;
      youtubeWatchClassification = "unknown";
    }

    if (currentRoute === rules.ROUTES.YOUTUBE_WATCH && settings.protectYoutubeShorts) {
      const metadataKind = youtubeWatchMetadataKind();
      if (metadataKind !== "unknown") {
        youtubeWatchClassification = metadataKind;
      } else if (youtubeWatchProbeStartedAt === 0) {
        youtubeWatchProbeStartedAt = performance.now();
      } else if (performance.now() - youtubeWatchProbeStartedAt >= 3500) {
        // If YouTube withholds metadata, fail open for ordinary long-form use.
        // A later canonical update can still reclassify and protect the video.
        youtubeWatchClassification = "video";
      }

      const classifying = youtubeWatchClassification === "unknown";
      document.documentElement.toggleAttribute("data-away-youtube-watch-classifying", classifying);
      if (classifying) {
        pauseYouTubeMedia();
        applySurfaceShrouds();
        return;
      }
      if (youtubeWatchClassification === "short" &&
        settings.youtubeProtectionMode === "strict") {
        void incrementInterventionCount(rules.ROUTES.YOUTUBE_SHORTS);
        window.location.replace("https://www.youtube.com/feed/subscriptions");
        return;
      }
      if (youtubeWatchClassification === "short" &&
        settings.youtubeProtectionMode === "balanced") {
        const currentUrl = new URL(window.location.href);
        const videoId = rules.youtubeVideoId(currentUrl);
        if (videoId && currentUrl.searchParams.has("list")) {
          // A Short opened from a playlist must remain one deliberate video.
          // Remove the playlist context before YouTube can auto-advance.
          currentUrl.searchParams.delete("list");
          currentUrl.searchParams.delete("index");
          currentUrl.searchParams.delete("start_radio");
          currentUrl.searchParams.set("away_focused", "1");
          window.location.replace(currentUrl.href);
          return;
        }
      }
      if (youtubeWatchClassification === "video" &&
        settings.youtubeProtectionMode === "strict") {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.has("list")) {
          // Strict mode permits the deliberately selected long-form video but
          // not a playlist-driven automatic continuation. Keep useful query
          // data such as a shared timestamp while dropping queue context.
          currentUrl.searchParams.delete("list");
          currentUrl.searchParams.delete("index");
          currentUrl.searchParams.delete("start_radio");
          window.location.replace(currentUrl.href);
          return;
        }
      }
    } else {
      document.documentElement.removeAttribute("data-away-youtube-watch-classifying");
    }

    if (rules.shouldBlockImmediately(currentRoute, settings)) {
      applySurfaceShrouds();
      showOverlay(currentRoute);
      return;
    }

    if (overlayReason && overlayReason !== currentRoute) {
      removeOverlay();
    }

    const balancedIndividualPost =
      currentRoute === rules.ROUTES.INDIVIDUAL_POST &&
      settings.protectInstagram &&
      settings.instagramProtectionMode === "balanced";
    if (balancedIndividualPost) {
      const mediaKind = getInstagramIndividualPostMetadataKind();
      if (mediaKind === "reel") {
        setInstagramPostProbeActive(false);
        void incrementInterventionCount(rules.ROUTES.REELS);
        navigateTo("https://www.instagram.com/direct/inbox/");
        return;
      }
      if (mediaKind === "unknown") {
        setInstagramPostProbeActive(true);
        applySurfaceShrouds();
        return;
      }
    }
    setInstagramPostProbeActive(false);

    // Reels and direct post routes are exited on entry instead of being covered: redirect the
    // tab to the Instagram inbox, a safe intentional surface.
    if (currentRoute === rules.ROUTES.REELS && settings.protectInstagram) {
      if (routeChanged) {
        void incrementInterventionCount(currentRoute);
      }
      navigateTo("https://www.instagram.com/direct/inbox/");
      return;
    }

    if (
      currentRoute === rules.ROUTES.STORIES &&
      settings.protectInstagram &&
      settings.instagramProtectionMode === "strict"
    ) {
      if (routeChanged) {
        void incrementInterventionCount(currentRoute);
      }
      navigateTo("https://www.instagram.com/direct/inbox/");
      return;
    }

    if (
      currentRoute === rules.ROUTES.INDIVIDUAL_POST &&
      settings.protectInstagram &&
      settings.instagramProtectionMode === "strict"
    ) {
      if (routeChanged) {
        void incrementInterventionCount(currentRoute);
      }
      navigateTo("https://www.instagram.com/direct/inbox/");
      return;
    }

    if (
      (isInstagramSavedUrl(window.location.href) ||
        isInstagramActivityUrl(window.location.href)) &&
      settings.protectInstagram
    ) {
      if (routeChanged) {
        void incrementInterventionCount(currentRoute);
      }
      navigateTo("https://www.instagram.com/direct/inbox/");
      return;
    }

    applySurfaceShrouds();
    syncInstagramShroudsBehindFlyout();

    if (instagramSurfaceIsCovered()) {
      lockCoveredSurfaceScrolling();
      if (
        routeChanged &&
        currentRoute === rules.ROUTES.EXPLORE &&
        rules.platformForRoute(currentRoute) === "instagram"
      ) {
        void incrementInterventionCount(currentRoute);
      }
    }
  }

  function scheduleRouteChecks() {
    for (const delay of [0, 75, 300]) {
      window.setTimeout(applyRouteState, delay);
    }
  }

  let lastRepairTime = 0;
  const REPAIR_COOLDOWN_MS = 150;

  function scheduleImmediateOverlayRepair() {
    if (!isExtensionContextValid() || immediateRepairScheduled) {
      return;
    }

    const now = performance.now();
    const delay = Math.max(0, REPAIR_COOLDOWN_MS - (now - lastRepairTime));
    immediateRepairScheduled = true;
    window.setTimeout(() => {
      immediateRepairScheduled = false;
      lastRepairTime = performance.now();
      applyRouteState();
    }, delay);
  }

  async function initialize() {
    settings = await loadSettings();
    globalThis.__awayDebug = shroudDebugSnapshot;
    applyRouteState();

    document.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    document.addEventListener("pointerdown", handleTikTokBlockedLinkClick, true);
    document.addEventListener("mousedown", handleTikTokBlockedLinkClick, true);
    document.addEventListener("click", handleTikTokBlockedLinkClick, true);
    document.addEventListener("auxclick", handleTikTokBlockedLinkClick, true);
    document.addEventListener("play", (event) => {
      const tikTokMediaMustStayPaused =
        rules.platformForRoute(currentRoute) === "tiktok" &&
        settings.protectTikTok &&
        (!tikTokFocusedVideoIsOpen() ||
          !(event.target instanceof Element) ||
          !event.target.hasAttribute(TIKTOK_FOCUSED_MEDIA_ATTR));
      const youtubeMediaMustStayPaused =
        rules.platformForRoute(currentRoute) === "youtube" &&
        settings.protectYoutubeShorts && (
          document.documentElement.hasAttribute("data-away-youtube-watch-classifying") ||
          rules.shouldCoverYouTubeHome(currentRoute, settings) ||
          (rules.shouldShroudYouTubeShorts(currentRoute, settings) &&
            event.target instanceof Element &&
            Boolean(event.target.closest(`[${YOUTUBE_SHROUD_ATTR}]`))) ||
          (rules.shouldAllowIntentionalYouTubeShorts(currentRoute, settings) &&
            event.target instanceof Element &&
            Boolean(event.target.closest(`[${YOUTUBE_STATIC_SHORT_ATTR}]`))) ||
          (youtubeWatchClassification === "short" &&
            (!(event.target instanceof Element) ||
              !event.target.hasAttribute(YOUTUBE_FOCUSED_MEDIA_ATTR)))
        );
      if (
        (tikTokMediaMustStayPaused || youtubeMediaMustStayPaused || instagramPostProbeIsActive()) &&
        event.target instanceof HTMLMediaElement
      ) {
        event.target.pause();
      }
    }, true);
    document.addEventListener("touchstart", handleTouchStart, { capture: true, passive: true });
    document.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("pointerdown", handleShroudedClick, true);
    document.addEventListener("mousedown", handleShroudedClick, true);
    document.addEventListener("pointerdown", handleTikTokNavigationControl, true);
    document.addEventListener("mousedown", handleTikTokNavigationControl, true);
    document.addEventListener("pointerdown", handleYouTubeNavigationControl, true);
    document.addEventListener("mousedown", handleYouTubeNavigationControl, true);
    document.addEventListener("click", handleShroudedClick, true);
    document.addEventListener("auxclick", handleShroudedClick, true);
    document.addEventListener("click", handleTikTokNavigationControl, true);
    document.addEventListener("click", handleYouTubeNavigationControl, true);
    document.addEventListener("click", handleInstagramFlyoutClick, true);
    document.addEventListener("pointerdown", handleInstagramFlyoutClick, true);
    document.addEventListener("click", scheduleRouteChecks, true);
    document.addEventListener("focusin", (e) => {
      if (isSearchFocused()) {
        applyRouteState();
      }
    }, true);
    document.addEventListener("focusout", () => {
      window.setTimeout(applyRouteState, 150);
    }, true);
    document.addEventListener("yt-navigate-start", scheduleRouteChecks, true);
    document.addEventListener("yt-navigate-finish", scheduleRouteChecks, true);
    document.addEventListener("yt-page-data-updated", scheduleRouteChecks, true);
    window.addEventListener("scroll", handleRootScroll, { capture: true, passive: true });
    window.addEventListener("popstate", scheduleRouteChecks);
    window.addEventListener("hashchange", scheduleRouteChecks);
    window.addEventListener("pageshow", scheduleRouteChecks);
    window.addEventListener("resize", scheduleRouteChecks, { passive: true });

    let routeCheckIntervalId = null;

    function hasUnshroudedDirectMedia() {
      if (!settings.protectInstagram) {
        return false;
      }
      for (const card of document.querySelectorAll("div[role='button']")) {
        if (isSharedMessageCard(card) && !card.querySelector(`:scope > .${SHROUD_CLASS}`)) {
          return true;
        }
      }
      const candidates = document.querySelectorAll(
        "a[href*='/reel' i]:not([data-away-doomscrollin-shrouded]), a[href*='/p/' i]:not([data-away-doomscrollin-shrouded]), a[href*='/tv/' i]:not([data-away-doomscrollin-shrouded])"
      );
      for (const link of candidates) {
        if (!isInsideInstagramMessageSurface(link)) {
          continue;
        }
        if (isInsideInstagramLeftNav(link)) {
          continue;
        }
        if (
          !link.closest(
            "nav, aside, [role='navigation'], [data-away-flyout='true'], [role='tablist'], [role='tab'], header"
          )
        ) {
          return true;
        }
      }
      return false;
    }

    function hasUnshroudedTikTokMedia() {
      if (!settings.protectTikTok) {
        return false;
      }
      if (tikTokSurfaceIsCovered()) {
        const surface = getTikTokMainSurface();
        return Boolean(surface && !surface.hasAttribute(TIKTOK_SHROUD_ATTR));
      }
      if (rules.shouldShroudTikTokMedia(currentRoute, settings)) {
        return tikTokMediaLinks().some((link) => !link.hasAttribute(SHROUD_TARGET_ATTR));
      }
      if (tikTokFocusedVideoIsOpen()) {
        return document.querySelectorAll("video").length > 0 &&
          !document.querySelector(`[${TIKTOK_FOCUSED_MEDIA_ATTR}]`);
      }
      return false;
    }

    function hasUnshroudedYouTubeMedia() {
      if (!settings.protectYoutubeShorts ||
        rules.platformForRoute(currentRoute) !== "youtube") {
        return false;
      }
      if (youtubeStrictNotificationMediaTargets().some((target) =>
        !target.hasAttribute(YOUTUBE_SHROUD_ATTR)
      )) {
        return true;
      }
      if (rules.shouldCoverYouTubeHome(currentRoute, settings)) {
        const surface = getYouTubeMainSurface();
        return Boolean(surface && !surface.hasAttribute(YOUTUBE_SHROUD_ATTR));
      }
      if (rules.shouldShroudYouTubeShorts(currentRoute, settings)) {
        return youtubeShortTargets().some((target) => !target.hasAttribute(YOUTUBE_SHROUD_ATTR));
      }
      if (rules.shouldAllowIntentionalYouTubeShorts(currentRoute, settings)) {
        return youtubeShortLinks().some((link) =>
          !link.hasAttribute("data-away-youtube-original-href")
        );
      }
      if (currentRoute === rules.ROUTES.YOUTUBE_WATCH &&
        youtubeWatchClassification === "short") {
        return document.querySelectorAll("video").length > 0 &&
          !document.querySelector(`[${YOUTUBE_FOCUSED_MEDIA_ATTR}]`);
      }
      return false;
    }

    const overlayRepairObserver = new MutationObserver(() => {
      if (!isExtensionContextValid()) {
        overlayRepairObserver.disconnect();
        if (routeCheckIntervalId) {
          window.clearInterval(routeCheckIntervalId);
        }
        return;
      }
      const detectedRoute = rules.classifySupportedUrl(window.location.href);
      if (
        (rules.shouldBlockImmediately(detectedRoute, settings) &&
          !document.getElementById(OVERLAY_ID)) ||
        rules.shouldCoverSurfaceInPlace(detectedRoute, settings) ||
        rules.shouldShroudProfileGrids(detectedRoute, settings) ||
        instagramPostProbeIsActive() ||
        hasUnshroudedDirectMedia() ||
        getUnshroudedInstagramNotificationMediaTargets().length > 0 ||
        hasUnshroudedTikTokMedia() ||
        hasUnshroudedYouTubeMedia()
      ) {
        scheduleImmediateOverlayRepair();
      }
    });
    overlayRepairObserver.observe(document, { childList: true, subtree: true });

    routeCheckIntervalId = window.setInterval(() => {
      if (!isExtensionContextValid()) {
        window.clearInterval(routeCheckIntervalId);
        overlayRepairObserver.disconnect();
        return;
      }
      applyRouteState();
    }, ROUTE_CHECK_INTERVAL_MS);

    extensionApi.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !isExtensionContextValid()) {
        return;
      }

      const merged = { ...settings };
      for (const key of Object.keys(rules.DEFAULT_SETTINGS)) {
        if (changes[key]) {
          merged[key] = changes[key].newValue;
        }
      }
      settings = rules.normalizeSettings(merged);
      if (changes.protectInstagram || changes.instagramProtectionMode ||
        changes.protectTikTok || changes.tiktokProtectionMode ||
        changes.protectYoutubeShorts || changes.youtubeProtectionMode) {
        resetRootScrollTracking();
      }
      applyRouteState();

      const activeSetting = rules.settingForRoute(overlayReason);
      if (activeSetting && !settings[activeSetting]) {
        removeOverlay();
      }
    });

    extensionApi.runtime.onMessage.addListener((message) => {
      if (!message || ![
        "away-instagram-mode-changed",
        "away-tiktok-mode-changed",
        "away-youtube-mode-changed"
      ].includes(message.type)) {
        return;
      }
      const settingKey = message.type === "away-tiktok-mode-changed"
        ? "tiktokProtectionMode"
        : message.type === "away-youtube-mode-changed"
          ? "youtubeProtectionMode"
          : "instagramProtectionMode";
      settings = rules.normalizeSettings({ ...settings, [settingKey]: message.mode });
      resetRootScrollTracking();
      applyRouteState();
    });
  }

  void initialize();
})();
