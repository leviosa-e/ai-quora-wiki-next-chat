import { create } from "zustand";
import { RenderPrompt } from "../components/chat";

interface ChatBodyState {
  userInput: string;
  attachImages: string[];
  promptHints: RenderPrompt[];
  isLoading: boolean;
  setUserInput: (input: string) => void;
  setAttachImages: (images: string[]) => void;
  setPromptHints: (hints: RenderPrompt[]) => void;
  setIsLoading: (loading: boolean) => void;
}

export const useChatBodyStore = create<ChatBodyState>((set) => ({
  userInput: "",
  attachImages: [],
  promptHints: [],
  isLoading: false,
  setUserInput: (input) => set({ userInput: input }),
  setAttachImages: (images) => set({ attachImages: images }),
  setPromptHints: (hints) => set({ promptHints: hints }),
  setIsLoading: (loading) => set({ isLoading: loading }),
}));
