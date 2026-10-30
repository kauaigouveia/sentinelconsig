import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {journeyDatabase} from './helpers/cltJourneyDatabase';
import {BmgBankService as Bmg} from '../server/services/bmgBankService';
const customer={cpf:'52998224725',phone:'11999999999'};
function database(){const db:any=journeyDatabase();db.promoter={findMany:async({where}:any)=>where.tenantId==='t'?[{id:'p',name:'DG'}]:[]};return db;}
beforeEach(()=>{vi.stubEnv('JWT_SECRET','synthetic-bmg-sms-secret');vi.stubGlobal('fetch',vi.fn(()=>{throw Error('No bank calls');}));vi.spyOn(Bmg,'config').mockResolvedValue({enabled:true} as any);});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();});
it('reserves one BMG SMS across concurrent operator clicks',async()=>{
 const db=database();const bank=vi.spyOn(Bmg,'request').mockResolvedValue({verificationToken:'synthetic-otp'});await Promise.allSettled([Bmg.sendOtp(db,'t','user:a',customer.cpf,customer.phone),Bmg.sendOtp(db,'t','user:a',customer.cpf,customer.phone)]);expect(bank).toHaveBeenCalledOnce();expect(fetch).not.toHaveBeenCalled();
});

it('renews expired BMG OTP only on explicit action and preserves the initial phone',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));const db=database();let count=0;const bank=vi.spyOn(Bmg,'request').mockImplementation(async()=>({verificationToken:'synthetic-'+(++count)}));
 const sent=await Bmg.sendOtp(db,'t','user:a',customer.cpf,customer.phone);expect(sent.authorization?.status).toBe('WAITING_OTP');expect((await Bmg.sendOtp(db,'t','user:a',customer.cpf,customer.phone)).smsSent).toBe(false);expect(bank).toHaveBeenCalledOnce();
 vi.setSystemTime(Date.now()+300001);expect((await Bmg.cltAuthorization(db,'t','user:a',customer,true)).status).toBe('EXPIRED');expect(bank).toHaveBeenCalledOnce();
 const resent=await Bmg.sendOtp(db,'t','user:a',customer.cpf,customer.phone);expect(resent.authorization?.status).toBe('WAITING_OTP');expect(bank).toHaveBeenCalledTimes(2);expect(bank.mock.calls[1].slice(1)).toEqual(['t','POST','/v1/sms/otp',{cpf:customer.cpf,celular:customer.phone}]);
});
it('enforces three official validation attempts and permits a new code after exhaustion',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));const db=database();const bank=vi.spyOn(Bmg,'request').mockImplementation(async(_d,_t,_m,path)=>{if(path==='/v1/sms/otp')return {verificationToken:'synthetic-otp'};throw Error('Código inválido.');});await Bmg.sendOtp(db,'t','user:a',customer.cpf,customer.phone);
 for(const code of ['1111','2222','3333'])await expect(Bmg.verifyOtp(db,'t','user:a',customer.cpf,code)).rejects.toThrow('Código inválido');expect(await Bmg.cltAuthorization(db,'t','user:a',customer,false)).toMatchObject({status:'ATTEMPTS_EXCEEDED',attemptsRemaining:0});await expect(Bmg.verifyOtp(db,'t','user:a',customer.cpf,'4444')).rejects.toThrow('três tentativas');expect(bank.mock.calls.filter(c=>c[3]==='/v1/sms/validar')).toHaveLength(3);
 vi.setSystemTime(Date.now()+1);await Bmg.sendOtp(db,'t','user:a',customer.cpf,customer.phone);expect(bank.mock.calls.filter(c=>c[3]==='/v1/sms/otp')).toHaveLength(2);expect(await Bmg.cltAuthorization(db,'t','user:a',customer,false)).toMatchObject({status:'WAITING_OTP',attemptsRemaining:3});
});
it('never treats SMS delivery as consent and queries eligibility only after official OTP validation',async()=>{
 const db=database();const bank=vi.spyOn(Bmg,'request').mockImplementation(async(_d,_t,_m,path)=>path==='/v1/sms/otp'?{verificationToken:'synthetic-otp'}:path==='/v1/sms/validar'?{session_token:'synthetic-session'}:{cpf:customer.cpf,elegivel:true});await Bmg.sendOtp(db,'t','user:a',customer.cpf,customer.phone);expect(await Bmg.cltAuthorization(db,'t','user:a',customer,false)).toMatchObject({status:'WAITING_OTP',ready:false});expect(bank.mock.calls.some(c=>c[3].includes('elegibilidade'))).toBe(false);
 expect(await Bmg.cltAuthorization(db,'t','user:b',customer,false)).toMatchObject({status:'MISSING',ready:false});await Bmg.verifyOtp(db,'t','user:a',customer.cpf,'1234');expect(await Bmg.cltAuthorization(db,'t','user:a',customer,false)).toMatchObject({status:'APPROVED',ready:true});const read=bank.mock.calls.find(c=>c[3].includes('elegibilidade'))!;expect(read[2]).toBe('GET');expect(read[5]).toMatchObject({cpf:customer.cpf,'session-token':'synthetic-session'});await expect(Bmg.cltAuthorization(db,'other','user:a',customer,false)).rejects.toThrow();
});
it('does not repeat a BMG SMS after an uncertain transport response',async()=>{
 const db=database();const bank=vi.spyOn(Bmg,'request').mockRejectedValue(Error('Timeout sintético'));await expect(Bmg.sendOtp(db,'t','user:a',customer.cpf,customer.phone)).rejects.toMatchObject({writeUncertain:true});await expect(Bmg.sendOtp(db,'t','user:a',customer.cpf,customer.phone)).rejects.toMatchObject({writeUncertain:true});expect(bank).toHaveBeenCalledOnce();
});
