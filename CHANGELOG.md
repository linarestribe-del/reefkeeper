## 4.3.42 — Maintenance 7B iPhone Status Canvas

### Fixed

- Moved the reef background image to the root `html/body` canvas so iOS can use the same artwork when painting the standalone status area.
- Made the separate `.ocean-bg` layer transparent to prevent the background image from restarting below the status area.
- Added a reef-compatible `theme-color` fallback for iOS/browser chrome that cannot expose the root image.

### Safety and compatibility

- The verified Maintenance 7A scrollable header and Ask AI answer positioning are unchanged.
- Bottom navigation, storage, APIs, AI protection, Apex, Observer, Raspberry Pi services, and Vercel routes are unchanged.
- `4.3.41 / Maintenance 7A` remains the immediate rollback build.

## 4.3.41 — Maintenance 7A Mobile Header and Ask AI Positioning

### Fixed

- Moved the Reef Keeper logo/tagline into the single `.app-content` scroll container so the complete top section scrolls away with the page instead of remaining fixed and clipping Home content.
- Enabled iPhone safe-area coverage with `viewport-fit=cover` and a translucent standalone status bar so the reef background replaces the solid blue status strip.
- Changed completed Ask AI responses to align at the beginning of the new answer rather than automatically revealing its final line.
- Applied the same top-of-response positioning to Ask AI connection and image-analysis errors.

### Safety and compatibility

- Bottom navigation remains fixed outside the scroll container.
- Existing question, typing, attachment, reminder, history, and chat-storage behavior is unchanged.
- Added a dedicated regression test for header placement, safe-area metadata, and final-answer positioning.
- No storage keys, APIs, AI access protection, Apex integration, Observer behavior, Raspberry Pi services, or Vercel routes changed.
- `4.3.40 / Maintenance 6F` remains the immediate rollback build.

## 4.3.40 — Maintenance 6F Stable Post-Cleanup Checkpoint

### Added

- Added repository-wide JavaScript syntax validation under Node.js 22.
- Added independent syntax validation for every inline `index.html` script.
- Added duplicate top-level browser function detection with the documented `showPage` compatibility router as the only allowed duplicate.
- Added literal DOM-reference validation for static, dynamically created, and documented optional elements.
- Added a stable-baseline regression that requires all prior cleanup safeguards, release files, and the 12-function Vercel limit checks to remain in the standard suite.
- Added `npm run test:stability` for the hardening subset.

### Updated

- Marked `4.3.40 / Maintenance 6F` as the required baseline for two isolated UI fixes followed by the next Aquarium Observer phase.
- Updated release, architecture, roadmap, rollback, development, test-plan, and checksum documentation.

### Safety and compatibility

- No feature logic, navigation behavior, storage key or schema, API function, Vercel route, AI protection, Apex integration, Observer behavior, or Raspberry Pi service changed.
- The only visible runtime difference is the Settings version label.
- `4.3.39 / Maintenance 6E` remains the immediate rollback build.

## 4.3.39 — Maintenance 6E Shared Inline Helper Consolidation
- Replaces duplicate JSON storage readers used by System Check, Reef Timeline, and Reports with one `rkReadStoredJson` helper.
- Replaces duplicate array-only storage readers used by Equipment and Home with one `rkReadStoredArray` helper.
- Replaces duplicate Timeline and Report HTML escaping functions with one `rkEscapeHtml` helper.
- Removes the unused `rkHomeNumber` helper after repository-wide call-site verification.
- Preserves missing-key fallbacks, malformed-JSON handling, array-shape validation, and HTML escaping output.
- Adds permanent regression coverage for the shared helper contract and retired helper names.
- Makes no navigation, storage-key, storage-schema, API, AI access-key, Apex, Observer, Raspberry Pi, dependency, or Vercel route changes.

