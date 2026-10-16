(function exposeRouteRules(root, factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.AwayDoomscrollinRouteRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRouteRules() {
  "use strict";

  const ROUTES = Object.freeze({
    OUTSIDE_SUPPORTED_SITES: "outside-supported-sites",
    HOME_FEED: "home-feed",
    REELS: "reels",
    STORIES: "stories",
    DIRECT_MESSAGES: "direct-messages",
    INDIVIDUAL_POST: "individual-post",
    EXPLORE: "explore",
    PROFILE_OR_OTHER: "profile-or-other",
    TIKTOK_FEED: "tiktok-feed",
    TIKTOK_SEARCH: "tiktok-search",
    TIKTOK_PROFILE: "tiktok-profile",
    TIKTOK_VIDEO: "tiktok-video",
    TIKTOK_MESSAGES: "tiktok-messages",
    TIKTOK_OTHER: "tiktok-other",
    YOUTUBE_HOME: "youtube-home",
    YOUTUBE_SHORTS: "youtube-shorts",
    YOUTUBE_SEARCH: "youtube-search",
    YOUTUBE_CHANNEL: "youtube-channel",
    YOUTUBE_SUBSCRIPTIONS: "youtube-subscriptions",
    YOUTUBE_LIBRARY: "youtube-library",
    YOUTUBE_WATCH: "youtube-watch",
    YOUTUBE_EMBED: "youtube-embed",
    YOUTUBE_OTHER: "youtube-other"
  });

  const DEFAULT_SETTINGS = Object.freeze({
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
  });

  const LEGACY_INSTAGRAM_SETTING_KEYS = Object.freeze([
    "protectHomeFeed",
    "protectReels",
    "protectInstagramPosts"
  ]);

  const SCROLL_KEYS = Object.freeze([
    "ArrowUp",
    "ArrowDown",
    "PageUp",
    "PageDown",
    "Home",
    "End",
    " "
  ]);

  const TIKTOK_NAVIGATION_KEYS = Object.freeze([
    ...SCROLL_KEYS,
    "j",
    "J",
    "k",
    "K"
  ]);

  const TIKTOK_NAVIGATION_MARKERS = Object.freeze([
    "arrow-left",
    "arrow-right",
    "arrow-up",
    "arrow-down",
    "feed-navigation-prev",
    "feed-navigation-next",
    "video-switch-prev",
    "video-switch-next",
    "cinema-playback-control-autoscroll"
  ]);

  function normalizePathname(pathname) {
    if (typeof pathname !== "string" || pathname.length === 0) {
      return "/";
    }

    let decoded = pathname;
    // Browsers retain percent-encoded path segments in URL.pathname. Decode a
    // few times so /%73earch and double-encoded variants cannot escape route
    // classification while malformed encodings still fail closed.
    for (let index = 0; index < 3; index += 1) {
      try {
        const next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next;
      } catch {
        break;
      }
    }
    const withLeadingSlash = decoded.startsWith("/") ? decoded : `/${decoded}`;
    const collapsed = withLeadingSlash.replace(/\/{2,}/g, "/");
    return collapsed.length > 1 && collapsed.endsWith("/")
      ? collapsed.slice(0, -1)
      : collapsed;
  }

  function classifyInstagramUrl(value) {
    let parsed;
    try {
      parsed = value instanceof URL ? value : new URL(String(value));
    } catch {
      return ROUTES.OUTSIDE_SUPPORTED_SITES;
    }

    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    if (!["www.instagram.com", "instagram.com", "m.instagram.com"].includes(hostname)) {
      return ROUTES.OUTSIDE_SUPPORTED_SITES;
    }

    const pathname = normalizePathname(parsed.pathname).toLowerCase();

    if (pathname === "/") {
      return ROUTES.HOME_FEED;
    }

    if (
      pathname === "/reels" ||
      pathname.startsWith("/reels/") ||
      pathname.startsWith("/reel/") ||
      pathname.includes("/reel/") ||
      pathname.includes("/reels/")
    ) {
      return ROUTES.REELS;
    }

    if (pathname === "/stories" || pathname.startsWith("/stories/")) {
      return ROUTES.STORIES;
    }

    if (pathname === "/direct" || pathname.startsWith("/direct/")) {
      return ROUTES.DIRECT_MESSAGES;
    }

    if (
      pathname === "/p" ||
      pathname.startsWith("/p/") ||
      pathname.includes("/p/") ||
      pathname.startsWith("/tv/") ||
      pathname.includes("/tv/")
    ) {
      return ROUTES.INDIVIDUAL_POST;
    }

    if (pathname === "/explore" || pathname.startsWith("/explore/")) {
      return ROUTES.EXPLORE;
    }

    return ROUTES.PROFILE_OR_OTHER;
  }

  function classifySupportedUrl(value) {
    let parsed;
    try {
      parsed = value instanceof URL ? value : new URL(String(value));
    } catch {
      return ROUTES.OUTSIDE_SUPPORTED_SITES;
    }

    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    if (["www.instagram.com", "instagram.com", "m.instagram.com"].includes(hostname)) {
      return classifyInstagramUrl(parsed);
    }

    const pathname = normalizePathname(parsed.pathname).toLowerCase();

    if (["www.tiktok.com", "tiktok.com", "m.tiktok.com"].includes(hostname)) {
      if (pathname === "/messages" || pathname.startsWith("/messages/")) {
        return ROUTES.TIKTOK_MESSAGES;
      }
      if (pathname === "/search" || pathname.startsWith("/search/")) {
        return ROUTES.TIKTOK_SEARCH;
      }
      if (/^\/@[^/]+\/video\/[^/]+$/.test(pathname)) {
        return ROUTES.TIKTOK_VIDEO;
      }
      if (/^\/@[^/]+$/.test(pathname)) {
        return ROUTES.TIKTOK_PROFILE;
      }

      // Only explicit account, publishing, and legal utilities are treated as
      // non-media pages. Every unknown TikTok route fails closed as a feed so
      // newly launched surfaces (Browse, Mini dramas, Shop, embeds, etc.) do
      // not become an unprotected short-content path.
      if (
        pathname === "/login" || pathname.startsWith("/login/") ||
        pathname === "/signup" || pathname.startsWith("/signup/") ||
        pathname === "/setting" || pathname.startsWith("/setting/") ||
        pathname === "/settings" || pathname.startsWith("/settings/") ||
        pathname === "/feedback" || pathname.startsWith("/feedback/") ||
        pathname === "/404" || pathname.startsWith("/404/") ||
        pathname === "/legal" || pathname.startsWith("/legal/") ||
        pathname === "/safety" || pathname.startsWith("/safety/") ||
        pathname === "/community-guidelines" || pathname.startsWith("/community-guidelines/") ||
        pathname === "/transparency" || pathname.startsWith("/transparency/") ||
        pathname === "/accessibility" || pathname.startsWith("/accessibility/") ||
        pathname === "/download" || pathname.startsWith("/download/") ||
        pathname === "/about" || pathname.startsWith("/about/") ||
        pathname === "/tiktokstudio/upload" || pathname.startsWith("/tiktokstudio/upload/")
      ) {
        return ROUTES.TIKTOK_OTHER;
      }
      return ROUTES.TIKTOK_FEED;
    }

    if (["www.youtube.com", "m.youtube.com", "youtube.com"].includes(hostname)) {
      if (pathname === "/") return ROUTES.YOUTUBE_HOME;
      if (pathname === "/shorts" || pathname.startsWith("/shorts/")) {
        return ROUTES.YOUTUBE_SHORTS;
      }
      if (pathname === "/results") return ROUTES.YOUTUBE_SEARCH;
      if (
        /^\/@[^/]+(?:\/.*)?$/.test(pathname) ||
        /^\/(?:channel|c|user)\/[^/]+(?:\/.*)?$/.test(pathname)
      ) {
        return ROUTES.YOUTUBE_CHANNEL;
      }
      if (pathname === "/feed/subscriptions") return ROUTES.YOUTUBE_SUBSCRIPTIONS;
      if (
        pathname === "/feed/you" || pathname === "/feed/history" ||
        pathname === "/feed/playlists" || pathname === "/feed/downloads" ||
        pathname === "/playlist"
      ) {
        return ROUTES.YOUTUBE_LIBRARY;
      }
      if (pathname === "/watch") return ROUTES.YOUTUBE_WATCH;
      if (pathname === "/embed" || pathname.startsWith("/embed/")) {
        return ROUTES.YOUTUBE_EMBED;
      }
      return ROUTES.YOUTUBE_OTHER;
    }

    return ROUTES.OUTSIDE_SUPPORTED_SITES;
  }

  function instagramMediaShortcode(value) {
    let parsed;
    try {
      parsed = value instanceof URL ? value : new URL(String(value));
    } catch {
      return null;
    }

    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    if (!["www.instagram.com", "instagram.com", "m.instagram.com"].includes(hostname)) {
      return null;
    }

    const segments = normalizePathname(parsed.pathname).split("/").filter(Boolean);
    for (let index = 0; index < segments.length - 1; index += 1) {
      if (["p", "reel", "tv"].includes(segments[index].toLowerCase())) {
        return segments[index + 1];
      }
    }
    return null;
  }

  function classifyInstagramIndividualMediaMetadata(values, expectedShortcode) {
    const candidates = Array.isArray(values) ? values : [values];
    const expected = typeof expectedShortcode === "string" && expectedShortcode.length > 0
      ? expectedShortcode
      : null;
    let sawPost = false;

    for (const value of candidates) {
      if (typeof value !== "string" || value.trim().length === 0) {
        continue;
      }
      if (expected && instagramMediaShortcode(value) !== expected) {
        continue;
      }
      const route = classifyInstagramUrl(value);
      if (route === ROUTES.REELS) {
        return "reel";
      }
      if (route === ROUTES.INDIVIDUAL_POST) {
        sawPost = true;
      }
    }

    return sawPost ? "post" : "unknown";
  }

  function normalizeSettings(value) {
    const candidate = value && typeof value === "object" ? value : {};
    const normalizeCount = (key) => Number.isSafeInteger(candidate[key]) && candidate[key] >= 0
      ? candidate[key]
      : DEFAULT_SETTINGS[key];
    const legacyInstagramValues = LEGACY_INSTAGRAM_SETTING_KEYS
      .map((key) => candidate[key])
      .filter((setting) => typeof setting === "boolean");
    const protectInstagram = typeof candidate.protectInstagram === "boolean"
      ? candidate.protectInstagram
      : legacyInstagramValues.length > 0
        ? legacyInstagramValues.every(Boolean)
        : DEFAULT_SETTINGS.protectInstagram;

    return {
      protectInstagram,
      instagramProtectionMode: candidate.instagramProtectionMode === "balanced"
        ? "balanced"
        : DEFAULT_SETTINGS.instagramProtectionMode,
      protectTikTok: typeof candidate.protectTikTok === "boolean"
        ? candidate.protectTikTok
        : DEFAULT_SETTINGS.protectTikTok,
      tiktokProtectionMode: candidate.tiktokProtectionMode === "balanced"
        ? "balanced"
        : DEFAULT_SETTINGS.tiktokProtectionMode,
      protectYoutubeShorts: typeof candidate.protectYoutubeShorts === "boolean"
        ? candidate.protectYoutubeShorts
        : DEFAULT_SETTINGS.protectYoutubeShorts,
      youtubeProtectionMode: candidate.youtubeProtectionMode === "balanced"
        ? "balanced"
        : DEFAULT_SETTINGS.youtubeProtectionMode,
      interventionCount: normalizeCount("interventionCount"),
      instagramInterventionCount: normalizeCount("instagramInterventionCount"),
      tiktokInterventionCount: normalizeCount("tiktokInterventionCount"),
      youtubeInterventionCount: normalizeCount("youtubeInterventionCount")
    };
  }

  function shouldBlockImmediately(route, settings) {
    const normalized = normalizeSettings(settings);
    // Instagram surfaces are covered in place (silent shrouds/curtains) instead
    // of the fullscreen dialog, matching the Android app's behavior.
    return false;
  }

  function shouldArmScrollableFeed(route, settings) {
    const normalized = normalizeSettings(settings);
    // Instagram is always handled silently: direct media routes leave for DMs,
    // while feed/profile media is covered in place. Keep the popup-triggering
    // scroll interceptor exclusive to TikTok.
    return route === ROUTES.TIKTOK_FEED && normalized.protectTikTok;
  }

  function tikTokVideoId(value) {
    let parsed;
    try {
      parsed = value instanceof URL ? value : new URL(String(value));
    } catch {
      return null;
    }
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    if (!["www.tiktok.com", "tiktok.com", "m.tiktok.com"].includes(hostname)) {
      return null;
    }
    const match = normalizePathname(parsed.pathname).match(/^\/@[^/]+\/video\/([^/]+)$/i);
    return match ? match[1] : null;
  }

  function shouldShroudTikTokMedia(route, settings) {
    const normalized = normalizeSettings(settings);
    if (!normalized.protectTikTok) return false;
    if (route === ROUTES.TIKTOK_SEARCH || route === ROUTES.TIKTOK_PROFILE ||
      route === ROUTES.TIKTOK_MESSAGES) {
      return normalized.tiktokProtectionMode === "strict";
    }
    return false;
  }

  function shouldFocusTikTokVideo(route, settings) {
    const normalized = normalizeSettings(settings);
    return route === ROUTES.TIKTOK_VIDEO && normalized.protectTikTok &&
      normalized.tiktokProtectionMode === "balanced";
  }

  function youtubeVideoId(value) {
    let parsed;
    try {
      parsed = value instanceof URL ? value : new URL(String(value));
    } catch {
      return null;
    }
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    const pathname = normalizePathname(parsed.pathname);
    if (hostname === "youtu.be") {
      return pathname.split("/").filter(Boolean)[0] || null;
    }
    if (!["www.youtube.com", "m.youtube.com", "youtube.com"].includes(hostname)) {
      return null;
    }
    const segments = pathname.split("/").filter(Boolean);
    if (["shorts", "embed"].includes((segments[0] || "").toLowerCase())) {
      return segments[1] || null;
    }
    if (pathname.toLowerCase() === "/watch") {
      return parsed.searchParams.get("v") || null;
    }
    return null;
  }

  function shouldCoverYouTubeHome(route, settings) {
    const normalized = normalizeSettings(settings);
    return route === ROUTES.YOUTUBE_HOME && normalized.protectYoutubeShorts &&
      normalized.youtubeProtectionMode === "strict";
  }

  function shouldShroudYouTubeShorts(route, settings) {
    const normalized = normalizeSettings(settings);
    if (!normalized.protectYoutubeShorts) return false;
    if (normalized.youtubeProtectionMode === "strict") {
      return [
        ROUTES.YOUTUBE_HOME,
        ROUTES.YOUTUBE_SEARCH,
        ROUTES.YOUTUBE_CHANNEL,
        ROUTES.YOUTUBE_SUBSCRIPTIONS,
        ROUTES.YOUTUBE_LIBRARY,
        ROUTES.YOUTUBE_OTHER
      ].includes(route);
    }
    return [ROUTES.YOUTUBE_HOME, ROUTES.YOUTUBE_OTHER].includes(route);
  }

  function shouldAllowIntentionalYouTubeShorts(route, settings) {
    const normalized = normalizeSettings(settings);
    return normalized.protectYoutubeShorts && normalized.youtubeProtectionMode === "balanced" &&
      [
        ROUTES.YOUTUBE_SEARCH,
        ROUTES.YOUTUBE_CHANNEL,
        ROUTES.YOUTUBE_SUBSCRIPTIONS,
        ROUTES.YOUTUBE_LIBRARY
      ].includes(route);
  }

  function isInstagramMediaSurface(route) {
    return route === ROUTES.HOME_FEED ||
      route === ROUTES.REELS ||
      route === ROUTES.STORIES ||
      route === ROUTES.INDIVIDUAL_POST ||
      route === ROUTES.EXPLORE;
  }

  function shouldCoverSurfaceInPlace(route, settings) {
    const normalized = normalizeSettings(settings);
    const shouldCoverInstagram = isInstagramMediaSurface(route) &&
      normalized.protectInstagram &&
      !(route === ROUTES.INDIVIDUAL_POST && normalized.instagramProtectionMode === "balanced") &&
      !(route === ROUTES.STORIES && normalized.instagramProtectionMode === "balanced");
    return shouldCoverInstagram ||
      (route === ROUTES.TIKTOK_FEED && normalized.protectTikTok) ||
      (route === ROUTES.TIKTOK_VIDEO && normalized.protectTikTok &&
        normalized.tiktokProtectionMode === "strict") ||
      shouldCoverYouTubeHome(route, normalized);
  }

  function shouldShroudProfileGrids(route, settings) {
    const normalized = normalizeSettings(settings);
    // Strict mode covers the full profile grid. Balanced mode still needs the
    // grid repair path so it can cover only Reel cells while leaving /p/ posts
    // visible and clickable.
    return route === ROUTES.PROFILE_OR_OTHER && normalized.protectInstagram;
  }

  function settingForRoute(route) {
    if ([ROUTES.HOME_FEED, ROUTES.REELS, ROUTES.STORIES, ROUTES.INDIVIDUAL_POST, ROUTES.EXPLORE].includes(route)) return "protectInstagram";
    if ([ROUTES.TIKTOK_FEED, ROUTES.TIKTOK_SEARCH, ROUTES.TIKTOK_PROFILE,
      ROUTES.TIKTOK_VIDEO, ROUTES.TIKTOK_MESSAGES].includes(route)) return "protectTikTok";
    if ([
      ROUTES.YOUTUBE_HOME,
      ROUTES.YOUTUBE_SHORTS,
      ROUTES.YOUTUBE_SEARCH,
      ROUTES.YOUTUBE_CHANNEL,
      ROUTES.YOUTUBE_SUBSCRIPTIONS,
      ROUTES.YOUTUBE_LIBRARY,
      ROUTES.YOUTUBE_WATCH,
      ROUTES.YOUTUBE_EMBED,
      ROUTES.YOUTUBE_OTHER
    ].includes(route)) return "protectYoutubeShorts";
    return null;
  }

  function platformForRoute(route) {
    if ([ROUTES.HOME_FEED, ROUTES.REELS, ROUTES.STORIES, ROUTES.DIRECT_MESSAGES, ROUTES.INDIVIDUAL_POST, ROUTES.EXPLORE, ROUTES.PROFILE_OR_OTHER].includes(route)) {
      return "instagram";
    }
    if ([ROUTES.TIKTOK_FEED, ROUTES.TIKTOK_SEARCH, ROUTES.TIKTOK_PROFILE,
      ROUTES.TIKTOK_VIDEO, ROUTES.TIKTOK_MESSAGES, ROUTES.TIKTOK_OTHER].includes(route)) {
      return "tiktok";
    }
    if ([
      ROUTES.YOUTUBE_HOME,
      ROUTES.YOUTUBE_SHORTS,
      ROUTES.YOUTUBE_SEARCH,
      ROUTES.YOUTUBE_CHANNEL,
      ROUTES.YOUTUBE_SUBSCRIPTIONS,
      ROUTES.YOUTUBE_LIBRARY,
      ROUTES.YOUTUBE_WATCH,
      ROUTES.YOUTUBE_EMBED,
      ROUTES.YOUTUBE_OTHER
    ].includes(route)) {
      return "youtube";
    }
    return null;
  }

  function interventionCountKeyForPlatform(platform) {
    if (platform === "instagram") return "instagramInterventionCount";
    if (platform === "tiktok") return "tiktokInterventionCount";
    if (platform === "youtube") return "youtubeInterventionCount";
    return null;
  }

  function incrementInterventionCounters(value, platform) {
    const normalized = normalizeSettings(value);
    const platformKey = interventionCountKeyForPlatform(platform);
    const updates = {
      interventionCount: normalized.interventionCount < Number.MAX_SAFE_INTEGER
        ? normalized.interventionCount + 1
        : normalized.interventionCount
    };

    if (platformKey) {
      updates[platformKey] = normalized[platformKey] < Number.MAX_SAFE_INTEGER
        ? normalized[platformKey] + 1
        : normalized[platformKey];
    }
    return updates;
  }

  function isMeaningfulVerticalIntent(deltaX, deltaY, threshold) {
    const minimum = Number.isFinite(threshold) && threshold >= 0 ? threshold : 6;
    const x = Number.isFinite(deltaX) ? Math.abs(deltaX) : 0;
    const y = Number.isFinite(deltaY) ? Math.abs(deltaY) : 0;
    return y >= minimum && y > x;
  }

  function isScrollingKey(key) {
    return SCROLL_KEYS.includes(key);
  }

  function isTikTokNavigationKey(key) {
    return TIKTOK_NAVIGATION_KEYS.includes(key);
  }

  function isTikTokNavigationControlDescriptor(dataE2e, accessibleName) {
    const marker = typeof dataE2e === "string" ? dataE2e.trim().toLowerCase() : "";
    if (TIKTOK_NAVIGATION_MARKERS.includes(marker)) {
      return true;
    }

    const name = typeof accessibleName === "string"
      ? accessibleName.trim().toLocaleLowerCase()
      : "";
    return [
      "next video",
      "previous video",
      "scroll to next video",
      "scroll to previous video",
      "sonraki video",
      "önceki video",
      "sonraki videoya geç",
      "önceki videoya geç"
    ].includes(name);
  }

  function isMeaningfulScrollDistance(previousPosition, nextPosition, threshold) {
    if (!Number.isFinite(previousPosition) || !Number.isFinite(nextPosition)) {
      return false;
    }

    const minimum = Number.isFinite(threshold) && threshold >= 0 ? threshold : 4;
    return Math.abs(nextPosition - previousPosition) >= minimum;
  }

  return Object.freeze({
    DEFAULT_SETTINGS,
    LEGACY_INSTAGRAM_SETTING_KEYS,
    ROUTES,
    SCROLL_KEYS,
    classifyInstagramIndividualMediaMetadata,
    classifyInstagramUrl,
    classifySupportedUrl,
    isMeaningfulVerticalIntent,
    isMeaningfulScrollDistance,
    isScrollingKey,
    isTikTokNavigationKey,
    isTikTokNavigationControlDescriptor,
    incrementInterventionCounters,
    instagramMediaShortcode,
    interventionCountKeyForPlatform,
    isInstagramMediaSurface,
    shouldCoverSurfaceInPlace,
    shouldFocusTikTokVideo,
    shouldAllowIntentionalYouTubeShorts,
    shouldCoverYouTubeHome,
    shouldShroudProfileGrids,
    shouldShroudTikTokMedia,
    shouldShroudYouTubeShorts,
    normalizePathname,
    normalizeSettings,
    platformForRoute,
    settingForRoute,
    shouldArmScrollableFeed,
    shouldBlockImmediately,
    tikTokVideoId,
    youtubeVideoId
  });
});
