import {expect,it,vi} from 'vitest';
import {telegramDaycovalPrints,telegramDaycovalPng,sendTelegramDaycovalPrint} from '../server/services/telegramDaycovalPrint';
import {formatTelegramInssPortfolio} from '../server/services/telegramInssPortfolio';
import {daycovalShareSvg} from '../src/lib/daycovalShareImage';
import type {TelegramPdfReview,TelegramSpreadsheetQuote} from '../server/services/telegramInssPdfService';
const review:TelegramPdfReview={birthDate:'1960-01-01',benefitType:42,benefitStartDate:'2010-01-01',uf:'AL',benefitContractCount:2,loanMargin:0,
 contracts:[{bank:'237',numberSuffix:'1111',originalTerm:84,remaining:37,balance:900,installment:34.08},{bank:'329',numberSuffix:'2222',originalTerm:96,remaining:84,balance:5000,installment:127.16}],
 bankConsultation:{cpf:'11122233344',benefitNumber:'1234567890',name:'Pessoa particular',income:1621,legalRepresentative:false,contracts:[{number:'11111111111111'},{number:'22222222222222'}]}};
const quote:TelegramSpreadsheetQuote={bank:'DAYCOVAL',indices:[0,1],table:'800581 - RFN - INSS 1',amount:1300,rate:1.85,installment:161.24,term:108,contractAmount:7300,version:'2026-11-13',changes:[{index:0,original:34.08,adjusted:34.08,returnRate:1.731},{index:1,original:127.16,adjusted:119.52,returnRate:2.046}]};
it('uses same Daycoval layout and preserves adjusted and refinanced payments without exposing identifiers',()=>{
 const [data]=telegramDaycovalPrints(review,[quote,{...quote,bank:'PARANA'}]);
 expect(data.balance).toBe(5900);expect(data.original).toBe(161.24);expect(data.adjusted).toBe(153.60);expect(data.refin).toBe(161.24);
 const svg=daycovalShareSvg(data,'A < B & C');expect(svg).toContain('A &lt; B &amp; C');expect(svg).toContain('NOVA PARCELA');expect(svg).toContain('800581');expect(svg).not.toContain('11122233344');expect(svg).not.toContain('1234567890');expect(JSON.stringify(data)).not.toContain('Pessoa particular');
 expect(formatTelegramInssPortfolio(review,[0,1],[quote],[],undefined,true).join(' ')).toContain('PRINT 1');
 expect(formatTelegramInssPortfolio(review,[0,1],[quote],[]).join(' ')).not.toContain('PRINT 1');
});
it('produces a PNG and sends only the selected image via Telegram multipart',async()=>{
 const [data]=telegramDaycovalPrints(review,[quote]);
 const png=await telegramDaycovalPng(data);expect(Array.from(png.slice(0,8))).toEqual([137,80,78,71,13,10,26,10]);expect(png.length).toBeGreaterThan(10000);
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({ok:true,result:{}})));
 await sendTelegramDaycovalPrint('test-token','123',data,fetcher as unknown as typeof fetch);
 const [url,options]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
 expect(url).toBe('https://api.telegram.org/bottest-token/sendPhoto');expect(options.body).toBeInstanceOf(FormData);
 expect((options.body as FormData).get('chat_id')).toBe('123');expect((options.body as FormData).get('photo')).toBeInstanceOf(Blob);
});