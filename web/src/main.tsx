import { render } from 'preact';
import './styles/tokens.css';
import './styles/base.css';
import { t } from './i18n';

function App() {
  return (
    <>
      <nav class="nav">
        <span class="logo">{t('app.name')}</span>
      </nav>
      <main class="hero">
        <div class="hero-logo">Negroni</div>
        <div class="hero-sub">{t('app.subtitle')}</div>
        <p class="note">{t('skeleton.status')}</p>
      </main>
    </>
  );
}

render(<App />, document.getElementById('app')!);
