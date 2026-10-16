const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const common = path.join(root, "src", "common");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("manifest permissions and declarative scopes match strict policy", () => {
  const chrome = JSON.parse(read("src/manifests/chrome.json"));
  const firefox = JSON.parse(read("src/manifests/firefox.json"));

  assert.deepEqual(chrome.permissions, ["storage"]);
  assert.deepEqual(firefox.permissions, ["storage"]);
  assert.deepEqual(chrome.host_permissions.sort(), [
    "https://instagram.com/*",
    "https://m.instagram.com/*",
    "https://m.tiktok.com/*",
    "https://m.youtube.com/*",
    "https://tiktok.com/*",
    "https://www.instagram.com/*",
    "https://www.tiktok.com/*",
    "https://www.youtube.com/*"
  ].sort());
  assert.deepEqual(firefox.host_permissions.sort(), [
    "https://instagram.com/*",
    "https://m.instagram.com/*",
    "https://m.tiktok.com/*",
    "https://m.youtube.com/*",
    "https://tiktok.com/*",
    "https://www.instagram.com/*",
    "https://www.tiktok.com/*",
    "https://www.youtube.com/*"
  ].sort());
});

test("Firefox explicitly declares that no data is collected or transmitted", () => {
  const firefox = JSON.parse(read("src/manifests/firefox.json"));
  assert.deepEqual(
    firefox.browser_specific_settings?.gecko?.data_collection_permissions?.required,
    ["none"]
  );
});

