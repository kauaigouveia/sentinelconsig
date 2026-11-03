// @vitest-environment jsdom
import React,{useState} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import express from 'express';
import request from 'supertest';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {factaCredentialPatch} from '../src/lib/factaCredentialIntent';
import {FactaCredentialFields} from '../src/components/integrations/FactaCredentialFields';
afterEach(cleanup);
it('never converts an autofilled Sentinel login into bank credentials without explicit edit intent',()=>{
 expect(factaCredentialPatch({username:'synthetic-login'})).toEqual({});
 expect(()=>factaCredentialPatch({username:'synthetic-login',password:'synthetic-login-password'})).toThrow(/edição/);
 expect(factaCredentialPatch({editCredentials:true,username:'synthetic-api',password:''})).toEqual({username:'synthetic-api',password:undefined});
 expect(factaCredentialPatch({editCredentials:true,username:'synthetic-api',password:'synthetic-bank-password'})).toMatchObject({username:'synthetic-api',password:'synthetic-bank-password'});
});
it('mounts a bank password field only after deliberate editing, with distinct names and new-password autocomplete',()=>{
 function Form(){const [editing,setEditing]=useState(false),[password,setPassword]=useState('');return <FactaCredentialFields editing={editing} username="synthetic-api" password={password} hasPassword onEditingChange={value=>{setEditing(value);setPassword('');}} onUsernameChange={()=>{}} onPasswordChange={setPassword}/>;}
 render(<Form/>);expect(screen.queryByLabelText('Nova senha da API FACTA')).toBeNull();
 expect((screen.getByLabelText('Usuário da API FACTA') as HTMLInputElement).readOnly).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Alterar credenciais FACTA'}));
 const input=screen.getByLabelText('Nova senha da API FACTA') as HTMLInputElement;
 expect(input.autocomplete).toBe('new-password');expect(input.name).toBe('sentinel_facta_api_secret');
 fireEvent.change(input,{target:{value:'synthetic-only'}});fireEvent.click(screen.getByRole('button',{name:'Cancelar edição de credenciais FACTA'}));
 expect(screen.queryByLabelText('Nova senha da API FACTA')).toBeNull();
});
const source=ts.createSourceFile('server.ts',readFileSync('server.ts','utf8'),ts.ScriptTarget.Latest,true);
function callback(path:string,deps:Record<string,any>){let code='';const visit=(node:ts.Node)=>{if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='post'&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text===path)code=node.arguments.at(-1)!.getText(source);ts.forEachChild(node,visit);};visit(source);if(!code)throw Error('Route missing');const js=ts.transpileModule(`(${code})`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;return new Function(...Object.keys(deps),`return ${js}`)(...Object.values(deps));}
function setup(session:any={user:{id:'synthetic-user',role:'MASTER',tenantId:'synthetic-a'},effectiveTenantId:'synthetic-a'}){
 const save=vi.fn(async(..._args:any[])=>({promoterId:'synthetic-promoter',hasPassword:true,username:'synthetic-api'})),test=vi.fn(async(..._args:any[])=>({success:true}));
 const deps={getAuthSession:async()=>session,hasPermission:()=>session?.user?.role==='MASTER',prisma:{},FactaBankService:{saveTenantConfig:save,testConnection:test},factaCredentialPatch,AuditLogService:{record:vi.fn(async()=>{})}};
 const app=express();app.use(express.json());for(const path of ['/api/integrations/facta/config','/api/integrations/facta/test-connection'])app.post(path,callback(path,deps));return {app,save,test};
}
it.each(['/api/integrations/facta/config','/api/integrations/facta/test-connection'])('rejects browser-filled passwords before any write/authentication: %s',async path=>{
 const {app,save,test}=setup();expect((await request(app).post(path).send({password:'synthetic-autofill'})).status).toBe(400);expect(save).not.toHaveBeenCalled();expect(test).not.toHaveBeenCalled();
});
it('preserves stored credentials when saving other settings and binds the operation to the session tenant',async()=>{
 const {app,save}=setup();expect((await request(app).post('/api/integrations/facta/config?promoterId=synthetic-promoter').send({username:'synthetic-login-autofill',enabled:true,tenantId:'other'})).status).toBe(200);
 expect(save.mock.calls[0][1]).toBe('synthetic-a');expect(save.mock.calls[0][2]).not.toHaveProperty('password');expect(save.mock.calls[0][2]).not.toHaveProperty('username');
 expect(save.mock.calls[0][3]).toBe('synthetic-promoter');
});
it('accepts an explicitly entered API password without exposing it in the response',async()=>{
 const {app,save}=setup();const response=await request(app).post('/api/integrations/facta/config').send({editCredentials:true,username:'synthetic-api',password:'synthetic-bank-password'});
 expect(response.status).toBe(200);expect(save.mock.calls[0][2]).toMatchObject({username:'synthetic-api',password:'synthetic-bank-password'});expect(JSON.stringify(response.body)).not.toContain('synthetic-bank-password');
});
it.each([null,{user:{role:'OPERADOR',tenantId:'synthetic-a'},effectiveTenantId:'synthetic-a'}])('preserves authentication and configuration permissions',async session=>{
 const {app,save,test}=setup(session);expect((await request(app).post('/api/integrations/facta/config').send({editCredentials:true,password:'synthetic'})).status).toBe(session?403:401);expect(save).not.toHaveBeenCalled();expect(test).not.toHaveBeenCalled();
});
