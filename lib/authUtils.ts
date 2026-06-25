import { UserRole } from '../types';

const ADMIN_EMAILS = ['rodrigocolicg@gmail.com'];

export function isAdmin(user: { role?: string; email?: string } | null | undefined): boolean {
  if (!user) return false;
  if (user.role === UserRole.ADMIN) return true;
  if (user.email && ADMIN_EMAILS.includes(user.email)) return true;
  return false;
}
