const test = require("node:test");
const assert = require("node:assert/strict");

const rules = require("../src/common/content/route-rules.js");
const { ROUTES } = rules;

const INSTAGRAM_SETTINGS = rules.normalizeSettings({ protectInstagram: true });
const INSTAGRAM_OFF = rules.normalizeSettings({ protectInstagram: false });
const INSTAGRAM_BALANCED = rules.normalizeSettings({
  protectInstagram: true,
  instagramProtectionMode: "balanced"
});

test("Instagram protection mode defaults safely to strict", () => {
  assert.equal(INSTAGRAM_SETTINGS.instagramProtectionMode, "strict");
  assert.equal(INSTAGRAM_BALANCED.instagramProtectionMode, "balanced");
  assert.equal(
    rules.normalizeSettings({ instagramProtectionMode: "unexpected" }).instagramProtectionMode,
    "strict"
  );
});

test("Instagram Explore urls classify as EXPLORE", () => {
  assert.equal(rules.classifySupportedUrl("https://www.instagram.com/explore/"), ROUTES.EXPLORE);
  assert.equal(rules.classifySupportedUrl("https://www.instagram.com/explore"), ROUTES.EXPLORE);
  assert.equal(rules.classifySupportedUrl("https://www.instagram.com/explore/tags/travel/"), ROUTES.EXPLORE);
  assert.equal(rules.classifySupportedUrl("https://instagram.com/explore/people/"), ROUTES.EXPLORE);
});

test("Instagram Stories are strict-only protection surfaces on every supported host", () => {
  assert.equal(
    rules.classifySupportedUrl("https://www.instagram.com/stories/example/123/"),
    ROUTES.STORIES
  );
  assert.equal(
    rules.classifySupportedUrl("https://m.instagram.com/stories/highlights/123/"),
    ROUTES.STORIES
  );
  assert.equal(
    rules.classifySupportedUrl("https://instagram.com/stories/example/123/"),
    ROUTES.STORIES
  );
  assert.equal(rules.shouldCoverSurfaceInPlace(ROUTES.STORIES, INSTAGRAM_SETTINGS), true);
  assert.equal(rules.shouldCoverSurfaceInPlace(ROUTES.STORIES, INSTAGRAM_BALANCED), false);
  assert.equal(rules.settingForRoute(ROUTES.STORIES), "protectInstagram");
  assert.equal(rules.platformForRoute(ROUTES.STORIES), "instagram");
});

test("Instagram surfaces never show the fullscreen dialog but are covered in place", () => {
  for (const route of [ROUTES.HOME_FEED, ROUTES.EXPLORE, ROUTES.REELS, ROUTES.INDIVIDUAL_POST]) {
    assert.equal(rules.shouldBlockImmediately(route, INSTAGRAM_SETTINGS), false, route);
    assert.equal(rules.shouldCoverSurfaceInPlace(route, INSTAGRAM_SETTINGS), true, route);
  }
  assert.equal(rules.shouldCoverSurfaceInPlace(ROUTES.EXPLORE, INSTAGRAM_OFF), false);
  assert.equal(rules.settingForRoute(ROUTES.EXPLORE), "protectInstagram");
  assert.equal(rules.platformForRoute(ROUTES.EXPLORE), "instagram");
  // YouTube now uses silent route redirects and in-place covers too.
  assert.equal(rules.shouldBlockImmediately(ROUTES.YOUTUBE_SHORTS, rules.normalizeSettings({})), false);
  assert.equal(rules.shouldBlockImmediately(ROUTES.TIKTOK_VIDEO, rules.normalizeSettings({})), false);
});

test("Instagram routes never arm the popup-triggering scroll interceptor", () => {
  assert.equal(rules.shouldArmScrollableFeed(ROUTES.EXPLORE, INSTAGRAM_SETTINGS), false);
  assert.equal(rules.shouldArmScrollableFeed(ROUTES.HOME_FEED, INSTAGRAM_SETTINGS), false);
  assert.equal(rules.shouldArmScrollableFeed(ROUTES.EXPLORE, INSTAGRAM_OFF), false);
  assert.equal(rules.shouldArmScrollableFeed(ROUTES.PROFILE_OR_OTHER, INSTAGRAM_SETTINGS), false);
});

test("TikTok feed remains armed for its current popup flow", () => {
  assert.equal(rules.shouldArmScrollableFeed(ROUTES.TIKTOK_FEED, { protectTikTok: true }), true);
  assert.equal(rules.shouldArmScrollableFeed(ROUTES.TIKTOK_FEED, { protectTikTok: false }), false);
});

