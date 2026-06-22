const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');

const registryPath = path.join(__dirname, 'test_registry.json');

const data = [];
for (let i = 0; i < 100000; i++) {
  data.push({
    key: `key-${i}`,
    someValue: 'test test test test test test test test test test test test',
    dateAdded: new Date().toISOString()
  });
}
fs.writeFileSync(registryPath, JSON.stringify(data, null, 2), 'utf8');

function readRegistrySync() {
  try {
    if (!fs.existsSync(registryPath)) {
      return [];
    }
    const fileData = fs.readFileSync(registryPath, 'utf8');
    return JSON.parse(fileData);
  } catch (err) {
    return [];
  }
}

async function readRegistryAsync() {
  try {
    const fileData = await fsPromises.readFile(registryPath, 'utf8');
    return JSON.parse(fileData);
  } catch (err) {
    return [];
  }
}

async function measureLag(fn, isAsync) {
  return new Promise(async (resolve) => {
    let maxLag = 0;
    let lastTick = performance.now();

    const interval = setInterval(() => {
      const now = performance.now();
      const lag = now - lastTick - 5; // Expected 5ms
      if (lag > maxLag) maxLag = lag;
      lastTick = now;
    }, 5);

    // Let the interval start running
    await new Promise(r => setTimeout(r, 20));
    lastTick = performance.now();

    const startOp = performance.now();
    if (isAsync) {
      await fn();
    } else {
      fn();
    }
    const endOp = performance.now();

    // Let the interval run once more if blocked
    await new Promise(r => setTimeout(r, 20));

    clearInterval(interval);

    resolve({ duration: endOp - startOp, maxLag });
  });
}

async function runBenchmark() {
  console.log('Warming up...');
  readRegistrySync();
  await readRegistryAsync();

  console.log('Running Sync Benchmark...');
  const syncResults = await measureLag(readRegistrySync, false);

  console.log('Running Async Benchmark...');
  const asyncResults = await measureLag(readRegistryAsync, true);

  console.log('\n--- Results ---');
  console.log(`Sync - Total Time: ${syncResults.duration.toFixed(2)}ms, Max Event Loop Lag: ${syncResults.maxLag.toFixed(2)}ms`);
  console.log(`Async - Total Time: ${asyncResults.duration.toFixed(2)}ms, Max Event Loop Lag: ${asyncResults.maxLag.toFixed(2)}ms`);
}

runBenchmark().then(() => fs.unlinkSync(registryPath));
