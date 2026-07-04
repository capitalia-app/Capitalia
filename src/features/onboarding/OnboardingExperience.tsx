import { useEffect, useMemo, useState } from 'react';

import { AuthScreen } from '@/features/onboarding/components/AuthScreen';
import { OnboardingScreen } from '@/features/onboarding/components/OnboardingScreen';
import { SplashScreen } from '@/features/onboarding/components/SplashScreen';
import { WelcomeScreen } from '@/features/onboarding/components/WelcomeScreen';

type ExperienceStep = 'splash' | 'welcome' | 'signup' | 'signin' | 'onboarding';

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

  useEffect(() => {
    if (step !== 'splash') {
      return;
    }

    const timer = window.setTimeout(() => {
      setStep('welcome');
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [step]);

  const activePanel = onboardingPanels[panelIndex] ?? onboardingPanels[0];
  const isLastPanel = panelIndex === onboardingPanels.length - 1;

  const primaryAction = useMemo(() => {
    if (!isLastPanel) {
      return () => setPanelIndex((current) => current + 1);
    }

    return () => setStep('welcome');
  }, [isLastPanel]);

  if (step === 'splash') {
    return <SplashScreen onFinish={() => setStep('welcome')} />;
  }

  if (step === 'signup' || step === 'signin') {
    return (
      <AuthScreen
        mode={step}
        onBack={() => setStep('welcome')}
        onSwitchMode={() => setStep(step === 'signup' ? 'signin' : 'signup')}
        onContinue={() => setStep('onboarding')}
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

  return (
    <WelcomeScreen
      onCreateAccount={() => {
        setPanelIndex(0);
        setStep('signup');
      }}
      onSignIn={() => {
        setPanelIndex(0);
        setStep('signin');
      }}
      onPreview={() => {
        setPanelIndex(0);
        setStep('onboarding');
      }}
    />
  );
}
