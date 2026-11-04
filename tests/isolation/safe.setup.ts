import {afterEach,vi} from 'vitest';
import {scrubCurrentEnvironment} from '../../scripts/testing/environment.mjs';
import {installIsolation,consumeIsolationViolations} from '../../scripts/testing/isolation.mjs';
vi.mock('dotenv/config',()=>({}));
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})},config:()=>({parsed:{}})}));
vi.mock('@prisma/client',async importOriginal=>{
 const actual=await importOriginal<any>();
 return {...actual,PrismaClient:class{constructor(){throw new Error('ISOLATED_TEST_REAL_PRISMA_DENIED');}}};
});
scrubCurrentEnvironment();
for(const key of ['SENTINEL_TEST_MANIFEST_FILE','SENTINEL_TEST_DATABASE_URL','SENTINEL_TEST_DIRECT_URL'])delete process.env[key];
installIsolation();
afterEach(()=>{const failures=consumeIsolationViolations();if(failures.length)throw new Error('UNEXPECTED_ISOLATION_ATTEMPT: '+failures.join(','));});