## 4.3.38 — Maintenance 6D Timeline and Report Data Snapshot Cleanup
- Builds the full Reef Timeline event set once per render and reuses it for filtering, intelligence, milestones, and the visible list.
- Allows report generation to pass already-loaded logs, actions, and completed tasks into Timeline construction.
- Reuses the loaded parameter-log snapshot in Monthly, Emergency, and Custom reports.
- Preserves Timeline ordering, filtering, counts, milestones, report content, local-storage keys, and saved-data formats.
- Adds runtime regression coverage for storage-read counts and report output.
- Makes no navigation, API, AI access-key, Apex, Observer, Raspberry Pi, dependency, or Vercel route changes.

## 4.3.37 — Maintenance 6C Handler and Renderer Consolidation
- Replaces 22 repeated tool-overlay `scrollToolToTop(...)` inline handlers with `data-scroll-tool` attributes and one delegated click handler.
- Preserves both scroll controls in every tool header: tapping the title or the top-arrow button still scrolls that tool to the top.
- Consolidates the duplicated primary and fallback Home snapshot DOM rendering into one `rkHomeRenderSnapshot` function.
- Keeps the Home data acquisition paths separate while ensuring telemetry refresh occurs once through the shared renderer.
- Adds permanent regression coverage for the delegated controls and shared Home rendering contract.
- Makes no navigation, storage, API, AI access-key, Apex, Observer, Raspberry Pi, or Vercel route changes.

## 4.3.36 — Maintenance 6B Inline JavaScript Cleanup
- Removes seven unreachable helper functions from `index.html` after repository-wide call-site verification.
- Removes layered wrappers around `showPage` and `showWorkspace` that caused duplicate Home intelligence refreshes.
- Replaces the DOM-ready plus forced window-load refresh sequence with one canonical initial Home render.
- Preserves the working direct navigator, page-specific rendering, AI access control, Apex, Observer, storage, and Vercel routes.
- Adds a permanent regression test that rejects the retired helpers and duplicate Home refresh hooks.

## 4.3.35 — Maintenance 6A Index Navigation Cleanup
- Consolidates the layered v4.3.28, v4.3.38, v4.3.39, and v4.3.40 app-shell navigation and scrolling overrides into one canonical `index.html` style block.
- Removes dead selectors for navigation elements that do not exist in the application.
- Preserves the verified fixed bottom navigation, single `.app-content` scroll container, Home clearance, and non-Home page growth behavior.
- Adds a permanent regression test that rejects the retired patch blocks and verifies the canonical layout contract.
- Makes no API, AI access-key, Apex, Observer, Raspberry Pi, storage, or Vercel route changes.

## 4.3.34 — Maintenance 5C Paid AI Access Protection
- Adds staged shared-key authentication to `/api/chat`, `/api/plan`, `/api/livestock`, and `/api/photo-analysis`.
- Adds a masked Settings → AI access-key field with Save, Test, and Clear controls.
- Rejects missing or incorrect keys with HTTP `401` before OpenAI is called once Vercel enforcement is configured.
- Keeps initial deployment non-breaking until `REEF_AI_ACCESS_KEY` or `REEF_AI_ACCESS_KEYS` is added in Vercel.
- Stores the key only on the current device and excludes it from Reef Keeper backup exports.
- Supports controlled key rotation without adding a Vercel function, dependency, Pi change, Apex change, or Observer change.

## 4.3.33 — Maintenance 5B Paid AI Abuse Controls
- Adds endpoint-specific request-body ceilings to `/api/chat`, `/api/plan`, `/api/livestock`, and `/api/photo-analysis` before OpenAI is called.
- Caps chat input to the newest 24 supported messages and 96,000 cumulative text characters.
- Adds strict supported-image data-URL validation to photo analysis.
- Adds dependency-free per-client burst controls that return `429` and `Retry-After`.
- Adds no Vercel function, UI change, Raspberry Pi change, new dependency, or required environment variable.
- Refreshes the runtime-critical checksum file and removes stale references to the root Apex duplicates deleted in Maintenance 4A.
- The limiter is best-effort per warm serverless instance; it reduces bursts but does not replace future caller authentication or durable platform-level rate limiting.

