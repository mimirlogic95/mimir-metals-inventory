import { z } from 'zod';

import { getSupabaseClient } from '@/lib/supabase/client';

const developmentAuthSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

let signInPromise: Promise<void> | undefined;

async function signInDevelopmentUser(): Promise<void> {
  const client = getSupabaseClient();
  const email = import.meta.env.VITE_DEV_AUTH_EMAIL;
  const password = import.meta.env.VITE_DEV_AUTH_PASSWORD;
  const config = developmentAuthSchema.safeParse({
    email,
    password,
  });

  if (!config.success) {
    if (import.meta.env.DEV) {
      console.error('Development sign-in configuration is invalid.', {
        emailPresent: Boolean(email),
        passwordPresent: Boolean(password),
        emailValid: developmentAuthSchema.shape.email.safeParse(email).success,
        passwordValid:
          developmentAuthSchema.shape.password.safeParse(password).success,
      });
    }
    throw new Error('AUTHENTICATION_REQUIRED');
  }

  const { error } = await client.auth.signInWithPassword(config.data);

  if (error) {
    throw new Error('DEVELOPMENT_SIGN_IN_FAILED', { cause: error });
  }
}

export async function getAuthenticatedSupabaseClient() {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw new Error('SESSION_READ_FAILED', { cause: error });
  }

  if (data.session) {
    return client;
  }

  if (!import.meta.env.DEV) {
    throw new Error('AUTHENTICATION_REQUIRED');
  }

  signInPromise ??= signInDevelopmentUser();

  try {
    await signInPromise;
  } catch (signInError) {
    signInPromise = undefined;
    throw signInError;
  }

  return client;
}
