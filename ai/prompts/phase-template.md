PHASE: [PHASE NAME]

CONTEXT:
You are working inside the UnitFlip/SiteEnhancer codebase.

You MUST strictly follow the AI workflow and skills defined below.

If you do not follow this workflow exactly, the solution is invalid.

----------------------------------------
REQUIRED SKILLS (MANDATORY)
----------------------------------------

1. critical-product-architect
2. builder-critic-loop

DO NOT skip critique.
DO NOT proceed without revision.

----------------------------------------
OBJECTIVE
----------------------------------------

[Describe the feature or change clearly]

----------------------------------------
SCOPE CONTROL (STRICT)
----------------------------------------

- Build ONLY what is necessary to achieve the objective
- You are allowed to SIMPLIFY or REDUCE scope if it improves usability
- Do NOT expand scope unless explicitly required for functionality

If a feature, option, or flexibility is not essential:
REMOVE IT

----------------------------------------
SUCCESS CRITERIA (MANDATORY)
----------------------------------------

Your solution is ONLY successful if ALL are true:

- Improves or maintains inspection workflow speed
- Reduces or maintains number of steps
- Does NOT introduce duplicate pathways
- Keeps UI cognitive load minimal
- Keeps one clear primary action per screen
- Hides advanced or optional logic behind progressive disclosure
- Does NOT expose backend/system complexity to the user
- Reuses existing services (no parallel systems)
- Fits current architecture without fragmentation

If any are violated:
You MUST revise before continuing

----------------------------------------
WORKFLOW (ENFORCED)
----------------------------------------

Step 1: BUILDER
- Propose solution
- Include UI, flow, and implementation details

Step 2: CRITIC (MANDATORY)
- Use critical-product-architect
- Identify:
  - Overengineering
  - Workflow friction
  - UI complexity
  - Unnecessary flexibility
  - Scope creep

Critic must push back strongly on complexity.

Step 3: REVISION (MANDATORY)
- Simplify aggressively
- Remove unnecessary elements
- Reduce steps
- Improve clarity
- Prefer deletion over addition

Step 4: FINAL IMPLEMENTATION PLAN
- Clean, simplified solution only
- Include:
  - Files to modify
  - Components/services affected
  - Data flow changes
  - UI changes

----------------------------------------
OUTPUT FORMAT (MANDATORY)
----------------------------------------

1. Builder Proposal
2. Critic Review
3. Revised Solution
4. Implementation Plan
5. Summary of Changes (what was removed/simplified)
6. Next Step Suggestions

----------------------------------------
NEXT STEP RULES
----------------------------------------

Next steps may include:
- Logical feature extensions
- Improvements to the same workflow

Next steps must NOT:
- Introduce unrelated systems
- Expand into admin/config prematurely
- Add flexibility without clear benefit

----------------------------------------
FAIL CONDITIONS
----------------------------------------

If your solution:
- Adds unnecessary complexity
- Introduces duplicate flows
- Increases cognitive load
- Drifts from inspection/material workflow

You MUST revise again before final output.