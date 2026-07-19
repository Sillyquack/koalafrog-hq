import{defineConfig,devices}from'@playwright/test'

export default defineConfig({
 testDir:'./e2e',
 fullyParallel:false,
 workers:1,
 retries:0,
 timeout:90_000,
 expect:{timeout:7_000},
 outputDir:'test-results/playwright',
 reporter:[['line'],['html',{outputFolder:'test-results/playwright-report',open:'never'}]],
 use:{
  baseURL:'http://127.0.0.1:4173',
  trace:'retain-on-failure',
  screenshot:'only-on-failure',
  video:'retain-on-failure',
 },
 globalSetup:'./e2e/globalSetup.ts',
 globalTeardown:'./e2e/globalTeardown.ts',
 webServer:{
  command:'node scripts/browser-test-server.mjs --port 4173',
  url:'http://127.0.0.1:4173',
  reuseExistingServer:false,
  timeout:30_000,
 },
 projects:[
  {name:'desktop',testMatch:/.*\.e2e\.ts/,testIgnore:/.*\.mobile\.e2e\.ts/,use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900}}},
  {name:'mobile',testMatch:/.*\.mobile\.e2e\.ts/,use:{browserName:'chromium',viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true}},
 ],
})
