---
name: biz
description: Business rules and product logic for CheckFlow. Consult this skill before implementing any feature that touches plans, billing, access control, checklist flows, versioning, or user permissions. Also trigger when the user asks "how should this work?" or "what's the rule for X?" about product behavior.
---

# Business Rules

## Core Product
- **CheckFlow:** checklist management system with sections, activities, versioning, and dependencies
- Users can build, assign, and track checklists in real-time

## Access & Plans
- *(Add plan tiers here as they are defined)*

## Key Flows
- **Checklist builder (montador):** drag-and-drop sections and activities, save as versioned schema
- **WhatsApp integration** via Evolution API: send checklist updates via QR-authenticated sessions

## Rules
- Checklists are versioned; never mutate a published version — create a new one
- RLS must be enforced on every table that holds user data

## Evolution Rule
When a new product rule is consolidated, the user will ask to update this skill. Add it as a short bullet under the relevant section. No prose.

**This skill is live.** When the user says "update skills with what we did today", check which business rules were established and append them here.
