export type AgentTemplate = {
  id: string;
  key: string;
  metier: string;
  icon: string;
  default_name: string;
  description: string;
  tone_default: string;
  disclaimer: string | null;
  starters: string[];
};

export type Agent = {
  id: string;
  template_id: string | null;
  metier: string;
  icon: string;
  name: string;
  model_id: string;
  tone: string;
  language: string;
  disclaimer: string | null;
  starters: string[];
  created_at: string;
};

export type CreateAgentPayload = {
  template_id: string;
  name?: string;
  tone?: string;
  language?: string;
  model_id: string;
};

export type AgentChatResult = {
  content: string;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number };
};
