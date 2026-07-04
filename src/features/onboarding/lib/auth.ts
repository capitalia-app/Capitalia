import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '@/shared/lib/supabase';

type ProfileRecord = {
  id: string;
  user_id: string;
};

type WorkspaceMembershipRecord = {
  workspace_id: string;
};

export type AuthResult =
  | {
      status: 'authenticated';
      session: Session;
    }
  | {
      status: 'confirmation_required';
    };

export async function getCurrentSession() {
  if (!supabase) {
    authLog('session user', null);
    return null;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    authLog('auth error', error.message);
    throw error;
  }

  authLog('session user', data.session?.user?.email ?? null);

  return data.session;
}

export function onAuthSessionChange(callback: (session: Session | null) => void) {
  if (!supabase) {
    return () => undefined;
  }

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    authLog('session user', session?.user?.email ?? null);
    callback(session);
  });

  return () => data.subscription.unsubscribe();
}

export async function signUpWithEmail(params: {
  email: string;
  password: string;
  fullName: string;
}): Promise<AuthResult> {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  authLog('signUp called', params.email);

  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        full_name: params.fullName,
        name: params.fullName
      }
    }
  });

  if (error) {
    authLog('auth error', error.message);
    throw error;
  }

  if (!data.session) {
    authLog('session user', null);
    return {
      status: 'confirmation_required'
    };
  }

  await ensureUserFoundation(data.session.user, params.fullName);

  authLog('session user', data.session.user.email);

  return {
    status: 'authenticated',
    session: data.session
  };
}

export async function signInWithEmail(params: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  authLog('signIn called', params.email);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: params.email,
    password: params.password
  });

  if (error) {
    authLog('auth error', error.message);
    throw error;
  }

  if (!data.session) {
    authLog('auth error', 'signInWithPassword returned no session');
    throw new Error('No se pudo iniciar sesion.');
  }

  await ensureUserFoundation(data.user);

  authLog('session user', data.user.email);

  return {
    status: 'authenticated',
    session: data.session
  };
}

export async function signOut() {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function ensureSessionFoundation(session: Session) {
  await ensureUserFoundation(session.user);
}

async function ensureUserFoundation(user: User, fullName?: string) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const profile = await ensureProfile(user, fullName);
  await ensurePersonalWorkspace(profile);
}

async function ensureProfile(user: User, fullName?: string) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const { data: existingProfile, error: selectError } = await supabase
    .from('profiles')
    .select('id, user_id')
    .eq('user_id', user.id)
    .maybeSingle<ProfileRecord>();

  if (selectError) {
    throw selectError;
  }

  if (existingProfile) {
    return existingProfile;
  }

  const displayName =
    fullName ||
    getUserMetadataValue(user, 'full_name') ||
    getUserMetadataValue(user, 'name') ||
    user.email ||
    'Capitalia';

  const { data: createdProfile, error: insertError } = await supabase
    .from('profiles')
    .insert({
      user_id: user.id,
      full_name: displayName,
      display_name: displayName
    })
    .select('id, user_id')
    .single<ProfileRecord>();

  if (insertError) {
    throw insertError;
  }

  return createdProfile;
}

async function ensurePersonalWorkspace(profile: ProfileRecord) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const { data: memberships, error: membershipError } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('profile_id', profile.id)
    .eq('status', 'active')
    .limit(1)
    .returns<WorkspaceMembershipRecord[]>();

  if (membershipError) {
    throw membershipError;
  }

  if (memberships.length > 0) {
    return;
  }

  const { error: workspaceError } = await supabase.from('workspaces').insert({
    name: 'Mi patrimonio',
    type: 'personal',
    base_currency: 'EUR',
    country: 'ES',
    created_by: profile.id
  });

  if (workspaceError) {
    throw workspaceError;
  }
}

function getUserMetadataValue(user: User, key: string) {
  const metadata = user.user_metadata as Record<string, unknown>;
  const value = metadata[key];

  return typeof value === 'string' && value.length > 0 ? value : null;
}

function authLog(event: string, details?: unknown) {
  if (details !== undefined) {
    console.info(event, details);
    return;
  }

  console.info(event);
}
