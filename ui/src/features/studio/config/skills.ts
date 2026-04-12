import type { SkillDefinition } from '../types';
import { SYSTEM_CREATED_AT, SYSTEM_OWNER_ID } from './constants';

export const SKILL_REGISTRY: SkillDefinition[] = [
  {
    id: "skill.framework.issue-tree",
    version: 1,
    label: "Issue Tree",
    class: "framework",
    scope: "core",
    status: "stable",
    semanticPromise: "Use MECE logic so branches are mutually exclusive, collectively exhaustive, and tied to one root problem.",
    summary: "Teaches the AI to decompose a question into a clean issue tree instead of a loose mind map.",
    targetModuleFamilies: ["framework", "story-pattern"],
    targetModuleIds: ["framework.issue-tree.flow"],
    fieldRules: [
      {
        fieldId: "root-problem",
        rule: "Define the root question or problem before branching.",
        required: true,
        examples: ["Why did margin decline?", "How can the operation scale profitably?"],
      },
      {
        fieldId: "mece-branches",
        rule: "Branches must not overlap and together must cover the root problem fully.",
        required: true,
        examples: ["Revenue = Volume x Price", "Cost = Labor + Materials + Overhead"],
      },
    ],
    antiPatterns: [
      {
        id: "issue-tree-overlap",
        label: "Overlapping branches",
        description: "Do not create branches where the same item could fit in multiple places.",
      },
      {
        id: "issue-tree-misc",
        label: "Misc bucket",
        description: "Do not use Other or Misc as a branch because it breaks MECE logic.",
      },
    ],
    evidenceRules: [
      {
        id: "issue-tree-root-completeness",
        description: "Each branch should clearly help solve the stated root question or diagnose the root problem.",
        severity: "recommended",
      },
    ],
    styleRules: [
      {
        id: "issue-tree-logic-first",
        description: "Keep the tree logically crisp and decision-oriented rather than decorative.",
      },
    ],
    logicBlocks: [
      {
        id: "issue-tree-mece",
        label: "MECE logic",
        description: "Branches should be mutually exclusive, collectively exhaustive, and grounded in one decomposition lens.",
      },
    ],
    createdAt: SYSTEM_CREATED_AT,
    updatedAt: SYSTEM_CREATED_AT,
    ownerId: SYSTEM_OWNER_ID,
  },
  {
    id: "skill.framework.swot",
    version: 1,
    label: "SWOT",
    class: "framework",
    scope: "core",
    status: "stable",
    semanticPromise: "Treat the module as a real SWOT analysis, not a generic four-card grid.",
    summary: "Teaches the AI to separate internal strengths and weaknesses from external opportunities and threats.",
    targetModuleFamilies: ["framework"],
    targetModuleIds: ["framework.swot.matrix"],
    fieldRules: [
      {
        fieldId: "strengths",
        rule: "Capture internal capabilities or advantages that support the page argument.",
        required: true,
        examples: ["Operational resilience", "Brand trust", "Installed infrastructure"],
      },
      {
        fieldId: "weaknesses",
        rule: "Capture internal limitations that weaken execution or competitiveness.",
        required: true,
        examples: ["Legacy systems", "Thin staffing", "Low data quality"],
      },
      {
        fieldId: "opportunities",
        rule: "Capture external openings the organization can exploit.",
        required: true,
        examples: ["Regulatory tailwind", "Technology cost decline", "New corridor demand"],
      },
      {
        fieldId: "threats",
        rule: "Capture external pressures that could undermine the strategy.",
        required: true,
        examples: ["New entrants", "Policy tightening", "Supply volatility"],
      },
    ],
    antiPatterns: [
      {
        id: "swot.generic-buckets",
        label: "Generic buckets",
        description: "Do not fill the four quadrants with unrelated observations that ignore the internal/external split.",
      },
    ],
    evidenceRules: [
      {
        id: "swot.supporting-evidence",
        description: "Use evidence to support each quadrant when the source provides concrete facts or numbers.",
        severity: "recommended",
      },
    ],
    styleRules: [
      {
        id: "swot.slide-density",
        description: "Keep each quadrant concise and slide-ready; avoid turning the SWOT into paragraph text.",
      },
    ],
    logicBlocks: [
      {
        id: "swot.internal-vs-external",
        label: "Internal vs external split",
        description: "Maintain the structural distinction between internal capabilities and external market context.",
      },
    ],
    createdAt: SYSTEM_CREATED_AT,
    updatedAt: SYSTEM_CREATED_AT,
    ownerId: SYSTEM_OWNER_ID,
  },
  {
    id: "skill.framework.porter-five-forces",
    version: 1,
    label: "Porter Five Forces",
    class: "framework",
    scope: "core",
    status: "stable",
    semanticPromise: "Use the module to explain industry attractiveness through the five competitive forces.",
    summary: "Teaches the AI to reason in terms of rivalry, buyers, suppliers, substitutes, and new entrants.",
    targetModuleFamilies: ["framework"],
    targetModuleIds: ["framework.porter-five-forces.matrix"],
    fieldRules: [
      {
        fieldId: "force-intensity",
        rule: "Explain how strong each force is in the market being analyzed.",
        required: false,
        examples: ["High rivalry", "Moderate supplier power"],
      },
      {
        fieldId: "strategic-pressure",
        rule: "Translate each force into margin, growth, or strategic pressure.",
        required: false,
        examples: ["Margin compression", "Switching risk", "Barrier protection"],
      },
    ],
    antiPatterns: [
      {
        id: "porter.pro-con-list",
        label: "Pro-con list",
        description: "Do not turn Porter into a generic list of positives and negatives.",
      },
    ],
    evidenceRules: [
      {
        id: "porter.market-evidence",
        description: "Ground force intensity in market structure, bargaining dynamics, or competitive signals when possible.",
        severity: "recommended",
      },
    ],
    styleRules: [
      {
        id: "porter.decision-language",
        description: "Tie the analysis back to strategic attractiveness, not just descriptive market facts.",
      },
    ],
    logicBlocks: [
      {
        id: "porter.industry-structure",
        label: "Industry structure logic",
        description: "Frame the output as a market-structure analysis rather than a company SWOT.",
      },
    ],
    createdAt: SYSTEM_CREATED_AT,
    updatedAt: SYSTEM_CREATED_AT,
    ownerId: SYSTEM_OWNER_ID,
  },
  {
    id: "skill.framework.growth-curve",
    version: 1,
    label: "Growth Curve",
    class: "framework",
    scope: "core",
    status: "stable",
    semanticPromise: "Interpret the line as a staged curve with changing momentum, not just unrelated time points.",
    summary: "Teaches the AI to map lifecycle, adoption, or maturity into a coherent curve narrative.",
    targetModuleFamilies: ["framework"],
    targetModuleIds: ["framework.growth-curve.line"],
    fieldRules: [
      {
        fieldId: "curve-stage",
        rule: "Define distinct stages on the curve and explain what changes between them.",
        required: true,
        examples: ["Experimentation", "Adoption", "Scale", "Maturity"],
      },
    ],
    antiPatterns: [
      {
        id: "growth-curve.random-timeline",
        label: "Random timeline",
        description: "Do not render the curve as four disconnected dates without a lifecycle logic.",
      },
    ],
    evidenceRules: [
      {
        id: "growth-curve-stage-evidence",
        description: "Use evidence to justify stage changes if the source contains adoption, revenue, or deployment signals.",
        severity: "recommended",
      },
    ],
    styleRules: [
      {
        id: "growth-curve-clear-shift",
        description: "Make the shift in momentum or maturity legible at a glance.",
      },
    ],
    logicBlocks: [
      {
        id: "growth-curve-stage-transition",
        label: "Stage transition",
        description: "Show why the curve moves from one stage to the next rather than presenting static milestones.",
      },
    ],
    createdAt: SYSTEM_CREATED_AT,
    updatedAt: SYSTEM_CREATED_AT,
    ownerId: SYSTEM_OWNER_ID,
  },
  {
    id: "skill.domain.logistics",
    version: 1,
    label: "Logistics",
    class: "domain",
    scope: "core",
    status: "stable",
    semanticPromise: "Use logistics terminology, operating logic, and proof points with real operational specificity.",
    summary: "Adapts strategy and evidence output to warehousing, distribution, fulfillment, and supply chain operations.",
    targetModuleFamilies: ["primitive", "framework", "story-pattern"],
    targetModuleIds: [],
    fieldRules: [],
    antiPatterns: [
      {
        id: "logistics.generic-operations",
        label: "Generic operations language",
        description: "Do not describe warehouse, fulfillment, or distribution work with vague operations language when logistics terms apply.",
      },
    ],
    evidenceRules: [
      {
        id: "logistics-operational-evidence",
        description: "Prefer throughput, pick rate, fill rate, cycle time, labor, capacity, and automation evidence when relevant.",
        severity: "recommended",
      },
    ],
    styleRules: [
      {
        id: "logistics-domain-specificity",
        description: "Keep the page specific to logistics dynamics rather than generic industry commentary.",
      },
    ],
    logicBlocks: [
      {
        id: "logistics-domain-adaptation",
        label: "Logistics adaptation",
        description: "Translate generic strategy into distribution, warehousing, fulfillment, and supply-chain terms.",
      },
    ],
    createdAt: SYSTEM_CREATED_AT,
    updatedAt: SYSTEM_CREATED_AT,
    ownerId: SYSTEM_OWNER_ID,
  },
  {
    id: "skill.domain.maritime",
    version: 1,
    label: "Maritime",
    class: "domain",
    scope: "core",
    status: "stable",
    semanticPromise: "Use maritime terminology, operating logic, and sector-specific evidence correctly.",
    summary: "Adapts generic strategy and evidence modules to shipping, ports, and maritime operations.",
    targetModuleFamilies: ["primitive", "framework", "story-pattern"],
    targetModuleIds: [],
    fieldRules: [],
    antiPatterns: [
      {
        id: "maritime.generic-operations",
        label: "Generic operations language",
        description: "Do not describe maritime operations using abstract business language when sector terminology is available.",
      },
    ],
    evidenceRules: [
      {
        id: "maritime-use-sector-evidence",
        description: "Prefer port throughput, fleet behavior, regulation, safety, and emissions evidence when relevant.",
        severity: "recommended",
      },
    ],
    styleRules: [
      {
        id: "maritime-sector-specificity",
        description: "Keep the output specific to maritime operations, ports, vessels, or seafarers as appropriate.",
      },
    ],
    logicBlocks: [
      {
        id: "maritime-domain-adaptation",
        label: "Domain adaptation",
        description: "Translate generic frameworks into maritime-specific dynamics and terminology.",
      },
    ],
    createdAt: SYSTEM_CREATED_AT,
    updatedAt: SYSTEM_CREATED_AT,
    ownerId: SYSTEM_OWNER_ID,
  },
  {
    id: "skill.domain.saas",
    version: 1,
    label: "SaaS",
    class: "domain",
    scope: "core",
    status: "stable",
    semanticPromise: "Use SaaS language, metrics, and growth logic correctly instead of generic business wording.",
    summary: "Adapts decks to subscription software, product growth, and unit-economics evidence.",
    targetModuleFamilies: ["primitive", "framework", "story-pattern"],
    targetModuleIds: [],
    fieldRules: [],
    antiPatterns: [
      {
        id: "saas-generic-metrics",
        label: "Generic business metrics",
        description: "Do not use vague revenue or customer language when ARR, MRR, NRR, churn, CAC, or LTV are the real terms.",
      },
    ],
    evidenceRules: [
      {
        id: "saas-product-growth-evidence",
        description: "Prefer retention, expansion, activation, funnel, and unit-economics evidence when relevant.",
        severity: "recommended",
      },
    ],
    styleRules: [
      {
        id: "saas-growth-specificity",
        description: "Keep the page fluent in SaaS product and growth logic.",
      },
    ],
    logicBlocks: [
      {
        id: "saas-domain-adaptation",
        label: "SaaS adaptation",
        description: "Translate generic business arguments into product, retention, growth, and subscription metrics.",
      },
    ],
    createdAt: SYSTEM_CREATED_AT,
    updatedAt: SYSTEM_CREATED_AT,
    ownerId: SYSTEM_OWNER_ID,
  },
  {
    id: "skill.output.consulting-deck",
    version: 1,
    label: "Consulting Deck",
    class: "output",
    scope: "core",
    status: "stable",
    semanticPromise: "Keep outputs concise, slide-native, and oriented around decisions and evidence.",
    summary: "Shapes module output so it reads like a consulting presentation instead of a loose note dump.",
    targetModuleFamilies: ["primitive", "framework", "story-pattern"],
    targetModuleIds: [],
    fieldRules: [],
    antiPatterns: [
      {
        id: "consulting-paragraph-overload",
        label: "Paragraph overload",
        description: "Do not write long prose when the slide should be read as structured takeaway blocks.",
      },
    ],
    evidenceRules: [
      {
        id: "consulting-proof-where-possible",
        description: "Prefer concise claims supported by evidence rather than generic qualitative filler.",
        severity: "recommended",
      },
    ],
    styleRules: [
      {
        id: "consulting-headline-clarity",
        description: "Every block should read like a concise structured argument, not a generic description.",
      },
    ],
    logicBlocks: [
      {
        id: "consulting-slide-fitness",
        label: "Slide fitness",
        description: "Optimize for scanability, clear takeaways, and executive readability.",
      },
    ],
    createdAt: SYSTEM_CREATED_AT,
    updatedAt: SYSTEM_CREATED_AT,
    ownerId: SYSTEM_OWNER_ID,
  },
  {
    id: "skill.output.board-memo",
    version: 1,
    label: "Board Memo",
    class: "output",
    scope: "core",
    status: "stable",
    semanticPromise: "Lead with the recommendation, make the decision explicit, and surface risks clearly in a formal tone.",
    summary: "Shapes output for board and governance audiences so the page reads like a decision tool rather than a general report.",
    targetModuleFamilies: ["primitive", "framework", "story-pattern"],
    targetModuleIds: [],
    fieldRules: [],
    antiPatterns: [
      {
        id: "board-buried-recommendation",
        label: "Buried recommendation",
        description: "Do not hide the ask or recommendation deep in the slide.",
      },
      {
        id: "board-vague-risk",
        label: "Vague risk",
        description: "Do not mention risk abstractly without showing the actual risk and mitigation.",
      },
    ],
    evidenceRules: [
      {
        id: "board-decision-evidence",
        description: "Support the recommendation with enough proof that a board audience can act.",
        severity: "recommended",
      },
    ],
    styleRules: [
      {
        id: "board-formal-tone",
        description: "Keep the page formal, recommendation-first, and governance-ready.",
      },
    ],
    logicBlocks: [
      {
        id: "board-decision-orientation",
        label: "Decision orientation",
        description: "Frame the page around the decision, rationale, risk, and mitigation.",
      },
    ],
    createdAt: SYSTEM_CREATED_AT,
    updatedAt: SYSTEM_CREATED_AT,
    ownerId: SYSTEM_OWNER_ID,
  },
  {
    id: "skill.output.investor-narrative",
    version: 1,
    label: "Investor Narrative",
    class: "output",
    scope: "core",
    status: "stable",
    semanticPromise: "Build a growth narrative with traction evidence, why-now logic, and a clear use-of-funds path.",
    summary: "Shapes output so it reads like an investor story instead of a static company fact sheet.",
    targetModuleFamilies: ["primitive", "framework", "story-pattern"],
    targetModuleIds: [],
    fieldRules: [],
    antiPatterns: [
      {
        id: "investor-history-only",
        label: "History only",
        description: "Do not make the page purely historical without a forward-looking growth narrative.",
      },
      {
        id: "investor-vague-funding",
        label: "Vague use of funds",
        description: "Do not mention funding without saying what capital enables and which milestones it reaches.",
      },
    ],
    evidenceRules: [
      {
        id: "investor-traction-proof",
        description: "Use traction, milestones, and hard proof points to support the narrative whenever possible.",
        severity: "recommended",
      },
    ],
    styleRules: [
      {
        id: "investor-why-now",
        description: "Keep the opportunity, momentum, and why-now logic explicit.",
      },
    ],
    logicBlocks: [
      {
        id: "investor-growth-story",
        label: "Growth story",
        description: "Connect market timing, traction, and capital deployment into one coherent investor narrative.",
      },
    ],
    createdAt: SYSTEM_CREATED_AT,
    updatedAt: SYSTEM_CREATED_AT,
    ownerId: SYSTEM_OWNER_ID,
  },
];
