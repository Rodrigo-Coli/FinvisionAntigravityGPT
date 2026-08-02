import { UserRole } from '../types';

const ADMIN_EMAILS = ['rodrigocolicg@gmail.com'];

export function isAdmin(user: { role?: string; email?: string } | null | undefined): boolean {
  if (!user) return false;
  if (user.role === UserRole.ADMIN) return true;
  if (user.email && ADMIN_EMAILS.includes(user.email)) return true;
  return false;
}

// Nível acima de admin — controla o painel da Landing Page (preço público exibido,
// textos e imagens do site). Nunca deriva de email/role: só existe via
// profiles.is_superadmin = true, promovido manualmente no banco (ver
// supabase/landing_settings_migration.sql).
export function isSuperadmin(user: { is_superadmin?: boolean } | null | undefined): boolean {
  return !!user?.is_superadmin;
}
