// Common type definitions

export interface User {
  username: string;
  passwordHash: string;
}

export interface UserBeliefs {
  [beliefName: string]: {
    choice?: string;
    favorite?: boolean;
    pieSlicePoints?: number;
    [key: string]: unknown;
  };
}

export interface UserSettings {
  allowAllDebates?: boolean;
  [key: string]: unknown;
}

export interface Notification {
  type: string;
  actor: string;
  timestamp?: number;
  [key: string]: unknown;
}

export interface FeedEntry {
  actor: string;
  type: string;
  timestamp: number;
  [key: string]: unknown;
}

export interface ProposedBelief {
  id: string;
  beliefName: string;
  category: string;
  proposedBy: string;
  timestamp: number;
  status?: string;
  [key: string]: unknown;
}

export interface BeliefData {
  [category: string]: Array<{
    name: string;
    description: string;
    choices?: string[];
    [key: string]: unknown;
  }>;
}

