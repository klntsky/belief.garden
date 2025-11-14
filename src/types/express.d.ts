// Extend Express Request to include Passport user
import { User as PassportUser } from '../types/index.js';

declare global {
  namespace Express {
    interface User extends PassportUser {
      id: string;
    }
  }
}

export {};

