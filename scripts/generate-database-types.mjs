import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const output = execFileSync('npx', ['supabase', 'gen', 'types', 'typescript', '--local'], { encoding: 'utf8' })
fs.mkdirSync('src/platform/supabase/generated', { recursive: true })
fs.writeFileSync('src/platform/supabase/generated/database.types.ts', output)
