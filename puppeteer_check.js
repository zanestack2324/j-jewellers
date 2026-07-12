const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(0);
  
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[PAGE ERROR] ${err.message}`));

  try {
    await page.goto('https://j-jewellers.vercel.app', { waitUntil: 'domcontentloaded' });
  } catch(e) {
    logs.push(`[NAV ERROR] ${e.message}`);
  }

  await page.evaluate(() => new Promise(r => setTimeout(r, 2000))).catch(e => logs.push(`[EVAL ERROR] ${e.message}`));

  const initial = await page.evaluate(() => ({
    catTabsLen: document.getElementById('catTabs')?.innerHTML.length || -1,
    catProductsLen: document.getElementById('catProducts')?.innerHTML.length || -1,
    totalCards: document.querySelectorAll('.product-card').length,
  }));
  console.log('=== INITIAL STATE ===', JSON.stringify(initial));

  // Test filterCategory directly via evaluate (avoids any playClick issues)
  const testFilter = await page.evaluate(() => {
    try {
      filterCategory('Earrings');
      return {
        activeTab: document.querySelector('.cat-tab.active')?.getAttribute('data-cat'),
        cardCount: document.querySelectorAll('.product-card').length,
      };
    } catch(e) { return { error: e.message }; }
  });
  console.log('=== AFTER filterCategory(Earrings) ===', JSON.stringify(testFilter));

  const testFilter2 = await page.evaluate(() => {
    try {
      filterCategory('Bangles');
      return {
        activeTab: document.querySelector('.cat-tab.active')?.getAttribute('data-cat'),
        cardCount: document.querySelectorAll('.product-card').length,
        sizeVisible: document.querySelector('.size-filter-wrap.visible') !== null,
      };
    } catch(e) { return { error: e.message }; }
  });
  console.log('=== AFTER filterCategory(Bangles) ===', JSON.stringify(testFilter2));

  const testFilter3 = await page.evaluate(() => {
    try {
      filterCategory('all');
      return {
        activeTab: document.querySelector('.cat-tab.active')?.getAttribute('data-cat'),
        cardCount: document.querySelectorAll('.product-card').length,
      };
    } catch(e) { return { error: e.message }; }
  });
  console.log('=== AFTER filterCategory(all) ===', JSON.stringify(testFilter3));

  console.log('\n=== CONSOLE LOGS ===');
  logs.forEach(l => console.log(l));

  await browser.close();
})();
