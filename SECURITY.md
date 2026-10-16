# Security Policy — AwayDoomscrollin' Browser

## Reporting

Do not publish an exploitable security issue in a public issue. Report it to
support@awaydoomscrollin.com or use the project's confidential GitLab issue
channel.

Include the affected browser and extension version, reproduction steps,
expected impact, and a minimal proof of concept when possible. Do not include
real messages, credentials, cookies, or account data.

## Security boundaries

- All executable logic is packaged with the extension.
- No remotely hosted scripts or dynamic code execution are allowed.
- The content script is limited to the declared Instagram, TikTok, and YouTube
  origins required for route detection and intervention.
- The extension does not authenticate to or communicate with a Resolve
  Community backend.
- Stored settings and counts are non-sensitive and local to the extension.
- Third-party page content must never be logged or added to error reports.

Third-party route or interface changes that cause missed interventions or
false positives are functional compatibility bugs. They should still be
reported, but the project does not claim perfect or permanent detection.
