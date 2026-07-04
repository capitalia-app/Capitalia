import { useEffect, useMemo, useState } from 'react';

import { BrandMark } from '@/features/onboarding/components/BrandMark';
import { ExperienceFrame } from '@/features/onboarding/components/ExperienceFrame';

type DemoDashboardProps = {
  onBack: () => void;
};

type DemoTab = 'home' | 'assets' | 'goals';

const summaryCards = [
  {
    label: 'Ingresos',
    value: '4.280 EUR',
    trend: '+8%'
  },
  {
    label: 'Gastos',
    value: '1.920 EUR',
    trend: '-4%'
  },
  {
    label: 'Ahorro',
    value: '2.360 EUR',
    trend: '55%'
  }
];

const assetCards = [
  {
    label: 'Inversiones',
    value: '64.200 EUR',
    color: 'gold'
  },
  {
    label: 'Liquidez',
    value: '18.450 EUR',
    color: 'sage'
  },
  {
    label: 'Inmuebles',
    value: '41.930 EUR',
    color: 'wine'
  }
];

const investmentRows = [
  {
    name: 'MSCI World ETF',
    type: 'ETF',
    value: '32.420 EUR',
    change: '+4,8%'
  },
  {
    name: 'S&P 500',
    type: 'Acciones',
    value: '18.760 EUR',
    change: '+2,1%'
  },
  {
    name: 'Bitcoin',
    type: 'Cripto',
    value: '7.840 EUR',
    change: '+9,6%'
  },
  {
    name: 'Fondo monetario',
    type: 'Fondo',
    value: '5.180 EUR',
    change: '+0,4%'
  }
];

function useAnimatedAmount(target: number) {
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    let frame = 0;
    const totalFrames = 72;

    const interval = window.setInterval(() => {
      frame += 1;
      const progress = Math.min(frame / totalFrames, 1);
      const eased = 1 - (1 - progress) ** 3;

      setAmount(Math.round(target * eased));

      if (progress === 1) {
        window.clearInterval(interval);
      }
    }, 16);

    return () => window.clearInterval(interval);
  }, [target]);

  return amount;
}

function formatEuro(value: number) {
  return new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: 0,
    style: 'currency',
    currency: 'EUR'
  }).format(value);
}

export function DemoDashboard({ onBack }: DemoDashboardProps) {
  const [activeTab, setActiveTab] = useState<DemoTab>('home');
  const animatedNetWorth = useAnimatedAmount(124580);

  const tabContent = useMemo(() => {
    if (activeTab === 'assets') {
      return <AssetsPanel />;
    }

    if (activeTab === 'goals') {
      return <GoalsPanel />;
    }

    return <HomePanel animatedNetWorth={animatedNetWorth} />;
  }, [activeTab, animatedNetWorth]);

  return (
    <ExperienceFrame className="dashboard-screen">
      <header className="dashboard-header">
        <button
          className="icon-button"
          onClick={onBack}
          type="button"
          aria-label="Volver"
        >
          <span aria-hidden="true">{'<'}</span>
        </button>
        <BrandMark />
      </header>

      {tabContent}

      <nav className="mobile-tab-bar" aria-label="Navegacion demo">
        <TabButton
          activeTab={activeTab}
          label="Inicio"
          tab="home"
          onSelect={setActiveTab}
        />
        <TabButton
          activeTab={activeTab}
          label="Activos"
          tab="assets"
          onSelect={setActiveTab}
        />
        <TabButton
          activeTab={activeTab}
          label="Objetivos"
          tab="goals"
          onSelect={setActiveTab}
        />
      </nav>
    </ExperienceFrame>
  );
}

type TabButtonProps = {
  activeTab: DemoTab;
  label: string;
  tab: DemoTab;
  onSelect: (tab: DemoTab) => void;
};

function TabButton({ activeTab, label, onSelect, tab }: TabButtonProps) {
  const isActive = activeTab === tab;

  return (
    <button
      className={
        isActive
          ? 'mobile-tab-bar__item mobile-tab-bar__item--active'
          : 'mobile-tab-bar__item'
      }
      onClick={() => onSelect(tab)}
      type="button"
    >
      {label}
    </button>
  );
}

type HomePanelProps = {
  animatedNetWorth: number;
};

function HomePanel({ animatedNetWorth }: HomePanelProps) {
  return (
    <>
      <section className="dashboard-hero" aria-label="Resumen financiero">
        <p className="eyebrow">Hoy</p>
        <div>
          <span>Patrimonio neto</span>
          <strong>{formatEuro(animatedNetWorth)}</strong>
        </div>
        <p>Construyes patrimonio, no controlas gastos</p>
        <small>+2.840 EUR este mes</small>
      </section>

      <section className="metric-grid" aria-label="Resumen mensual">
        {summaryCards.map((card) => (
          <article className="metric-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.trend}</small>
          </article>
        ))}
      </section>

      <section className="portfolio-card" aria-label="Distribucion de patrimonio">
        <div className="portfolio-chart" aria-hidden="true">
          <div className="portfolio-chart__ring" />
          <div className="portfolio-chart__core">
            <span>Activos</span>
            <strong>3</strong>
          </div>
        </div>
        <div className="portfolio-list">
          {assetCards.map((card) => (
            <div
              className={`portfolio-list__item portfolio-list__item--${card.color}`}
              key={card.label}
            >
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function AssetsPanel() {
  return (
    <section className="assets-panel" aria-label="Activos conectados">
      <div className="section-heading">
        <p className="eyebrow">Activos</p>
        <h2>Inversiones conectadas</h2>
        <span>64.200 EUR</span>
      </div>

      <div className="asset-list">
        {investmentRows.map((asset) => (
          <article className="asset-row" key={asset.name}>
            <div>
              <strong>{asset.name}</strong>
              <span>{asset.type}</span>
            </div>
            <div>
              <strong>{asset.value}</strong>
              <small>{asset.change}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function GoalsPanel() {
  return (
    <section className="assets-panel" aria-label="Objetivos demo">
      <div className="section-heading">
        <p className="eyebrow">Objetivos</p>
        <h2>Fondo de libertad</h2>
        <span>68%</span>
      </div>

      <div className="goal-preview-card">
        <span>Progreso estimado</span>
        <strong>40.800 EUR de 60.000 EUR</strong>
        <i aria-hidden="true">
          <b />
        </i>
      </div>
    </section>
  );
}