## Maintenance 5A.1 — Release Alignment
- Aligns the repository version, lockfile, release regression, documentation, and permanent Apex data-minimization regression coverage with the deployed Maintenance 5A runtime baseline.
- Records commit `7be5d8d` as the user-confirmed working Apex data-minimization runtime baseline.
- Adds no runtime, UI, Vercel route, environment-variable, Raspberry Pi, or Apex connector changes.
- Keeps the application version at `4.3.32`, the version assigned to Maintenance 5A.

## 4.3.32 — Maintenance 5A Apex Data Minimization
- Sanitizes Apex data before it is stored by `/api/apex-sync`.
- Sanitizes every `/api/apex-status` read so older KV records cannot expose the former raw controller payload.
- Removes the Apex source URL, controller hostname, serial, link key, hardware/software metadata, raw text, device identifiers, and unrelated inputs/outlets from the public response.
- Preserves the small `raw.istat.inputs` and `raw.istat.outputs` compatibility shape used by the current app, limited to telemetry, power, leak, equipment-state, and alarm fields Reef Keeper actually reads.
- Adds regression coverage proving sensitive sample fields are excluded while required Apex values remain available.
- No Raspberry Pi update or Vercel environment-variable change is required.

## Maintenance 1.1 — Public npm registry lockfile fix
- Replaced environment-specific package-lock download URLs with public npm registry URLs.
- Added `.npmrc` to make Vercel and GitHub Actions use `https://registry.npmjs.org/`.
- No runtime application files changed.

## Maintenance 1 — Repository safeguards

- Added locked dependencies, Node/npm version declarations, GitHub Actions CI, repository-integrity tests, and a Vercel function-count guard.
- Added rollback and release-manifest documentation.
- Updated README and architecture metadata for Build 2L.1.
- No intentional changes to application runtime files, API routes, Observer behavior, Apex behavior, or Raspberry Pi services.

## 4.3.31 - Build 2L.1 Hobby Plan Function Fix
- Consolidated time-lapse metadata into observer-status.
- Consolidated time-lapse uploads into observer-publish.
- Consolidated private MP4 delivery into observer-image.
- Reduced the deployment from 14 to 12 Vercel Functions for Hobby-plan compatibility.
- Preserved weekly/monthly time-lapse behavior and private Blob storage.

## 4.3.30 - Build 2L Weekly and Monthly Time-Lapses
- Added private rolling 7-day and rolling 30-day Observer videos.
- A separate daily Pi service selects one hourly frame for weekly video and one frame about every six hours for monthly video.
- Only compact H.264 MP4 files are uploaded; the full five-minute archive remains local.
- Added byte-range video delivery for reliable iPhone and Safari playback.
- Added archive-progress states while the Pi accumulates enough history.

## 4.3.29 — Build 2K Automatic Change Alerts
- Converts the daily visual comparison into evidence-limited structured alerts for water level, skimmer condition, leak/overflow evidence, equipment position, buildup, and camera quality.
- Adds urgent/watch/info severity rules that explicitly avoid alerts caused only by lighting, reflections, framing, or image noise.
- Adds an Observer alert card with new-alert toasts, review controls, current comparison access, and recent textual alert history.
- Stores up to 30 alert records privately in Vercel Blob. Older alert text remains available while only the latest daily image pair is retained remotely.
- Requires no Raspberry Pi update; the existing Build 2J publisher automatically triggers the new alert evaluation.

## 4.3.28 - Build 2J Daily Visual Summary
- Pi publisher 2.2 selects stable representative frames near noon local time for today and the prior day.
- An authenticated server endpoint automatically compares the two frames once per day with OpenAI and saves a concise evidence-limited report.
- Aquarium Observer now displays the daily status, headline, visible changes, concerns, image limitations, and up to two practical next checks.
- The daily frames can be opened in Ask AI for an interactive follow-up comparison.
- Full five-minute archives remain local on the Pi; only two representative daily frames are uploaded.

