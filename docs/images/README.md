# Screenshots for the SOP site

Drop PNGs in this folder using the **exact filenames** listed in the
_Appendix — Screenshot checklist_ at the bottom of the published page.

Any slot without a matching file renders as a dashed "Screenshot needed" card
showing the filename, the URL to visit, and what to capture. Add the PNG and it
replaces the card on the next page load — **no rebuild needed**.

## Before you shoot

The queue pages (Consults, Commission Claims, Marketing Orders, Support, Project
Intake) display live customer names, rep emails, and order details.

**GitHub Pages sites are public unless the repository is private *and* Pages
access is restricted.** If this site will be publicly reachable, either:

- blur or crop the identifying data before saving, or
- capture with a test account / seeded demo data.

## Practical notes

- **Width:** capture at roughly 1400–1600px wide. The page scales images down to
  its column, so anything narrower than ~1000px looks soft.
- **Format:** PNG. Use JPG only for photos of physical things (the QR code on a
  shelf, a phone home screen).
- **Crop:** tight to the thing being explained. Full-desktop screenshots with
  acres of empty chrome are hard to read at column width.
- **Retina:** a 2× Mac screenshot is fine — it just renders sharper.
- **Dark mode:** pick one and stay consistent. Mixed light/dark shots across the
  document read as inconsistency rather than as theme support.

## Adding or moving a slot

Slots are declared in `scripts/build-docs.mjs` in the `SHOTS` array. Each one
anchors to an exact substring of `SOP.md`. Add an entry, then run:

```bash
npm run docs
```

If an anchor stops matching (because `SOP.md` was edited), the build fails and
names the offending anchor rather than silently dropping the slot.
