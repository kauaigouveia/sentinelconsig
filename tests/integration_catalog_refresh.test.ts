// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {watchIntegrationCatalog} from '../src/lib/integrationCatalogRefresh';
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it('refreshes reads, pauses hidden pages, resumes, prevents overlap and cleans up',async()=>{
 vi.useFakeTimers();let visible='visible';vi.spyOn(document,'visibilityState','get').mockImplementation(()=>visible as DocumentVisibilityState);
 let release:()=>void=()=>{};const read=vi.fn(()=>new Promise<void>(resolve=>release=resolve));
 const stop=watchIntegrationCatalog(read);expect(read).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(60000);expect(read).toHaveBeenCalledTimes(1);release();await Promise.resolve();
 visible='hidden';await vi.advanceTimersByTimeAsync(60000);expect(read).toHaveBeenCalledTimes(1);
 visible='visible';document.dispatchEvent(new Event('visibilitychange'));expect(read).toHaveBeenCalledTimes(2);
 release();await Promise.resolve();stop();await vi.advanceTimersByTimeAsync(120000);window.dispatchEvent(new Event('focus'));expect(read).toHaveBeenCalledTimes(2);
});