## 4.3.27 - Build 2I Observer Health & Reliability
- Adds an Observer Health dashboard for camera freshness, remote publishing, Pi timers, archive storage, free space, and power flags.
- Distinguishes a stale camera from a stale remote publisher.
- Preserves the last published image while accepting metadata-only failure reports from the Pi.
- Adds a copyable diagnostic report that excludes tokens, camera credentials, and private network addresses.
- Updates the Pi publisher to version 2.1 with health-only fallback reporting when local images or storage are unavailable.

## 4.3.26 - Build 2H Observer History Comparison
- Publishes selected previous, approximately 24-hour-old, and approximately 7-day-old sump captures alongside the latest image.
- Adds built-in historical comparison actions to Aquarium Observer.
- Sends only two selected frames to Ask AI in chronological order while the full archive remains local on the Pi.
- Adds comparison-specific safety and uncertainty instructions.

## 4.3.25 - Build 2G.1 Visible Compare Photos
- Added a dedicated Compare Photos tile in AI Vision.
- Added a Compare photos row below the photo picker.
- Added Compare Photos to the Ask AI add menu.
- Multi-photo upload and comparison behavior from Build 2G remain unchanged.

## 4.3.24 - Build 2G Multi-Image Comparison
- Ask AI now accepts up to 4 uploaded photos at once for comparison.
- Added Compare Photos helper actions in AI Vision and the add menu.
- Chat now uses a comparison prompt automatically when multiple images are attached without typed text.
- Observer image handoff remains compatible with the new multi-image attachment format.

## v4.3.20 — Build 2F.3: Observer Overlay Removal

## 4.3.22 — Build 2F.5: Vision request timeout fix

- Increased the Vercel execution window for `/api/chat.js` from the platform default to 60 seconds so image analysis can finish reliably.
- Added clearer handling for browser-level network termination errors such as Safari's `Load failed`.
- Added regression coverage for the function-duration configuration.

- Fixed the connected Observer image placeholder remaining visible over the live image.
- Added a CSS rule honoring the placeholder's `hidden` attribute even though its base layout uses `display: flex`.
- Added a JavaScript fallback that explicitly removes and restores placeholder display state on image load/error.
- Bumped Observer CSS and JavaScript cache keys.

## v4.3.18 — Build 2F.1: Observer Token Normalization

- Normalizes accidental leading or trailing whitespace in the Observer write token on both sides of the constant-time comparison.
- Prevents false `401 Unauthorized` responses when a Vercel environment-variable value contains an invisible space or line break.
- Adds regression coverage for token normalization.

# Reef Keeper Changelog

## v4.3.17 — Build 2F: Aquarium Observer Publishing Bridge

### Added

- Added authenticated `/api/observer-publish` uploads for the Raspberry Pi's current JPEG and sanitized capture status.
- Added private Vercel Blob storage for one replaceable current image and one current status record.
- Added `/api/observer-image` to stream the private current image through the Reef Keeper origin without exposing the Blob URL.
- Added a dependency-free Raspberry Pi publisher script at `connector/observer-publisher.py`.
- Added storage-capacity reporting, upload-size validation, JPEG signature validation, constant-time token comparison, and publishing regression tests.

### Privacy and architecture

- Full-resolution archives remain only on the Raspberry Pi's ext4 drive.
- Vercel receives only the current selected JPEG and a strict allowlist of status fields.
- Camera credentials, RTSP URLs, local paths, and home-network addresses are excluded from the payload and stored record.
- The current cloud image is stored in a private Blob store and is delivered only through the same-origin app endpoint.
- No router port forwarding or direct inbound connection to the Raspberry Pi is required.

## v4.3.16 — Build 2E: Aquarium Observer Interface

### Added

- Added an Aquarium Observer preview to AI Vision and a dedicated Observer status page.
- Added remote-ready status, capture-age, camera, stream, image-size, interval, and archive-storage fields.
- Added safe offline, stale, and not-yet-connected states instead of showing fabricated camera data.
- Added an Analyze Latest Capture action that reuses the tested Ask AI image-resize and attachment pipeline when a selected remote image reference becomes available.
- Added `/api/observer-status` as an authenticated, metadata-only Pi bridge contract backed by Vercel KV when configured.
- Added automated Observer UI and privacy regression tests.

### Privacy and architecture

