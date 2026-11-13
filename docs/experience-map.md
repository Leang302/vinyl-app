# VINYL experience contract

Confirmed: single listener, frontend-only React 19 application. YouTube uses one visible official IFrame player and sequential volume fades. Local audio uses two Web Audio decks and equal-power overlap. EQ and measured spectrum apply only to local music. Files, library, favorites, recent listening, and preferences live in browser IndexedDB.

Assumptions: new empty repository; no accounts, backend, subscriptions, or stem service. Included music and cover illustrations are original generated works for this project. Artwork imports are stored as small data URLs. Local file imports are stored as Blobs, not transient object URLs.

| Journey | Surfaces | Outcome / recovery | Verification |
|---|---|---|---|
| Start listening | Collection → record → transport | Original music plays after click, spin and stylus follow actual state; errors are visible | Browser smoke and local media playback |
| YouTube import | Add music → link → visible player → queue | Robust URL validation; player retains controls, branding, ads; unavailable content gives actionable message | URL unit tests; external embed requires manual playback |
| Local import | Add music → files → custom collection | Store files and metadata, play through shared transport; unsupported formats show error | IndexedDB unit tests and browser import |
| Change song | Queue / transport / collection | Single source active; sequential YouTube fade or local overlapping equal-power fade; manual skip cancels obsolete work | Envelope and mocked player tests; local browser test |
| Tune listening | Sound / transitions / appearance | EQ capability-aware, saved master volume independent of fade; settings survive refresh | Persistence and transition tests |
| Return visit | Library / favorites / recent | All collections and settings restored; deleted collections removed without affecting others | Browser persistence and library checks |

Direction: tactile listening room, not a monitoring dashboard. Charcoal canvas, sage status accents, walnut physical turntable, brushed metal, restrained serif editorial title, compact sans-serif controls. Mobile reorders scene before the library and keeps transport reachable. Reduced motion disables ornamental motion; essential playback remains explicit.

Research, 2026-11-13: official YouTube IFrame API documentation (https://developers.google.com/youtube/iframe_api_reference) requires minimum 200×200 viewport, exposes playlist IDs and current video metadata but no full arbitrary-playlist metadata API. Display unknown titles as numbered tracks until the official player supplies the title. Official R3F documentation (https://r3f.docs.pmnd.rs/getting-started/installation) pairs React 19 with Fiber 9. MDN Web Audio guidance (https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) supports gain/filter/analyser graphs. Teenage Engineering OB–4 product page (https://teenage.engineering/products/ob-4) demonstrates a restrained physical control language; this informed the compact equipment controls, without copying its design.
