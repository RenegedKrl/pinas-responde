export type StepType = "text" | "link" | "image" | "video" | "audio" | "wait";

export interface Step {
  type: StepType;
  text?: string;   // texto (text/link)
  url?: string;    // link ou mídia
  label?: string;  // texto do botão do link
  seconds?: number; // wait
}

export interface Automation {
  id: string;
  user_id: string;
  folder_id: string | null;
  name: string;
  active: boolean;
  post_ids: string[];
  post_previews: { id: string; thumb?: string; caption?: string }[];
  keywords: string[];
  comment_replies: string[];
  welcome_message: string;
  button_label: string;
  steps: Step[];
  created_at?: string;
  updated_at?: string;
}

export interface Folder {
  id: string;
  name: string;
}
