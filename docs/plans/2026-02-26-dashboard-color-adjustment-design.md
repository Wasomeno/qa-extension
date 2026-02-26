# Design Doc: Dashboard Color Adjustment (Dark and Neutral)

**Date:** 2026-02-26  
**Topic:** Dashboard UI Modernization  
**Status:** Approved

## Overview
The goal is to replace the multi-colored (blue, purple, orange) accents in the dashboard with a "dark and neutral" palette. We use the project's specific `theme-text` color (`#0b1220`) for high-contrast highlights and a tiered grayscale system for categorization.

## Design

### 1. Activity Feed Categorization
Accents in the activity feed (icons, tag backgrounds, borders) will use the `secondary` (neutral) palette from `tailwind.config.js`.

| Action Type | Text Color | Background Color | Border Color | Shade Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **Comment** | `secondary-900` | `secondary-100` | `secondary-200` | Deepest neutral for direct interaction |
| **System Note** | `secondary-700` | `secondary-50` | `secondary-100` | Mid-tier neutral for status changes |
| **Update** | `secondary-500` | `gray-50` | `gray-100` | Lightest neutral for general updates |

### 2. Primary Highlights
The `theme-text` color will be used for interactive emphasis:
- **Title Hover**: `group-hover:text-theme-text`
- **Action Links**: `hover:text-theme-text`
- **Stat Values**: Any blue text values will migrate to `text-theme-text`.

### 3. Verification
- Confirm `theme-text` contrast against white backgrounds.
- Ensure visual distinction between the three tiers of activities without relying on hue.
