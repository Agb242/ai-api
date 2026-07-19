import { Model, RelationMappingsThunk } from 'objection';
import { BaseModel } from './BaseModel';
import { normalizeEmail } from '../utils/normalize-email';
import type { Session } from './Session';

export class User extends BaseModel {
  static tableName = 'users';
  static emailFields = ['email'];

  email!: string;
  full_name?: string | null;
  avatar_url?: string | null;
  email_verified!: boolean;


  sessions?: Session[];

  /** Find user by email (case-insensitive) */
  static async findByEmail(email: string): Promise<User | undefined> {
    const normalized = normalizeEmail(email);
    if (!normalized) return undefined;
    return User.query().findOne({ email: normalized });
  }

  static relationMappings: RelationMappingsThunk = () => ({
   
    sessions: {
      relation: Model.HasManyRelation,
      modelClass: require('./Session').Session,
      join: {
        from: 'users.id',
        to: 'sessions.user_id',
      },
    },
  });
}
