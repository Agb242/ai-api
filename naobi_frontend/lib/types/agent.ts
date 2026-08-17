export type AgentTemplate = {
  id: string;
  key: string;
  metier: string;
  icon: string;
  default_name: string;
  description: string;
  system_prompt: string;
  disclaimer: string | null;
  starters: string[];
};

export type Agent = {
  id: string;
  template_id: string | null;
  metier: string | null;
  icon: string;
  name: string;
  model_id: string;
  temperature: number;
  max_tokens: number;
  system_prompt: string;
  disclaimer: string | null;
  starters: string[];
  created_at: string;
};

export type CreateAgentPayload = {
  name: string;
  system_prompt: string;
  model_id: string;
  temperature?: number;
  max_tokens?: number;
  template_id?: string | null;
};

export type AgentChatResult = {
  content: string;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number };
};
