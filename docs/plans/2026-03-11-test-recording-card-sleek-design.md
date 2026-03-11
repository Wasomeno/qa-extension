# Design Doc: Recording Card Layout Refactor (Sleek & Neat)
Date: 2026-03-11

## Overview
Adjust the `RecordingItem` card layout to resolve "squished" elements and create a more modern, premium "sleek" aesthetic.

## Proposed Changes

### 1. Header & Foundation
- Increase main card padding from `p-4` to `p-5`.
- Change Title font weight from `font-bold` to `font-semibold`.
- Relocate the creation date from the footer to the top-right (absolute positioned next to the menu) to free up footer space.
- Soften hover shadow to `hover:shadow-lg`.

### 2. Test Steps Section
- Increase internal padding to `p-4`.
- Increase vertical spacing between steps to `space-y-2`.
- Update "TEST STEPS" label to `text-[10px]` with `tracking-widest`.
- Update background to a cleaner `bg-zinc-50/50` with `rounded-xl`.
- Mute step numbers with `text-zinc-400` to emphasize action text.

### 3. Footer Refinement
- Remove date (relocated to header).
- Wrap step count in a subtle pill-style badge.
- Use a lighter border-t (`border-zinc-50`) to reduce visual separation.
- Align Project Picker and Step Count neatly to the left with improved spacing.

## Success Criteria
- The card feels spacious and not "squished".
- Metadata is clearly hierarchical and easy to read.
- The layout matches the "sleek" description provided by the user.