test("Home feed, reels and posts are covered in place; profiles are not", () => {
  for (const route of [ROUTES.HOME_FEED, ROUTES.REELS, ROUTES.INDIVIDUAL_POST]) {
    assert.equal(rules.shouldCoverSurfaceInPlace(route, INSTAGRAM_SETTINGS), true, route);
  }
  assert.equal(rules.shouldCoverSurfaceInPlace(ROUTES.PROFILE_OR_OTHER, INSTAGRAM_SETTINGS), false);
  assert.equal(rules.shouldCoverSurfaceInPlace(ROUTES.DIRECT_MESSAGES, INSTAGRAM_SETTINGS), false);
  assert.equal(rules.shouldCoverSurfaceInPlace(ROUTES.TIKTOK_FEED, INSTAGRAM_SETTINGS), true);
});

test("Instagram canonical metadata distinguishes Reel aliases from normal posts", () => {
  assert.equal(
    rules.classifyInstagramIndividualMediaMetadata([
      "https://www.instagram.com/reel/DeFXjSiSjdS/",
      "https://www.instagram.com/peigengo/reel/DeFXjSiSjdS/"
    ]),
    "reel"
  );
  assert.equal(
    rules.classifyInstagramIndividualMediaMetadata([
      "https://www.instagram.com/understationstore/p/Dd6fiEVCONz/",
      "https://www.instagram.com/understationstore/p/Dd6fiEVCONz/"
    ]),
    "post"
  );
  assert.equal(
    rules.classifyInstagramIndividualMediaMetadata([null, "", "not a url"]),
    "unknown"
  );
  assert.equal(
    rules.classifyInstagramIndividualMediaMetadata([
      "https://www.instagram.com/p/DeFXjSiSjdS/",
      "https://www.instagram.com/reel/DeFXjSiSjdS/"
    ], "DeFXjSiSjdS"),
    "reel",
    "a Reel signal wins over a conflicting /p/ alias"
  );
  assert.equal(
    rules.classifyInstagramIndividualMediaMetadata([
      "https://www.instagram.com/reel/PreviousShortcode/",
      "https://www.instagram.com/p/CurrentShortcode/"
    ], "CurrentShortcode"),
    "post",
    "stale SPA metadata from another shortcode is ignored"
  );
  assert.equal(
    rules.instagramMediaShortcode("https://www.instagram.com/creator/reel/AbC_123-/"),
    "AbC_123-"
  );
});

test("Balanced Instagram mode opens profile posts without opening feed surfaces", () => {
  assert.equal(rules.shouldShroudProfileGrids(ROUTES.PROFILE_OR_OTHER, INSTAGRAM_BALANCED), true);
  assert.equal(rules.shouldCoverSurfaceInPlace(ROUTES.INDIVIDUAL_POST, INSTAGRAM_BALANCED), false);
  assert.equal(rules.shouldCoverSurfaceInPlace(ROUTES.HOME_FEED, INSTAGRAM_BALANCED), true);
  assert.equal(rules.shouldCoverSurfaceInPlace(ROUTES.EXPLORE, INSTAGRAM_BALANCED), true);
  assert.equal(rules.shouldCoverSurfaceInPlace(ROUTES.REELS, INSTAGRAM_BALANCED), true);
});

test("TikTok feeds and videos use curtains only while protection is enabled", () => {
  for (const route of [ROUTES.TIKTOK_FEED, ROUTES.TIKTOK_VIDEO]) {
    assert.equal(rules.shouldBlockImmediately(route, { protectTikTok: true }), false);
    assert.equal(rules.shouldCoverSurfaceInPlace(route, { protectTikTok: true }), true);
    assert.equal(rules.shouldCoverSurfaceInPlace(route, { protectTikTok: false }), false);
  }
  assert.equal(rules.shouldCoverSurfaceInPlace(ROUTES.TIKTOK_OTHER, { protectTikTok: true }), false);
});

test("TikTok unknown and newly launched media routes fail closed as feeds", () => {
  for (const url of [
    "https://www.tiktok.com/",
    "https://www.tiktok.com/browse",
    "https://www.tiktok.com/shortdrama",
    "https://www.tiktok.com/shop",
    "https://www.tiktok.com/embed/v2/123",
    "https://www.tiktok.com/%73hortdrama",
    "https://www.tiktok.com/%2573hortdrama",
    "https://m.tiktok.com/explore"
  ]) {
    assert.equal(rules.classifySupportedUrl(url), ROUTES.TIKTOK_FEED, url);
  }
});

