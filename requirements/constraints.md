# Constraints

- Manifest V3; plain JS with no build step, unless a build step is explicitly
  justified otherwise.
- Runs only on https://calculator.aws/*.
- No secrets hardcoded.
- The spotlight overlay must never block or alter the RPA's own clicks/inputs
  (pointer-events:none, very high z-index, scroll-follow, guaranteed cleanup on both
  success and error).
- Popup UI copy in Spanish (Applying brand); code and comments in English.
