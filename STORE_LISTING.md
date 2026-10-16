# Browser Store Listing Draft

## Name

AwayDoomscrollin' — Short-Feed Interrupter

## Short description (English)

Interrupt distracting feeds on Instagram, TikTok, and YouTube while keeping intentional areas available.

## Short description (Turkish)

Amaçlı alanları engellemeden Instagram, TikTok ve YouTube'daki dikkat dağıtan akışları durdurun.

## Full description (English)

AwayDoomscrollin' Browser interrupts distracting short-form loops without using
a time limit. Strict and Balanced modes let the user choose between maximum
protection and intentional one-video viewing. On YouTube, canonical metadata
identifies actual Shorts even when they open through a normal `/watch` URL;
video duration alone is never used as the decision. Search, subscriptions,
channels, libraries, comments, and deliberately selected long-form videos
remain available.

AwayDoomscrollin' is also available as a separate Android app for Instagram
Reels, TikTok, and YouTube Shorts. The browser extension does not install or
communicate with the Android app; each product has its own permissions,
settings, versioning, and privacy disclosure. Learn more at
https://awaydoomscrollin.com/en/.

Developed and maintained by Resolve Community, an independent initiative
building transparent digital-wellbeing tools.

The extension is free and open source. It contains no ads, telemetry,
analytics, remote code, or automatic Resolve Community network requests. A
clearly labelled website link opens awaydoomscrollin.com only when selected.
Settings and the total and per-platform intervention counters are stored
locally in your browser.

All integrations are beta. Third-party route or interface changes may cause
missed detections or false positives. The extension is not affiliated with or
endorsed by Instagram, Meta, TikTok, ByteDance, YouTube, or Google.

## Full description (Turkish)

AwayDoomscrollin' Browser, süre sınırı koymadan dikkat dağıtan kısa içerik
döngülerini durdurur. Sert ve Dengeli modlar, en güçlü koruma ile amaçlı tek
video izleme arasında seçim sunar. YouTube'da gerçek Shorts içerikleri normal
bir `/watch` adresiyle açılsa bile kanonik metadata ile tanınır; karar yalnızca
video süresine göre verilmez. Arama, abonelikler, kanallar, kitaplık, yorumlar
ve amaçlı seçilen uzun videolar açık kalır.

Eklenti ücretsiz ve açık kaynaklıdır. Reklam, telemetri, analitik, uzaktan kod
veya Resolve Community sunucularına otomatik istek içermez. Ayarlar ile toplam
müdahale sayısı yalnızca tarayıcınızda saklanır.

AwayDoomscrollin', Instagram Reels, TikTok ve YouTube Shorts için ayrı bir
Android uygulaması olarak da sunulur. Tarayıcı eklentisi Android uygulamasını
kurmaz ve onunla iletişim kurmaz; iki ürünün izinleri, ayarları, sürümleri ve
gizlilik açıklamaları birbirinden ayrıdır. Ayrıntılar:
https://awaydoomscrollin.com/tr/.

Şeffaf dijital iyi oluş araçları geliştiren bağımsız girişim Resolve Community
tarafından geliştirilir ve sürdürülür.

Tüm entegrasyonlar beta aşamasındadır. Üçüncü taraf adres veya arayüz
değişiklikleri algılamanın kaçırılmasına ya da yanlış müdahaleye neden olabilir.
Eklentinin Instagram, Meta, TikTok, ByteDance, YouTube veya Google ile bağlantısı
yoktur ve bu kuruluşlar tarafından desteklenmemektedir.

## Permission justification

- `storage`: preserves the three user-selected platform protection switches and
  the local total and per-platform intervention counters.
- Instagram and TikTok origins: classify protected routes, observe deliberate
  protected-feed scroll input, and display the local intervention.
- YouTube origins: classify routes, inspect canonical video metadata, cover
  recommendation/Shorts surfaces, and prevent chained video navigation under
  the selected mode. All decisions remain local. If a browser withholds site
  access, the popup asks the user to grant only these declared origins.

## Chrome single-purpose statement

The extension's single purpose is to interrupt distracting short-form feeds on
supported platforms while preserving intentional areas.

## Firefox data collection declaration

`browser_specific_settings.gecko.data_collection_permissions.required` is set
to `none`. The extension does not collect or transmit data outside the extension.

## Store identity

- Developer / publisher display name: `Resolve Community`
- Official product website: `https://awaydoomscrollin.com/en/`
- Developer website: `https://resolvecommunity.com/en/`
- Recommended final onboarding screenshot: include the Android app and
  Resolve Community ecosystem card, while keeping the extension's own browser
  protection controls as the main subject.