test("TikTok intentional routes and protection modes remain distinct", () => {
  const strict = rules.normalizeSettings({ protectTikTok: true });
  const balanced = rules.normalizeSettings({
    protectTikTok: true,
    tiktokProtectionMode: "balanced"
  });
  assert.equal(strict.tiktokProtectionMode, "strict");
  assert.equal(balanced.tiktokProtectionMode, "balanced");
  assert.equal(
    rules.classifySupportedUrl("https://www.tiktok.com/search?q=recipe"),
    ROUTES.TIKTOK_SEARCH
  );
  assert.equal(
    rules.classifySupportedUrl("https://www.tiktok.com/@chef"),
    ROUTES.TIKTOK_PROFILE
  );
  assert.equal(
    rules.classifySupportedUrl("https://www.tiktok.com/@chef/video/123"),
    ROUTES.TIKTOK_VIDEO
  );
  assert.equal(
    rules.classifySupportedUrl("https://www.tiktok.com/messages/123"),
    ROUTES.TIKTOK_MESSAGES
  );
  assert.equal(rules.classifySupportedUrl("https://www.tiktok.com/404"), ROUTES.TIKTOK_OTHER);
  assert.equal(rules.classifySupportedUrl("https://www.tiktok.com/safety/en"), ROUTES.TIKTOK_OTHER);
  assert.equal(rules.shouldShroudTikTokMedia(ROUTES.TIKTOK_PROFILE, strict), true);
  assert.equal(rules.shouldShroudTikTokMedia(ROUTES.TIKTOK_SEARCH, strict), true);
  assert.equal(rules.shouldShroudTikTokMedia(ROUTES.TIKTOK_MESSAGES, strict), true);
  assert.equal(rules.shouldShroudTikTokMedia(ROUTES.TIKTOK_PROFILE, balanced), false);
  assert.equal(rules.shouldFocusTikTokVideo(ROUTES.TIKTOK_VIDEO, strict), false);
  assert.equal(rules.shouldFocusTikTokVideo(ROUTES.TIKTOK_VIDEO, balanced), true);
  assert.equal(rules.tikTokVideoId("https://www.tiktok.com/@chef/video/123"), "123");
  for (const key of ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "j", "k"]) {
    assert.equal(rules.isTikTokNavigationKey(key), true, key);
  }
});

test("YouTube routes and aliases are classified independently of duration", () => {
  assert.equal(rules.classifySupportedUrl("https://www.youtube.com/"), ROUTES.YOUTUBE_HOME);
  assert.equal(rules.classifySupportedUrl("https://www.youtube.com/shorts/abc"), ROUTES.YOUTUBE_SHORTS);
  assert.equal(rules.classifySupportedUrl("https://www.youtube.com/%73horts/abc"), ROUTES.YOUTUBE_SHORTS);
  assert.equal(rules.classifySupportedUrl("https://www.youtube.com/%2573horts/abc"), ROUTES.YOUTUBE_SHORTS);
  assert.equal(rules.classifySupportedUrl("https://www.youtube.com/results?search_query=recipe"), ROUTES.YOUTUBE_SEARCH);
  assert.equal(rules.classifySupportedUrl("https://www.youtube.com/@chef/shorts"), ROUTES.YOUTUBE_CHANNEL);
  assert.equal(rules.classifySupportedUrl("https://www.youtube.com/channel/UC123"), ROUTES.YOUTUBE_CHANNEL);
  assert.equal(rules.classifySupportedUrl("https://www.youtube.com/feed/subscriptions"), ROUTES.YOUTUBE_SUBSCRIPTIONS);
  assert.equal(rules.classifySupportedUrl("https://www.youtube.com/feed/you"), ROUTES.YOUTUBE_LIBRARY);
  assert.equal(rules.classifySupportedUrl("https://www.youtube.com/playlist?list=PL123"), ROUTES.YOUTUBE_LIBRARY);
  assert.equal(rules.classifySupportedUrl("https://www.youtube.com/watch?v=abc"), ROUTES.YOUTUBE_WATCH);
  assert.equal(rules.classifySupportedUrl("https://www.youtube.com/embed/abc"), ROUTES.YOUTUBE_EMBED);
  assert.equal(rules.classifySupportedUrl("https://www.youtube.com/gaming"), ROUTES.YOUTUBE_OTHER);
  assert.equal(rules.youtubeVideoId("https://www.youtube.com/shorts/abc"), "abc");
  assert.equal(rules.youtubeVideoId("https://www.youtube.com/watch?v=abc"), "abc");
  assert.equal(rules.youtubeVideoId("https://www.youtube.com/watch?feature=share&v=abc&list=PL123"), "abc");
  assert.equal(rules.youtubeVideoId("https://m.youtube.com/watch?list=PL123&v=abc&index=2"), "abc");
  assert.equal(rules.youtubeVideoId("https://www.youtube.com/shorts/abc?si=shared"), "abc");
  assert.equal(rules.youtubeVideoId("https://youtu.be/abc"), "abc");
});

