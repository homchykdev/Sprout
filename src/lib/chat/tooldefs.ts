/**
 * Function-calling declarations shared by the server chat fn (generateContent
 * config) and by the client handlers. Plain JSON-schema objects so tests and
 * the SDK can use them without importing client-only code.
 */
export interface ToolDecl {
  name: string;
  description: string;
  parameters: {
    type: "OBJECT";
    properties: Record<string, ToolParam>;
    required: string[];
  };
}

export interface ToolParam {
  type: "STRING" | "NUMBER" | "BOOLEAN" | "ARRAY" | "OBJECT";
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
      type: "OBJECT",
      properties: {
        exercise_name: {
          type: "STRING",
          description: "canonical exercise name as written by the user, e.g. «Отжимания».",
        },
        query_hint: {
          type: "STRING",
          description:
            "optional English search query for the video, e.g. 'push ups proper form'. Use it when the Russian name alone would not be a good search query.",
        },
        language_hint: {
          type: "STRING",
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
      type: "OBJECT",
      properties: {
        exercise_name: { type: "STRING", description: "exercise name as the user called it." },
        video_ref: {
          type: "STRING",
          description: "opaque handle returned by find_exercise_video.",
        },
        muscles: {
          type: "ARRAY",
          description:
            "ONLY when creating a new exercise: muscle keys, first is main. Use the catalog prompt section for valid keys.",
          items: { type: "STRING", description: "muscle key." },
        },
        category: {
          type: "STRING",
          description: "ONLY when creating a new exercise: strength | cardio | stretch.",
        },
        mode: {
          type: "STRING",
          description: "ONLY when creating a new exercise: reps (default) | time.",
        },
        reps: { type: "NUMBER", description: "default reps to store on a new exercise." },
        seconds: {
          type: "NUMBER",
          description: "default seconds to store on a new exercise (mode=time).",
        },
        equipment: {
          type: "STRING",
          description: "short equipment name in Russian, e.g. гантели.",
        },
        description: {
          type: "STRING",
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
      type: "OBJECT",
      properties: {
        name: { type: "STRING", description: "workout name in Russian." },
        emoji: { type: "STRING", description: "exactly one emoji." },
        exercise_ids: {
          type: "ARRAY",
          description: "catalog exercise ids in workout order (max 12).",
          items: { type: "STRING", description: "exercise id from the catalog." },
        },
        sets: {
          type: "ARRAY",
          description: "optional same-length list of sets per exercise (sensible defaults 1–5).",
          items: { type: "NUMBER", description: "sets for the exercise at the same position." },
        },
        rest_sec: {
          type: "ARRAY",
          description:
            "optional same-length list of rest seconds (strength 45–90, cardio/stretch 20–40).",
          items: {
            type: "NUMBER",
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
      type: "OBJECT",
      properties: {
        after_index: {
          type: "NUMBER",
          description: "index in the cycle to insert after; -1 = at the very beginning.",
        },
        workout_id: {
          type: "STRING",
          description: "catalog workout id, required when kind=workout.",
        },
        kind: { type: "STRING", description: "'workout' | 'rest'." },
      },
      required: ["kind"],
    },
  },
  {
    name: "get_exercise_details",
    description:
      "Returns the FULL stored data of one catalog exercise by id (description, steps, mistakes, video, feedback). Use it when the compact catalog line is not enough.",
    parameters: {
      type: "OBJECT",
      properties: {
        exercise_id: { type: "STRING", description: "id from the catalog." },
      },
      required: ["exercise_id"],
    },
  },
];

export const TOOL_NAMES = new Set(TOOL_DEFS.map((t) => t.name));
