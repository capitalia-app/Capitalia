import { BrandMark } from '@/features/onboarding/components/BrandMark';
import { ExperienceFrame } from '@/features/onboarding/components/ExperienceFrame';

type SplashScreenProps = {
  onFinish: () => void;
};

export function SplashScreen({ onFinish }: SplashScreenProps) {
  return (
    <ExperienceFrame className="splash-screen">
      <button className="splash-skip" onClick={onFinish} type="button">
        Saltar
      </button>
      <div className="splash-core">
        <BrandMark size="large" />
        <p>Capitalia</p>
      </div>
      <div className="splash-line" />
    </ExperienceFrame>
  );
}
