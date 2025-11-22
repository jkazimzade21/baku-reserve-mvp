#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const puppeteer = require('puppeteer');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);
const { hideBin } = require('yargs/helpers');
const yargs = require('yargs/yargs');

const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

const flows = [
  {
    id: 'A',
    name: 'romantic_skyline_dinner',
    locations: ['Flame Towers', 'Highland Park', 'Bayil', 'Four Seasons rooftop', 'Port Baku'],
    budgets: ['130', '140', '150', '160'],
    languages: {
      en: [
        'Romantic skyline dinner with cocktails near {location}, try to keep it around {budget} AZN.',
        'Need a dreamy rooftop date night by {location} with cocktails, budget about {budget} AZN.',
      ],
      az: [
        '{location} ətrafında {budget} AZN civarında romantik rooftop şam yeməyi və kokteyllər.',
        'Romantik skyline görüşü istəyirəm, {location} yanında təxminən {budget} AZN limitlə.',
      ],
      ru: [
        'Романтический ужин с видом на огни Баку возле {location}, до {budget} AZN.',
        'Нужен уютный rooftop с коктейлями у {location}, бюджет около {budget} AZN.',
      ],
    },
  },
  {
    id: 'B',
    name: 'old_city_brunch',
    locations: ['Icherisheher', 'Maiden Tower', 'Sabayil', 'Nizami street'],
    budgets: ['45', '55', '65', '75'],
    languages: {
      en: [
        'Old City brunch near {location} with sunlit terrace, roughly {budget} AZN for two.',
        'Casual brunch in {location} with good coffee and sweets, keep it under {budget} AZN.',
      ],
      az: [
        'İçərişəhərdə {budget} AZN civarında ailəvi branç, {location} yaxınlığı ideal olsun.',
        'Old City-də rahat branç, desert və çayla {budget} AZN ətrafında olsun.',
      ],
      ru: [
        'Бранч в Старом городе рядом с {location}, бюджет до {budget} AZN.',
        'Хочу уютный Old City brunch возле {location} примерно за {budget} AZN.',
      ],
    },
  },
  {
    id: 'C',
    name: 'boulevard_seafood_value',
    locations: ['Seaside boulevard', 'Port Baku marina', 'Sea Breeze front', 'Crystal Hall side'],
    budgets: ['60', '70', '80', '90'],
    languages: {
      en: [
        'Not too expensive seafood near the {location} promenade, target {budget} AZN.',
        'Casual Caspian seafood by {location}, max {budget} AZN including wine.',
      ],
      az: [
        '{location} sahilində çox baha olmayan seafood istəyirəm, təxminən {budget} AZN.',
        'Boulevard boyu balıq restoranı, {budget} AZN-dən yuxarı olmasın.',
      ],
      ru: [
        'Морепродукты у бульвара {location}, но без пафоса, до {budget} AZN.',
        'Ищу спокойное seafood место рядом с {location} примерно за {budget} AZN.',
      ],
    },
  },
  {
    id: 'D',
    name: 'late_night_tea_backgammon',
    locations: ['Fountain Square', 'Torgovaya', 'Icherisheher', 'Nizami street'],
    budgets: ['30', '35', '40', '45'],
    languages: {
      en: [
        'Late-night tea house with backgammon near {location}, budget ~{budget} AZN.',
        'Need a midnight çayxana vibe around {location} for tea + desserts under {budget} AZN.',
      ],
      az: [
        '{location} ətrafında gecə açıq çayxana, nərd oynamaq və şirniyyat üçün {budget} AZN limit.',
        'Səssiz gecə çay süfrəsi istəyirəm, {location} tərəfində {budget} AZN civarında.',
      ],
      ru: [
        'Ночное место для чая и нард у {location}, бюджет {budget} AZN.',
        'Хочу тёплую чайхану после полуночи возле {location} до {budget} AZN.',
      ],
    },
  },
  {
    id: 'E',
    name: 'azerbaijani_live_music_midprice',
    locations: ['Fountain Square', 'Port Baku', 'Old City', 'Baku Boulevard'],
    budgets: ['70', '85', '95', '110'],
    languages: {
      en: [
        'Azerbaijani restaurant with live music near {location}, mid price about {budget} AZN.',
        'Need live Mugham vibes with dinner around {location}, cap it at {budget} AZN.',
      ],
      az: [
        '{location} tərəfdə canlı musiqili Azərbaycan mətbəxi, orta büdcə {budget} AZN.',
        'Canlı muğam olan yer istəyirəm, {location} yaxınlığında təxminən {budget} AZN.',
      ],
      ru: [
        'Азербайджанская кухня с живой музыкой у {location}, средний чек {budget} AZN.',
        'Нужен уютный ресторан с живым мугамом рядом с {location}, до {budget} AZN.',
      ],
    },
  },
];

