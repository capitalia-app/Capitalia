import { BrandMark } from '@/features/onboarding/components/BrandMark';
import { ExperienceFrame } from '@/features/onboarding/components/ExperienceFrame';

type DemoDashboardProps = {
  onBack: () => void;
};

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
    value: '64.200 EUR'
  },
  {
    label: 'Liquidez',
    value: '18.450 EUR'
  },
  {
    label: 'Inmuebles',
    value: '41.930 EUR'
  }
];

export function DemoDashboard({ onBack }: DemoDashboardProps) {
  return (
    <ExperienceFrame className="dashboard-screen">
      <header className="dashboard-header">
        <button
          className="icon-button"
          onClick={onBack}
          type="button"
          aria-label="Volver"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <BrandMark />
      </header>

      <section className="dashboard-hero" aria-label="Resumen financiero">
        <p className="eyebrow">Hoy</p>
        <div>
          <span>Patrimonio neto</span>
          <strong>124.580 EUR</strong>
        </div>
        <p>+2.840 EUR este mes</p>
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
          <span />
          <span />
          <span />
        </div>
        <div className="portfolio-list">
          {assetCards.map((card) => (
            <div key={card.label}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <nav className="mobile-tab-bar" aria-label="Navegacion demo">
        <button
          className="mobile-tab-bar__item mobile-tab-bar__item--active"
          type="button"
        >
          Inicio
        </button>
        <button className="mobile-tab-bar__item" type="button">
          Activos
        </button>
        <button className="mobile-tab-bar__item" type="button">
          Objetivos
        </button>
      </nav>
    </ExperienceFrame>
  );
}
