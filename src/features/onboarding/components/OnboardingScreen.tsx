import { ActionButton } from '@/features/onboarding/components/ActionButton';
import { ExperienceFrame } from '@/features/onboarding/components/ExperienceFrame';
import { ProgressDots } from '@/features/onboarding/components/ProgressDots';

type OnboardingPanel = {
  eyebrow: string;
  title: string;
  copy: string;
};

type OnboardingScreenProps = {
  activeIndex: number;
  panel: OnboardingPanel;
  panelCount: number;
  primaryLabel: string;
  onBack: () => void;
  onPrimary: () => void;
  onSkip: () => void;
};

export function OnboardingScreen({
  activeIndex,
  onBack,
  onPrimary,
  onSkip,
  panel,
  panelCount,
  primaryLabel
}: OnboardingScreenProps) {
  return (
    <ExperienceFrame className="onboarding-screen">
      <header className="top-bar">
        <button
          className="icon-button"
          onClick={onBack}
          type="button"
          aria-label="Volver"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button className="text-link" onClick={onSkip} type="button">
          Saltar
        </button>
      </header>

      <section className="signal-card" aria-label="Datos reales">
        <span>Datos reales</span>
        <strong>Conecta tu patrimonio</strong>
        <div className="signal-lines" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </section>

      <section className="hero-stack hero-stack--compact">
        <p className="eyebrow">{panel.eyebrow}</p>
        <h1>{panel.title}</h1>
        <p className="quiet-copy">{panel.copy}</p>
      </section>

      <footer className="action-stack">
        <ProgressDots activeIndex={activeIndex} count={panelCount} />
        <ActionButton onClick={onPrimary}>{primaryLabel}</ActionButton>
      </footer>
    </ExperienceFrame>
  );
}