test("packaged scripts contain no network or dynamic-code primitives", () => {
  const scriptPaths = [
    path.join(common, "content", "route-rules.js"),
    path.join(common, "content", "content.js"),
    path.join(common, "popup", "popup.js"),
    path.join(common, "background", "background.js"),
    path.join(common, "onboarding", "onboarding.js")
  ];
  const forbidden = [
    /\beval\s*\(/,
    /\bnew\s+Function\s*\(/,
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bEventSource\b/,
    /\bsendBeacon\b/,
    /\bimportScripts\b/
  ];

  for (const scriptPath of scriptPaths) {
    const source = fs.readFileSync(scriptPath, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${scriptPath} matched ${pattern}`);
    }
  }
});

test("immediate interventions preserve the detected platform and use platform-specific actions", () => {
  const content = read("src/common/content/content.js");
  assert.match(content, /showOverlay\(currentRoute\)/);
  assert.doesNotMatch(content, /showOverlay\(rules\.ROUTES\.REELS\)/);
  assert.match(
    content,
    /function showOverlay\(reason\) \{\s*\/\/ Product invariant:[\s\S]*?if \(rules\.platformForRoute\(reason\) === "instagram"\) \{\s*return;/
  );
  assert.match(content, /incrementInterventionCounters\(stored, rules\.platformForRoute\(reason\)\)/);
  assert.match(content, /https:\/\/www\.instagram\.com\/direct\/inbox\//);
  assert.match(content, /https:\/\/www\.tiktok\.com\//);
  assert.match(content, /https:\/\/www\.youtube\.com\//);
});

test("YouTube Shorts protection survives SPA navigation and page rerenders", () => {
  const content = read("src/common/content/content.js");
  const css = read("src/common/content/content.css");
  assert.match(content, /function enforceImmediateRouteProtection\(event\)/);
  assert.match(content, /document\.addEventListener\("yt-navigate-start"/);
  assert.match(content, /document\.addEventListener\("yt-navigate-finish"/);
  assert.match(content, /document\.addEventListener\("yt-page-data-updated"/);
  assert.match(content, /function youtubeWatchMetadataKind\(\)/);
  assert.match(content, /link\[rel='canonical'\]\[href\]/);
  assert.match(content, /youtubeWatchClassification === "short"/);
  assert.match(content, /away_focused=1/);
  assert.match(content, /function applyYouTubeFocusedShort\(\)/);
  assert.match(content, /primary\.loop = false/);
  assert.match(content, /let sawMatchingWatchMetadata = false/);
  assert.match(content, /return sawMatchingWatchMetadata \? "video" : "unknown"/);
  assert.match(content, /function prepareYouTubeIntentionalLinks\(\)/);
  assert.match(content, /function youtubeStrictNotificationMediaTargets\(\)/);
  assert.match(content, /ytd-notification-renderer yt-img-shadow:not\(#avatar\)/);
  assert.match(content, /currentUrl\.searchParams\.has\("list"\)/);
  assert.match(content, /A Short opened from a playlist must remain one deliberate video/);
  assert.match(content, /Strict mode permits the deliberately selected long-form video/);
  assert.match(content, /currentUrl\.searchParams\.delete\("index"\)/);
  assert.match(content, /window\.location\.replace\("https:\/\/www\.youtube\.com\/feed\/subscriptions"\)/);
  assert.match(content, /document\.addEventListener\("click", handleYouTubeNavigationControl, true\)/);
  assert.match(css, /data-away-youtube-watch-classifying/);
  assert.match(css, /data-away-youtube-focused-short/);
  assert.match(css, /data-away-youtube-strict-watch/);
});

test("TikTok navigation buttons cannot bypass feed protection", () => {
  const content = read("src/common/content/content.js");
  assert.match(content, /document\.addEventListener\("click", handleTikTokNavigationControl, true\)/);
  assert.match(content, /stopImmediatePropagation\(\)/);
});

test("TikTok focused viewing blocks navigation before applying modal exceptions", () => {
  const content = read("src/common/content/content.js");
  assert.match(
    content,
    /const protectedTikTokSurface = tikTokSurfaceIsCovered\(\) \|\| tikTokFocusedVideoIsOpen\(\);/
  );
  assert.match(
    content,
    /if \(!protectedTikTokSurface && \(visibleModalDialogExists\(\) \|\| isEventInsideModal\(event\)\)\)/
  );

  const keyHandlerStart = content.indexOf("function handleKeyDown(event)");
  const keyHandlerEnd = content.indexOf("function handleRootScroll(event)", keyHandlerStart);
  const keyHandler = content.slice(keyHandlerStart, keyHandlerEnd);
  assert.ok(
    keyHandler.indexOf("enforceImmediateRouteProtection(event)") <
      keyHandler.indexOf("visibleModalDialogExists() || isEventInsideModal(event)"),
    "TikTok route protection must run before the generic modal exemption"
  );
});

test("TikTok focused viewing hides current controls and prevents automatic advance", () => {
  const content = read("src/common/content/content.js");
  const css = read("src/common/content/content.css");
  const rules = read("src/common/content/route-rules.js");
  assert.match(content, /primary\.loop = true/);
  assert.match(content, /TIKTOK_PREVIOUS_LOOP_ATTR/);
  assert.match(content, /input\[name='cinema-mode-autoscroll'\]/);
  assert.match(css, /button\[aria-label="Next video" i\]/);
  assert.match(css, /button\[aria-label="Previous video" i\]/);
  assert.match(css, /data-e2e="cinema-playback-control-autoscroll"/);
  assert.match(rules, /"cinema-playback-control-autoscroll"/);
});

test("locale catalogs have identical keys", () => {
  const english = JSON.parse(read("src/common/_locales/en/messages.json"));
  const turkish = JSON.parse(read("src/common/_locales/tr/messages.json"));
  assert.deepEqual(Object.keys(turkish).sort(), Object.keys(english).sort());
  for (const [key, entry] of Object.entries(english)) {
    assert.ok(entry.message.trim(), `English ${key}`);
    assert.ok(turkish[key].message.trim(), `Turkish ${key}`);
  }
});

test("popup uses external local scripts only", () => {
  const popup = read("src/common/popup/popup.html");
  const popupScript = read("src/common/popup/popup.js");
  assert.match(popup, /<script src="popup\.js"><\/script>/);
  assert.match(popup, /<script src="popup-messages\.js"><\/script>/);
  assert.match(popup, /href="https:\/\/awaydoomscrollin\.com\/en\/"/);
  assert.match(popup, /id="site-access-warning"/);
  assert.match(popup, /id="grant-site-access"/);
  assert.match(popupScript, /permissions\.contains\(\{ origins: requiredOrigins \}\)/);
  assert.match(popupScript, /permissions\.request\(\{ origins: requiredOrigins \}\)/);
  assert.match(popup, /class="platform-tabs" role="tablist"/);
  assert.equal((popup.match(/role="tab"/g) || []).length, 3);
  assert.equal((popup.match(/role="tabpanel"/g) || []).length, 3);
  assert.deepEqual(
    new Set(Array.from(popup.matchAll(/data-setting="([^"]+)"/g), (match) => match[1])),
    new Set(["protectInstagram", "protectTikTok", "protectYoutubeShorts"])
  );
  assert.equal((popup.match(/data-instagram-mode/g) || []).length, 3);
  assert.match(popup, /value="strict" data-instagram-mode/);
  assert.match(popup, /value="balanced" data-instagram-mode/);
  assert.match(popupScript, /instagramProtectionMode: "strict"/);
  assert.match(popupScript, /function renderInstagramMode\(mode, protectionEnabled\)/);
  assert.match(popupScript, /storage\.local\.set\(\{ instagramProtectionMode: input\.value \}\)/);
  assert.equal((popup.match(/data-tiktok-mode/g) || []).length, 3);
  assert.match(popup, /value="strict" data-tiktok-mode/);
  assert.match(popup, /value="balanced" data-tiktok-mode/);
  assert.match(popupScript, /tiktokProtectionMode: "strict"/);
  assert.match(popupScript, /function renderTikTokMode\(mode, protectionEnabled\)/);
  assert.match(popupScript, /storage\.local\.set\(\{ tiktokProtectionMode: input\.value \}\)/);
  assert.equal((popup.match(/data-youtube-mode/g) || []).length, 3);
  assert.match(popup, /value="strict" data-youtube-mode/);
  assert.match(popup, /value="balanced" data-youtube-mode/);
  assert.match(popupScript, /youtubeProtectionMode: "strict"/);
  assert.match(popupScript, /function renderYouTubeMode\(mode, protectionEnabled\)/);
  assert.match(popupScript, /storage\.local\.set\(\{ youtubeProtectionMode: input\.value \}\)/);
  assert.match(popupScript, /type: "away-youtube-mode-changed"/);
  assert.equal((popup.match(/data-popup-language=/g) || []).length, 2);
  assert.match(popupScript, /function renderLanguageSelector\(\)/);
  assert.match(popupScript, /storage\.local\.set\(\{ popupLanguage: language \}\)/);
  assert.match(popupScript, /legacyInstagramSettingKeys/);
  assert.match(popupScript, /storage\.local\.remove\(legacyKeys\)/);
  assert.match(popupScript, /function setupPlatformTabs\(\)/);
  assert.match(popupScript, /function setupMainNavigation\(\)/);
  assert.match(popupScript, /function renderProtectionStatus\(values, hasSiteAccess\)/);
  assert.match(popupScript, /function renderStatistics\(values\)/);
  assert.equal((popup.match(/data-page="/g) || []).length, 3);
  assert.equal((popup.match(/data-page-target="/g) || []).length, 3);
  assert.match(popup, /id="summary-page"/);
  assert.match(popup, /id="applications-page"/);
  assert.match(popup, /id="about-page"/);
  assert.match(popup, /id="protection-status-card"/);
  assert.match(popup, /data-community-link/);
  assert.equal((popup.match(/class="scope-details"/g) || []).length, 3);
  assert.equal((popup.match(/class="scope-icon scope-icon-protected"/g) || []).length, 3);
  assert.equal((popup.match(/class="scope-icon scope-icon-available"/g) || []).length, 3);
  assert.equal((popup.match(/data-i18n="protectedAreasLabel"/g) || []).length, 3);
  assert.equal((popup.match(/data-i18n="availableAreasLabel"/g) || []).length, 3);
  assert.match(popup, /data-i18n="instagramAvailableAreas"/);
  assert.match(popup, /data-i18n="youtubeAvailableAreas"/);
  assert.equal((popup.match(/data-stat-value=/g) || []).length, 3);
  assert.equal((popup.match(/data-stat-bar=/g) || []).length, 3);
  assert.equal((popup.match(/data-stat-percent=/g) || []).length, 3);
  assert.equal((popup.match(/class="stack-segment /g) || []).length, 3);
  assert.equal((popup.match(/class="stacked-track"/g) || []).length, 1);
  assert.match(popupScript, /style\.height = `\$\{percentage\}%`/);
  assert.doesNotMatch(popupScript, /style\.width = `\$\{percentage\}%`/);
  assert.match(popupScript, /event\.key === "ArrowRight"/);
  assert.match(popupScript, /event\.key === "ArrowLeft"/);
  for (const platform of ["instagram", "tiktok", "youtube"]) {
    assert.match(popup, new RegExp(`src="\\.\\.\\/icons\\/platform-${platform}\\.svg"`));
    assert.ok(fs.statSync(path.join(common, "icons", `platform-${platform}.svg`)).size > 0);
  }
  assert.doesNotMatch(popup, /<script(?![^>]+src=)[^>]*>/i);
  assert.doesNotMatch(popup, /<script[^>]+src="https?:/i);
});

test("onboarding opens only on first install and remains local-only", () => {
  const background = read("src/common/background/background.js");
  const onboarding = read("src/common/onboarding/onboarding.html");
  const onboardingScript = read("src/common/onboarding/onboarding.js");

  assert.match(background, /details\.reason !== "install"/);
  assert.match(background, /onboarding\/onboarding\.html/);
  assert.match(background, /setBadgeText\(\{ text \}\)/);
  assert.match(background, /text = "ON"/);
  assert.match(background, /text = "OFF"/);
  assert.match(background, /text = "!"/);
  assert.match(onboarding, /<script src="onboarding\.js"><\/script>/);
  assert.match(onboarding, /sends no telemetry/);
  assert.match(onboarding, /href="https:\/\/awaydoomscrollin\.com\/en\/privacy\/"/);
  assert.match(onboarding, /rel="noreferrer" data-privacy-link/);
  assert.equal((onboarding.match(/data-setting="protect/g) || []).length, 3);
  assert.match(onboarding, /data-i18n="onboardingInstagramDescription"/);
  assert.match(onboarding, /data-i18n="onboardingTikTokDescription"/);
  assert.match(onboarding, /data-i18n="onboardingYouTubeDescription"/);
  assert.match(onboarding, /DMs, profiles, comments, and settings remain available/);
  assert.match(onboarding, /Strict Mode closes Home recommendations and every Shorts surface/);
  assert.match(onboardingScript, /https:\/\/awaydoomscrollin\.com\/tr\/gizlilik\//);
  assert.match(onboardingScript, /https:\/\/awaydoomscrollin\.com\/en\/privacy\//);
  assert.match(onboarding, /data-mobile-app-link/);
  assert.equal((onboarding.match(/data-community-link/g) || []).length, 2);
  assert.match(onboardingScript, /https:\/\/awaydoomscrollin\.com\/tr\//);
  assert.match(onboardingScript, /https:\/\/awaydoomscrollin\.com\/en\//);
  assert.match(onboardingScript, /https:\/\/resolvecommunity\.com\/tr\//);
  assert.match(onboardingScript, /https:\/\/resolvecommunity\.com\/en\//);
  assert.match(onboardingScript, /function updateSelectionCount\(\)/);
  assert.match(onboardingScript, /storage\.local\.set\(\{ \[input\.dataset\.setting\]: input\.checked \}\)/);
  assert.match(onboardingScript, /permissions\.request\(\{ origins: requiredOrigins \}\)/);
  assert.doesNotMatch(onboarding, /<script(?![^>]+src=)[^>]*>/i);
  assert.doesNotMatch(onboardingScript, /\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\b/);
  assert.match(read("src/common/onboarding/onboarding.css"), /prefers-reduced-motion: reduce/);
});

test("Instagram Explore is classified and covered in place with shrouds", () => {
  const routeRules = read("src/common/content/route-rules.js");
  const content = read("src/common/content/content.js");
  const contentCss = read("src/common/content/content.css");
  const popupScript = read("src/common/popup/popup.js");
  const en = JSON.parse(read("src/common/_locales/en/messages.json"));
  const tr = JSON.parse(read("src/common/_locales/tr/messages.json"));

  assert.match(routeRules, /EXPLORE: "explore"/);
  assert.match(routeRules, /pathname === "\/explore" \|\| pathname\.startsWith\("\/explore\/"\)/);
  assert.match(routeRules, /function isInstagramMediaSurface\(route\)/);
  assert.match(routeRules, /function shouldCoverSurfaceInPlace\(route, settings\)/);
  assert.match(routeRules, /function shouldShroudProfileGrids\(route, settings\)/);
  assert.match(content, /shroudProfileGridLinks\(\)/);
  assert.match(content, /PROFILE_REEL_SELECTOR = "a\[href\*=\\"\/reel\/\\" i\], a\[href\*=\\"\/tv\/\\" i\]"/);
  assert.match(content, /INSTAGRAM_STORY_SELECTOR =/);
  assert.match(content, /function shroudInstagramStoryLinks\(\)/);
  assert.match(content, /function cleanInstagramStoryShrouds\(\)/);
  assert.match(content, /currentRoute === rules\.ROUTES\.STORIES/);
  assert.match(content, /settings\.instagramProtectionMode === "strict"/);
  assert.match(content, /settings\.instagramProtectionMode === "balanced"\s*\? PROFILE_REEL_SELECTOR/);
  assert.match(routeRules, /function classifyInstagramIndividualMediaMetadata\(values, expectedShortcode\)/);
  assert.match(routeRules, /function instagramMediaShortcode\(value\)/);
  assert.match(content, /rules\.instagramMediaShortcode\(window\.location\.href\)/);
  assert.match(content, /function getInstagramIndividualPostMetadataKind\(\)/);
  assert.match(content, /link\[rel~="canonical" i\]/);
  assert.match(content, /meta\[property="og:url" i\]/);
  assert.match(content, /mediaKind === "reel"/);
  assert.match(content, /mediaKind === "unknown"/);
  assert.match(content, /INSTAGRAM_POST_PROBE_ATTR = "data-away-instagram-post-classifying"/);
  assert.match(contentCss, /data-away-instagram-post-classifying/);
  assert.match(content, /function balancedProfileIsOpen\(route = currentRoute\)/);
  assert.match(content, /function cleanBalancedProfilePostShrouds\(\)/);
  assert.match(content, /!isProfileReelTarget\(element\)/);
  assert.match(content, /data-away-instagram-balanced-profile/);
  assert.match(content, /"away-youtube-mode-changed"/);
  assert.match(popupScript, /function broadcastInstagramMode\(mode\)/);
  assert.match(popupScript, /type: "away-instagram-mode-changed"/);
  assert.match(content, /rules\.shouldShroudProfileGrids\(currentRoute, settings\)/);
  assert.match(content, /rules\.shouldShroudProfileGrids\(detectedRoute, settings\)/);
  assert.match(routeRules, /ROUTES\.EXPLORE\].includes\(route\)\) return "protectInstagram"/);
  assert.match(content, /function applySurfaceShrouds\(\)/);
  assert.match(content, /function applyExploreCurtain\(\)/);
  assert.match(content, /function exploreGridIsPresent\(\)/);
  assert.match(content, /function instagramSurfaceIsCovered\(\)/);
  assert.match(content, /function lockCoveredSurfaceScrolling\(\)/);
  assert.match(content, /function preventCoveredGesture\(event\)/);
  assert.match(content, /shroudInstagramPostArticles\(\)/);
  assert.match(content, /incrementInterventionCount\(currentRoute\)/);
  assert.match(content, /SHIELD_ICON_SVG =/);
  assert.match(content, /function renderShroudPresentation\(shroud, withContent, showIcon\)/);
  assert.match(content, /function shroudTarget\(element, withContent = false, showIcon = true, allowFlyoutMedia = false\)/);
  assert.match(content, /const bannerArticle = articles\.find/);
  assert.match(content, /shroudTarget\(article, showsMessage, showsMessage\)/);
  assert.match(content, /showIcon \? "icon" : "blank"/);
  assert.match(contentCss, /\.away-doomscrollin-shroud \.away-doomscrollin-shroud-icon/);
  assert.match(contentCss, /\.away-doomscrollin-shroud \.away-doomscrollin-shroud-title,/);
  assert.match(content, /EXPLORE_CURTAIN_ID = "away-doomscrollin-explore-curtain"/);
  assert.match(content, /currentRoute === rules\.ROUTES\.REELS && settings\.protectInstagram/);
  assert.match(
    content,
    /currentRoute === rules\.ROUTES\.INDIVIDUAL_POST &&\s*settings\.protectInstagram &&\s*settings\.instagramProtectionMode === "strict"/
  );
  assert.match(content, /navigateTo\("https:\/\/www\.instagram\.com\/direct\/inbox\/"\)/);
  assert.doesNotMatch(content, /away-doomscrollin-banner-action/);
  assert.match(content, /exploreGridIsPresent\(\) &&\s*\n\s*!exploreCurtainPaused &&\s*\n\s*!visibleInstagramDialogExists\(\)/);
  assert.match(content, /function isInstagramFlyoutToggle\(target\)/);
  assert.match(content, /function handleInstagramFlyoutClick\(event\)/);
  assert.match(content, /exploreCurtainPaused = true/);
  assert.match(content, /exploreCurtainPaused = false/);
  assert.match(content, /document\.addEventListener\("click", handleInstagramFlyoutClick, true\)/);
  assert.match(content, /function handleShroudedClick\(event\)/);
  assert.match(content, /document\.addEventListener\("click", handleShroudedClick, true\)/);
  assert.match(content, /document\.addEventListener\("pointerdown", handleShroudedClick, true\)/);
  assert.match(content, /document\.addEventListener\("auxclick", handleShroudedClick, true\)/);
  assert.match(content, /GRID_SHROUD_SELECTOR = "a\[href\*=\\"\/p\/\\" i\], a\[href\*=\\"\/reel\/\\" i\], a\[href\*=\\"\/tv\/\\" i\]"/);
  assert.match(content, /isInstagramSavedUrl/);
  assert.match(content, /a\[href\*="\/saved\/" i\]/);
  assert.match(content, /isInstagramActivityUrl/);
  assert.match(content, /a\[href\*="\/your_activity" i\]/);
  assert.match(content, /function shroudDirectMessageMedia\(\)/);
  assert.match(content, /function isInsideInstagramMessageSurface\(element\)/);
  assert.match(content, /if \(!isInsideInstagramMessageSurface\(link\)\) \{\s*continue;/);
  assert.match(content, /function restoreShroudedTarget\(target\)/);
  assert.match(content, /PREVIOUS_TABINDEX_ATTR/);
  assert.match(content, /PREVIOUS_ARIA_HIDDEN_ATTR/);
  assert.match(contentCss, /\.away-doomscrollin-shroud \.away-doomscrollin-grid-shield-icon/);
  assert.match(content, /"bildirimler"/);
  assert.match(content, /"notifications"/);
  assert.match(content, /function isInstagramFlyoutOpen\(\)/);
  assert.match(content, /function getInstagramFlyoutInfo\(\)/);
  assert.match(content, /rect\.left < 0 \|\| rect\.left > 550/);
  assert.match(content, /pRect\.left >= 0/);
  assert.match(content, /function activateInstagramFlyoutPanel\(panel\)/);
  assert.match(content, /function clearInstagramFlyoutPanels\(\)/);
  assert.match(content, /FLYOUT_CLIPPED_SHROUD_ATTR = "data-away-clipped-behind-flyout"/);
  assert.match(content, /function syncInstagramShroudsBehindFlyout\(\)/);
  assert.match(content, /flyoutRight - rect\.left/);
  assert.match(content, /clip-path/);
  assert.match(content, /syncInstagramShroudsBehindFlyout\(\)/);
  assert.match(content, /function getVisibleModalDialogs\(\)/);
  assert.match(content, /INSTAGRAM_NOTIFICATION_PANEL_TEXT_PATTERN/);
  assert.match(content, /activateInstagramFlyoutPanel\(notificationDialog\)/);
  assert.match(content, /NOTIFICATION_MEDIA_ATTR = "data-away-instagram-notification-media"/);
  assert.match(content, /function isInstagramNotificationMediaLink\(link, flyoutElement\)/);
  assert.match(content, /function getInstagramNotificationMediaTarget\(link\)/);
  assert.match(content, /INSTAGRAM_NOTIFICATION_TEXT_PATTERN/);
  assert.match(content, /function getInstagramNotificationRowForMedia\(media, flyoutElement\)/);
  assert.match(content, /function getInstagramNotificationRowMediaTarget\(row\)/);
  assert.match(content, /visibleMedia\.length < 2/);
  assert.match(content, /rowRect\.width \* 0\.64/);
  assert.match(content, /function shroudInstagramNotificationMedia\(\)/);
  assert.match(content, /function cleanInstagramNotificationMediaShrouds\(\)/);
  assert.match(content, /shroudTarget\(target, false, true, true\)/);
  assert.match(content, /settings\.instagramProtectionMode !== "strict"/);
  assert.match(content, /getUnshroudedInstagramNotificationMediaTargets\(\)\.length > 0/);
  assert.match(content, /data-away-instagram-strict/);
  assert.match(content, /"filtrele"/);
  assert.match(content, /"filter"/);
  assert.match(content, /"yorumlar"/);
  assert.match(content, /"comments"/);
  assert.match(content, /"takipler"/);
  assert.match(content, /"follows"/);
  assert.match(content, /data-away-flyout/);
  assert.match(contentCss, /data-away-flyout/);
  assert.match(contentCss, /data-away-flyout-elevated/);
  assert.match(contentCss, /z-index: 2147483000 !important/);
  assert.match(contentCss, /data-away-flyout-positioned/);
  assert.match(contentCss, /data-away-instagram-flyout-open/);
  assert.match(contentCss, /data-away-instagram-strict.*:is\(main, \[role="main"\]\) a\[data-away-doomscrollin-shrouded\]/s);
  assert.match(contentCss, /z-index: 2 !important/);
  assert.match(content, /function getExploreGridLinks\(\)/);
  assert.match(content, /curtain\.style\.top = `\$\{minTop\}px`/);
  assert.match(content, /curtain\.style\.width = `\$\{maxRight - minLeft\}px`/);
  assert.doesNotMatch(
    contentCss.match(/\.away-doomscrollin-explore-curtain \{[^}]*\}/)?.[0] ?? "",
    /inset: 0|100vw|100vh/
  );
  assert.doesNotMatch(content, /\beval\s*\(|new\s+Function\s*\(/);
  assert.match(contentCss, /\.away-doomscrollin-shroud \{/);
  assert.match(contentCss, /\[data-away-doomscrollin-shrouded\]/);
  assert.match(contentCss, /\.away-doomscrollin-explore-curtain \{/);
  assert.match(contentCss, /\.away-doomscrollin-surface-banner \{/);
  assert.match(contentCss, /pointer-events: auto !important/);
  assert.match(contentCss, /pointer-events: none !important/);
  for (const key of [
    "homeShroudTitle",
    "homeShroudDescription",
    "exploreShroudTitle",
    "exploreShroudDescription",
    "postShroudTitle",
    "postShroudDescription",
    "reelsShroudTitle",
    "reelsShroudDescription",
    "exploreInterventionTitle",
    "exploreInterventionDescription"
  ]) {
    assert.equal(typeof en[key]?.message, "string", `en.${key}`);
    assert.equal(typeof tr[key]?.message, "string", `tr.${key}`);
  }
  assert.equal(tr.homeShroudTitle.message, "Akış Korunuyor");
  assert.equal(tr.exploreShroudTitle.message, "Keşfet Korunuyor");
  assert.equal(en.exploreShroudTitle.message, "Explore Protected");
  assert.equal(en.homeShroudTitle.message, "Feed Protected");
});

test("the packaged privacy page accurately describes local-only behavior", () => {
  const privacy = read("src/common/privacy/privacy.html");
  assert.match(privacy, /no telemetry/i);
  assert.match(privacy, /Telemetri, analitik/);
  assert.match(privacy, /Instagram, TikTok, and YouTube origins/);
  assert.match(privacy, /normal YouTube pages is needed to detect single-page navigation into Shorts/);
  assert.match(privacy, /extension storage/i);
  assert.match(privacy, /eklenti depolama alan[ıi]nda/i);
  assert.doesNotMatch(privacy, /<script/i);
});
