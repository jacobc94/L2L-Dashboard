import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSeed } from '../data/seed';
import { StoreProvider } from '../store';
import { ClientPageLayout } from '../views/ClientPageLayout';
import { Shell } from '../components/Shell';
import { setNow } from '../utils/dates';
import App from '../App';

afterEach(() => { setNow(null); vi.unstubAllGlobals(); });

describe('client page rendering', () => {
  it('renders only the signed-in client’s custom pages and escapes their content', () => {
    const state = buildSeed('2026-11-04');
    state.clients.find((c) => c.id === 'c_maria')!.portal = {
      pages: [{ id: 'p_custom', title: 'My custom page', sections: [{ id: 's_1', type: 'text', heading: 'Welcome', text: '<script>not executable</script>' }] }],
      checkInQuestions: [],
    };
    const html = renderToStaticMarkup(
      <StoreProvider initial={state} initialAuth={{ role: 'client', id: 'c_maria' }}>
        <Shell active="page/p_custom"><ClientPageLayout pageId="p_custom" /></Shell>
      </StoreProvider>,
    );
    expect(html).toContain('#/page/p_custom');
    expect(html).toContain('My custom page');
    expect(html).toContain('&lt;script&gt;not executable&lt;/script&gt;');
    expect(html).not.toContain('<script>not executable</script>');
    const other = renderToStaticMarkup(
      <StoreProvider initial={state} initialAuth={{ role: 'client', id: 'c_priya' }}>
        <Shell active="home"><ClientPageLayout pageId="p_custom" /></Shell>
      </StoreProvider>,
    );
    expect(other).not.toContain('My custom page');
    expect(other).not.toContain('not executable');
  });

  it('shows customized check-in prompts and additional questions', () => {
    setNow(new Date('2026-11-04T18:00:00Z'));
    const state = buildSeed('2026-11-04');
    state.clients.find((c) => c.id === 'c_maria')!.portal = {
      pages: [], checkInQuestions: [{ id: 'q_test', label: 'How was your week?', required: true }],
      checkInLabels: { wins: 'What did you accomplish?' },
    };
    const html = renderToStaticMarkup(
      <StoreProvider initial={state} initialAuth={{ role: 'client', id: 'c_maria' }}>
        <ClientPageLayout pageId="checkin" />
      </StoreProvider>,
    );
    expect(html).toContain('What did you accomplish?');
    expect(html).toContain('How was your week? (required)');
  });

  it('opens the reset form even when a user is already signed in', () => {
    vi.stubGlobal('window', { location: { hash: '#/reset?email=maria%40example.com&token=token' } });
    const html = renderToStaticMarkup(
      <StoreProvider initial={buildSeed('2026-11-04')} initialAuth={{ role: 'client', id: 'c_maria' }}>
        <App />
      </StoreProvider>,
    );
    expect(html).toContain('Reset password');
    expect(html).toContain('Confirm password');
  });
});
