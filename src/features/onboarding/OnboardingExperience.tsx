import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import {
  AuthScreen,
  type AuthFormValues
} from '@/features/onboarding/components/AuthScreen';
import { DemoDashboard } from '@/features/onboarding/components/DemoDashboard';
import { OnboardingScreen } from '@/features/onboarding/components/OnboardingScreen';
import { SplashScreen } from '@/features/onboarding/components/SplashScreen';
import { WelcomeScreen } from '@/features/onboarding/components/WelcomeScreen';
import {
  ensureSessionFoundation,
  getCurrentSession,
  onAuthSessionChange,
  signInWithEmail,
  signOut,
  signUpWithEmail
} from '@/features/onboarding/lib/auth';
import { isSupabaseConfigured } from '@/shared/lib/supabase';

type ExperienceStep =
  'splash' | 'welcome' | 'signup' | 'signin' | 'onboarding' | 'dashboard';

const onboardingPanels = [
  {
    eyebrow: '01',
    title: 'Patrimonio primero.',
    copy: 'Cuentas, activos y objetivos en una sola lectura.',
    metric: '124.580 EUR',
    label: 'Patrimonio simulado'
  },
  {
    eyebrow: '02',
    title: 'Menos friccion.',
    copy: 'Importa ahora. Revisa solo lo importante.',
    metric: '7',
    label: 'Elementos por revisar'
  },
  {
    eyebrow: '03',
    title: 'Decision tranquila.',
    copy: 'Una vision clara antes de mover tu dinero.',
    metric: '68%',
    label: 'Objetivo de inversion'
  }
] as const;

export function OnboardingExperience() {
  const [step, setStep] = useState<ExperienceStep>('splash');
  const [panelIndex, setPanelIndex] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      try {
        const currentSession = await getCurrentSession();

        if (!isMounted) {
          return;
        }

        if (currentSession) {
          await ensureSessionFoundation(currentSession);
        }

        if (!isMounted) {
          return;
        }

        setSession(currentSession);
        setStep(currentSession ? 'dashboard' : 'welcome');
      } catch (error) {
        if (isMounted) {
          setAuthError(getAuthErrorMessage(error));
          setStep('welcome');
        }
      } finally {
        if (isMounted) {
          setIsBooting(false);
        }
      }
    }

    const minimumSplash = window.setTimeout(() => {
      void loadSession();
    }, 1100);

    const unsubscribe = onAuthSessionChange((nextSession) => {
      setSession(nextSession);

      if (nextSession) {
        setStep('dashboard');
      }
    });

    return () => {
      isMounted = false;
      window.clearTimeout(minimumSplash);
      unsubscribe();
    };
  }, []);

  const activePanel = onboardingPanels[panelIndex] ?? onboardingPanels[0];
  const isLastPanel = panelIndex === onboardingPanels.length - 1;

  const primaryAction = useMemo(() => {
    if (!isLastPanel) {
      return () => setPanelIndex((current) => current + 1);
    }

    return () => setStep('welcome');
  }, [isLastPanel]);

  async function handleAuthSubmit(values: AuthFormValues) {
    setAuthError(null);
    setAuthSuccess(null);

    if (!isSupabaseConfigured) {
      setAuthError('Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
      return;
    }

    setIsAuthLoading(true);

    try {
      const result =
        step === 'signup'
          ? await signUpWithEmail(values)
          : await signInWithEmail({
              email: values.email,
              password: values.password
            });

      if (result.status === 'confirmation_required') {
        setAuthSuccess('Revisa tu email para confirmar la cuenta.');
        return;
      }

      setSession(result.session);
      setAuthSuccess('Sesion iniciada.');
      setStep('dashboard');
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function handleSignOut() {
    setAuthError(null);
    setAuthSuccess(null);
    setIsAuthLoading(true);

    try {
      await signOut();
      setSession(null);
      setPanelIndex(0);
      setStep('welcome');
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setIsAuthLoading(false);
    }
  }

  if (step === 'splash' || isBooting) {
    return <SplashScreen onFinish={() => setStep('welcome')} />;
  }

  if (session) {
    return (
      <DemoDashboard
        onSignOut={() => {
          void handleSignOut();
        }}
        userEmail={session.user.email}
      />
    );
  }

  if (step === 'signup' || step === 'signin') {
    return (
      <AuthScreen
        error={authError}
        isLoading={isAuthLoading}
        mode={step}
        successMessage={authSuccess}
        onBack={() => {
          setAuthError(null);
          setAuthSuccess(null);
          setStep('welcome');
        }}
        onSwitchMode={() => {
          setAuthError(null);
          setAuthSuccess(null);
          setStep(step === 'signup' ? 'signin' : 'signup');
        }}
        onSubmit={(values) => {
          void handleAuthSubmit(values);
        }}
      />
    );
  }

  if (step === 'onboarding') {
    return (
      <OnboardingScreen
        activeIndex={panelIndex}
        panel={activePanel}
        panelCount={onboardingPanels.length}
        primaryLabel={isLastPanel ? 'Entrar' : 'Continuar'}
        onBack={() => {
          if (panelIndex === 0) {
            setStep('welcome');
            return;
          }

          setPanelIndex((current) => current - 1);
        }}
        onPrimary={primaryAction}
        onSkip={() => setStep('welcome')}
      />
    );
  }

  if (step === 'dashboard') {
    return <DemoDashboard onBack={() => setStep('welcome')} />;
  }

  return (
    <WelcomeScreen
      onCreateAccount={() => {
        setAuthError(null);
        setAuthSuccess(null);
        setPanelIndex(0);
        setStep('signup');
      }}
      onSignIn={() => {
        setAuthError(null);
        setAuthSuccess(null);
        setPanelIndex(0);
        setStep('signin');
      }}
      onPreview={() => {
        setStep('dashboard');
      }}
    />
  );
}

function getAuthErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'No se pudo completar la operacion.';
}
