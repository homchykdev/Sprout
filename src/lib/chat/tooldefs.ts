/**
 * Function-calling declarations shared by the server chat fn (generateContent
 * config) and by the client handlers. Plain JSON-schema objects so tests and
 * the SDK can use them without importing client-only code.
 */
export interface ToolDecl {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParam>;
    required: string[];
  };
}

export interface ToolParam {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  items?: ToolParam;
  properties?: Record<string, ToolParam>;
  required?: string[];
}

const REPLY_NOTE =
  "Respond for yourself only through tool results. Never invent video_ref values, URLs, video IDs or timestamps: videos exist only as video_ref handles returned by find_exercise_video.";

export const TOOL_DEFS: ToolDecl[] = [
  {
    name: "find_exercise_video",
    description: `Finds a REAL, verified YouTube video demonstrating an exercise and, when available, the exact clip range where the exercise is performed. Returns an opaque video_ref plus human-readable facts. ${REPLY_NOTE}`,
    parameters: {
      type: "object",
      properties: {
        exercise_name: {
          type: "string",
          description: "canonical exercise name as written by the user, e.g. «Отжимания».",
        },
        query_hint: {
          type: "string",
          description:
            "optional English search query for the video, e.g. 'push ups proper form'. Use it when the Russian name alone would not be a good search query.",
        },
        language_hint: {
          type: "string",
          description: "optional preferred video language, e.g. 'russian'.",
        },
      },
      required: ["exercise_name"],
    },
  },
  {
    name: "add_video_to_exercise",
    description: `Attaches a verified video (by video_ref from find_exercise_video) to an exercise. The exercise is looked up in the app catalog by name, ignoring case. If found — the video is added to it; if not found — a NEW exercise is created (then muscles and category are required). ${REPLY_NOTE}`,
    parameters: {
      type: "object",
      properties: {
        exercise_name: { type: "string", description: "exercise name as the user called it." },
        video_ref: {
          type: "string",
          description: "opaque handle returned by find_exercise_video.",
        },
        muscles: {
          type: "array",
          description:
            "ONLY when creating a new exercise: muscle keys, first is main. Use the catalog prompt section for valid keys.",
          items: { type: "string", description: "muscle key." },
        },
        category: {
          type: "string",
          description: "ONLY when creating a new exercise: strength | cardio | stretch.",
        },
        mode: {
          type: "string",
          description: "ONLY when creating a new exercise: reps (default) | time.",
        },
        reps: { type: "number", description: "default reps to store on a new exercise." },
        seconds: {
          type: "number",
          description: "default seconds to store on a new exercise (mode=time).",
        },
        equipment: {
          type: "string",
          description: "short equipment name in Russian, e.g. гантели.",
        },
        description: {
          type: "string",
          description: "one short sentence in Russian: what it trains.",
        },
      },
      required: ["exercise_name", "video_ref"],
    },
  },
  {
    name: "create_workout",
    description:
      "Creates a workout from catalog exercise ids. exercise_id must be taken from the catalog data or from a get_exercise_details result — never invented.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "workout name in Russian." },
        emoji: { type: "string", description: "exactly one emoji." },
        exercise_ids: {
          type: "array",
          description: "catalog exercise ids in workout order (max 12).",
          items: { type: "string", description: "exercise id from the catalog." },
        },
        sets: {
          type: "array",
          description: "optional same-length list of sets per exercise (sensible defaults 1–5).",
          items: { type: "number", description: "sets for the exercise at the same position." },
        },
        rest_sec: {
          type: "array",
          description:
            "optional same-length list of rest seconds (strength 45–90, cardio/stretch 20–40).",
          items: {
            type: "number",
            description: "rest seconds for the exercise at the same position.",
          },
        },
      },
      required: ["name", "exercise_ids"],
    },
  },
  {
    name: "add_plan_step",
    description: "Inserts one step (workout or rest day) into the repeating plan cycle.",
    parameters: {
      type: "object",
      properties: {
        after_index: {
          type: "number",
          description: "index in the cycle to insert after; -1 = at the very beginning.",
        },
        workout_id: {
          type: "string",
          description: "catalog workout id, required when kind=workout.",
        },
        kind: { type: "string", description: "'workout' | 'rest'." },
      },
      required: ["kind"],
    },
  },
  {
    name: "get_exercise_details",
    description:
      "Returns the FULL stored data of one catalog exercise by id (description, steps, mistakes, video, feedback). Use it when the compact catalog line is not enough.",
    parameters: {
      type: "object",
      properties: {
        exercise_id: { type: "string", description: "id from the catalog." },
      },
      required: ["exercise_id"],
    },
  },
];

export const TOOL_NAMES = new Set(TOOL_DEFS.map((t) => t.name));
