import { registerPlugin } from "@capacitor/core";
import type {
  QueueStrategy as NativeQueueStrategy,
  TextToSpeechPlugin,
} from "@capacitor-community/text-to-speech";

export const TextToSpeech = registerPlugin<TextToSpeechPlugin>("TextToSpeech");
export const QueueStrategy = {
  Flush: 0 as NativeQueueStrategy,
  Add: 1 as NativeQueueStrategy,
};
