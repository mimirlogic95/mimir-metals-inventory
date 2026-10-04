import { getSupabaseClient } from '@/lib/supabase/client';
import { getAuthenticatedSupabaseClient } from '@/lib/supabase/developmentAuth';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: vi.fn(),
}));

describe('development authentication diagnostics', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('identifies invalid local configuration without logging credentials', async () => {
    const password = 'short#';
    const signInWithPassword = vi.fn();
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: null },
          error: null,
        }),
        signInWithPassword,
      },
    } as unknown as ReturnType<typeof getSupabaseClient>;
    vi.mocked(getSupabaseClient).mockReturnValue(client);
    vi.stubEnv('VITE_DEV_AUTH_EMAIL', 'fictional.worker@example.test');
    vi.stubEnv('VITE_DEV_AUTH_PASSWORD', password);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(getAuthenticatedSupabaseClient()).rejects.toThrow(
      'AUTHENTICATION_REQUIRED',
    );

    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      'Development sign-in configuration is invalid.',
      {
        emailPresent: true,
        passwordPresent: true,
        emailValid: true,
        passwordValid: false,
      },
    );
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(password);
  });
});