test("YouTube Strict and Balanced modes protect loops without using video length", () => {
  const strict = rules.normalizeSettings({ protectYoutubeShorts: true });
  const balanced = rules.normalizeSettings({
    protectYoutubeShorts: true,
    youtubeProtectionMode: "balanced"
  });
  assert.equal(strict.youtubeProtectionMode, "strict");
  assert.equal(balanced.youtubeProtectionMode, "balanced");
  assert.equal(rules.shouldCoverYouTubeHome(ROUTES.YOUTUBE_HOME, strict), true);
  assert.equal(rules.shouldCoverYouTubeHome(ROUTES.YOUTUBE_HOME, balanced), false);
  for (const route of [
    ROUTES.YOUTUBE_HOME,
    ROUTES.YOUTUBE_SEARCH,
    ROUTES.YOUTUBE_CHANNEL,
    ROUTES.YOUTUBE_SUBSCRIPTIONS,
    ROUTES.YOUTUBE_LIBRARY,
    ROUTES.YOUTUBE_OTHER
  ]) {
    assert.equal(rules.shouldShroudYouTubeShorts(route, strict), true, route);
  }
  assert.equal(rules.shouldShroudYouTubeShorts(ROUTES.YOUTUBE_HOME, balanced), true);
  assert.equal(rules.shouldShroudYouTubeShorts(ROUTES.YOUTUBE_SEARCH, balanced), false);
  for (const route of [
    ROUTES.YOUTUBE_SEARCH,
    ROUTES.YOUTUBE_CHANNEL,
    ROUTES.YOUTUBE_SUBSCRIPTIONS,
    ROUTES.YOUTUBE_LIBRARY
  ]) {
    assert.equal(rules.shouldAllowIntentionalYouTubeShorts(route, balanced), true, route);
  }
  assert.equal(rules.shouldAllowIntentionalYouTubeShorts(ROUTES.YOUTUBE_HOME, balanced), false);
  assert.equal(rules.settingForRoute(ROUTES.YOUTUBE_WATCH), "protectYoutubeShorts");
  assert.equal(rules.platformForRoute(ROUTES.YOUTUBE_EMBED), "youtube");
});

test("Profile surfaces keep their chrome but media grids are shrouded", () => {
  assert.equal(rules.shouldShroudProfileGrids(ROUTES.PROFILE_OR_OTHER, INSTAGRAM_SETTINGS), true);
  assert.equal(rules.shouldShroudProfileGrids(ROUTES.PROFILE_OR_OTHER, INSTAGRAM_BALANCED), true);
  assert.equal(rules.shouldShroudProfileGrids(ROUTES.PROFILE_OR_OTHER, INSTAGRAM_OFF), false);
  assert.equal(rules.shouldShroudProfileGrids(ROUTES.HOME_FEED, INSTAGRAM_SETTINGS), false);
  assert.equal(rules.shouldShroudProfileGrids(ROUTES.EXPLORE, INSTAGRAM_SETTINGS), false);
  assert.equal(rules.shouldShroudProfileGrids(ROUTES.DIRECT_MESSAGES, INSTAGRAM_SETTINGS), false);
  assert.equal(rules.shouldShroudProfileGrids(ROUTES.TIKTOK_OTHER, INSTAGRAM_SETTINGS), false);
});

test("Other Instagram routes stay classified as before", () => {
  assert.equal(rules.classifySupportedUrl("https://www.instagram.com/"), ROUTES.HOME_FEED);
  assert.equal(rules.classifySupportedUrl("https://www.instagram.com/reels/"), ROUTES.REELS);
  assert.equal(rules.classifySupportedUrl("https://www.instagram.com/reel/abc123/"), ROUTES.REELS);
  assert.equal(rules.classifySupportedUrl("https://www.instagram.com/p/abc123/"), ROUTES.INDIVIDUAL_POST);
  assert.equal(rules.classifySupportedUrl("https://www.instagram.com/someuser/p/abc123/"), ROUTES.INDIVIDUAL_POST);
  assert.equal(rules.classifySupportedUrl("https://www.instagram.com/someuser/reel/abc123/"), ROUTES.REELS);
  assert.equal(rules.classifySupportedUrl("https://www.instagram.com/someuser/reels/"), ROUTES.PROFILE_OR_OTHER);
  assert.equal(rules.classifySupportedUrl("https://www.instagram.com/direct/inbox/"), ROUTES.DIRECT_MESSAGES);
  assert.equal(rules.classifySupportedUrl("https://www.instagram.com/someuser/"), ROUTES.PROFILE_OR_OTHER);
  assert.equal(rules.classifySupportedUrl("https://www.instagram.com/someuser/saved/"), ROUTES.PROFILE_OR_OTHER);
  assert.equal(rules.classifySupportedUrl("https://www.instagram.com/your_activity/interactions/likes/"), ROUTES.PROFILE_OR_OTHER);
});