- Full-resolution camera archives remain on the Raspberry Pi drive.
- The metadata endpoint rejects embedded image bytes, credentials, RTSP URLs, local file paths, and home-network addresses.
- Selected cloud images must be supplied later as HTTPS object-storage references.
- This build does not expose the Pi or camera directly to the internet.

## v4.3.15 — Build 2D: Ask AI Image Input

### Fixed

- Ask AI now sends the actual attached image pixels to the Responses API instead of sending only the filename or a text placeholder.
- Camera and photo-library uploads are resized and converted to JPEG before sending, with a compact preview confirming the image is ready.
- A photo can be sent without typing a question; Reef Keeper supplies a conservative general reef-photo analysis prompt.
- Image data is used only for the current request and is not stored inside chat-history localStorage.
- The existing AI Vision fallback call can now pass image attachments through the same Ask AI pipeline.

### Safety and compatibility

- Existing PDF and text-document attachment behavior remains unchanged.
- Unsupported or oversized images are rejected with a clear error before an OpenAI request is made.
- Image requests use `OPENAI_MODEL_VISION` when configured, while text-only model selection remains unchanged.
- No saved-data migration, navigation, Parameter Log, graph, Apex, or explainability changes.
- Added an automated multimodal request regression test.

## v4.3.14 — Build 2C: In-Answer Explainability

### Added

- Added `ai/explainability.js`, a deterministic presentation layer for Evidence and Decision Engine results.
- Added a compact Evidence Review directly inside each new Ask AI response when tank context is enabled.
- The review shows calculated confidence, strongest evidence, missing or stale data, Skeptic Layer notes, and the permitted action ceiling.
- Saved conversations retain the optional explainability record for new assistant messages.
- Added automated explainability and release-regression tests.

### Safety and compatibility

- No separate Why button or expandable control.
- No core asset renaming; production remains on `app.js` and `css/app.css`.
- No navigation, Apex, parameter-log, or existing saved-data migration changes.
- Chat history is sanitized to `role` and `content` before being sent to the API, so local explainability metadata is never sent as an unsupported message field.

## Unreleased – Build 2B.1: Touch Drag Repair

- Fixed iPhone parameter-chart dragging so pointer movement updates the inspected reading while a finger remains on the chart.
- Added pointer capture and pointer end/cancel cleanup so dragging remains reliable across the graph surface.
- Preserved vertical page scrolling through the existing `touch-action: pan-y` chart rule.
- No changes to Ask AI, navigation, saved data, Apex integration, or parameter analytics.

## v4.3.12 — Build 2B: Graph Display and Touch Inspection

### Added

- Added `ai/trend-chart.js`, a deterministic presentation model for time-scaled parameter charts.
- Added explicit working-range bands, readable value-grid lines, improved date labels, and maintenance-event markers.
- Added touch, mouse, and keyboard inspection of individual readings with date, value, change from the prior reading, and nearby logged events.
- Added automated chart-model and release regression tests.

### Updated

- Changed graph spacing from equal-by-reading to proportional-by-time so long gaps are visually honest.
- Improved the latest-reading highlight, chart legend, dark-mode presentation, and compact iPhone layout.
- Retained the Build 2A analytics panel and non-causation language for event correlations.

### Safety and compatibility

- No Ask AI, navigation, Apex, or saved-data schema changes.
- No core asset renaming; production remains on `app.js` and `css/app.css`.
- Existing manual logs, maintenance records, reminders, and completed history remain unchanged.

## v4.3.11 — Build 2A: Parameter Analytics

### Added

- Added `ai/trend-engine.js`, a deterministic parameter-analysis module.
- Added rising, falling, stable, oscillating, and insufficient-data classification.
- Added rate-of-change, target-range status, trend strength, cautious directional estimates, and rapid-change warnings.
- Added parameter-relevant maintenance and completed-task correlation with a clear non-causation disclaimer.
- Added automated Trend Engine and release regression tests.

### Updated

