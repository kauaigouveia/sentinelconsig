// Process-local only. Never load application .env files to run isolated tests.
/** @returns {Record<string,string>} */
export function sanitizedEnvironment(env=process.env){
 const allowed=/^(PATH|PATHEXT|SystemRoot|WINDIR|COMSPEC|TEMP|TMP|LOCALAPPDATA|APPDATA|USERPROFILE|HOME|HOMEDRIVE|HOMEPATH|LANG|LC_.*|TZ|TERM|CI|NO_COLOR|FORCE_COLOR|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|OS|VITEST.*|NODE_CHANNEL_FD|NODE_CHANNEL_SERIALIZATION_MODE)$/i;
 const clean=Object.fromEntries(Object.entries(env).filter(([key])=>allowed.test(key)));
 for(const key of ['SENTINEL_TEST_MANIFEST_FILE','SENTINEL_TEST_DATABASE_URL','SENTINEL_TEST_DIRECT_URL'])if(env[key])clean[key]=env[key];
 return {...clean,NODE_ENV:'test',TEST_MODE:'1',LOG_LEVEL:'silent',SENTINEL_ISOLATED_TESTS:'1',TZ:'America/Bahia'};
}
export function scrubCurrentEnvironment(){const safe=sanitizedEnvironment();for(const key of Object.keys(process.env))if(!(key in safe))delete process.env[key];Object.assign(process.env,safe);}
