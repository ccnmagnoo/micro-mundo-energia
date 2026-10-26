import {
  getSite,
  getSitesByZone,
  getZone,
  sites,
  type EnergySite,
  type IconName,
  type ZoneId,
} from '../data/sites';
import { EnergyWorld } from './three/world';

const $ = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

const app = $('#app') as HTMLElement;
const worldContainer = $('#world') as HTMLDivElement;
const loader = $('#loader') as HTMLElement;
const detailPanel = $('#detail-panel') as HTMLElement;
const overviewMode = detailPanel.querySelector<HTMLElement>('[data-detail-mode="overview"]')!;
const zoneMode = detailPanel.querySelector<HTMLElement>('[data-detail-mode="zone"]')!;
const siteMode = detailPanel.querySelector<HTMLElement>('[data-detail-mode="site"]')!;
const themeToggle = $('#theme-toggle') as HTMLButtonElement;
const motionToggle = $('#motion-toggle') as HTMLButtonElement;
const mapTip = $('#map-tip');
const tourDock = $('#tour-dock') as HTMLElement;
const tourTitle = $('[data-tour-title]');
const tourCopy = $('[data-tour-copy]');
const tourSite = $('[data-tour-site]');
const tourCount = $('[data-tour-count]');
const tourProgress = $('[data-tour-progress]');
const tourPrev = $('[data-tour-prev]') as HTMLButtonElement;
const tourNext = $('[data-tour-next]') as HTMLButtonElement;
const webglFallback = $('#webgl-fallback');

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const icon = (name: IconName | string) =>
  `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

const stageOrder = ['Generación', 'Transmisión', 'Distribución', 'Consumo'] as const;

interface TourStep {
  zone: ZoneId;
  site: string;
  title: string;
  copy: string;
}

const tourSteps: TourStep[] = [
  {
    zone: 'costa',
    site: 'mareomotriz',
    title: 'El viaje comienza en el mar',
    copy: 'Mareas, olas y viento marino convierten el océano en electricidad. Avanza por la costa y observa cómo trabaja cada tecnología.',
  },
  {
    zone: 'desierto',
    site: 'csp',
    title: 'El desierto que brilla',
    copy: 'En Atacama, el sol es tan intenso que puede concentrarse con espejos sobre una torre. La energía se guarda como calor para seguir generando de noche.',
  },
  {
    zone: 'cordillera',
    site: 'hidro-embalse',
    title: 'Agua que baja de los Andes',
    copy: 'Los embalses guardan agua de deshielo y la liberan cuando hace falta. La caída mueve turbinas capaces de responder en minutos.',
  },
  {
    zone: 'geotermia',
    site: 'geotermica',
    title: 'El calor de la Tierra',
    copy: 'Bajo la cordillera, el vapor asciende a alta presión. Una central geotérmica puede generar electricidad sin depender del sol ni del viento.',
  },
  {
    zone: 'rural',
    site: 'hibrido',
    title: 'Energía que florece en el sur',
    copy: 'Aerogeneradores, paneles y baterías se combinan en sistemas híbridos para llevar electricidad firme a comunidades y campos.',
  },
  {
    zone: 'red',
    site: 'ciudad',
    title: 'La energía llega a casa',
    copy: 'La red de transmisión conecta el territorio de norte a sur. Hogares, escuelas, industrias y hospitales cierran el viaje de la electricidad.',
  },
];

let world: EnergyWorld | null = null;
let activeZone: ZoneId | null = null;
let selectedSiteId: string | null = null;
let isNight = false;
let isPaused = false;
let isTouring = false;
let tourIndex = 0;
let tipTimeout = 0;
let ready = false;
let readyAt = performance.now();
let revealScheduled = false;

const zoneButtons = [...document.querySelectorAll<HTMLButtonElement>('.zone-button[data-zone]')];

function updateZoneButtons() {
  zoneButtons.forEach((button) => {
    const value = button.dataset.zone;
    const active = value === 'all' ? activeZone === null : value === activeZone;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function updateThemeUI(night: boolean) {
  isNight = night;
  app.classList.toggle('theme-night', isNight);
  themeToggle.setAttribute('aria-pressed', String(isNight));
  themeToggle.setAttribute('aria-label', isNight ? 'Activar modo día' : 'Activar modo noche');
  const label = themeToggle.querySelector<HTMLElement>('[data-theme-label]');
  if (label) label.textContent = isNight ? 'Modo día' : 'Modo noche';
}

function updatePausedUI(paused: boolean) {
  isPaused = paused;
  app.classList.toggle('is-paused', isPaused);
  motionToggle.setAttribute('aria-pressed', String(isPaused));
  motionToggle.setAttribute('aria-label', isPaused ? 'Reanudar animaciones' : 'Pausar animaciones');
  const label = motionToggle.querySelector<HTMLElement>('.motion-toggle__label');
  if (label) label.textContent = isPaused ? 'En pausa' : 'En vivo';
}

function hideMapTip() {
  mapTip.classList.remove('is-visible');
  window.clearTimeout(tipTimeout);
}

function scheduleMapTip() {
  window.clearTimeout(tipTimeout);
  window.setTimeout(() => {
    if (!selectedSiteId && !activeZone && !isTouring) {
      mapTip.classList.add('is-visible');
      tipTimeout = window.setTimeout(() => mapTip.classList.remove('is-visible'), 9500);
    }
  }, 1600);
}

function syncSheetClass() {
  app.classList.toggle(
    'has-sheet',
    detailPanel.dataset.mode !== 'overview' && window.innerWidth <= 860,
  );
}

function switchMode(mode: 'overview' | 'zone' | 'site') {
  detailPanel.dataset.mode = mode;
  app.dataset.mode = mode;
  overviewMode.hidden = mode !== 'overview';
  zoneMode.hidden = mode !== 'zone';
  siteMode.hidden = mode !== 'site';
  syncSheetClass();
}

function showOverview() {
  switchMode('overview');
  detailPanel.style.setProperty('--detail-accent', 'var(--gold)');
}

function renderZone(zoneId: ZoneId) {
  const zone = getZone(zoneId);
  const zoneSites = getSitesByZone(zoneId);
  detailPanel.style.setProperty('--detail-accent', zone.color);
  zoneMode.innerHTML = `
    <div class="detail-top">
      <span class="eyebrow eyebrow--dark">
        <span class="eyebrow__line"></span>
        ${escapeHtml(zone.eyebrow)}
      </span>
      <button class="icon-button detail-close" type="button" data-detail-close aria-label="Volver a la vista general">
        ${icon('close')}
      </button>
    </div>
    <div class="zone-hero">
      <span class="zone-hero__icon">${icon(zone.icon)}</span>
      <span class="zone-hero__label">${escapeHtml(zone.shortName)}</span>
      <h2>${escapeHtml(zone.name)}</h2>
    </div>
    <p class="detail-copy">${escapeHtml(zone.description)}</p>
    <div class="section-heading">
      <span>Instalaciones de la zona</span>
      <strong>${zoneSites.length} puntos</strong>
    </div>
    <div class="zone-site-list">
      ${zoneSites
        .map(
          (site) => `
            <button class="zone-site" type="button" data-site-id="${site.id}">
              <span class="zone-site__index">${String(site.index).padStart(2, '0')}</span>
              <span class="zone-site__body">
                <strong>${escapeHtml(site.shortName)}</strong>
                <span>${escapeHtml(site.stage)} · ${escapeHtml(site.capacity)}</span>
              </span>
              ${icon('chevron-right')}
            </button>
          `,
        )
        .join('')}
    </div>
    <button class="secondary-button" type="button" data-reset-all style="width:100%; margin-top:16px; color: var(--ink); border-color: rgba(17,58,56,.14);">
      ${icon('reset')}
      Volver a la vista general
    </button>
  `;
  switchMode('zone');
}

function stageTrack(current: string) {
  return `
    <div class="site-stage-track" aria-label="Etapa en la cadena eléctrica">
      ${stageOrder
        .map(
          (stage) => `
            <span class="site-stage ${stage === current ? 'is-current' : ''}">${stage}</span>
          `,
        )
        .join('')}
    </div>
  `;
}

function renderSite(site: EnergySite) {
  const zone = getZone(site.zone);
  const list = sites;
  const index = Math.max(0, list.findIndex((item) => item.id === site.id));
  const previous = list[(index - 1 + list.length) % list.length];
  const next = list[(index + 1) % list.length];
  detailPanel.style.setProperty('--detail-accent', site.color);

  siteMode.innerHTML = `
    <div class="detail-top">
      <span class="eyebrow eyebrow--dark">
        <span class="eyebrow__line"></span>
        ${escapeHtml(site.stage)} · ${escapeHtml(zone.shortName)}
      </span>
      <button class="icon-button detail-close" type="button" data-detail-close aria-label="Cerrar ficha">
        ${icon('close')}
      </button>
    </div>
    <div class="site-banner">
      <span class="site-banner__icon">${icon(site.icon)}</span>
      <span class="site-banner__index">${String(site.index).padStart(2, '0')} / ${String(sites.length).padStart(2, '0')}</span>
      <span class="site-banner__status">${escapeHtml(site.status)}</span>
    </div>
    <h2 class="detail-title">${escapeHtml(site.name)}</h2>
    <div class="site-location">${icon('pin')}${escapeHtml(site.location)}</div>
    <p class="detail-copy">${escapeHtml(site.description)}</p>
    <div class="site-metrics">
      <div class="site-metric">
        <span>${escapeHtml(site.capacityLabel)}</span>
        <strong>${escapeHtml(site.capacity)}</strong>
      </div>
      <div class="site-metric">
        <span>${escapeHtml(site.secondaryLabel)}</span>
        <strong>${escapeHtml(site.secondaryValue)}</strong>
      </div>
    </div>
    <div class="site-tags">
      ${site.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}
    </div>
    ${stageTrack(site.stage)}
    <div class="site-fact">
      <span>${icon('spark')}¿Sabías que?</span>
      <p>${escapeHtml(site.fact)}</p>
    </div>
    <div class="site-nav">
      <button class="site-nav__button" type="button" data-site-prev="${previous.id}">
        ${icon('chevron-left')}
        <span><small>Anterior</small><strong>${escapeHtml(previous.shortName)}</strong></span>
      </button>
      <button class="site-nav__button" type="button" data-site-next="${next.id}">
        <span><small>Siguiente</small><strong>${escapeHtml(next.shortName)}</strong></span>
        ${icon('chevron-right')}
      </button>
    </div>
  `;
  switchMode('site');
}

function selectSite(id: string, options: { focus?: boolean; keepTour?: boolean } = {}) {
  const site = getSite(id);
  if (!site) return;
  if (!options.keepTour && isTouring) stopTour();
  hideMapTip();
  selectedSiteId = site.id;
  activeZone = site.zone;
  world?.setZone(activeZone);
  world?.selectSite(site.id, options.focus ?? true, false);
  renderSite(site);
  updateZoneButtons();
}

function selectZone(zoneId: ZoneId | null) {
  if (isTouring) stopTour();
  hideMapTip();
  selectedSiteId = null;
  world?.setSelected(null);

  if (!zoneId) {
    activeZone = null;
    world?.focusZone(null);
    updateZoneButtons();
    showOverview();
    return;
  }

  activeZone = zoneId;
  world?.focusZone(zoneId);
  updateZoneButtons();
  renderZone(zoneId);
}

function resetExploration() {
  if (isTouring) stopTour();
  activeZone = null;
  selectedSiteId = null;
  world?.resetView();
  updateZoneButtons();
  showOverview();
  hideMapTip();
}

function closeDetail() {
  if (detailPanel.dataset.mode === 'zone') {
    resetExploration();
    return;
  }

  selectedSiteId = null;
  world?.setSelected(null);
  if (activeZone) {
    world?.focusZone(activeZone);
    renderZone(activeZone);
  } else {
    showOverview();
  }
}

function startTour() {
  hideMapTip();
  activeZone = null;
  selectedSiteId = null;
  isTouring = true;
  tourIndex = 0;
  app.classList.add('is-touring');
  tourDock.hidden = false;
  updateZoneButtons();
  renderTourStep(0);
}

function renderTourStep(index: number) {
  tourIndex = Math.max(0, Math.min(tourSteps.length - 1, index));
  const step = tourSteps[tourIndex];
  const site = getSite(step.site);
  activeZone = step.zone;
  updateZoneButtons();
  world?.setZone(step.zone);
  world?.focusZone(step.zone);
  if (site) {
    selectedSiteId = site.id;
    world?.selectSite(site.id, true, false);
    renderSite(site);
  }

  tourTitle.textContent = step.title;
  tourCopy.textContent = step.copy;
  tourSite.textContent = site ? `${site.shortName} · ${site.capacity}` : '';
  tourCount.textContent = `${String(tourIndex + 1).padStart(2, '0')} / ${String(tourSteps.length).padStart(2, '0')}`;
  tourPrev.disabled = tourIndex === 0;
  tourNext.innerHTML =
    tourIndex === tourSteps.length - 1
      ? `Finalizar ${icon('check')}`
      : `Siguiente ${icon('chevron-right')}`;
  tourProgress.innerHTML = tourSteps
    .map(
      (_, progressIndex) =>
        `<span class="${progressIndex < tourIndex ? 'is-complete' : ''} ${progressIndex === tourIndex ? 'is-current' : ''}"></span>`,
    )
    .join('');
}

function stopTour() {
  isTouring = false;
  app.classList.remove('is-touring');
  tourDock.hidden = true;
}

function nextTourStep() {
  if (tourIndex >= tourSteps.length - 1) {
    stopTour();
    return;
  }
  renderTourStep(tourIndex + 1);
}

function previousTourStep() {
  if (tourIndex > 0) renderTourStep(tourIndex - 1);
}

function revealExperience() {
  if (ready || revealScheduled) return;
  ready = true;
  revealScheduled = true;
  const elapsed = performance.now() - readyAt;
  const wait = Math.max(0, 950 - elapsed);
  window.setTimeout(() => {
    app.classList.add('is-ready');
    loader.classList.add('is-hidden');
    loader.setAttribute('aria-hidden', 'true');
    scheduleMapTip();
  }, wait);
}

function showWebGLFallback() {
  loader.classList.add('is-hidden');
  app.classList.add('is-ready');
  if (webglFallback instanceof HTMLElement) webglFallback.hidden = false;
}

try {
  world = new EnergyWorld(worldContainer, {
    onSelect: (site) => {
      if (isTouring) stopTour();
      hideMapTip();
      if (site) {
        selectedSiteId = site.id;
        activeZone = site.zone;
        world?.setZone(activeZone);
        renderSite(site);
        updateZoneButtons();
      } else {
        selectedSiteId = null;
        world?.setSelected(null);
        if (activeZone) renderZone(activeZone);
        else showOverview();
      }
    },
    onThemeChange: (night) => updateThemeUI(night),
    onReady: revealExperience,
  });
} catch (error) {
  console.error('No se pudo iniciar el mundo 3D:', error);
  showWebGLFallback();
}

// Fallback to reveal the interface even if the WebGL frame is unusually slow.
window.setTimeout(revealExperience, 3800);

zoneButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const value = button.dataset.zone;
    if (!value || value === 'all') {
      resetExploration();
    } else {
      selectZone(value as ZoneId);
    }
  });
});

themeToggle.addEventListener('click', () => {
  if (world) {
    world.setNight(!isNight);
  } else {
    updateThemeUI(!isNight);
  }
});

motionToggle.addEventListener('click', () => {
  updatePausedUI(!isPaused);
  world?.setPaused(isPaused);
});

$('#zoom-in').addEventListener('click', () => {
  world?.zoomBy(1.22);
  hideMapTip();
});

$('#zoom-out').addEventListener('click', () => {
  world?.zoomBy(0.82);
  hideMapTip();
});

$('#reset-view').addEventListener('click', resetExploration);

$('#tour-start').addEventListener('click', startTour);
$('#overview-tour').addEventListener('click', startTour);
$('#mobile-tour').addEventListener('click', startTour);

$('#tour-close').addEventListener('click', stopTour);
tourPrev.addEventListener('click', previousTourStep);
tourNext.addEventListener('click', nextTourStep);

detailPanel.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const close = target.closest<HTMLElement>('[data-detail-close]');
  if (close) {
    closeDetail();
    return;
  }

  const reset = target.closest<HTMLElement>('[data-reset-all]');
  if (reset) {
    resetExploration();
    return;
  }

  const siteButton = target.closest<HTMLElement>('[data-site-id]');
  if (siteButton?.dataset.siteId) {
    selectSite(siteButton.dataset.siteId);
    return;
  }

  const previous = target.closest<HTMLElement>('[data-site-prev]');
  if (previous?.dataset.sitePrev) {
    selectSite(previous.dataset.sitePrev);
    return;
  }

  const next = target.closest<HTMLElement>('[data-site-next]');
  if (next?.dataset.siteNext) {
    selectSite(next.dataset.siteNext);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (isTouring) {
      stopTour();
      return;
    }
    if (selectedSiteId || detailPanel.dataset.mode === 'zone') {
      closeDetail();
    }
  }
});

worldContainer.addEventListener('pointerdown', hideMapTip, { passive: true });
worldContainer.addEventListener('wheel', hideMapTip, { passive: true });

window.addEventListener('resize', () => {
  syncSheetClass();
  if (window.innerWidth > 860 && isTouring) {
    app.classList.add('is-touring');
  }
});

updateThemeUI(false);
updatePausedUI(false);
updateZoneButtons();
showOverview();

if (window.matchMedia('(prefers-reduced-motion: reduce)').matches && world) {
  updatePausedUI(true);
  world.setPaused(true);
}
