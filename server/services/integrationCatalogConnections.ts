import type {PrismaClient} from '@prisma/client';
import {withIntegrationPromoter} from './bankPromoterConfig.js';
import {C6BankService} from './c6BankService.js';
import {FactaBankService} from './factaBankService.js';
import {HappyBankService} from './happyBankService.js';
import {BmgBankService} from './bmgBankService.js';
import {FinantoService} from './finantoService.js';
import {NossaFintechService} from './nossaFintechService.js';
import {V8BankService} from './v8BankService.js';
import {PresencaBankService} from './presencaBankService.js';
import {ParanaBankService} from './paranaBankService.js';
import {WorkbankService} from './workbankService.js';

export type CatalogSlug='c6'|'facta'|'bmg'|'happy'|'finanto'|'nossa-fintech'|'workbank'|'parana'|'presenca'|'v8'|'vctex';
export type ConnectionMetadata={enabled:boolean;configured:boolean;environment?:string;baseUrl?:string};
export type CatalogReader=(db:PrismaClient,tenant:string,promoter:string)=>Promise<ConnectionMetadata>;
const readers:Record<Exclude<CatalogSlug,'vctex'>,CatalogReader>={
 c6:async(db,t)=>{const c=await C6BankService.getTenantConfig(db,t);return {enabled:c.enabled,configured:!!(c.username&&c.password),baseUrl:c.baseUrl};},
 facta:async(db,t,p)=>{const c=await FactaBankService.getTenantConfig(db,t,p);return {enabled:c.enabled,configured:!!(c.username&&c.password),environment:c.environment,baseUrl:c.baseUrl};},
 happy:async(db,t)=>{const c=await HappyBankService.getTenantConfig(db,t);return {enabled:c.ativo,configured:c.isConfigured,environment:c.ambiente,baseUrl:c.baseUrl};},
 bmg:async(db,t)=>{const c=await BmgBankService.config(db,t);return {enabled:c.enabled,configured:!!(c.username&&c.password),environment:c.environment==='sandbox'?'homologation':c.environment,baseUrl:c.environment==='sandbox'?'https://api-partners-sandbox.bancobmg.com.br':'https://api-partners.bancobmg.com.br'};},
 finanto:async(db,t)=>{const c=await FinantoService.getConfig(db,t);return {enabled:c.enabled,configured:c.isConfigured,baseUrl:'https://integration.ajin.io'};},
 'nossa-fintech':async(db,t)=>{const c=await NossaFintechService.getConfig(db,t);return {enabled:c.enabled,configured:c.isConfigured,baseUrl:'https://nossa-fintech-api.spixiiservices.com.br'};},
 v8:async(db,t,p)=>{const c=V8BankService.metadata(await V8BankService.config(db,t,p));return {enabled:c.enabled,configured:c.hasCredentials,environment:c.environment,baseUrl:c.apiUrl||undefined};},
 presenca:async(db,t,p)=>{const c=PresencaBankService.metadata(await PresencaBankService.config(db,t,p));return {enabled:c.enabled,configured:c.hasCredentials,environment:c.environment,baseUrl:c.environment==='production'?'https://presenca-bank-api.azurewebsites.net':undefined};},
 parana:async(db,t,p)=>{const c=await ParanaBankService.config(db,t,p);return {enabled:c.enabled,configured:!!(c.clientId&&c.clientSecret&&c.promoterCode&&c.bankId),environment:c.environment,baseUrl:c.environment==='production'?'https://api-marketplace.paranabanco.com.br':'https://api-marketplace-hom.paranabanco.com.br'};},
 workbank:async(db,t,p)=>{const c=await WorkbankService.config(db,t,p);return {enabled:c.enabled,configured:!!(c.username&&c.clientKey&&c.publicKey),baseUrl:c.extractOrigin};},
};
/** Config reads only: no authentication, probes, token refresh or provider requests. Whitelist returned fields. */
export async function readCatalogConnections(db:PrismaClient,tenant:string,promoters:{id:string}[],sources:Record<string,CatalogReader>=readers){
 if(!tenant)throw Error('Empresa obrigatória.');
 const result:Record<string,{connections:ConnectionMetadata[];unavailable:boolean}>={};
 for(const [slug,read] of Object.entries(sources)){
  const connections:ConnectionMetadata[]=[];let unavailable=false;
  for(const promoter of promoters){
   try{const c=await withIntegrationPromoter(promoter.id,()=>read(db,tenant,promoter.id));connections.push({enabled:c.enabled===true,configured:c.configured===true,environment:['production','staging','homologation'].includes(c.environment||'')?c.environment:undefined,baseUrl:c.baseUrl});}
   catch{unavailable=true;}
  }
  result[slug]={connections,unavailable};
 }
 return result;
}