const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];

function buildPrompt(iteration) {
  const flow = flows[iteration % flows.length];
  const availableLangs = Object.keys(flow.languages);
  const lang = randomChoice(availableLangs);
  const template = randomChoice(flow.languages[lang]);
  const location = randomChoice(flow.locations);
  const budget = randomChoice(flow.budgets);
  const text = template.replace('{location}', location).replace('{budget}', budget);
  return { flowId: flow.id, flowName: flow.name, language: lang, location, budget, text };
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[rank]);
}

async function ensureExploreTab(page) {
  await page.waitForSelector('[role="tab"]', { timeout: 15000 });
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const explore = tabs.find((tab) => tab.textContent?.includes('Explore'));
    if (explore && explore.getAttribute('aria-selected') !== 'true') {
      explore.click();
    }
  });
}

async function clearAndType(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 20000 });
  await page.focus(selector);
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) {
      el.value = '';
      const event = new Event('input', { bubbles: true });
      el.dispatchEvent(event);
    }
  }, selector);
  await page.type(selector, value, { delay: 30 });
}

async function run() {
  const argv = yargs(hideBin(process.argv))
    .option('runs', {
      alias: 'r',
      type: 'number',
      default: 50,
      describe: 'Number of concierge journeys to execute',
    })
    .option('base-url', {
      type: 'string',
      default: 'http://localhost:19006',
      describe: 'Expo web dev server URL',
    })
    .option('output-dir', {
      type: 'string',
      describe: 'Optional absolute/relative path for artifacts root',
    })
    .option('headless', {
      type: 'boolean',
      default: true,
      describe: 'Run Chromium in headless mode',
    })
    .help()
    .parse();

  const timestamp = dayjs().utc().format('YYYYMMDD-HHmmss');
  const runId = `web-${timestamp}`;
  const artifactsRoot = path.resolve(
    argv['output-dir'] ? argv['output-dir'] : path.join('artifacts', 'web', runId),
  );
  await fs.mkdir(artifactsRoot, { recursive: true });

  const browser = await puppeteer.launch({
    headless: argv.headless ? 'new' : false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const iterationResults = [];

  for (let i = 0; i < argv.runs; i += 1) {
    const iteration = i + 1;
    const prompt = buildPrompt(i);
    const iterationDir = path.join(artifactsRoot, `iteration-${String(iteration).padStart(2, '0')}`);
    await fs.mkdir(iterationDir, { recursive: true });

    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.setUserAgent(UA_IPHONE);
    page.setDefaultTimeout(45000);

    const consoleLogs = [];
    const networkLogs = [];
    const requestMap = new Map();

    page.on('console', (msg) => {
      consoleLogs.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location(),
        timestamp: new Date().toISOString(),
      });
    });

    page.on('pageerror', (error) => {
      consoleLogs.push({
        type: 'pageerror',
        text: error?.message || String(error),
        timestamp: new Date().toISOString(),
      });
    });

    page.on('request', (request) => {
      requestMap.set(request, {
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        headers: request.headers(),
        startTime: Date.now(),
      });
    });

    page.on('requestfinished', async (request) => {
      const entry = requestMap.get(request);
      if (!entry) return;
      const response = await request.response();
      entry.status = response?.status();
      entry.responseHeaders = response?.headers();
      entry.endTime = Date.now();
      entry.durationMs = entry.endTime - entry.startTime;
      entry.fromCache = response?.fromCache() || false;
      networkLogs.push(entry);
      requestMap.delete(request);
    });

    page.on('requestfailed', (request) => {
      const entry = requestMap.get(request) || {
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        startTime: Date.now(),
      };
      entry.errorText = request.failure()?.errorText || 'request failed';
      entry.endTime = Date.now();
      entry.durationMs = entry.endTime - entry.startTime;
      networkLogs.push(entry);
      requestMap.delete(request);
    });

    const iterationResult = {
      iteration,
      prompt,
      timestamp: new Date().toISOString(),
      selectedResultTestId: null,
      selectedResultName: null,
      resultNames: [],
      resultCount: 0,
      ttfrMs: null,
      detailName: null,
      errors: [],
    };

    let tracingActive = false;

    try {
      await page.goto(argv['base-url'], { waitUntil: 'domcontentloaded' });
      await ensureExploreTab(page);
      await page.waitForSelector('[data-testid="concierge-input"]');
      await clearAndType(page, '[data-testid="concierge-input"]', prompt.text);

      const tracePath = path.join(iterationDir, 'trace.json');
      await page.tracing.start({ path: tracePath, screenshots: false });
      tracingActive = true;

      const startMark = performance.now();
      await page.click('[data-testid="concierge-submit"]');

      const waitHandle = await page.waitForFunction(
        () => {
          const nodes = document.querySelectorAll('[data-testid^="concierge-result-"]');
          if (!nodes.length) return false;
          const names = Array.from(nodes).map((node) => {
            const text = node.textContent || '';
            const [firstLine] = text.trim().split('\n').filter(Boolean);
            return firstLine || 'unknown';
          });
          return { count: nodes.length, names };
        },
        { timeout: 40000 },
      );
      const resolved = await waitHandle.jsonValue();
      iterationResult.resultNames = resolved.names;
      iterationResult.resultCount = resolved.count;
      iterationResult.ttfrMs = Math.round(performance.now() - startMark);

      await page.screenshot({ path: path.join(iterationDir, 'results.png'), fullPage: true });
      await page.tracing.stop();
      tracingActive = false;

      const safeCount = Math.max(1, resolved.count);
      const desiredIndex = Math.min(
        safeCount - 1,
        Math.max(0, Math.floor(Math.random() * Math.min(3, safeCount))),
      );
      const selectedTestId = await page.evaluate((index) => {
        const nodes = Array.from(document.querySelectorAll('[data-testid^="concierge-result-"]'));
        const target = nodes[index] || nodes[nodes.length - 1];
        if (!target) return null;
        target.scrollIntoView({ block: 'center' });
        target.click();
        return target.getAttribute('data-testid');
      }, desiredIndex);
      iterationResult.selectedResultTestId = selectedTestId;
      iterationResult.selectedResultName = resolved.names[desiredIndex] || null;

      await page.waitForSelector('[data-testid="restaurant-hero-card"]', { timeout: 30000 });
      await page.waitForSelector('[data-testid="restaurant-see-availability"]', { timeout: 30000 });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      iterationResult.detailName = await page.evaluate(() => {
        const hero = document.querySelector('[data-testid="restaurant-hero-card"]');
        if (!hero) return null;
        const text = hero.textContent || '';
        const [firstLine] = text.trim().split('\n').filter(Boolean);
        return firstLine || null;
      });
      await page.screenshot({ path: path.join(iterationDir, 'detail.png'), fullPage: true });

      await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
        const explore = tabs.find((tab) => tab.textContent?.includes('Explore'));
        if (explore) {
          explore.click();
        } else {
          window.history.back();
        }
      });
      await page.waitForSelector('[data-testid="concierge-input"]', { timeout: 20000 });
    } catch (error) {
      iterationResult.errors.push(error?.message || String(error));
      if (tracingActive) {
        try {
          await page.tracing.stop();
        } catch (_) {
          // ignore
        }
        tracingActive = false;
      }
      try {
        await page.screenshot({ path: path.join(iterationDir, 'failure.png'), fullPage: true });
      } catch (_) {
        // ignore screenshot failures
      }
    } finally {
      if (requestMap.size) {
        requestMap.forEach((entry) => {
          const now = Date.now();
          networkLogs.push({
            ...entry,
            status: entry.status ?? null,
            endTime: now,
            durationMs: now - entry.startTime,
            abandoned: true,
          });
        });
        requestMap.clear();
      }
      await fs.writeFile(
        path.join(iterationDir, 'metrics.json'),
        JSON.stringify(iterationResult, null, 2),
      );
      await fs.writeFile(
        path.join(iterationDir, 'performance.json'),
        JSON.stringify(
          {
            iteration,
            ttfr_ms: iterationResult.ttfrMs,
            resultCount: iterationResult.resultCount,
            selectedResult: iterationResult.selectedResultName,
          },
          null,
          2,
        ),
      );
      await fs.writeFile(path.join(iterationDir, 'network.json'), JSON.stringify(networkLogs, null, 2));
      await fs.writeFile(path.join(iterationDir, 'console.json'), JSON.stringify(consoleLogs, null, 2));
      iterationResults.push({ ...iterationResult, networkLogs, consoleLogs });
      await page.close().catch(() => {});
      console.log(
        `[concierge] iteration ${iteration}/${argv.runs} -> results=${iterationResult.resultCount} ttfr=${iterationResult.ttfrMs}ms errors=${iterationResult.errors.length}`,
      );
    }
  }

  await browser.close();

  const ttfrValues = iterationResults.filter((r) => typeof r.ttfrMs === 'number').map((r) => r.ttfrMs);
  const successCount = iterationResults.filter((r) => r.errors.length === 0).length;
  const failureCount = iterationResults.length - successCount;

  const consoleErrors = new Map();
  iterationResults.forEach((result) => {
    result.consoleLogs
      .filter((log) => log.type === 'error' || log.type === 'pageerror')
      .forEach((log) => {
        const key = log.text.slice(0, 200);
        consoleErrors.set(key, (consoleErrors.get(key) || 0) + 1);
      });
  });

  const networkFailures = new Map();
  iterationResults.forEach((result) => {
    result.networkLogs
      .filter((entry) => entry.status >= 400 || entry.errorText)
      .forEach((entry) => {
        let route = entry.url;
        try {
          const parsed = new URL(entry.url);
          route = `${parsed.pathname}`;
        } catch (_) {
          // ignore parsing issues
        }
        const key = `${entry.method || 'GET'} ${route}`;
        networkFailures.set(key, (networkFailures.get(key) || 0) + 1);
      });
  });

  const summary = {
    runId,
    artifactsRoot,
    startedAt: timestamp,
    totalRuns: iterationResults.length,
    successCount,
    failureCount,
    scenarios: flows.reduce((acc, flow) => {
      acc[flow.id] = iterationResults.filter((r) => r.prompt.flowId === flow.id).length;
      return acc;
    }, {}),
    ttfr: {
      p50: percentile(ttfrValues, 50),
      p95: percentile(ttfrValues, 95),
      p99: percentile(ttfrValues, 99),
      min: ttfrValues.length ? Math.min(...ttfrValues) : null,
      max: ttfrValues.length ? Math.max(...ttfrValues) : null,
    },
    consoleErrors: Array.from(consoleErrors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([message, count]) => ({ message, count })),
    failingRequests: Array.from(networkFailures.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([route, count]) => ({ route, count })),
  };

  await fs.writeFile(path.join(artifactsRoot, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`[concierge] Completed run ${runId} (${successCount}/${iterationResults.length} successful)`);
  console.log(`[concierge] Artifacts: ${artifactsRoot}`);
}

run().catch((err) => {
  console.error('[concierge] fatal error', err);
  process.exitCode = 1;
});
