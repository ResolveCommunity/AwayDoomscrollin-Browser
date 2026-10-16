# Privacy Policy — AwayDoomscrollin' Browser

Last updated: 6 October 2026

## Summary

AwayDoomscrollin' Browser performs its detection and intervention locally in
the browser. It does not include telemetry, analytics, advertising, tracking,
remote configuration, or remote executable code.

## What the extension accesses

The extension is limited to its declared Instagram, TikTok, and YouTube
origins. On those pages it:

- reads the current URL path to distinguish protected feeds from areas that
  should remain available;
- reads YouTube's canonical URL metadata and local page structure to distinguish
  an actual Short from a normal video without using duration as the classifier;
- observes wheel, touch, scrolling keyboard, and root-scroll input on the
  Instagram and TikTok feeds to determine when to display the intervention;
- adds and removes its own intervention interface and in-page media covers; and
- stores protection preferences and an aggregate intervention counter in the
  browser's extension-local storage.

It does not intentionally read or store the contents of posts, messages,
comments, forms, account names, or passwords.

## Data collection and transmission

The extension does not automatically send data to AwayDoomscrollin', Resolve
Community, or any analytics or advertising provider. No installation
identifier is created. No telemetry endpoint is contacted.

Instagram, TikTok, and YouTube continue to operate as third-party websites and
make their own network requests. Those requests are controlled by the
respective services and are separate from the extension. User-triggered
intervention buttons may open an Instagram page or leave the current service.
If the user selects the clearly labelled
`awaydoomscrollin.com` link, the browser opens that public website and its
separate website privacy disclosures apply.

## Local storage and deletion

The following values may be stored locally by the browser:

- whether Instagram protection is enabled and its selected mode;
- whether TikTok protection is enabled;
- the selected TikTok protection mode;
- whether YouTube protection is enabled;
- the selected YouTube protection mode; and
- the aggregate number of interventions shown.

These values remain until the user resets the counter, clears extension data,
or removes the extension. They are not treated as confidential storage and
must never contain sensitive information.

## Permissions

- **Instagram, TikTok, and YouTube site access:** required to classify routes,
  observe protected-feed scroll intent, handle single-page navigation into
  short-form feeds, inspect YouTube's canonical URL metadata, cover protected
  recommendation surfaces, and display the intervention. If the browser
  withholds this access, protection cannot run automatically; the popup
  explains this and provides a user-initiated permission request limited to the
  supported sites.
- **Storage:** required to retain user-selected protection settings and the
  local aggregate counter between browser sessions.

The extension does not request access to all websites, browser history, tabs,
downloads, cookies, location, clipboard, camera, or microphone.

## Changes

Any future data collection or network behavior must be implemented only after
the source, this policy, and both browser-store disclosures are updated before
release. A store update must not silently introduce telemetry.

## Contact

Privacy and security questions may be sent to support@awaydoomscrollin.com.
