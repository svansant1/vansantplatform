(function exposeRobloxIntent(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.svansRobloxIntent = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  // ============================================================
  // PHASE 2 — ROBLOX INTENT AND CONVERSATION SYSTEM
  // ============================================================

  const CREATE_START =
    /^(?:create|recreate|build|construct|design|generate|develop|place)\b/i;

  const MODIFY_START =
    /^(?:keep|preserve|retain|maintain|upscale|enlarge|increase|expand|deepen|strengthen|improve|revise|modify|change|update|add|integrate|implement|write|tighten|make)\b/i;

  const TEST_START =
    /^(?:test|playtest|try|verify|validate)\b/i;

  const REPAIR_START =
    /^(?:repair|fix|debug|troubleshoot)\b/i;

  const INSPECT_START =
    /^(?:inspect|assess|review|analy[sz]e|evaluate|check)\b/i;

  const OPEN_START =
    /^(?:open|launch)\b/i;

  const QUESTION_START =
    /^(?:what|why|how|when|where|which|who|is|are|was|were|does|do|did|can|could|would|will|should)\b/i;

  // ============================================================
  // SUBJECT CLASSIFICATION
  // ============================================================

  const SUBJECT_PATTERNS = Object.freeze([
    [
      "vehicle",
      /\b(?:car|truck|vehicle|motorcycle|bike|boat|ship|aircraft|airplane|helicopter|train|spaceship|hovercraft|kart)\b/i,
    ],

    [
      "character",
      /\b(?:character|person|people|npc|villager|merchant|mentor|warrior|avatar|humanoid)\b/i,
    ],

    [
      "creature",
      /\b(?:creature|monster|dragon|animal|pet|dinosaur|boss|enemy)\b/i,
    ],

    [
      "interface",
      /\b(?:ui|gui|hud|menu|inventory screen|dialog|interface|button|scoreboard)\b/i,
    ],

    [
      "gameplay-system",
      /\b(?:combat|quest|inventory|economy|shop|race|checkpoint|ability|power|leveling|progression|save system|data store|datastore)\b/i,
    ],

    [
      "terrain",
      /\b(?:terrain|mountain|island|ocean|river|lake|forest|desert|cave|landscape|biome|waterfall)\b/i,
    ],

    [
      "infrastructure",
      /\b(?:road|street|highway|bridge|railway|sidewalk|tunnel|runway|path)\b/i,
    ],

    [
      "architecture",
      /\b(?:building|house|home|castle|citadel|fortress|palace|temple|tower|apartment|store|shop|school|hospital|arena|stadium|factory|warehouse|garage|hotel|mansion)\b/i,
    ],

    [
      "prop",
      /\b(?:prop|furniture|chair|table|lamp|weapon|tool|statue|sculpture|tree|crate|decoration)\b/i,
    ],

    [
      "world",
      /\b(?:world|city|town|village|kingdom|district|neighborhood|realm|map)\b/i,
    ],
  ]);

  const STYLE_WORDS = [
    "realistic",
    "real-life",
    "fantasy",
    "medieval",
    "futuristic",
    "cyberpunk",
    "cartoon",
    "stylized",
    "low-poly",
    "modern",
    "ancient",
    "elemental",
    "fire",
    "ice",
    "water",
    "earth",
    "wind",
    "volcanic",
    "aquatic",
    "steampunk",
    "sci-fi",
    "horror",
  ];

  // ============================================================
  // TEXT HELPERS
  // ============================================================

  function normalized(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function stripRequestPrefix(value) {
    return String(value || "")
      .trim()
      .replace(/^svans[,.]?\s*/i, "")
      .replace(/^please\s+/i, "")
      .replace(
        /^(?:go ahead and\s+)?(?:(?:can|could|would|will)\s+you|(?:i\s+)?(?:need|want|wan)\s+(?:for\s+)?you\s+to)\s+/i,
        ""
      )
      .trim();
  }

  // ============================================================
  // PROJECT DETECTION
  // ============================================================

  function isNewProjectRequest(text) {
    const value = stripRequestPrefix(text);

    return (
      /^(?:open|launch|start)(?: up)?(?: the)?\s+roblox studio\s*,?\s*(?:and|then|and then)\s+(?:build|create|make|develop|start)(?: me)?(?: a| an| the)?\s+(?:new\s+)?(?:roblox\s+)?(?:game|experience|project)\b/i.test(
        value
      ) ||
      /^(?:build|create|make|develop|start)(?: me)?(?: a| an| the)?\s+(?:new\s+)?roblox\s+(?:game|experience|project)\b/i.test(
        value
      ) ||
      /^(?:build|create|make|develop|start)(?: me)?(?: a| an| the)?\s+new\s+(?:game|experience|project)\b/i.test(
        value
      ) ||
      /^(?:build|create|make|develop|start)(?: me)?(?: a| an| the)?\s+new\s+[\s\S]{1,120}?\b(?:game|experience|project)\b/i.test(
        value
      )
    );
  }

  function matchKnownProject(text, projects = []) {
    const wanted = normalized(text);

    return (Array.isArray(projects) ? projects : [])
      .filter(Boolean)
      .map((project) =>
        typeof project === "string"
          ? { name: project }
          : project
      )
      .filter(
        (project) =>
          project.name &&
          wanted.includes(normalized(project.name))
      )
      .sort(
        (left, right) =>
          normalized(right.name).length -
          normalized(left.name).length
      )[0] || null;
  }

  function inferProject(
    text,
    fallback = "current Roblox project",
    projects = []
  ) {
    const known = matchKnownProject(text, projects);

    if (known?.name) {
      return known.name;
    }

    return /\belemental realms?\b/i.test(String(text || ""))
      ? "Elemental Realm"
      : fallback;
  }

  // ============================================================
  // BEHAVIOR DETECTION
  // ============================================================

  function detectBehaviors(text, action) {
    const behaviors = [];
    const value = String(text || "");

    const add = (name) => {
      if (!behaviors.includes(name)) {
        behaviors.push(name);
      }
    };

    if (
      /\b(?:larger|bigger|upscale|enlarge|increase size)\b/i.test(
        value
      )
    ) {
      add("increase-size");
    }

    if (/\bwider\b/i.test(value)) {
      add("increase-width");
    }

    if (/\b(?:longer|extend)\b/i.test(value)) {
      add("increase-length");
    }

    if (/\b(?:taller|higher)\b/i.test(value)) {
      add("increase-height");
    }

    if (
      /\badd (?:another|a|one more)?\s*floor\b/i.test(value)
    ) {
      add("add-floor");
    }

    if (/\b(?:working|functional|interactive)\b/i.test(value)) {
      add("functional");
    }

    if (/\b(?:drive|driveable|drivable)\b/i.test(value)) {
      add("driveable");
    }

    if (/\b(?:fly|flies|flyable)\b/i.test(value)) {
      add("flyable");
    }

    if (/\b(?:attack|attacks|combat)\b/i.test(value)) {
      add("combat-capable");
    }

    if (/\b(?:follow|follows)\b/i.test(value)) {
      add("follow-behavior");
    }

    if (/\b(?:talk|talks|dialogue|dialog)\b/i.test(value)) {
      add("dialogue");
    }

    if (action === "test") {
      add("test");
    }

    if (action === "repair") {
      add("repair");
    }

    return behaviors;
  }

  // ============================================================
  // MAIN PHASE 2 INTENT COMPILER
  // ============================================================

  function compileRobloxIntent(text, context = {}) {
    const original = String(text || "").trim();
    const commandText = stripRequestPrefix(original);

    const knownProjects = Array.isArray(context.knownProjects)
      ? context.knownProjects
      : [];

    const namedProject =
      matchKnownProject(original, knownProjects) ||
      (/\belemental realms?\b/i.test(original)
        ? { name: "Elemental Realm" }
        : null);

    const newProject = isNewProjectRequest(original);

    // Do not let the name of a project contaminate the requested
    // subject or style.
    //
    // Example:
    // "Add a dragon to Elemental Realm"
    // should classify as CREATURE, not WORLD + ELEMENTAL.
    const semanticText = namedProject?.name
      ? commandText.replace(
          new RegExp(
            namedProject.name.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            ),
            "ig"
          ),
          " "
        )
      : commandText;

    const subjects = SUBJECT_PATTERNS
      .filter(([, pattern]) => pattern.test(semanticText))
      .map(([name]) => name);

    const explicitStyles = STYLE_WORDS.filter((style) =>
      new RegExp(
        `\\b${style.replace(/-/g, "[- ]")}\\b`,
        "i"
      ).test(semanticText)
    );

    // Castle generators may only activate from an explicit
    // castle-family request.
    const explicitCastleRequested =
      /\b(?:castle|citadel|fortress|palace)\b/i.test(
        semanticText
      );

    const explicitSettlementRequested =
      /\b(?:town|village|kingdom|settlement|city|district|neighborhood)\b/i.test(
        semanticText
      );

    const referenceRequested =
      /\b(?:uploaded|multi[- ]view|references?|blueprint|photos?|pictures?|images?|camera views?)\b/i.test(
        semanticText
      );

    // ------------------------------------------------------------
    // ACTION
    // ------------------------------------------------------------

    let action = "discuss";

    if (newProject || CREATE_START.test(commandText)) {
      action = "create";
    } else if (OPEN_START.test(commandText)) {
      action = "open";
    } else if (INSPECT_START.test(commandText)) {
      action = "inspect";
    } else if (TEST_START.test(commandText)) {
      action = "test";
    } else if (REPAIR_START.test(commandText)) {
      action = "repair";
    } else if (MODIFY_START.test(commandText)) {
      action = "modify";
    } else if (QUESTION_START.test(commandText)) {
      action = "question";
    }

    // ------------------------------------------------------------
    // PROJECT SCOPE
    // ------------------------------------------------------------

    const explicitCurrentScope =
      /\b(?:current|open|this|here)\s*(?:game|project|place|build)?\b/i.test(
        commandText
      );

    const scope = newProject
      ? "new-project"
      : namedProject
        ? "named-project"
        : explicitCurrentScope || context.robloxActive
          ? "current-project"
          : "unspecified";

    // ------------------------------------------------------------
    // OWNER RESTRICTIONS
    // ------------------------------------------------------------

    const restrictions = [
      ...original.matchAll(
        /\b(?:do not|don't|without|avoid|never)\s+([^.;]+)/gi
      ),
    ]
      .map((match) => match[1].trim())
      .slice(0, 8);

    const preservation = [
      ...original.matchAll(
        /\b(?:keep|preserve|retain|maintain)\s+([^.;]+)/gi
      ),
    ]
      .map((match) => match[1].trim())
      .slice(0, 8);

    // ------------------------------------------------------------
    // FOLLOW-UP CONVERSATION RESOLUTION
    // ------------------------------------------------------------

    const contextualReference =
      /\b(?:it|that|this|those|them|same|another)\b/i.test(
        commandText
      ) ||
      /^(?:make|add|increase|expand|change|update|modify|test|repair|fix|improve|try|verify|validate)\b/i.test(
        commandText
      );

    const currentSubject =
      context.currentSubject || null;

    const resolvedFromContext =
      subjects.length === 0 &&
      contextualReference &&
      Boolean(currentSubject);

    const castleRequested =
      explicitCastleRequested ||
      (resolvedFromContext && Boolean(context.currentCastleRequested));

    const settlementRequested =
      explicitSettlementRequested ||
      (resolvedFromContext && Boolean(context.currentSettlementRequested));

    const styles = explicitStyles.length
      ? explicitStyles
      : resolvedFromContext && Array.isArray(context.currentStyles)
        ? context.currentStyles
        : [];

    const primarySubject =
      subjects[0] ||
      (resolvedFromContext
        ? String(currentSubject)
        : newProject
          ? "game"
          : "unspecified");

    const behaviors = detectBehaviors(
      commandText,
      action
    );

    const related = Boolean(
      context.robloxActive ||
      newProject ||
      namedProject ||
      /\broblox(?: studio)?\b/i.test(original) ||
      (contextualReference && currentSubject)
    );

    // ------------------------------------------------------------
    // FINAL STRUCTURED INTENT
    // ------------------------------------------------------------

    return {
      version: 2,

      original,

      action,
      scope,
      related,

      targetProject:
        namedProject?.name ||
        (scope === "current-project"
          ? context.currentProject || null
          : null),

      primarySubject,
      subjects,
      styles,

      behaviors,
      behaviorRequested: behaviors.length > 0,

      followUp:
        contextualReference &&
        !newProject,

      resolvedFromContext,

      previousSubject:
        context.previousSubject || null,

      currentSubject:
        resolvedFromContext
          ? currentSubject
          : primarySubject !== "unspecified"
            ? primarySubject
            : currentSubject,

      referenceRequested,

      castleRequested,
      settlementRequested,

      broadWorldBuild:
        subjects.includes("world") ||
        (
          subjects.includes("terrain") &&
          settlementRequested
        ),

      restrictions,
      preservation,

      // These are explicit Phase 2 safety rails.
      forbiddenFallbacks: [
        !castleRequested ? "castle" : null,
        !settlementRequested ? "village" : null,
        "generic operations center",
        "placeholder primitive",
      ].filter(Boolean),
    };
  }

  // ============================================================
  // BACKWARD-COMPATIBILITY HELPERS
  //
  // app.js still uses these during the Phase 2 migration.
  // We keep them until compileRobloxIntent becomes the primary
  // router in the next step.
  // ============================================================

  function isExplicitModification(text) {
    const intent = compileRobloxIntent(text, { robloxActive: true });

    return (
      intent.related &&
      (
        intent.action === "modify" ||
        (
          intent.action === "create" &&
          intent.scope !== "new-project"
        )
      )
    );
  }

  function isReferenceBuildRequest(text) {
    const intent = compileRobloxIntent(
      text,
      { robloxActive: true }
    );

    return (
      ["create", "modify"].includes(intent.action) &&
      intent.referenceRequested
    );
  }

  return {
    compileRobloxIntent,
    inferProject,
    isExplicitModification,
    isNewProjectRequest,
    isReferenceBuildRequest,
    matchKnownProject,
  };
});
