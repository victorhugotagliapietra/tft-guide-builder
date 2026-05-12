\# Product Context — TFT Guide Builder



\## Problem



TFT players often search for comps online, but most sites show only the final ideal board.



This creates a common problem:



A guide says the final board uses a 5-cost unit, but the player does not know what to play before finding that unit.



Examples of player questions:



\- What do I play at level 4?

\- Who holds the carry items before I find the real carry?

\- What is the level 7 version of this comp?

\- Can I play this comp without the legendary unit?

\- When do I roll?

\- When do I level?

\- Which units are temporary?

\- Which units are core?

\- Which board stabilizes me in stage 3?

\- What should I do if I do not hit the final board?



\## Solution



Build a guide builder focused on board progression.



Instead of only showing the final board, a guide can show a sequence of optional board steps.



Example:



Guide: "Fast 8 AP Flex"



Board steps:



1\. Level 4 — Early game opener

2\. Level 6 — Stabilization board

3\. Level 7 — Transition board

4\. Level 8 — Cheap version

5\. Level 9 — Final capped board



Each board step can have:



\- Units

\- Items

\- Positioning

\- Notes

\- Economy plan

\- Roll/level instructions

\- Substitution tips

\- Item holder explanation

\- Planner code



\## Core Differentiator



The product teaches the path to the comp, not just the final comp.



The core value proposition is:



"Show players how to get from early game to the final board."



\## User Stories



\### Creator



As a guide creator, I want to create a TFT guide so I can share a comp with my audience.



As a guide creator, I want to add multiple board steps so I can explain the progression.



As a guide creator, I want to mark temporary item holders so players understand transitions.



As a guide creator, I want to share a public link so people can view my guide without logging in.



As a guide creator, I want to edit my guide later because the meta changes.



\### Viewer



As a viewer, I want to see the final board so I understand the end goal.



As a viewer, I want to see intermediate boards so I know what to play before hitting expensive units.



As a viewer, I want to read notes per board step so I understand when to roll, level or transition.



As a viewer, I want to copy a planner code so I can paste the board into the TFT client.



\## Guide Structure



A guide should support:



\- Title

\- Slug/public URL

\- Description

\- Set

\- Patch

\- Difficulty

\- Playstyle

\- Tags

\- Visibility

\- Board steps

\- General notes

\- Created/updated timestamps



\## Board Step Structure



A board step should support:



\- Title

\- Level

\- Stage

\- Step type

\- Description

\- Units

\- Notes

\- Sort order



Board steps should be ordered manually by the creator.



\## Board Step Types



Possible types:



\- Early game

\- Mid game

\- Stabilization

\- Transition

\- Low-cost version

\- Final board

\- Capped board

\- Alternative board



Do not force these types too strictly. They are helper labels.



\## Visibility



Guides can be:



\- Draft

\- Published

\- Private/unlisted, optional later



MVP:



\- Draft

\- Published



Published guides should have a public read-only page.



\## Public Sharing



A public guide should be accessible through a link like:



`/g/\[slug]`



or:



`/guides/\[slug]`



The viewer should not need to log in.



Only the owner can edit.

