\# TFT Guide Builder — Claude Context



\## Product Summary



We are building a web application for creating and sharing Teamfight Tactics guides.



The main idea is not just to create a final TFT board, but to help users explain the full progression of a comp.



Most TFT websites show only the final board. This can confuse players because many final boards include expensive 4-cost and 5-cost units that are not available during early and mid game.



This application allows users to create a guide with optional progressive board steps, such as:



\- Level 4 early game board

\- Level 5 transition board

\- Level 6 stabilization board

\- Level 7 low-cost version

\- Level 8 version without legendary units

\- Final capped board



Each guide can have as many board steps as the author wants. Board steps are optional.



Users should be able to create, edit, save and publish guides. Public guides should be viewable through a shareable link without requiring login.



\## Core Concept



A guide contains:



\- Title

\- Description

\- TFT set

\- Patch

\- Playstyle

\- Difficulty

\- Final comp information

\- Optional board steps

\- Notes

\- Items

\- Units

\- Positioning

\- Transitions

\- Item holders

\- Substitutions

\- Public sharing link



A board step represents a playable board at a specific moment of the game.



Examples:



\- "Level 4 — Strong early board"

\- "Level 6 — Stabilize with cheap frontline"

\- "Level 7 — Roll if weak"

\- "Level 8 — Low-cost version without 5-cost units"

\- "Final board — Capped version"



\## Important Product Rule



Board steps are optional.



A user may create:



\- Only one final board

\- A final board plus 2 transition boards

\- A complete guide with 8+ board steps



Do not force a fixed guide structure.



\## Target Users



\- TFT players who want to create public guides

\- Streamers and pro players who want to share comps with their audience

\- Casual/intermediate players who need help understanding how to transition into a final comp

\- Competitive players who want to document flex lines and board paths



\## MVP Goal



Build a functional MVP where users can:



1\. Sign up / sign in

2\. Create a guide

3\. Add/edit/remove board steps

4\. Build a board visually

5\. Add units to the board

6\. Add items to units

7\. Add comments/notes per board step

8\. Save guides

9\. Edit their own guides

10\. Publish a guide

11\. Share a public read-only guide link

12\. Copy a TFT planner code for each board when possible



\## Tech Preferences



Use:



\- Next.js

\- TypeScript

\- Tailwind CSS

\- ShadCN UI

\- dnd-kit for drag and drop

\- Prisma ORM

\- PostgreSQL

\- NextAuth/Auth.js or another simple auth solution

\- Community Dragon data for TFT champions, traits and items



Prioritize clean code, maintainability and simple architecture.



Avoid overengineering the MVP.



\## Coding Style



Use:



\- TypeScript

\- Clear function names

\- Small components

\- Feature-based folders

\- Zod for validation

\- Server actions or API routes, depending on what fits best

\- Clean data models

\- Explicit error handling



Avoid:



\- Massive components

\- Premature abstractions

\- Complex state management unless necessary

\- Overly generic code

\- Hardcoded TFT data when it should come from a data source



\## UX Direction



The app should feel like a modern gaming/SaaS tool.



Style inspiration:



\- MetaTFT

\- Tactics.tools

\- Mobalytics

\- Linear

\- Notion

\- Figma

\- Modern dark-mode SaaS dashboards



Visual goals:



\- Dark mode first

\- Clean board builder

\- Minimal but polished UI

\- Fast editing

\- Clear guide reading experience

\- Easy public sharing



\## Main Entities



\- User

\- Guide

\- BoardStep

\- BoardUnit

\- Champion

\- Item

\- Trait

\- GuideNote



See `docs/DATA\_MODEL.md` for more details.



\## Development Approach



Work incrementally.



Recommended implementation order:



1\. Project setup

2\. Database schema

3\. Auth

4\. Guide CRUD

5\. Basic board renderer

6\. Board step CRUD

7\. Unit placement on board

8\. Item assignment

9\. Public guide page

10\. Planner code generation

11\. Polish UI



When implementing, always keep the MVP scope in mind.

