# MYLG! Design System Pre-Ship Checklist

## 60-Second Pre-Ship Checklist ✅

Before shipping any UI component or feature, run through this checklist to ensure design guide compliance:

### ✅ Copy & Labels
- [ ] Each button label = clear verb (e.g., "Claim rewards" not "Earn tokens")
- [ ] No duplicates from nearby headings
- [ ] Labels ≤ 3 meaningful words
- [ ] Concrete terms over jargon ("Votes left" vs "Commit time")

### ✅ Visual Hierarchy
- [ ] Only one accent color visible (`--brand: #FA3356`)
- [ ] Error/destructive hues (`--error: #D32F2F`) used only when needed
- [ ] One focal point per view - not everything pops

### ✅ Typography
- [ ] ≤ 4 type sizes used: 12px/16px/20px/28px
- [ ] ≤ 2 weights: 400 (body), 600 (headings)
- [ ] Numbers use monospace if large/changing
- [ ] Line-height between 1.3-1.5

### ✅ Spacing & Structure  
- [ ] All margins/padding are multiples of 8px
- [ ] 8pt grid alignment: 8px/16px/24px/32px
- [ ] Related items grouped; larger gaps between groups than within
- [ ] Icons + text aligned to shared baseline

### ✅ Colors (60-30-10 Rule)
- [ ] Background neutrals ~60% (`--bg: #0c0c0c`)
- [ ] Text/surfaces ~30% (`--ink: #fff`, `--ink-muted: #777`)
- [ ] Brand accent ~10% (`--brand: #FA3356`)
- [ ] Red reserved for meaning (`--error: #D32F2F`)

### ✅ States & Flow
- [ ] Empty/loading/error states written and shown
- [ ] Primary flow animated
- [ ] Transitions feel under 300ms
- [ ] No surprise jumps - preserve object continuity

## Quick Design Tokens Reference

```css
/* Spacing (8pt grid) */
--space-1: 8px;    /* Small gaps */
--space-2: 16px;   /* Medium gaps */  
--space-3: 24px;   /* Large gaps */
--space-4: 32px;   /* Section gaps */

/* Typography (4-size scale) */
--fs-sm: 12px;     /* Captions */
--fs-md: 16px;     /* Body text */
--fs-lg: 20px;     /* Subheadings */
--fs-xl: 28px;     /* Main headings */

/* Colors (60-30-10) */
--bg: #0c0c0c;     /* 60% Background */
--ink: #fff;       /* 30% Text */
--brand: #FA3356;  /* 10% Accent */
--error: #D32F2F;  /* Error only */
```

## Button Label Examples

### ❌ Before → ✅ After
- "Earn Tokens" (on claim action) → "Claim rewards"
- "Last 10 votes" under "Voting" header → "Last 10"
- "Submit Form" → "Save project"
- "Get Started" → "Create account"
- "Learn More" → "View details"

## Common Spacing Fixes

### ❌ Non-8pt values to avoid:
- 5px, 10px, 12px, 15px, 20px, 25px, 30px

### ✅ Use instead:
- 8px, 16px, 24px, 32px, 48px

## Motion Guidelines

- **Entrance**: 100-200ms staggers
- **Transitions**: Preserve object continuity (move/scale, don't pop)
- **Feedback**: Press → progress → result within 300-700ms total
- **Easing**: ease-out standard, emphasized on primary actions

---

*This checklist implements the principles from the design guide to stop repeating design mistakes and maintain consistency across MYLG! components.*