import { execFileSync,spawn } from 'node:child_process'
const portIndex=process.argv.indexOf('--port'),port=portIndex>=0?process.argv[portIndex+1]:'5173'
const status=execFileSync('npx',['supabase','status','-o','env'],{encoding:'utf8'})
const values=Object.fromEntries(status.split('\n').map(line=>line.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(match=>[match[1],match[2]]))
const url=values.API_URL??'http://127.0.0.1:54321',publishableKey=values.ANON_KEY??values.PUBLISHABLE_KEY
if(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)||!publishableKey)throw new Error('A running local Supabase instance is required.')
const child=spawn('npm',['run','dev','--','--host','127.0.0.1','--port',port,'--strictPort'],{stdio:'inherit',env:{...process.env,VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:publishableKey,VITE_WORKSPACE_REPOSITORY:'supabase'}})
for(const signal of['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal))
child.on('exit',code=>process.exitCode=code??1)