- Expanded the existing Parameter Trends card with a compact analytics summary while retaining the current SVG chart and saved-log format.
- Kept the production asset names `app.js` and `css/app.css`; only cache query labels changed.
- Left Ask AI, Decision Engine behavior, and chat UI unchanged.

### Safety and compatibility

- No localStorage schema changes.
- No existing parameter, maintenance, reminder, or completed-history records are rewritten.
- No Why button, experimental chat renderer, or Build 2 asset renaming is included.
- The Parameter Log navigation repair remains covered by regression tests.

## Unreleased — Build 1C: Decision Engine

- Added deterministic evidence confidence scoring based on relevance-weighted evidence, freshness, completeness, conflicts, and data-quality limitations.
- Added question-specific missing and stale measurement detection.
- Added a Skeptic Layer that surfaces conflicts, limitations, alternative-cause requirements, and overconfidence risk.
- Added conservative action ceilings so weak evidence leads to observation or verification rather than aggressive intervention.
- Integrated the decision review into Ask AI while preserving Build 1B as a safe fallback.
- Added automated Decision Engine and navigation regression tests.

# Reef Keeper Changelog

## v4.3.10 — Build 1B: Structured Context and Evidence

### Added

- Added `ai/evidence-engine.js`, a dependency-free normalized context and evidence layer.
- Added typed observations for manual chemistry, Apex probes/outlet states, actions, completed tasks, reminders, inventory, equipment, Tank Knowledge, and Reef Library records.
- Added source reliability, freshness, authority, applicability, data quality, effective evidence weights, current-state selection, derived parameter trends, and explicit conflicts.
- Added deterministic evidence-engine and Parameter Log navigation regression tests through `npm test`.

### Updated

- Ask AI now receives a bounded structured evidence contract in addition to the legacy context during the migration period.
- Reef Library records migrate in place to schema 1.0 metadata: source class, publisher/authors, publication/review dates, status, topics, trust, equipment/firmware scope, and supersession.
- Added a Vercel static route for `/ai/` so the evidence module is served as JavaScript instead of falling through to `index.html`.
- Bumped the package version to 4.3.10 and cache-bumped the evidence/app scripts.

### Safety and compatibility

- Existing local records are not deleted or rewritten by the evidence collector.
- The legacy Ask AI context remains the fallback if structured normalization fails.
- The Parameter Log direct-navigation repair remains intact and is now tested.

## Unreleased — Build 1A: AI Architecture Foundation

### Added

- Added `AI_ENGINE.md` as the governing specification for Reef Keeper's evidence-based AI architecture.
- Defined the AI Constitution, evidence hierarchy, freshness/review rules, Knowledge Graph, Digital Twin, Decision Engine, Skeptic Layer, confidence caps, Decision Journal, Risk Engine, Learning Engine, and bounded Simulation Engine.
- Defined how Apex graphs, manual parameter trends, ICP results, display-tank camera observations, and sump-camera observations will feed one Evidence Engine.
- Defined hybrid camera storage: full-resolution local Raspberry Pi/USB SSD archive plus selected private cloud thumbnails and incident images.
- Defined staged Builds 1B through 5.

### Updated

- Replaced the older high-level architecture outline with current runtime and target v5 architecture.
- Expanded the roadmap into independently deployable builds.
- Expanded development rules for evidence quality, freshness, uncertainty, migration, vision, graphs, and read-only equipment boundaries.
- Expanded the test plan with deterministic AI fixtures and future graph, ICP, and camera acceptance tests.

### Runtime impact

- Documentation only.
- No JavaScript, HTML, CSS, API, connector, Vercel configuration, or package-version changes.

## v4.3.4 — Auto Telemetry Hub

### Fixed

- Removed the need to maintain `telemetry-config.js` for each preview branch.
- Production reads telemetry from its own `/api/telemetry` endpoint.
- Preview deployments and local testing automatically read telemetry from `https://reefkeeper.vercel.app/api/telemetry`.
- Prevents stale preview URLs from breaking Live Telemetry.

### Notes

- Keep the Mac Apex connector pointed at `https://reefkeeper.vercel.app`.
- `telemetry-config.js` is no longer required for this release.
