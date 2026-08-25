import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// フロントエンド表示用
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// バッチ・管理スクリプト用（書き込み権限）
export const getServiceSupabase = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for batch scripts');
  }
  return createClient(supabaseUrl, serviceRoleKey);
};